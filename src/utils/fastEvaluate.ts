import type {
  CoachHighlightPoint,
  EvaluationRoutingMeta,
  FeedbackImplementationDetail,
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  PinpointedRewrite,
  RewrittenSample,
  RubricMetricNotes,
  RubricScores,
  ToneSetting,
  VocabEntry,
  VocabSuggestion,
  WritingMode,
} from '../types';
import {
  analyzeDraftLocally,
  deriveInternationalMetrics,
  MODE_LABELS,
  TONE_LABELS,
} from './analytics';
import {
  assessDraftIntegrity,
  calibrateEvaluationScores,
  computeTopicOverlap,
  filterGroundedGrammarFixes,
} from './evaluationCalibration';
import type { OfflineProofIssue } from './offlineProofreader';
import { analyzeWritingSample } from './textAnalysis';

export interface InstantEvaluationResult {
  evaluationStatus: 'completed';
  modelUsed: string;
  thinkingLevelUsed: string;
  isProvisionalInstant: boolean;
  suggestedTitle: string;
  scores: RubricScores;
  metricNotes?: RubricMetricNotes;
  cefrLevel: string;
  internationalMetrics: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: FeedbackImplementedStatus;
  feedbackCheck?: FeedbackImplementationDetail;
  whatImproved: string;
  whatImprovedPoints?: CoachHighlightPoint[];
  strictImprovements: string;
  pinpointedRewrites?: PinpointedRewrite[];
  rewrittenSample?: RewrittenSample;
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
  routingMeta?: EvaluationRoutingMeta;
}

export interface RandomTopicDismissInput {
  currentTopic: string;
  currentContent: string;
  loadedRandomTopic: string | null;
  contentSnapshotAtPick: string;
  previousTopicAtPick: string;
}

export interface RandomTopicDismissResult {
  nextTopic: string;
  keptTopic: boolean;
}

export interface StudioGreeting {
  headline: string;
  sublinePrefix: string;
}

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this',
  'these', 'those', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'can', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off',
  'over', 'under', 'again', 'further', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'too',
  'very', 'just', 'really', 'actually', 'basically', 'literally', 'today',
  'yesterday', 'tomorrow', 'now', 'still', 'also', 'well', 'even', 'back',
  'much', 'many', 'get', 'got', 'make', 'made', 'going', 'went', 'like',
  'think', 'thought', 'feel', 'felt', 'want', 'wanted', 'need', 'needed',
  'know', 'knew', 'thing', 'things', 'something', 'anything', 'everything',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'yours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'they', 'them',
  'their', 'theirs', 'what', 'which', 'who', 'whom', 'because', 'while',
  'since', 'until', 'though', 'although', 'however', 'therefore', 'hi',
  'hello', 'hey', 'dear', 'thanks', 'thank', 'regards', 'best', 'sincerely',
]);

const MINOR_TITLE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'of', 'by', 'as', 'up', 'via', 'with', 'from', 'into',
]);

function toEditorialTitleCase(raw: string): string {
  const words = raw
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return '';

  return words
    .map((word, idx) => {
      // Preserve intentional acronyms like API, PCB, AI, IELTS
      if (word.length >= 2 && word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      if (idx > 0 && idx < words.length - 1 && MINOR_TITLE_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Fast, deterministic content analyzer that produces a crisp, natural 3 to 7 word
 * editorial title when the writer evaluates a piece without typing a title first.
 */
export function inferSuitableTitle(content: string, mode: WritingMode): string {
  const cleaned = content.replace(/\r\n/g, '\n').trim();
  if (!cleaned) {
    return `${MODE_LABELS[mode]} Reflection`;
  }

  // 1. Check for an explicit subject line (common in Email mode)
  const subjectMatch = cleaned.match(/^subject\s*:\s*([^\n]{3,75})/i);
  if (subjectMatch?.[1]) {
    const candidate = toEditorialTitleCase(subjectMatch[1].trim());
    if (candidate.split(' ').length >= 2) {
      return candidate.slice(0, 64);
    }
  }

  // 2. Skip greeting-only opening lines ("Hi Team,", "Dear Professor,")
  const rawLines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyLines = rawLines.filter(
    (line, idx) =>
      !(
        idx === 0 &&
        line.length < 42 &&
        /^(hi|hello|hey|dear|good\s+(morning|afternoon|evening))\b/i.test(line)
      )
  );
  const effectiveText = (bodyLines.length > 0 ? bodyLines : rawLines).join(' ');

  // 3. Extract frequency-weighted meaningful keywords across the full piece
  const tokenMatches = effectiveText.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
  const freq = new Map<string, { count: number; original: string; firstIdx: number }>();

  tokenMatches.forEach((tok, idx) => {
    const lower = tok.toLowerCase().replace(/^'+|'+$/g, '');
    if (lower.length < 3 || TITLE_STOP_WORDS.has(lower)) return;
    const prev = freq.get(lower);
    if (prev) {
      prev.count += 1;
    } else {
      freq.set(lower, { count: 1, original: tok, firstIdx: idx });
    }
  });

  // 4. Prefer a crisp opening clause from the first meaningful sentence if it reads cleanly
  const firstSentence = effectiveText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .find((s) => s.split(/\s+/).length >= 3);

  if (firstSentence) {
    const strippedLead = firstSentence
      .replace(
        /^(today\s+i\s+(want\s+to\s+write\s+about|learned\s+about|realized\s+that|am\s+writing\s+about)|i\s+am\s+writing\s+to\s+|in\s+this\s+(post|essay|note|email|draft)\s*,?\s*|i\s+want\s+to\s+share\s+|honestly\s*,?\s*|recently\s*,?\s*)/i,
        ''
      )
      .replace(/[.!?]+$/, '')
      .trim();

    const firstClause = strippedLead.split(/[,;:]/)[0]?.trim() ?? strippedLead;
    const clauseWords = firstClause.split(/\s+/).filter(Boolean);

    if (clauseWords.length >= 3 && clauseWords.length <= 8) {
      const candidate = toEditorialTitleCase(clauseWords.join(' '));
      if (candidate.length >= 10 && candidate.length <= 64) {
        return candidate;
      }
    }

    if (clauseWords.length > 8) {
      // Split at a natural conjunction boundary ("and", "but", "because", "while", "so")
      const subClause =
        firstClause
          .split(/\s+(?:and|but|so|because|while|when|which|that)\s+/i)[0]
          ?.trim() ?? '';
      const subWords = subClause.split(/\s+/).filter(Boolean);
      if (subWords.length >= 3 && subWords.length <= 8) {
        const candidate = toEditorialTitleCase(subWords.join(' '));
        if (candidate.length >= 10 && candidate.length <= 64) {
          return candidate;
        }
      }
    }
  }

  // 5. Fallback: synthesize a crisp title from the top 3 recurring themes
  const topTerms = Array.from(freq.values())
    .sort((a, b) => b.count - a.count || a.firstIdx - b.firstIdx)
    .slice(0, 3)
    .map((item) => item.original);

  if (topTerms.length >= 2) {
    const joined =
      topTerms.length === 2
        ? `${topTerms[0]} and ${topTerms[1]}`
        : `${topTerms[0]}, ${topTerms[1]}, and ${topTerms[2]}`;
    const prefix =
      mode === 'email'
        ? 'Note on '
        : mode === 'technical'
          ? 'Guide to '
          : mode === 'linkedin'
            ? 'Lessons in '
            : 'Reflections on ';
    return toEditorialTitleCase(`${prefix}${joined}`).slice(0, 64);
  }

  if (topTerms.length === 1) {
    return toEditorialTitleCase(`Notes on ${topTerms[0]}`);
  }

  return `${MODE_LABELS[mode]} Notes`;
}

const WEAK_VOCAB_UPGRADES: Array<{
  pattern: RegExp;
  original: string;
  better: string;
  reason: string;
}> = [
  {
    pattern: /\bdue\s+to\s+the\s+fact\s+that\b/i,
    original: 'due to the fact that',
    better: 'because',
    reason: 'Replaces five bloated words with one clean causal link.',
  },
  {
    pattern: /\bin\s+order\s+to\b/i,
    original: 'in order to',
    better: 'to',
    reason: 'Cuts unnecessary padding immediately.',
  },
  {
    pattern: /\bat\s+the\s+end\s+of\s+the\s+day\b/i,
    original: 'at the end of the day',
    better: 'ultimately',
    reason: 'Replaces a tired cliché with crisp spoken clarity.',
  },
  {
    pattern: /\bvery\s+good\b/i,
    original: 'very good',
    better: 'compelling',
    reason: 'Replaces a flat intensifier with a sharper adjective.',
  },
  {
    pattern: /\bvery\s+big\b/i,
    original: 'very big',
    better: 'substantial',
    reason: 'Conveys scale with cleaner precision.',
  },
  {
    pattern: /\bvery\s+important\b/i,
    original: 'very important',
    better: 'essential',
    reason: 'Tightens emphasis without relying on "very".',
  },
  {
    pattern: /\ba\s+lot\s+of\b/i,
    original: 'a lot of',
    better: 'heavy',
    reason: 'Replaces vague quantity filler with concrete specificity.',
  },
  {
    pattern: /\bvery\s+fast\b/i,
    original: 'very fast',
    better: 'rapid',
    reason: 'Single strong word sharpens pacing.',
  },
  {
    pattern: /\bvery\s+hard\b/i,
    original: 'very hard',
    better: 'demanding',
    reason: 'More vivid and specific than "very hard".',
  },
  {
    pattern: /\bmake\s+sure\b/i,
    original: 'make sure',
    better: 'ensure',
    reason: 'Tighter, more direct verb choice.',
  },
  {
    pattern: /\bget\s+rid\s+of\b/i,
    original: 'get rid of',
    better: 'eliminate',
    reason: 'Stronger single verb for clear technical or professional speech.',
  },
  {
    pattern: /\bfind\s+out\b/i,
    original: 'find out',
    better: 'pinpoint',
    reason: 'More active and concrete than a generic phrasal verb.',
  },
  {
    pattern: /\blook\s+into\b/i,
    original: 'look into',
    better: 'investigate',
    reason: 'Sounds decisive and accountable in interviews or emails.',
  },
  {
    pattern: /\bkind\s+of\b/i,
    original: 'kind of',
    better: 'somewhat',
    reason: 'Tightens vague conversational hedging for clearer conviction.',
  },
  {
    pattern: /\bsort\s+of\b/i,
    original: 'sort of',
    better: 'roughly',
    reason: 'Replaces vague hedging with crisp everyday precision.',
  },
];

function clampRawScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function buildLocalRewriteSample(
  content: string,
  vocabUpgrades: VocabSuggestion[]
): RewrittenSample | undefined {
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 220);

  if (sentences.length === 0) return undefined;

  // Prefer rewriting a sentence that contains removable filler words
  const fillerRegex = /\b(basically|actually|literally|really|just|very)\s+/gi;
  const fillerCandidate = sentences.find((s) => fillerRegex.test(s));
  if (fillerCandidate) {
    fillerRegex.lastIndex = 0;
    const cleaned = fillerCandidate
      .replace(fillerRegex, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^([a-z])/, (m) => m.toUpperCase())
      .trim();
    if (cleaned.length >= 16 && cleaned.toLowerCase() !== fillerCandidate.toLowerCase()) {
      return {
        original: fillerCandidate,
        improved: cleaned,
        why: 'Stripping spoken hedge words immediately sharpens conviction and rhythm.',
      };
    }
  }

  // Otherwise apply the top concrete vocab upgrade to its containing sentence
  const directUpgrade = vocabUpgrades.find(
    (v) => !v.betterAlternative.includes('/')
  );
  if (directUpgrade) {
    const escaped = directUpgrade.used.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    const hitSentence = sentences.find((s) => re.test(s));
    if (hitSentence) {
      const improved = hitSentence.replace(re, directUpgrade.betterAlternative);
      if (improved !== hitSentence) {
        return {
          original: hitSentence,
          improved,
          why: directUpgrade.explanation,
        };
      }
    }
  }

  return undefined;
}

/**
 * Instant (<15ms) calibrated local evaluation engine so "Evaluate & Score" responds
 * immediately while the deep Gemini Coach (gemini-4-hydrogen, MEDIUM thinking) runs.
 * Uses strict integrity checks (gibberish/short-draft/rhythm/topic alignment) so it
 * never hands out inflated scores even offline or on static GitHub Pages.
 */
export function buildInstantLocalEvaluation(
  content: string,
  mode: WritingMode,
  tone: ToneSetting,
  offlineIssues: OfflineProofIssue[],
  existingTopic?: string,
  vocabulary: VocabEntry[] = []
): InstantEvaluationResult {
  const diag = analyzeDraftLocally(content);
  const integrity = assessDraftIntegrity(content);
  const eieAnalysis = analyzeWritingSample({
    text: content,
    vocabulary,
    mode,
    tone,
    topic: existingTopic,
  });
  const words = Math.max(1, diag.wordCount);
  const sentences = Math.max(1, diag.sentenceCount);
  const lexicalDiversity = integrity.uniqueWordRatio;
  const fillerCount = diag.fillerHits.reduce((sum, hit) => sum + hit.count, 0);
  const repeatedOpenerCount = diag.repeatedOpeners.length;
  const passiveCount = diag.passiveMarkers;

  const spellingCount = offlineIssues.filter((i) => i.category === 'spelling').length;
  const grammarCount = offlineIssues.filter((i) => i.category === 'grammar').length;
  const punctCount = offlineIssues.filter((i) => i.category === 'punctuation').length;
  const issueDensity =
    (spellingCount * 1.2 + grammarCount * 1.4 + punctCount * 0.65) /
    Math.max(20, words);

  // Depth curve: 140+ words can earn full depth; <35 words is penalized honestly
  const depthFactor =
    words >= 140
      ? 1.0
      : words >= 85
        ? 0.5
        : words >= 45
          ? 0.0
          : words >= 25
            ? -0.8
            : -1.8;

  const avgLen = diag.avgWordsPerSentence;
  const cadenceBonus =
    sentences >= 3 && integrity.sentenceLengthStdDev >= 4.0
      ? 1.0
      : sentences >= 2 && integrity.sentenceLengthStdDev >= 2.2
        ? 0.4
        : -0.6;
  const balancedSentenceLen =
    avgLen >= 10 && avgLen <= 22 ? 0.8 : avgLen >= 7 && avgLen <= 27 ? 0.2 : -0.8;

  const topicOverlap = computeTopicOverlap(content, existingTopic);
  const topicPenalty =
    topicOverlap !== null && topicOverlap === 0 && words >= 25 ? -1.0 : 0;

  const rawScores: RubricScores = {
    naturalVoiceFlow: clampRawScore(
      6.4 +
        depthFactor * 0.8 +
        cadenceBonus * 0.6 -
        Math.min(2.0, fillerCount * 0.35) -
        Math.min(1.5, repeatedOpenerCount * 0.5)
    ),
    claritySimplicity: clampRawScore(
      6.8 +
        balancedSentenceLen -
        Math.min(1.8, fillerCount * 0.3) -
        Math.min(1.5, passiveCount * 0.35) -
        Math.min(1.5, issueDensity * 10)
    ),
    grammarMechanics: clampRawScore(
      8.5 -
        issueDensity * 22 -
        Math.min(3.5, (spellingCount + grammarCount) * 0.55)
    ),
    toneEngagement: clampRawScore(
      6.3 +
        depthFactor * 0.7 +
        (lexicalDiversity >= 0.58 ? 0.8 : lexicalDiversity >= 0.48 ? 0.2 : -0.6) +
        topicPenalty
    ),
    sentenceVarietyCadence: clampRawScore(
      6.0 +
        cadenceBonus +
        (sentences >= 4 ? 0.6 : -0.4) -
        Math.min(1.8, repeatedOpenerCount * 0.6) -
        (integrity.longestSentenceWords > 36 ? 0.8 : 0)
    ),
    concisenessDirectness: clampRawScore(
      7.4 -
        Math.min(2.2, fillerCount * 0.42) -
        Math.min(1.5, passiveCount * 0.35) -
        (avgLen > 28 ? 1.2 : avgLen > 24 ? 0.5 : 0)
    ),
  };

  const grammarFixes: GrammarFix[] = filterGroundedGrammarFixes(
    content,
    offlineIssues.slice(0, 6).map((issue) => ({
      original: issue.original,
      corrected: issue.replacement,
      rule: issue.rule,
      category: issue.category,
    }))
  );

  const calibrated = calibrateEvaluationScores({
    content,
    scores: rawScores,
    grammarFixesCount: grammarFixes.length,
  });

  const vocabUpgrades: VocabSuggestion[] = [];
  const seenUsedPhrases = new Set<string>();
  if (!calibrated.integrity.isGibberishOrLowEffort) {
    // 1. Prioritize phrases matching entries already saved in the user's vocabulary library
    for (const opp of eieAnalysis.vocabularyComparison.missedLibraryOpportunities) {
      const key = opp.matchedUsedPhrase.toLowerCase();
      if (seenUsedPhrases.has(key)) continue;
      seenUsedPhrases.add(key);
      vocabUpgrades.push({
        used: opp.matchedUsedPhrase,
        betterAlternative: opp.libraryAlternative,
        explanation: opp.explanation,
      });
      if (vocabUpgrades.length >= 3) break;
    }

    // 2. Surface EIE-authentic professional vocabulary alternatives
    if (vocabUpgrades.length < 3) {
      for (const alt of eieAnalysis.vocabularyComparison.professionalAlternatives) {
        const key = alt.original.toLowerCase();
        if (seenUsedPhrases.has(key)) continue;
        seenUsedPhrases.add(key);
        vocabUpgrades.push({
          used: alt.original,
          betterAlternative: alt.professionalAlternative,
          explanation: alt.educationalNote,
        });
        if (vocabUpgrades.length >= 3) break;
      }
    }

    // 3. Fill remaining slots from general prose upgrades
    if (vocabUpgrades.length < 3) {
      for (const candidate of WEAK_VOCAB_UPGRADES) {
        if (candidate.pattern.test(content)) {
          const key = candidate.original.toLowerCase();
          if (seenUsedPhrases.has(key)) continue;
          seenUsedPhrases.add(key);
          vocabUpgrades.push({
            used: candidate.original,
            betterAlternative: candidate.better,
            explanation: candidate.reason,
          });
          if (vocabUpgrades.length >= 3) break;
        }
      }
    }
  }

  const suggestedTitle =
    existingTopic && existingTopic.trim().length > 0
      ? existingTopic.trim()
      : inferSuitableTitle(content, mode);

  const internationalMetrics = deriveInternationalMetrics({
    scores: calibrated.scores,
    content,
    internationalMetrics: {
      ieltsBand: calibrated.ieltsBand,
      toeflEquivalent: calibrated.toeflEquivalent,
      lexicalResource: calibrated.integrity.isGibberishOrLowEffort
        ? 1
        : clampRawScore(
            (calibrated.scores.claritySimplicity +
              calibrated.scores.concisenessDirectness) /
              2
          ),
      coherenceCohesion: calibrated.integrity.isGibberishOrLowEffort
        ? 1
        : clampRawScore(
            (calibrated.scores.naturalVoiceFlow +
              calibrated.scores.sentenceVarietyCadence) /
              2
          ),
      taskAchievement: calibrated.integrity.isGibberishOrLowEffort
        ? 1
        : clampRawScore(
            (calibrated.scores.claritySimplicity +
              calibrated.scores.toneEngagement) /
              2 +
              topicPenalty
          ),
      registerControl: calibrated.scores.toneEngagement,
      grammarAccuracy: calibrated.scores.grammarMechanics,
      fleschReadingEase: 0,
      fkGradeLevel: 0,
    },
  });

  if (calibrated.integrity.isGibberishOrLowEffort) {
    return {
      evaluationStatus: 'completed',
      modelUsed: 'instant-local',
      thinkingLevelUsed: 'LOCAL',
      isProvisionalInstant: true,
      suggestedTitle,
      scores: calibrated.scores,
      cefrLevel: calibrated.cefrLevel,
      internationalMetrics,
      toneVerdict:
        calibrated.integrity.reason ||
        'This input does not contain enough coherent English sentences to grade.',
      flowVerdict: `Detected ${words} tokens with low recognizable word coherence.`,
      feedbackImplemented: 'Baseline',
      whatImproved: 'Write at least 3 to 4 genuine sentences so the coach can evaluate your voice.',
      strictImprovements:
        'Replace scrambled or repeated text with a real spoken-style response to your topic.',
      grammarFixes,
      vocabUpgrades: [],
    };
  }

  const strengthParts: string[] = [];
  if (integrity.sentenceLengthStdDev >= 4.0 && sentences >= 3) {
    strengthParts.push(
      `Natural sentence-length variation across ${sentences} sentences keeps spoken pacing lively.`
    );
  } else if (lexicalDiversity >= 0.6 && words >= 35) {
    strengthParts.push(
      `Fresh vocabulary range (${Math.round(lexicalDiversity * 100)}% unique words) avoids flat repetition.`
    );
  } else {
    strengthParts.push(
      `Clear ${MODE_LABELS[mode].toLowerCase()} focus across ${words} words (${sentences} ${sentences === 1 ? 'sentence' : 'sentences'}).`
    );
  }

  const appliedLibrary = eieAnalysis.vocabularyComparison.appliedFromLibrary;
  if (appliedLibrary.length > 0) {
    const sampleHeadwords = appliedLibrary
      .slice(0, 2)
      .map((item) => `"${item.headword}"`)
      .join(', ');
    strengthParts.push(
      `Applied ${appliedLibrary.length} saved library ${
        appliedLibrary.length === 1 ? 'term' : 'terms'
      } (${sampleHeadwords}) naturally.`
    );
  }

  const strictParts: string[] = [];
  if (words < 45) {
    strictParts.push(
      `At ${words} words, this draft is still brief; expand with one concrete example or counter-point.`
    );
  }
  if (grammarFixes.length > 0) {
    strictParts.push(
      `Fix ${grammarFixes.length} flagged mechanics ${grammarFixes.length === 1 ? 'slip' : 'slips'} (starting with "${grammarFixes[0].original}").`
    );
  }
  const eieGrammarTip = eieAnalysis.suggestions.find(
    (s) => s.category === 'grammar' && s.id.startsWith('eie-')
  );
  if (eieGrammarTip) {
    strictParts.push(
      `${eieGrammarTip.title} ("${eieGrammarTip.excerpt}") — ${eieGrammarTip.suggestion}.`
    );
  }
  if (diag.fillerHits.length > 0) {
    const sampleFillers = diag.fillerHits.slice(0, 2).map((f) => `"${f.word}"`);
    strictParts.push(
      `Cut filler hedges like ${sampleFillers.join(' and ')} to make your claims hit harder.`
    );
  }
  if (integrity.longestSentenceWords > 30) {
    strictParts.push(
      `Your longest sentence runs ${integrity.longestSentenceWords} words; split it into two crisp breaths.`
    );
  }
  if (repeatedOpenerCount > 0) {
    strictParts.push(
      `You open multiple sentences with "${diag.repeatedOpeners[0].opener}"; vary your sentence starters.`
    );
  }
  if (passiveCount >= 2) {
    strictParts.push(
      `Convert ${passiveCount} passive constructions into direct active verbs.`
    );
  }
  if (topicPenalty < 0 && existingTopic) {
    strictParts.push(
      `Tie your draft more explicitly back to the stated prompt ("${existingTopic.slice(0, 48)}").`
    );
  }
  if (strictParts.length === 0) {
    strictParts.push(
      'Sharpen one abstract claim with a concrete physical detail, number, or real conversation beat.'
    );
  }

  const rewrittenSample = buildLocalRewriteSample(content, vocabUpgrades);

  const metricNotes: RubricMetricNotes = {
    naturalVoiceFlow:
      fillerCount > 0
        ? `Clear spoken intent, but ${fillerCount} hedge word${fillerCount === 1 ? '' : 's'} soften your conviction.`
        : `Direct spoken flow across ${words} words with minimal conversational drag.`,
    claritySimplicity:
      passiveCount >= 2
        ? `Core message comes through; converting ${passiveCount} passive verbs will sharpen clarity.`
        : `Clean, readable explanation at ${avgLen} words per sentence.`,
    grammarMechanics:
      grammarFixes.length > 0
        ? `${grammarFixes.length} local mechanics slip${grammarFixes.length === 1 ? '' : 's'} flagged for one-click repair.`
        : 'Clean local spelling and punctuation; connect API for deeper syntax analysis.',
    toneEngagement:
      topicPenalty < 0
        ? `Matches ${TONE_LABELS[tone]} tone, though prompt alignment looks light.`
        : `Steady ${TONE_LABELS[tone].toLowerCase()} register suited to ${MODE_LABELS[mode]}.`,
    sentenceVarietyCadence:
      integrity.longestSentenceWords > 32
        ? `Longest sentence runs ${integrity.longestSentenceWords} words; split it into two spoken breaths.`
        : `Sentence length spread (${integrity.sentenceLengthStdDev}w) keeps pacing readable.`,
    concisenessDirectness:
      fillerCount > 0 || avgLen > 24
        ? 'Tighten long clauses and cut filler hedges so key ideas land faster.'
        : 'Tight phrasing with low filler density.',
  };

  const pinpointedRewrites: PinpointedRewrite[] = [];
  if (rewrittenSample) {
    pinpointedRewrites.push({
      original: rewrittenSample.original,
      rewrite: rewrittenSample.improved,
      rule: rewrittenSample.why,
      category: 'Sentence Flow & Conciseness',
    });
  }
  for (const fix of grammarFixes.slice(0, 3)) {
    pinpointedRewrites.push({
      original: fix.original,
      rewrite: fix.corrected,
      rule: fix.rule,
      category: fix.category,
    });
  }

  const whatImprovedPoints: CoachHighlightPoint[] = [
    {
      title: 'Draft Structure',
      detail: strengthParts.join(' '),
    },
  ];

  const feedbackCheck: FeedbackImplementationDetail = {
    status: 'Baseline',
    implemented:
      grammarFixes.length === 0
        ? 'Zero offline spelling or punctuation slips detected in this draft.'
        : `Completed a ${words}-word draft in ${MODE_LABELS[mode]} mode.`,
    missed:
      strictParts[0] ||
      'Connect the AI Coach server for cross-session feedback implementation tracking.',
  };

  const taggedVocab: VocabSuggestion[] = vocabUpgrades.map((v) => ({
    ...v,
    contextTag: MODE_LABELS[mode],
  }));

  return {
    evaluationStatus: 'completed',
    modelUsed: 'offline-rubric',
    thinkingLevelUsed: 'LOCAL',
    isProvisionalInstant: false,
    suggestedTitle,
    scores: calibrated.scores,
    metricNotes,
    cefrLevel: calibrated.cefrLevel,
    internationalMetrics,
    toneVerdict:
      topicPenalty < 0
        ? `Reads in a ${TONE_LABELS[tone].toLowerCase()} voice, though topical alignment with the prompt looks light.`
        : `Fits ${TONE_LABELS[tone]} register for ${MODE_LABELS[mode]} across ${words} words.`,
    flowVerdict:
      avgLen >= 10 && avgLen <= 22
        ? `Averaging ${avgLen} words/sentence (spread ${integrity.sentenceLengthStdDev}w).`
        : avgLen < 10
          ? `Short choppy pacing at ${avgLen} words/sentence; connect closely linked thoughts.`
          : `Dense pacing at ${avgLen} words/sentence (longest: ${integrity.longestSentenceWords}w); break up long clauses.`,
    feedbackImplemented: 'Baseline',
    feedbackCheck,
    whatImproved: strengthParts.join(' '),
    whatImprovedPoints,
    strictImprovements: strictParts.slice(0, 2).join(' '),
    pinpointedRewrites,
    rewrittenSample,
    grammarFixes,
    vocabUpgrades: taggedVocab,
    routingMeta: {
      model: 'offline-rubric',
      thinkingLevel: 'LOCAL',
      tierLabel: 'Offline Rubric',
      reason: 'Evaluated locally because the AI Coach backend was unreachable.',
    },
  };
}

/**
 * Decides whether to keep or remove a loaded random topic when the writer
 * closes the random topic prompt strip:
 * - If the writer added or modified body content AFTER clicking random (and body is non-empty), keep the topic.
 * - Otherwise (body is empty OR unchanged since before clicking random), remove/revert the loaded random topic.
 */
export function resolveRandomTopicDismiss(
  input: RandomTopicDismissInput
): RandomTopicDismissResult {
  const {
    currentTopic,
    currentContent,
    loadedRandomTopic,
    contentSnapshotAtPick,
    previousTopicAtPick,
  } = input;

  const trimmedContent = currentContent.trim();
  const wroteAfterRandomClick =
    trimmedContent.length > 0 && currentContent !== contentSnapshotAtPick;

  if (wroteAfterRandomClick) {
    return {
      nextTopic: currentTopic,
      keptTopic: true,
    };
  }

  // No new writing happened after picking the random topic.
  // Only revert/clear if the title is still the loaded random topic (don't clobber a manual title edit).
  if (
    loadedRandomTopic !== null &&
    currentTopic.trim() === loadedRandomTopic.trim()
  ) {
    return {
      nextTopic: previousTopicAtPick,
      keptTopic: false,
    };
  }

  return {
    nextTopic: currentTopic,
    keptTopic: false,
  };
}

/**
 * Psychology-informed studio greeting that reduces blank-page pressure
 * by replacing an imperative command ("Write, Name") with a calm,
 * welcoming invitation anchored to the writer's time of day.
 */
export function getStudioGreeting(
  displayName?: string,
  hour: number = new Date().getHours()
): StudioGreeting {
  const cleanName = displayName?.trim() || '';

  if (!cleanName) {
    if (hour >= 5 && hour < 12) {
      return {
        headline: 'Your morning page is open',
        sublinePrefix: 'Quiet space to think in ink',
      };
    }
    if (hour >= 12 && hour < 17) {
      return {
        headline: 'Your page is open',
        sublinePrefix: 'A calm space for clear thought',
      };
    }
    if (hour >= 17 && hour < 22) {
      return {
        headline: 'An unhurried evening page',
        sublinePrefix: 'Put the day into words',
      };
    }
    return {
      headline: 'A quiet night page',
      sublinePrefix: 'Write freely at your own pace',
    };
  }

  if (hour >= 5 && hour < 12) {
    return {
      headline: `Good morning, ${cleanName}`,
      sublinePrefix: 'Your page is open',
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      headline: `Good afternoon, ${cleanName}`,
      sublinePrefix: 'Your page is open',
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      headline: `Good evening, ${cleanName}`,
      sublinePrefix: 'Your page is open',
    };
  }
  return {
    headline: `A quiet night, ${cleanName}`,
    sublinePrefix: 'Your page is open',
  };
}

const SHORT_WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Formats the writer's chosen practice weekdays (0=Sun .. 6=Sat) into a
 * clean, contradiction-free schedule label (never hardcoded to "Tri-Weekly").
 */
export function formatWritingDaysSummary(preferredDays?: number[]): {
  label: string;
  shortList: string;
  countPerWeek: number;
  mondayFirstIndices: Set<number>;
} {
  const normalized = Array.from(
    new Set(
      (preferredDays && preferredDays.length > 0 ? preferredDays : [3, 5, 0]).filter(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      )
    )
  );

  // Order Monday-first for crisp calendar readability (Mon=0 .. Sun=6)
  const sortedMondayFirst = [...normalized].sort(
    (a, b) => ((a + 6) % 7) - ((b + 6) % 7)
  );

  const mondayFirstIndices = new Set(sortedMondayFirst.map((d) => (d + 6) % 7));
  const shortList = sortedMondayFirst.map((d) => SHORT_WEEKDAY_NAMES[d]).join(' · ');

  let label: string;
  if (sortedMondayFirst.length === 7) {
    label = 'Daily rhythm';
  } else if (
    sortedMondayFirst.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => normalized.includes(d))
  ) {
    label = 'Weekday rhythm';
  } else if (
    sortedMondayFirst.length === 2 &&
    normalized.includes(0) &&
    normalized.includes(6)
  ) {
    label = 'Weekend rhythm';
  } else {
    label = `${sortedMondayFirst.length} ${sortedMondayFirst.length === 1 ? 'day' : 'days'}/week`;
  }

  return {
    label,
    shortList,
    countPerWeek: sortedMondayFirst.length,
    mondayFirstIndices,
  };
}

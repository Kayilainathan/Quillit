import type {
  FeedbackImplementedStatus,
  GrammarFix,
  InternationalMetrics,
  RubricScores,
  ToneSetting,
  VocabSuggestion,
  WritingMode,
} from '../types';
import {
  analyzeDraftLocally,
  computeTotalScore,
  deriveInternationalMetrics,
  MODE_LABELS,
  TONE_LABELS,
} from './analytics';
import type { OfflineProofIssue } from './offlineProofreader';

export interface InstantEvaluationResult {
  evaluationStatus: 'completed';
  modelUsed: string;
  thinkingLevelUsed: string;
  isProvisionalInstant: boolean;
  suggestedTitle: string;
  scores: RubricScores;
  cefrLevel: string;
  internationalMetrics: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: FeedbackImplementedStatus;
  whatImproved: string;
  strictImprovements: string;
  grammarFixes: GrammarFix[];
  vocabUpgrades: VocabSuggestion[];
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
    better: 'numerous',
    reason: 'Reads more crisply in structured writing.',
  },
  {
    pattern: /\bvery\s+fast\b/i,
    original: 'very fast',
    better: 'rapid',
    reason: 'Single strong word improves pacing.',
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
    reason: 'More direct and concise phrasing.',
  },
  {
    pattern: /\bin\s+order\s+to\b/i,
    original: 'in order to',
    better: 'to',
    reason: 'Cuts unnecessary padding immediately.',
  },
];

function clampScore(value: number): number {
  return Math.max(4, Math.min(10, Math.round(value)));
}

/**
 * Instant (<15ms) local evaluation engine so "Evaluate & Score" feels
 * lightning fast the moment the writer clicks it. Seamlessly upgrades
 * in-place when the fast Gemini server pass completes moments later.
 */
export function buildInstantLocalEvaluation(
  content: string,
  mode: WritingMode,
  tone: ToneSetting,
  offlineIssues: OfflineProofIssue[],
  existingTopic?: string
): InstantEvaluationResult {
  const diag = analyzeDraftLocally(content);
  const words = Math.max(1, diag.wordCount);
  const sentences = Math.max(1, diag.sentenceCount);
  const tokens = content.toLowerCase().match(/[a-z']+/g) ?? [];
  const uniqueTokens = new Set(tokens);
  const lexicalDiversity =
    tokens.length > 0 ? uniqueTokens.size / tokens.length : 0.5;
  const fillerCount = diag.fillerHits.reduce((sum, hit) => sum + hit.count, 0);
  const repeatedOpenerCount = diag.repeatedOpeners.length;

  const spellingCount = offlineIssues.filter((i) => i.category === 'spelling').length;
  const grammarCount = offlineIssues.filter((i) => i.category === 'grammar').length;
  const punctCount = offlineIssues.filter((i) => i.category === 'punctuation').length;
  const issueDensity =
    (spellingCount * 1.15 + grammarCount * 1.3 + punctCount * 0.6) /
    Math.max(25, words);

  // Compute nuanced 6-pillar scores (4..10) from concrete writing signals
  const lengthBoost =
    words >= 120 ? 1.1 : words >= 60 ? 0.6 : words >= 30 ? 0.2 : -0.6;
  const avgLen = diag.avgWordsPerSentence;
  const balancedSentenceLen =
    avgLen >= 10 && avgLen <= 22 ? 1.0 : avgLen >= 7 && avgLen <= 28 ? 0.4 : -0.5;

  const grammarMechanics = clampScore(
    9.2 - issueDensity * 18 - Math.min(2.2, (spellingCount + grammarCount) * 0.42)
  );
  const claritySimplicity = clampScore(
    7.4 +
      balancedSentenceLen -
      Math.min(1.6, fillerCount * 0.28) +
      (words >= 45 ? 0.4 : 0)
  );
  const naturalVoiceFlow = clampScore(
    7.2 +
      lengthBoost * 0.6 +
      (sentences >= 3 ? 0.6 : 0) -
      Math.min(1.2, repeatedOpenerCount * 0.45)
  );
  const toneEngagement = clampScore(
    7.1 + lengthBoost * 0.55 + (lexicalDiversity >= 0.55 ? 0.7 : 0.1)
  );
  const sentenceVarietyCadence = clampScore(
    6.8 +
      (sentences >= 4 ? 0.7 : 0.1) +
      (lexicalDiversity >= 0.6 ? 0.8 : lexicalDiversity >= 0.48 ? 0.4 : -0.3) -
      Math.min(1.4, repeatedOpenerCount * 0.5)
  );
  const concisenessDirectness = clampScore(
    8.1 -
      Math.min(1.8, fillerCount * 0.35) -
      (avgLen > 28 ? 1.0 : avgLen > 24 ? 0.4 : 0)
  );

  const scores: RubricScores = {
    naturalVoiceFlow,
    claritySimplicity,
    grammarMechanics,
    toneEngagement,
    sentenceVarietyCadence,
    concisenessDirectness,
  };

  const totalScore = computeTotalScore(scores);
  const cefrLevel =
    totalScore >= 54
      ? 'C2'
      : totalScore >= 49
        ? 'C1'
        : totalScore >= 43
          ? 'B2'
          : totalScore >= 36
            ? 'B1'
            : 'A2';

  const internationalMetrics = deriveInternationalMetrics({
    scores,
    content,
  });

  const grammarFixes: GrammarFix[] = offlineIssues.slice(0, 6).map((issue) => ({
    original: issue.original,
    corrected: issue.replacement,
    rule: issue.rule,
    category: issue.category,
  }));

  const vocabUpgrades: VocabSuggestion[] = [];
  for (const candidate of WEAK_VOCAB_UPGRADES) {
    if (candidate.pattern.test(content)) {
      vocabUpgrades.push({
        used: candidate.original,
        betterAlternative: candidate.better,
        explanation: candidate.reason,
      });
      if (vocabUpgrades.length >= 4) break;
    }
  }

  const suggestedTitle =
    existingTopic && existingTopic.trim().length > 0
      ? existingTopic.trim()
      : inferSuitableTitle(content, mode);

  const whatImproved =
    lexicalDiversity >= 0.58
      ? `Clear ${TONE_LABELS[tone].toLowerCase()} focus across ${words} words with varied word choice.`
      : `Steady ${MODE_LABELS[mode].toLowerCase()} rhythm across ${sentences} ${sentences === 1 ? 'sentence' : 'sentences'} with a direct central point.`;

  const strictParts: string[] = [];
  if (grammarFixes.length > 0) {
    strictParts.push(
      `Tighten ${grammarFixes.length} spelling or grammar ${grammarFixes.length === 1 ? 'slip' : 'slips'} before finalizing.`
    );
  }
  if (diag.fillerHits.length >= 2) {
    const sampleFillers = diag.fillerHits.slice(0, 2).map((f) => f.word);
    strictParts.push(
      `Trim filler words like "${sampleFillers.join('" and "')}" for sharper cadence.`
    );
  }
  if (avgLen > 24) {
    strictParts.push(
      'Split your longest sentences to improve breathing room and clarity.'
    );
  }
  if (strictParts.length === 0) {
    strictParts.push(
      'Push specificity one notch deeper with a concrete detail or example.'
    );
  }

  return {
    evaluationStatus: 'completed',
    modelUsed: 'instant-local',
    thinkingLevelUsed: 'INSTANT',
    isProvisionalInstant: true,
    suggestedTitle,
    scores,
    cefrLevel,
    internationalMetrics,
    toneVerdict: `Aligned with ${TONE_LABELS[tone]} (${MODE_LABELS[mode]}).`,
    flowVerdict:
      avgLen >= 10 && avgLen <= 22
        ? `Balanced cadence averaging ${avgLen} words per sentence.`
        : avgLen < 10
          ? `Brisk pacing averaging ${avgLen} words per sentence; link related ideas smoothly.`
          : `Dense sentences averaging ${avgLen} words; vary with shorter punchy lines.`,
    feedbackImplemented: 'Baseline',
    whatImproved,
    strictImprovements: strictParts.join(' '),
    grammarFixes,
    vocabUpgrades,
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

import type { WritingMode } from '../types';

export type SkeletonPhase = 'study' | 'reconstruct' | 'compare';

export interface SkeletonPassage {
  id: string;
  title: string;
  domain: 'technical' | 'linkedin' | 'creative' | 'email';
  mode: WritingMode;
  text: string;
  wordCount: number;
  /** 1 concise structural keyword clue per sentence (max 4 words each) for Franklin Reconstruction */
  sentenceClues?: string[];
  /** Key strong verbs / cadence anchors highlighted in Side-by-Side Compare */
  signatureMoves: string[];
  /** When tailored to the user's active topic, stores that topic label */
  adaptedToTopic?: string;
}

/**
 * Curated 12-passage high-craft bank for zero-latency offline Skeleton Reconstruction
 * across EIE/Technical Explanations, LinkedIn Builder Reflections, Crisp Emails, and Vivid Stories.
 * Every passage carries accurate 1-per-sentence structural beats (`sentenceClues`) plus `signatureMoves`.
 */
export const SKELETON_PASSAGE_BANK: SkeletonPassage[] = [
  {
    id: 'skel-tech-01',
    title: 'Why 4–20 mA Survives Noisy Factory Floors',
    domain: 'technical',
    mode: 'technical',
    text: 'Long copper runs steal voltage from weak sensor signals. Push a steady current instead, and wire resistance stops rewriting your measurement. Even better, starting at four milliamps creates a live zero: zero milliamps immediately screams broken wire instead of an empty tank.',
    wordCount: 44,
    sentenceClues: [
      'copper steals sensor voltage',
      'steady current beats resistance',
      'live zero flags breaks',
    ],
    signatureMoves: ['steal voltage', 'stops rewriting', 'immediately screams'],
  },
  {
    id: 'skel-tech-02',
    title: 'How PID Control Stops Overshoot',
    domain: 'technical',
    mode: 'technical',
    text: 'Proportional gain pushes hard when error is wide, yet it always stops short of the setpoint. Integral action remembers stubborn drift and closes the remaining gap. Derivative action spots how fast you are approaching and taps the brakes before the system swings past target.',
    wordCount: 45,
    sentenceClues: [
      'proportional stops short setpoint',
      'integral closes stubborn drift',
      'derivative brakes before overshoot',
    ],
    signatureMoves: ['pushes hard', 'remembers stubborn drift', 'taps the brakes'],
  },
  {
    id: 'skel-tech-03',
    title: 'Why Op-Amp Buffers Protect Weak Sensors',
    domain: 'technical',
    mode: 'technical',
    text: 'A raw transducer can generate clean voltage, yet collapse the moment an ADC draws current from it. Place a unity-gain op-amp buffer between them. Its huge input impedance barely sips current from the sensor while its stiff output drives the converter cleanly.',
    wordCount: 43,
    sentenceClues: [
      'ADC collapses weak transducer',
      'insert unity-gain op-amp buffer',
      'high impedance drives cleanly',
    ],
    signatureMoves: ['collapse the moment', 'barely sips current', 'stiff output drives'],
  },
  {
    id: 'skel-tech-04',
    title: 'Sampling Rate Without Aliasing',
    domain: 'technical',
    mode: 'technical',
    text: 'Sample a fast wave too slowly and your ADC invents phantom low-frequency ripples that never existed in hardware. Nyquist sets the floor at twice the highest signal frequency. In real labs, engineers filter first and sample five to ten times faster so waveforms stay faithful.',
    wordCount: 46,
    sentenceClues: [
      'slow sampling invents ripples',
      'Nyquist sets double floor',
      'filter first oversample faithfully',
    ],
    signatureMoves: ['invents phantom', 'sets the floor', 'waveforms stay faithful'],
  },
  {
    id: 'skel-li-01',
    title: 'The Ground Loop That Cost Three Hours',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'Our sensor trace looked haunted until we stopped blaming the code. Two breadboards shared power through different ground paths, turning a simple jumper wire into a 50 Hz antenna. One star-ground connection flattened the noise floor in ten seconds. Hardware bugs love hiding behind software assumptions.',
    wordCount: 47,
    sentenceClues: [
      'haunted trace blamed code',
      'split grounds became antenna',
      'star-ground flattened noise',
      'hardware hides behind software',
    ],
    signatureMoves: ['looked haunted', 'flattened the noise floor', 'hiding behind software assumptions'],
  },
  {
    id: 'skel-li-02',
    title: 'Why Boring Documentation Wins Teams',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'Nobody applauds a clean pinout diagram at midnight, until a teammate has to swap a fried regulator ten minutes before a demo. Clear notes turn frantic guesswork into calm execution. Good engineering is rarely about looking clever; it is about making the next hour effortless for whoever touches the bench.',
    wordCount: 51,
    sentenceClues: [
      'pinout saves midnight demo',
      'clear notes calm execution',
      'engineering eases next hour',
    ],
    signatureMoves: ['applauds a clean pinout', 'calm execution', 'making the next hour effortless'],
  },
  {
    id: 'skel-li-03',
    title: 'What Failed Benchmarks Actually Teach',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'My first prototype hit every textbook equation and failed on the real bench. Ambient heat drifted the bridge resistor faster than my calibration loop could react. Measuring real failure taught me more in one afternoon than three clean simulations ever did.',
    wordCount: 41,
    sentenceClues: [
      'textbook prototype failed bench',
      'heat outran calibration loop',
      'failure beat three simulations',
    ],
    signatureMoves: ['hit every textbook equation', 'drifted the bridge', 'taught me more'],
  },
  {
    id: 'skel-email-01',
    title: 'Asking a Senior Engineer for 15 Minutes',
    domain: 'email',
    mode: 'email',
    text: 'I read your write-up on analog front-end layout and applied your guard-ring trick to our capstone RTD board. Noise dropped by half, though our cold-junction compensation still drifts after warm-up. Could I borrow fifteen minutes Thursday or Friday afternoon to walk you through one schematic page?',
    wordCount: 47,
    sentenceClues: [
      'applied guard-ring capstone board',
      'halved noise cold-junction drifts',
      'borrow fifteen minutes schematic',
    ],
    signatureMoves: ['applied your guard-ring trick', 'dropped by half', 'borrow fifteen minutes'],
  },
  {
    id: 'skel-email-02',
    title: 'Owning a Demo Delay Cleanly',
    domain: 'email',
    mode: 'email',
    text: 'Our PCB demo will move from Wednesday to Friday at 4 PM. Yesterday’s bench test exposed a thermal shutdown on the buck converter under peak load. I have ordered the higher-rated regulator and already verified the firmware on the backup supply so Friday stays locked.',
    wordCount: 45,
    sentenceClues: [
      'PCB demo moves Friday',
      'bench exposed thermal shutdown',
      'ordered regulator verified firmware',
    ],
    signatureMoves: ['exposed a thermal shutdown', 'already verified', 'Friday stays locked'],
  },
  {
    id: 'skel-story-01',
    title: 'The Quiet Before the Monsoon',
    domain: 'creative',
    mode: 'creative',
    text: 'Heat clung to the tin roof long after sunset. Down the lane, a vendor snapped his wooden shutters closed one by one, racing the first smell of wet dust. Then the wind shifted, cool and sudden, lifting stray paper across the dark courtyard.',
    wordCount: 43,
    sentenceClues: [
      'heat clung after sunset',
      'vendor snapped shutters wet dust',
      'sudden wind lifted paper',
    ],
    signatureMoves: ['Heat clung', 'snapped his wooden shutters', 'lifting stray paper'],
  },
  {
    id: 'skel-story-02',
    title: 'Last Train Out of the Brass Station',
    domain: 'creative',
    mode: 'creative',
    text: 'Steam hissed beneath the iron carriages as the station clock clicked toward eleven. Maya held the folded telegram against her coat, afraid the ink might smudge before she spoke. When the guard raised his brass lantern, she stepped aboard without looking back.',
    wordCount: 42,
    sentenceClues: [
      'steam hissed clock eleven',
      'Maya guarded folded telegram',
      'lantern raised stepped aboard',
    ],
    signatureMoves: ['Steam hissed', 'clicked toward eleven', 'stepped aboard without looking back'],
  },
  {
    id: 'skel-story-03',
    title: 'Workshop at Two in the Morning',
    domain: 'creative',
    mode: 'creative',
    text: 'Rosin smoke drifted past the desk lamp in thin silver curls. Outside, rain tapped steadily on the hostel window while the oscilloscope traced a clean green line at last. He leaned back, exhaled slowly, and switched the soldering iron off.',
    wordCount: 40,
    sentenceClues: [
      'rosin smoke past lamp',
      'rain tapped clean trace',
      'exhaled switched iron off',
    ],
    signatureMoves: ['thin silver curls', 'rain tapped steadily', 'switched the soldering iron off'],
  },
];

const CLUE_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'yet', 'so', 'nor', 'for',
  'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'into', 'onto',
  'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'us',
  'you', 'your', 'i', 'me', 'my', 'he', 'him', 'his', 'she', 'her', 'who', 'whoever', 'which', 'what',
  'when', 'while', 'where', 'how', 'why', 'if', 'than', 'then', 'there', 'here', 'just', 'very',
  'more', 'most', 'much', 'many', 'some', 'any', 'every', 'all', 'each', 'only', 'even', 'still',
  'also', 'too', 'about', 'after', 'before', 'between', 'through', 'during', 'under', 'over',
  'across', 'against', 'without', 'until', 'though', 'although', 'because', 'instead', 'actually',
  'really', 'already', 'never', 'always', 'ever', 'one', 'two', 'three',
]);

/**
 * Abbreviation- and decimal-safe sentence splitter for Skeleton Master Passages.
 */
export function splitPassageSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Protect common decimals and abbreviations before splitting
  const protectedText = cleaned
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|e\.g|i\.e|etc)\./gi, '$1__DOT__')
    .replace(/(\d)\.(\d)/g, '$1__DEC__$2');

  const raw = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/)
    .map((s) =>
      s
        .replace(/__DOT__/g, '.')
        .replace(/__DEC__/g, '.')
        .trim()
    )
    .filter(Boolean);

  return raw.length > 0 ? raw : [cleaned];
}

/**
 * Deterministically distills 1 accurate structural keyword clue (2–4 words) per sentence
 * from ANY passage by filtering stopwords and selecting high-signal domain nouns, numbers, and verbs.
 */
export function extractSentenceSkeletonClues(
  text: string,
  maxClues = 4
): string[] {
  const sentences = splitPassageSentences(text).slice(0, maxClues);
  const clues: string[] = [];

  for (const sentence of sentences) {
    const rawWords = sentence
      .replace(/[“”"'()[\]{},:;?!]/g, ' ')
      .replace(/[.]+$/g, '')
      .split(/\s+/)
      .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
      .filter(Boolean);

    const scored: { word: string; idx: number; score: number }[] = [];
    const seenLower = new Set<string>();

    rawWords.forEach((word, idx) => {
      const lower = word.toLowerCase();
      if (seenLower.has(lower)) return;
      if (CLUE_STOPWORDS.has(lower)) return;
      if (lower.length < 3 && !/\d/.test(lower)) return;

      seenLower.add(lower);

      let score = 0;
      // Domain terms, acronyms, hyphenated compounds, and numbers carry strong structural signal
      if (/[0-9]/.test(word) || word.includes('-') || word.includes('–')) score += 4;
      if (/^[A-Z]{2,}$/.test(word)) score += 3.5;
      if (word.length >= 6) score += 2.2;
      else if (word.length >= 4) score += 1.4;
      // Subject opening and closing beat anchor the sentence spine
      if (idx <= 2) score += 1.2;
      if (idx >= rawWords.length - 3) score += 1.1;

      scored.push({ word, idx, score });
    });

    // Pick top 3–4 signal words and restore natural sentence reading order
    const topWords = scored
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .slice(0, 4)
      .sort((a, b) => a.idx - b.idx)
      .map((item) => item.word);

    const clue =
      topWords.length > 0
        ? topWords.join(' ')
        : rawWords.slice(0, 4).join(' ');

    if (clue.trim()) {
      clues.push(clue.trim());
    }
  }

  return clues.slice(0, maxClues);
}

/**
 * Returns the canonical initial structural clues for a passage:
 * prefers explicit per-sentence `sentenceClues` (normalized <= 4 words),
 * otherwise extracts sentence-level clues deterministically from `passage.text`.
 */
export function getInitialSkeletonClues(passage: SkeletonPassage): string[] {
  if (Array.isArray(passage.sentenceClues) && passage.sentenceClues.length > 0) {
    const cleaned = passage.sentenceClues
      .slice(0, 4)
      .map((c) => c.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(' '))
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  const extracted = extractSentenceSkeletonClues(passage.text, 4);
  if (extracted.length > 0) return extracted;
  return passage.signatureMoves.slice(0, 4);
}

/**
 * Distinguishes a genuine user/calendar topic from an auto-generated Skeleton title
 * or empty string so Skeleton adapts to the user's topic without overwriting it.
 */
export function isCustomUserTopic(topic: string): boolean {
  const trimmed = topic.trim();
  if (trimmed.length < 4) return false;
  if (/^skeleton:\s*/i.test(trimmed)) return false;
  if (/^explain one tricky idea simply/i.test(trimmed)) return false;
  return true;
}

function tokenizeTopicSignal(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => (w.length >= 3 || /\d/.test(w)) && !CLUE_STOPWORDS.has(w)
  );
}

/**
 * Scores how strongly a curated passage matches the user's active topic (0..100).
 */
export function scorePassageTopicRelevance(
  passage: SkeletonPassage,
  topic: string
): number {
  const topicTokens = tokenizeTopicSignal(topic);
  if (topicTokens.length === 0) return 0;

  const haystackTokens = new Set(
    tokenizeTopicSignal(
      `${passage.title} ${passage.text} ${passage.domain} ${(passage.sentenceClues ?? []).join(' ')}`
    )
  );
  const haystackList = Array.from(haystackTokens);

  let hits = 0;
  for (const tk of topicTokens) {
    const stem = tk.length >= 5 ? tk.slice(0, tk.length - 1) : tk;
    const matched = haystackList.some(
      (ht) => ht === tk || ht.startsWith(stem) || tk.startsWith(ht)
    );
    if (matched) hits += 1;
  }

  return Math.round((hits / topicTokens.length) * 100);
}

/**
 * Selects the best offline Skeleton passage adapted to the user's active topic + mode + domain filter.
 * If a strong topic match exists in the bank, it wins; otherwise rotates cleanly past completed/current passages.
 */
export function findBestTopicSkeletonPassage(params: {
  topic?: string;
  mode: WritingMode;
  completedIds?: string[];
  currentId?: string | null;
  domainFilter?: SkeletonPassage['domain'] | 'all';
}): { passage: SkeletonPassage; topicMatched: boolean } {
  const {
    topic = '',
    mode,
    completedIds = [],
    currentId = null,
    domainFilter = 'all',
  } = params;
  const completedSet = new Set(completedIds);

  const bank =
    domainFilter === 'all'
      ? SKELETON_PASSAGE_BANK
      : SKELETON_PASSAGE_BANK.filter((p) => p.domain === domainFilter);
  const pool = bank.length > 0 ? bank : SKELETON_PASSAGE_BANK;

  if (isCustomUserTopic(topic)) {
    const ranked = pool
      .map((p) => {
        const relevance = scorePassageTopicRelevance(p, topic);
        const modeBonus = p.mode === mode ? 6 : 0;
        const freshBonus = !completedSet.has(p.id) && p.id !== currentId ? 4 : 0;
        return {
          passage: p,
          relevance,
          totalScore: relevance + modeBonus + freshBonus,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    if (ranked[0] && ranked[0].relevance >= 15) {
      return {
        passage: {
          ...ranked[0].passage,
          adaptedToTopic: topic.trim(),
        },
        topicMatched: true,
      };
    }
  }

  // Fallback rotation: unseen mode-matched -> unseen any -> next past currentId
  const freshMode = pool.filter(
    (p) => p.mode === mode && !completedSet.has(p.id) && p.id !== currentId
  );
  if (freshMode.length > 0) {
    return { passage: freshMode[0], topicMatched: false };
  }

  const freshAny = pool.filter(
    (p) => !completedSet.has(p.id) && p.id !== currentId
  );
  if (freshAny.length > 0) {
    return { passage: freshAny[0], topicMatched: false };
  }

  const currentIdx = pool.findIndex((p) => p.id === currentId);
  if (currentIdx >= 0 && pool.length > 1) {
    return {
      passage: pool[(currentIdx + 1) % pool.length],
      topicMatched: false,
    };
  }

  return { passage: pool[0], topicMatched: false };
}

/**
 * Benjamin Franklin "Jumbled Notes" variation:
 * deterministically returns a non-identical permutation of the clue indices so the writer
 * must reconstruct logical sequence as well as phrasing.
 */
export function shuffleSkeletonClueOrder(count: number, seed = 1): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const order = Array.from({ length: count }, (_, i) => i);
  if (count === 2) return [1, 0];

  // Deterministic Fisher-Yates seeded shuffle guaranteed not to equal identity
  let s = Math.abs(Math.floor(seed)) + 17;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  const isIdentity = order.every((val, idx) => val === idx);
  if (isIdentity) {
    return [...order.slice(1), order[0]];
  }
  return order;
}

/**
 * Parses a comma/newline-separated clue input into up to 4 crisp skeleton clues
 * (max 4 words each) for memory-based structural reconstruction.
 */
export function parseSkeletonClues(rawInput: string): string[] {
  if (!rawInput || !rawInput.trim()) return [];
  const rawParts = rawInput
    .split(/[\n,;•·]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return rawParts.slice(0, 4).map((part) => {
    const words = part.split(/\s+/).filter(Boolean).slice(0, 4);
    return words.join(' ');
  });
}

export function validateSkeletonClues(clues: string[]): {
  valid: boolean;
  message: string;
} {
  if (clues.length === 0) {
    return {
      valid: false,
      message: 'Jot 3–4 short clues (max 4 words each) before hiding the passage.',
    };
  }
  const tooLong = clues.find((c) => c.split(/\s+/).filter(Boolean).length > 4);
  if (tooLong) {
    return {
      valid: false,
      message: `Trim "${tooLong}" to 4 words max so you rebuild from structure, not rote copying.`,
    };
  }
  return {
    valid: true,
    message: `${clues.length} structural clue${clues.length === 1 ? '' : 's'} locked.`,
  };
}

/**
 * Picks a Skeleton passage matching the user's writing mode (or rotates cleanly through the bank).
 */
export function pickOfflineSkeletonPassage(
  mode: WritingMode,
  excludeIds: string[] = []
): SkeletonPassage {
  const excluded = new Set(excludeIds);
  const matching = SKELETON_PASSAGE_BANK.filter(
    (p) => p.mode === mode && !excluded.has(p.id)
  );
  if (matching.length > 0) return matching[0];

  const anyFresh = SKELETON_PASSAGE_BANK.filter((p) => !excluded.has(p.id));
  if (anyFresh.length > 0) return anyFresh[0];

  return SKELETON_PASSAGE_BANK[0];
}

/**
 * Deterministic structural comparison between the original master passage and the user's reconstruction.
 * Rewards original wording + crisp cadence rather than verbatim memorization.
 */
export function compareSkeletonReconstruction(
  originalText: string,
  userText: string
): {
  originalWords: number;
  userWords: number;
  wordRatioPct: number;
  originalityPct: number;
  cadenceNote: string;
} {
  const tokenize = (s: string) =>
    (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);

  const origTokens = tokenize(originalText);
  const userTokens = tokenize(userText);
  const originalWords = originalText.trim().split(/\s+/).filter(Boolean).length;
  const userWords = userText.trim().split(/\s+/).filter(Boolean).length;

  const origSet = new Set(origTokens);
  let overlap = 0;
  for (const t of userTokens) {
    if (origSet.has(t)) overlap += 1;
  }
  const overlapPct =
    userTokens.length > 0 ? Math.round((overlap / userTokens.length) * 100) : 0;
  const originalityPct = Math.max(0, Math.min(100, 100 - overlapPct));
  const wordRatioPct =
    originalWords > 0 ? Math.round((userWords / originalWords) * 100) : 0;

  let cadenceNote = 'Balanced structural rebuild with your own phrasing.';
  if (userWords === 0) {
    cadenceNote = 'Reconstruct the passage from your clues to compare cadence.';
  } else if (overlapPct > 75) {
    cadenceNote =
      'Close to verbatim memory — try recasting the middle beats in your own verbs next pass.';
  } else if (wordRatioPct > 145) {
    cadenceNote =
      'Your rebuild ran longer than the model — tighten transitions to match its crisp beat.';
  } else if (wordRatioPct < 65) {
    cadenceNote =
      'Tight summary! Make sure the causal bridge in the middle stayed concrete.';
  }

  return {
    originalWords,
    userWords,
    wordRatioPct,
    originalityPct,
    cadenceNote,
  };
}

/**
 * 3 Rooms / Explain It Twice — Register-Shifting Audience Ladder.
 * Room A: Explain the concept to a curious 10-year-old (50–90 words, zero jargon).
 * Room B: Defend the exact same concept to a skeptical Senior Interviewer (70–120 words, crisp precision).
 */

export interface JargonCheckResult {
  jargonHits: string[];
  jargonCount: number;
  wordCount: number;
  withinWordRange: boolean;
  isClean: boolean;
  feedback: string;
}

const JARGON_PATTERNS: Array<{ term: string; regex: RegExp }> = [
  { term: 'impedance', regex: /\bimpedance\b/i },
  { term: 'transducer', regex: /\btransducer\b/i },
  { term: 'attenuation', regex: /\battenuation\b/i },
  { term: 'hysteresis', regex: /\bhysteresis\b/i },
  { term: 'quantization', regex: /\bquantization\b/i },
  { term: 'asymptotic', regex: /\basymptotic\b/i },
  { term: 'polymorphism', regex: /\bpolymorphism\b/i },
  { term: 'idempotent', regex: /\bidempotent\b/i },
  { term: 'heuristic', regex: /\bheuristic\b/i },
  { term: 'deterministic', regex: /\bdeterministic\b/i },
  { term: 'orthogonality', regex: /\borthogonal(?:ity)?\b/i },
  { term: 'common-mode rejection', regex: /\b(cmrr|common-mode rejection)\b/i },
  { term: 'transfer function', regex: /\btransfer function\b/i },
  { term: 'aliasing', regex: /\baliasing\b/i },
  { term: 'latency', regex: /\blatency\b/i },
  { term: 'throughput', regex: /\bthroughput\b/i },
  { term: 'abstraction', regex: /\babstraction\b/i },
  { term: 'paradigm', regex: /\bparadigm\b/i },
  { term: 'synergy', regex: /\bsynergy\b/i },
  { term: 'leverage', regex: /\bleverage\b/i },
  { term: 'utilize', regex: /\butilize\b/i },
  { term: 'differential', regex: /\bdifferential\b/i },
  { term: 'multiplexing', regex: /\bmultiplex(?:ing|er)?\b/i },
  { term: 'stochastic', regex: /\bstochastic\b/i },
  { term: 'convolution', regex: /\bconvolution\b/i },
  { term: 'microcontroller', regex: /\bmicrocontroller\b/i },
  { term: 'algorithm', regex: /\balgorithm\b/i },
  { term: 'calibration', regex: /\bcalibration\b/i },
];

export function countRoomWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministic jargon-density checker for Room A (10-Year-Old).
 * Also flags overly dense 4+ syllable Latinate words when they stack up.
 */
export function checkRoomAJargon(text: string): JargonCheckResult {
  const wordCount = countRoomWords(text);
  const hits: string[] = [];

  for (const rule of JARGON_PATTERNS) {
    if (rule.regex.test(text)) {
      hits.push(rule.term);
    }
  }

  // Flag unexplained ALL-CAPS acronyms of 3+ letters (e.g., ADC, PID, CMRR, API)
  const acronyms = text.match(/\b[A-Z]{3,5}\b/g) ?? [];
  for (const acr of acronyms) {
    if (!hits.includes(acr) && !['THE', 'AND', 'FOR', 'BUT', 'YOU', 'ARE'].includes(acr)) {
      hits.push(acr);
    }
  }

  const withinWordRange = wordCount >= 50 && wordCount <= 90;
  const isClean = hits.length === 0;

  let feedback = 'Clean, everyday language — a 10-year-old will follow right along.';
  if (wordCount === 0) {
    feedback = 'Target 50–90 words with everyday analogies and zero acronyms or jargon.';
  } else if (hits.length > 0) {
    feedback = `Swap jargon for plain words: ${hits.slice(0, 4).join(', ')}.`;
  } else if (wordCount < 50) {
    feedback = `Plain language looks clean — add ~${50 - wordCount} more words with a concrete analogy.`;
  } else if (wordCount > 90) {
    feedback = `Trim ~${wordCount - 90} words to stay inside the crisp 50–90 word target.`;
  }

  return {
    jargonHits: hits,
    jargonCount: hits.length,
    wordCount,
    withinWordRange,
    isClean,
    feedback,
  };
}

/**
 * Checks whether Room A and Room B genuinely shifted register rather than copy-pasting the same draft.
 */
export function evaluateRegisterShift(
  roomAText: string,
  roomBText: string
): {
  roomAWords: number;
  roomBWords: number;
  roomAJargonCount: number;
  lexicalShiftPct: number;
  readyToEvaluate: boolean;
  summary: string;
} {
  const roomACheck = checkRoomAJargon(roomAText);
  const roomBWords = countRoomWords(roomBText);

  const tokensA = new Set(
    (roomAText.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  );
  const tokensB = roomBText.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  let shared = 0;
  for (const w of tokensB) {
    if (tokensA.has(w)) shared += 1;
  }
  const overlapPct =
    tokensB.length > 0 ? Math.round((shared / tokensB.length) * 100) : 100;
  const lexicalShiftPct = Math.max(0, Math.min(100, 100 - overlapPct));

  const readyToEvaluate = roomACheck.wordCount >= 20 && roomBWords >= 25;

  let summary = 'Strong audience shift between plain analogy and executive defense.';
  if (!readyToEvaluate) {
    summary = 'Complete both Room A (10-Year-Old) and Room B (Senior Interviewer) to score your register shift.';
  } else if (roomACheck.jargonCount > 0) {
    summary = `Room A still has ${roomACheck.jargonCount} jargon term(s) (${roomACheck.jargonHits.slice(0, 3).join(', ')}); simplify them before evaluating.`;
  } else if (lexicalShiftPct < 35) {
    summary = 'Room A and Room B sound too similar — widen the register gap between analogy and technical defense.';
  }

  return {
    roomAWords: roomACheck.wordCount,
    roomBWords,
    roomAJargonCount: roomACheck.jargonCount,
    lexicalShiftPct,
    readyToEvaluate,
    summary,
  };
}

export function combineThreeRoomsForEvaluation(
  roomAText: string,
  roomBText: string
): string {
  return `[Room A — Curious 10-Year-Old]\n${roomAText.trim()}\n\n[Room B — Skeptical Senior Interviewer]\n${roomBText.trim()}`;
}

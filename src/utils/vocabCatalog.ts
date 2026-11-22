import type { VocabEntry } from '../types';

export const VOCAB_CATEGORIES = [
  'Technical & Engineering',
  'Professional & Outreach',
  'Storytelling & Vivid',
  'Precision & Clarity',
  'Everyday Expression',
] as const;

export type VocabCategory = (typeof VOCAB_CATEGORIES)[number];

export const ALPHABET_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;

const TECHNICAL_REGEX =
  /\b(signal|sensor|adc|pcb|loop|drift|calibrat|diagnos|isolat|stabiliz|digitiz|interface|voltage|current|filter|impedance|firmware|latency|hardware|circuit|oscilloscope|bandwidth|telemetry|bottleneck|protocol|actuator|control|thermal|noise|amplifier|threshold|debug)\b/i;

const OUTREACH_REGEX =
  /\b(stakeholder|deliverable|milestone|follow-up|feedback|align|collaborat|mentor|recruiter|escalat|propos|outreach|negotiate|diplomatic|concise|executive|handover|agenda|timeline|clarify|appreciat|respectful|brief|pitch)\b/i;

const STORYTELLING_REGEX =
  /\b(whisper|flicker|echo|luminous|shadow|crimson|brass|storm|horizon|silence|rhythm|cadence|subtext|vivid|tense|metaphor|gaze|shimmer|ancient|velvet|rust|amber|weary|hesitat|linger|glint|solitary)\b/i;

const PRECISION_REGEX =
  /\b(consequently|however|whereas|nonetheless|precisely|substantiate|articulate|distinguish|contrast|eliminate|streamline|quantify|underscore|illustrate|reframe|crystallize|mitigate|verify|pinpoint|synthesiz)\b/i;

export function isValidVocabCategory(value: unknown): value is VocabCategory {
  return (
    typeof value === 'string' &&
    (VOCAB_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Deterministic, instantaneous semantic classifier used as default and offline
 * fallback whenever AI categorization is unavailable (e.g., static GitHub Pages).
 */
export function classifyVocabEntryLocally(entry: VocabEntry): VocabCategory {
  if (isValidVocabCategory(entry.aiCategory)) {
    return entry.aiCategory;
  }

  const text = `${entry.betterAlternative} ${entry.used} ${entry.explanation} ${entry.contextSnippet}`;

  if (TECHNICAL_REGEX.test(text) || entry.mode === 'technical') {
    return 'Technical & Engineering';
  }
  if (
    OUTREACH_REGEX.test(text) ||
    entry.mode === 'email' ||
    entry.mode === 'linkedin'
  ) {
    return 'Professional & Outreach';
  }
  if (STORYTELLING_REGEX.test(text) || entry.mode === 'creative') {
    return 'Storytelling & Vivid';
  }
  if (PRECISION_REGEX.test(text)) {
    return 'Precision & Clarity';
  }
  return 'Everyday Expression';
}

/**
 * Extracts the primary alphabetical display headword from a VocabEntry
 * (using the upgraded/target word or phrase).
 */
export function getVocabHeadword(entry: VocabEntry): string {
  const raw = (entry.betterAlternative || entry.used || '').trim();
  const primary = raw.split('/')[0]?.trim() || raw;
  return primary.replace(/^["'“”‘’(\[]+/, '').trim() || raw;
}

/**
 * Returns the A-Z index bucket for a VocabEntry (or '#' if non-alphabetic).
 */
export function getVocabInitialLetter(entry: VocabEntry): string {
  const head = getVocabHeadword(entry);
  const match = head.match(/[A-Za-z]/);
  if (!match) return '#';
  return match[0].toUpperCase();
}

export interface AlphabeticalVocabGroup {
  letter: string;
  entries: VocabEntry[];
}

/**
 * Sorts vocabulary entries strictly A-Z by headword and groups them under
 * editorial alphabetical section headers.
 */
export function groupVocabularyAlphabetically(entries: VocabEntry[]): {
  groups: AlphabeticalVocabGroup[];
  letterCounts: Record<string, number>;
} {
  const sorted = [...entries].sort((a, b) =>
    getVocabHeadword(a).localeCompare(getVocabHeadword(b), 'en', {
      sensitivity: 'base',
    })
  );

  const map = new Map<string, VocabEntry[]>();
  const letterCounts: Record<string, number> = {};

  for (const entry of sorted) {
    const letter = getVocabInitialLetter(entry);
    const bucket = map.get(letter) ?? [];
    bucket.push(entry);
    map.set(letter, bucket);
    letterCounts[letter] = (letterCounts[letter] ?? 0) + 1;
  }

  const orderedLetters = Array.from(map.keys()).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const groups: AlphabeticalVocabGroup[] = orderedLetters.map((letter) => ({
    letter,
    entries: map.get(letter) ?? [],
  }));

  return { groups, letterCounts };
}

/**
 * Applies AI-returned category mappings cleanly to a vocabulary list, falling back
 * to deterministic local classification for any unmapped items.
 */
export function applyAiCategoriesToVocabulary(
  entries: VocabEntry[],
  assignments:
    | Array<{ id: string; category: string }>
    | Record<string, string>
): VocabEntry[] {
  const assignMap = new Map<string, VocabCategory>();
  if (Array.isArray(assignments)) {
    for (const item of assignments) {
      if (item && typeof item.id === 'string' && isValidVocabCategory(item.category)) {
        assignMap.set(item.id, item.category);
      }
    }
  } else if (assignments && typeof assignments === 'object') {
    for (const [id, category] of Object.entries(assignments)) {
      if (typeof id === 'string' && isValidVocabCategory(category)) {
        assignMap.set(id, category);
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    aiCategory: assignMap.get(entry.id) ?? classifyVocabEntryLocally(entry),
  }));
}

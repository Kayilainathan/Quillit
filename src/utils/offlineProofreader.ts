export type OfflineIssueCategory = 'spelling' | 'punctuation' | 'grammar';

export interface OfflineProofIssue {
  id: string;
  category: OfflineIssueCategory;
  start: number;
  end: number;
  original: string;
  replacement: string;
  rule: string;
}

const COMMON_TYPOS: Record<string, string> = {
  teh: 'the',
  hte: 'the',
  adn: 'and',
  nad: 'and',
  taht: 'that',
  waht: 'what',
  wiht: 'with',
  wtih: 'with',
  form: 'from',
  thier: 'their',
  therei: 'their',
  recieve: 'receive',
  recieved: 'received',
  beleive: 'believe',
  beleived: 'believed',
  acheive: 'achieve',
  acheived: 'achieved',
  definately: 'definitely',
  definitly: 'definitely',
  seperate: 'separate',
  seperated: 'separated',
  occured: 'occurred',
  occuring: 'occurring',
  untill: 'until',
  becuase: 'because',
  beacuse: 'because',
  becouse: 'because',
  wich: 'which',
  whcih: 'which',
  alot: 'a lot',
  doesnt: "doesn't",
  dont: "don't",
  didnt: "didn't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  arent: "aren't",
  wasnt: "wasn't",
  werent: "weren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  shouldnt: "shouldn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  im: "I'm",
  ive: "I've",
  youre: "you're",
  theyre: "they're",
  weve: "we've",
  accomodate: 'accommodate',
  arguement: 'argument',
  begining: 'beginning',
  calender: 'calendar',
  commited: 'committed',
  concious: 'conscious',
  enviroment: 'environment',
  existance: 'existence',
  goverment: 'government',
  grammer: 'grammar',
  independant: 'independent',
  intresting: 'interesting',
  knowlege: 'knowledge',
  neccessary: 'necessary',
  occassion: 'occasion',
  persistant: 'persistent',
  posession: 'possession',
  priviledge: 'privilege',
  proffessional: 'professional',
  publically: 'publicly',
  realy: 'really',
  reccomend: 'recommend',
  refered: 'referred',
  relevent: 'relevant',
  rythm: 'rhythm',
  sucessful: 'successful',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  tounge: 'tongue',
  truely: 'truly',
  wierd: 'weird',
  writting: 'writing',
  langauge: 'language',
  sentance: 'sentence',
  puntuation: 'punctuation',
  speeling: 'spelling',
  freind: 'friend',
  peopel: 'people',
  poeple: 'people',
  throught: 'through',
  trough: 'through',
  diffrent: 'different',
  importent: 'important',
  experiance: 'experience',
  oppurtunity: 'opportunity',
  oppertunity: 'opportunity',
  developement: 'development',
  managment: 'management',
  perfomance: 'performance',
  explaination: 'explanation',
  maintenence: 'maintenance',
  buisness: 'business',
  collegue: 'colleague',
  suprise: 'surprise',
  usefull: 'useful',
  helpfull: 'helpful',
  thankfull: 'thankful',
};

// Exclude 'form' since it is a valid English word!
delete COMMON_TYPOS.form;

const AN_EXCEPTIONS_NEED_A = new Set([
  'uni',
  'university',
  'unique',
  'uniform',
  'union',
  'unit',
  'united',
  'user',
  'useful',
  'usual',
  'utensil',
  'one',
  'once',
  'european',
  'eulogy',
]);

const A_EXCEPTIONS_NEED_AN = new Set([
  'hour',
  'hours',
  'hourly',
  'honest',
  'honestly',
  'honor',
  'honour',
  'heir',
  'herb',
]);

function matchCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (replacement.startsWith("I'")) return replacement;
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function overlapsExisting(
  issues: OfflineProofIssue[],
  start: number,
  end: number
): boolean {
  return issues.some((item) => start < item.end && end > item.start);
}

/**
 * Instant, 100% offline deterministic spelling, punctuation, and grammar checker.
 * Zero network calls, zero API tokens — designed to run live as the user types.
 */
export function runOfflineProofread(text: string): OfflineProofIssue[] {
  if (!text || text.trim().length < 2) return [];

  const issues: OfflineProofIssue[] = [];
  let seq = 0;

  const pushIssue = (
    category: OfflineIssueCategory,
    start: number,
    end: number,
    original: string,
    replacement: string,
    rule: string
  ) => {
    if (original === replacement) return;
    if (overlapsExisting(issues, start, end)) return;
    seq += 1;
    issues.push({
      id: `off-${seq}-${start}-${end}`,
      category,
      start,
      end,
      original,
      replacement,
      rule,
    });
  };

  // 1. Common spelling typos & missing apostrophe contractions
  const wordRegex = /\b([A-Za-z]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[1];
    const lower = word.toLowerCase();
    const start = match.index;
    const end = start + word.length;

    // Skip if currently being typed at the very end of the buffer without trailing space/punct
    // only for short partial contractions like "im" so we don't interrupt mid-word typing
    if (end === text.length && lower.length <= 3) continue;

    // Standalone lowercase 'i'
    if (word === 'i') {
      const prevChar = start > 0 ? text[start - 1] : ' ';
      const nextChar = end < text.length ? text[end] : ' ';
      if (/\s|[("'—-]/.test(prevChar) && /[\s.,!?;:)'"-]/.test(nextChar)) {
        pushIssue('grammar', start, end, 'i', 'I', 'Capitalize pronoun "I"');
      }
      continue;
    }

    const fix = COMMON_TYPOS[lower];
    if (fix) {
      pushIssue(
        'spelling',
        start,
        end,
        word,
        matchCase(word, fix),
        fix.includes("'") ? 'Missing apostrophe in contraction' : 'Spelling typo'
      );
    }
  }

  // 2. Repeated consecutive words ("the the", "to to", "is is")
  const dupWordRegex = /\b([A-Za-z]{1,14})\s+\1\b/gi;
  while ((match = dupWordRegex.exec(text)) !== null) {
    const full = match[0];
    const single = match[1];
    const lower = single.toLowerCase();
    if (lower === 'had' || lower === 'that') continue; // valid constructions ("had had", "that that")
    pushIssue(
      'grammar',
      match.index,
      match.index + full.length,
      full,
      single,
      'Repeated consecutive word'
    );
  }

  // 3. Common grammar phrase slips ("should of", "more better", "very unique")
  const phraseRules: Array<{ regex: RegExp; replace: (m: RegExpExecArray) => string; rule: string }> = [
    {
      regex: /\b(should|could|would|might|must)\s+of\b/gi,
      replace: (m) => `${m[1]} have`,
      rule: 'Use "have" instead of "of" after modal verb',
    },
    {
      regex: /\bmore\s+(better|easier|faster|cleaner|stronger|smarter)\b/gi,
      replace: (m) => matchCase(m[0], m[1].toLowerCase()),
      rule: 'Avoid double comparative',
    },
    {
      regex: /\bvery\s+unique\b/gi,
      replace: (m) => matchCase(m[0], 'unique'),
      rule: '"Unique" is already absolute',
    },
  ];

  for (const pr of phraseRules) {
    while ((match = pr.regex.exec(text)) !== null) {
      pushIssue(
        'grammar',
        match.index,
        match.index + match[0].length,
        match[0],
        pr.replace(match),
        pr.rule
      );
    }
  }

  // 4. Article agreement: "a" vs "an"
  const articleRegex = /\b(a|an)\s+([A-Za-z]{2,})\b/gi;
  while ((match = articleRegex.exec(text)) !== null) {
    const article = match[1];
    const nextWord = match[2];
    const nextLower = nextWord.toLowerCase();
    const startsWithVowel = /^[aeiou]/.test(nextLower);

    const needsAn =
      (startsWithVowel && !AN_EXCEPTIONS_NEED_A.has(nextLower)) ||
      A_EXCEPTIONS_NEED_AN.has(nextLower);

    if (article.toLowerCase() === 'a' && needsAn) {
      pushIssue(
        'grammar',
        match.index,
        match.index + match[0].length,
        match[0],
        `${matchCase(article, 'an')} ${nextWord}`,
        'Use "an" before a vowel sound'
      );
    } else if (article.toLowerCase() === 'an' && !needsAn) {
      pushIssue(
        'grammar',
        match.index,
        match.index + match[0].length,
        match[0],
        `${matchCase(article, 'a')} ${nextWord}`,
        'Use "a" before a consonant sound'
      );
    }
  }

  // 5. Lowercase start of a sentence (first character or after . ! ?)
  const firstLetterMatch = /^(\s*)([a-z])/.exec(text);
  if (firstLetterMatch && text.trim().length >= 6) {
    const idx = firstLetterMatch[1].length;
    const ch = firstLetterMatch[2];
    pushIssue(
      'grammar',
      idx,
      idx + 1,
      ch,
      ch.toUpperCase(),
      'Capitalize the start of the sentence'
    );
  }

  const afterSentenceRegex = /([.!?]\s+)([a-z])/g;
  while ((match = afterSentenceRegex.exec(text)) !== null) {
    const letterIdx = match.index + match[1].length;
    const ch = match[2];
    pushIssue(
      'grammar',
      letterIdx,
      letterIdx + 1,
      ch,
      ch.toUpperCase(),
      'Capitalize after sentence-ending punctuation'
    );
  }

  // 6. Punctuation: space before comma/period/question/exclamation/semicolon
  const spaceBeforePunct = /(\S)([ \t]+)([,.;!?])/g;
  while ((match = spaceBeforePunct.exec(text)) !== null) {
    const start = match.index + 1;
    const end = match.index + match[0].length;
    pushIssue(
      'punctuation',
      start,
      end,
      match[2] + match[3],
      match[3],
      'Remove extra space before punctuation'
    );
  }

  // 7. Punctuation: missing space after comma/semicolon/period before a letter
  // Ignore URLs, domains (.com/.org/.io), decimals, and common abbreviations (e.g., i.e.)
  const missingSpaceAfterPunct = /([,;!?])([A-Za-z])/g;
  while ((match = missingSpaceAfterPunct.exec(text)) !== null) {
    pushIssue(
      'punctuation',
      match.index,
      match.index + match[0].length,
      match[0],
      `${match[1]} ${match[2]}`,
      'Add a space after punctuation'
    );
  }

  const DOMAIN_OR_EXT = new Set([
    'com', 'org', 'net', 'io', 'dev', 'edu', 'gov', 'app', 'co', 'in', 'ai',
    'uk', 'us', 'ca', 'de', 'fr', 'jp', 'js', 'ts', 'tsx', 'jsx', 'md', 'json',
    'html', 'css', 'pdf', 'png', 'jpg', 'jpeg', 'svg', 'csv', 'txt', 'py',
  ]);
  const missingSpaceAfterPeriod = /([a-z]{2,})\.([A-Za-z][a-z]{1,})\b/g;
  while ((match = missingSpaceAfterPeriod.exec(text)) !== null) {
    const afterWord = match[2];
    if (DOMAIN_OR_EXT.has(afterWord.toLowerCase())) continue;
    const start = match.index + match[1].length;
    const end = start + 1 + afterWord.length;
    const capitalizedNext =
      afterWord[0].toUpperCase() + afterWord.slice(1);
    pushIssue(
      'punctuation',
      start,
      end,
      `.${afterWord}`,
      `. ${capitalizedNext}`,
      'Add a space after period'
    );
  }

  // 8. Punctuation: double spaces inside a line
  const multiSpaceRegex = /(\S)([ ]{2,})(\S)/g;
  while ((match = multiSpaceRegex.exec(text)) !== null) {
    const start = match.index + 1;
    const end = start + match[2].length;
    pushIssue(
      'punctuation',
      start,
      end,
      match[2],
      ' ',
      'Collapse multiple spaces into one'
    );
  }

  // 9. Punctuation: accidental duplicate commas/semicolons
  const dupPunctRegex = /(,,+|;;+)/g;
  while ((match = dupPunctRegex.exec(text)) !== null) {
    pushIssue(
      'punctuation',
      match.index,
      match.index + match[0].length,
      match[0],
      match[0][0],
      'Remove repeated punctuation'
    );
  }

  return issues.sort((a, b) => a.start - b.start).slice(0, 20);
}

/**
 * Applies a single offline proofread issue cleanly by exact character offset.
 */
export function applyOfflineIssue(
  text: string,
  issue: OfflineProofIssue
): string {
  if (text.slice(issue.start, issue.end) !== issue.original) {
    const fallbackIdx = text.indexOf(issue.original);
    if (fallbackIdx === -1) return text;
    return (
      text.slice(0, fallbackIdx) +
      issue.replacement +
      text.slice(fallbackIdx + issue.original.length)
    );
  }
  return (
    text.slice(0, issue.start) + issue.replacement + text.slice(issue.end)
  );
}

/**
 * Applies all non-overlapping offline proofread issues in reverse offset order
 * and runs a follow-up pass for cascading spacing/capitalization fixes (e.g. " ,and" -> ", and").
 */
export function applyAllOfflineIssues(
  text: string,
  issues: OfflineProofIssue[]
): string {
  const applyPass = (source: string, list: OfflineProofIssue[]) => {
    const sortedDesc = [...list].sort((a, b) => b.start - a.start);
    let result = source;
    for (const issue of sortedDesc) {
      if (result.slice(issue.start, issue.end) === issue.original) {
        result =
          result.slice(0, issue.start) +
          issue.replacement +
          result.slice(issue.end);
      }
    }
    return result;
  };

  let next = applyPass(text, issues);
  // Up to 2 cascading passes for overlapping punctuation/capitalization pairs
  for (let pass = 0; pass < 2; pass += 1) {
    const remaining = runOfflineProofread(next);
    if (remaining.length === 0) break;
    const updated = applyPass(next, remaining);
    if (updated === next) break;
    next = updated;
  }
  return next;
}

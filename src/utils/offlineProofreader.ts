/**
 * High-speed, zero-token offline live proofreader for Quillit.
 * Single-pass O(n) Map-based spelling lookup (185+ everyday typos & contractions)
 * paired with crisp, high-precision basic grammar and punctuation checks.
 */

export type OfflineIssueCategory = 'spelling' | 'grammar' | 'punctuation';

export interface OfflineProofIssue {
  id: string;
  start: number;
  end: number;
  original: string;
  replacement: string;
  category: OfflineIssueCategory;
  rule: string;
}

const COMMON_TYPOS_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  // Everyday high-frequency typos
  ['teh', 'the'],
  ['hte', 'the'],
  ['adn', 'and'],
  ['nad', 'and'],
  ['taht', 'that'],
  ['tath', 'that'],
  ['wiht', 'with'],
  ['wtih', 'with'],
  ['waht', 'what'],
  ['whta', 'what'],
  ['wher', 'where'],
  ['wehn', 'when'],
  ['becuase', 'because'],
  ['beacuse', 'because'],
  ['becasue', 'because'],
  ['bcz', 'because'],
  ['recieve', 'receive'],
  ['recieved', 'received'],
  ['recieving', 'receiving'],
  ['beleive', 'believe'],
  ['beleived', 'believed'],
  ['acheive', 'achieve'],
  ['acheived', 'achieved'],
  ['acheivement', 'achievement'],
  ['definately', 'definitely'],
  ['definitly', 'definitely'],
  ['definatly', 'definitely'],
  ['seperate', 'separate'],
  ['seperated', 'separated'],
  ['seperately', 'separately'],
  ['occured', 'occurred'],
  ['occuring', 'occurring'],
  ['occurence', 'occurrence'],
  ['untill', 'until'],
  ['tommorow', 'tomorrow'],
  ['tomorow', 'tomorrow'],
  ['tommorrow', 'tomorrow'],
  ['goverment', 'government'],
  ['enviroment', 'environment'],
  ['enviornment', 'environment'],
  ['wierd', 'weird'],
  ['freind', 'friend'],
  ['freinds', 'friends'],
  ['freindly', 'friendly'],
  ['thier', 'their'],
  ['therefor', 'therefore'],
  ['wich', 'which'],
  ['whcih', 'which'],
  ['writting', 'writing'],
  ['writeing', 'writing'],
  ['writen', 'written'],
  ['begining', 'beginning'],
  ['comming', 'coming'],
  ['runing', 'running'],
  ['stoping', 'stopping'],
  ['planing', 'planning'],
  ['geting', 'getting'],
  ['makeing', 'making'],
  ['takeing', 'taking'],
  ['useing', 'using'],
  ['haveing', 'having'],
  ['giveing', 'giving'],
  ['loveing', 'loving'],
  ['moveing', 'moving'],
  ['hopeing', 'hoping'],
  ['liveing', 'living'],
  ['neccessary', 'necessary'],
  ['necesary', 'necessary'],
  ['unneccessary', 'unnecessary'],
  ['accomodate', 'accommodate'],
  ['acommodate', 'accommodate'],
  ['recomend', 'recommend'],
  ['reccomend', 'recommend'],
  ['recomended', 'recommended'],
  ['embarass', 'embarrass'],
  ['embarassing', 'embarrassing'],
  ['independant', 'independent'],
  ['maintainance', 'maintenance'],
  ['maintenence', 'maintenance'],
  ['persistant', 'persistent'],
  ['relevent', 'relevant'],
  ['irrelevent', 'irrelevant'],
  ['succesful', 'successful'],
  ['sucessful', 'successful'],
  ['sucess', 'success'],
  ['succes', 'success'],
  ['calender', 'calendar'],
  ['collegue', 'colleague'],
  ['collegues', 'colleagues'],
  ['knowlege', 'knowledge'],
  ['knowladge', 'knowledge'],
  ['languge', 'language'],
  ['langauge', 'language'],
  ['bussiness', 'business'],
  ['buisness', 'business'],
  ['intresting', 'interesting'],
  ['intersting', 'interesting'],
  ['diferent', 'different'],
  ['diffrent', 'different'],
  ['differnt', 'different'],
  ['immediatly', 'immediately'],
  ['imediatly', 'immediately'],
  ['completly', 'completely'],
  ['absolutly', 'absolutely'],
  ['actualy', 'actually'],
  ['basicly', 'basically'],
  ['finaly', 'finally'],
  ['realy', 'really'],
  ['truely', 'truly'],
  ['usualy', 'usually'],
  ['especialy', 'especially'],
  ['generaly', 'generally'],
  ['naturaly', 'naturally'],
  ['normaly', 'normally'],
  ['originaly', 'originally'],
  ['personalY', 'personally'],
  ['personaly', 'personally'],
  ['probly', 'probably'],
  ['probaly', 'probably'],
  ['similiar', 'similar'],
  ['familar', 'familiar'],
  ['particluar', 'particular'],
  ['availble', 'available'],
  ['avalable', 'available'],
  ['posible', 'possible'],
  ['imposible', 'impossible'],
  ['responcible', 'responsible'],
  ['responsable', 'responsible'],
  ['importent', 'important'],
  ['imporant', 'important'],
  ['exampel', 'example'],
  ['exmaple', 'example'],
  ['probelm', 'problem'],
  ['problme', 'problem'],
  ['problmes', 'problems'],
  ['peopel', 'people'],
  ['poeple', 'people'],
  ['persno', 'person'],
  ['studnet', 'student'],
  ['studnets', 'students'],
  ['projcet', 'project'],
  ['projcets', 'projects'],
  ['enginer', 'engineer'],
  ['enginering', 'engineering'],
  ['developement', 'development'],
  ['managment', 'management'],
  ['expereince', 'experience'],
  ['experiance', 'experience'],
  ['oportunity', 'opportunity'],
  ['oppertunity', 'opportunity'],
  ['comunication', 'communication'],
  ['communcation', 'communication'],
  ['infomation', 'information'],
  ['infromation', 'information'],
  ['tecnology', 'technology'],
  ['techology', 'technology'],
  ['algoirthm', 'algorithm'],
  ['algoritm', 'algorithm'],
  ['softare', 'software'],
  ['hardare', 'hardware'],
  ['messge', 'message'],
  ['mesage', 'message'],
  ['mornign', 'morning'],
  ['evning', 'evening'],
  ['yestarday', 'yesterday'],
  ['yesterdy', 'yesterday'],
  ['alway', 'always'],
  ['alwyas', 'always'],
  ['alot', 'a lot'],
  ['noone', 'no one'],
  ['incase', 'in case'],
  ['thankyou', 'thank you'],
  ['everytime', 'every time'],
  ['anyways', 'anyway'],
  ['gratefull', 'grateful'],
  ['greatful', 'grateful'],
  ['helpfull', 'helpful'],
  ['usefull', 'useful'],
  ['carefull', 'careful'],
  ['beautifull', 'beautiful'],
  ['beutiful', 'beautiful'],
  ['wonderfull', 'wonderful'],
  ['powerfull', 'powerful'],
  ['thoughtfull', 'thoughtful'],
  ['succed', 'succeed'],
  ['existance', 'existence'],
  ['apparant', 'apparent'],
  ['arguement', 'argument'],
  ['judgement', 'judgment'],
  ['commited', 'committed'],
  ['concensus', 'consensus'],
  ['dilema', 'dilemma'],
  ['gaurantee', 'guarantee'],
  ['harrass', 'harass'],
  ['lisence', 'license'],
  ['mispell', 'misspell'],
  ['noticable', 'noticeable'],
  ['peice', 'piece'],
  ['privelege', 'privilege'],
  ['publically', 'publicly'],
  ['questionaire', 'questionnaire'],
  ['rythm', 'rhythm'],
  ['rythym', 'rhythm'],
  ['scedule', 'schedule'],
  ['shedule', 'schedule'],
  ['sentance', 'sentence'],
  ['sentances', 'sentences'],
  ['grammer', 'grammar'],
  ['vocabuary', 'vocabulary'],
  ['vocaulary', 'vocabulary'],
  ['pargraph', 'paragraph'],
  ['paragrah', 'paragraph'],
  ['explaination', 'explanation'],
  ['disapear', 'disappear'],
  ['disapoint', 'disappoint'],
  ['disapointed', 'disappointed'],
  ['foriegn', 'foreign'],
  ['foward', 'forward'],
  ['fourty', 'forty'],
  ['happend', 'happened'],
  ['hieght', 'height'],
  ['lenght', 'length'],
  ['strenght', 'strength'],
  ['widht', 'width'],
  ['wieght', 'weight'],
  ['libary', 'library'],
  ['medecine', 'medicine'],
  ['minuite', 'minute'],
  ['mischevious', 'mischievous'],
  ['occassion', 'occasion'],
  ['orginal', 'original'],
  ['pastime', 'pastime'],
  ['percieve', 'perceive'],
  ['posession', 'possession'],
  ['prefered', 'preferred'],
  ['refered', 'referred'],
  ['rember', 'remember'],
  ['remeber', 'remember'],
  ['remined', 'remind'],
  ['scince', 'science'],
  ['sincerly', 'sincerely'],
  ['speling', 'spelling'],
  ['supprise', 'surprise'],
  ['suprise', 'surprise'],
  ['temperture', 'temperature'],
  ['thoughout', 'throughout'],
  ['togther', 'together'],
  ['togehter', 'together'],
  ['unfortunatly', 'unfortunately'],
  ['untill', 'until'],
  ['vaccuum', 'vacuum'],
  ['wheather', 'whether'],
  // Missing apostrophes in everyday contractions
  ['dont', "don't"],
  ['cant', "can't"],
  ['wont', "won't"],
  ['doesnt', "doesn't"],
  ['didnt', "didn't"],
  ['isnt', "isn't"],
  ['arent', "aren't"],
  ['wasnt', "wasn't"],
  ['werent', "weren't"],
  ['hasnt', "hasn't"],
  ['havent', "haven't"],
  ['hadnt', "hadn't"],
  ['shouldnt', "shouldn't"],
  ['wouldnt', "wouldn't"],
  ['couldnt', "couldn't"],
  ['mustnt', "mustn't"],
  ['im', "I'm"],
  ['ive', "I've"],
  ['id', "I'd"],
  ['youre', "you're"],
  ['youve', "you've"],
  ['theyre', "they're"],
  ['theyve', "they've"],
  ['weve', "we've"],
  ['hes', "he's"],
  ['shes', "she's"],
  ['thats', "that's"],
  ['whats', "what's"],
  ['whos', "who's"],
  ['theres', "there's"],
  ['heres', "here's"],
  ['lets', "let's"],
];

const COMMON_TYPOS = new Map<string, string>(
  COMMON_TYPOS_ENTRIES.map(([k, v]) => [k.toLowerCase(), v])
);

const SILENT_H_AN_WORDS = new Set([
  'hour',
  'hours',
  'hourly',
  'honest',
  'honestly',
  'honesty',
  'honor',
  'honour',
  'honorable',
  'honourable',
  'heir',
  'heirs',
  'heiress',
  'herb',
  'herbal',
]);

const CONSONANT_SOUND_U_WORDS =
  /^(uni|use|user|used|useful|useless|usual|usually|utensil|utility|eu|one|once)/i;

const IRREGULAR_PAST_AFTER_DID: Record<string, string> = {
  went: 'go',
  saw: 'see',
  came: 'come',
  did: 'do',
  took: 'take',
  ate: 'eat',
  wrote: 'write',
  spoke: 'speak',
  broke: 'break',
  chose: 'choose',
  drove: 'drive',
  fell: 'fall',
  flew: 'fly',
  forgot: 'forget',
  gave: 'give',
  knew: 'know',
  made: 'make',
  ran: 'run',
  said: 'say',
  told: 'tell',
  thought: 'think',
  got: 'get',
  bought: 'buy',
  brought: 'bring',
  caught: 'catch',
  taught: 'teach',
  found: 'find',
  heard: 'hear',
  kept: 'keep',
  left: 'leave',
  lost: 'lose',
  met: 'meet',
  paid: 'pay',
  sent: 'send',
  spent: 'spend',
  stood: 'stand',
  understood: 'understand',
  won: 'win',
  began: 'begin',
  drank: 'drink',
  sang: 'sing',
  swam: 'swim',
  wore: 'wear',
};

function preserveCase(original: string, replacement: string): string {
  if (!original) return replacement;
  if (replacement.startsWith("I'")) return replacement;
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function overlaps(
  existing: OfflineProofIssue[],
  start: number,
  end: number
): boolean {
  for (const item of existing) {
    if (start < item.end && end > item.start) {
      return true;
    }
  }
  return false;
}

/**
 * Runs a fast, single-pass-style offline proofreading scan over the draft.
 * Zero network calls, zero API tokens, high precision (minimal false positives).
 */
export function runOfflineProofread(text: string): OfflineProofIssue[] {
  if (!text || text.trim().length < 2) return [];

  const issues: OfflineProofIssue[] = [];

  const pushIssue = (
    start: number,
    end: number,
    original: string,
    replacement: string,
    category: OfflineIssueCategory,
    rule: string
  ) => {
    if (start < 0 || end <= start || original === replacement) return;
    if (overlaps(issues, start, end)) return;
    issues.push({
      id: `${category}-${start}-${end}-${replacement}`,
      start,
      end,
      original,
      replacement,
      category,
      rule,
    });
  };

  // 1. Standalone lowercase "i" pronoun
  const standaloneI = /(^|[^A-Za-z0-9_'])i(?=[^A-Za-z0-9_']|$)/g;
  let m: RegExpExecArray | null;
  while ((m = standaloneI.exec(text)) !== null) {
    const start = m.index + m[1].length;
    pushIssue(
      start,
      start + 1,
      'i',
      'I',
      'grammar',
      'Capitalize the pronoun "I"'
    );
  }

  // 2. Repeated consecutive words ("the the", "is is", "to to")
  const repeatedWord = /\b([A-Za-z]{2,})\s+(\1)\b/gi;
  while ((m = repeatedWord.exec(text)) !== null) {
    const first = m[1];
    // Allow intentional "had had" or "that that"
    if (first.toLowerCase() === 'had' || first.toLowerCase() === 'that') {
      continue;
    }
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      first,
      'grammar',
      'Remove repeated word'
    );
  }

  // 3. Basic grammar: "should/could/would/must of" -> "... have"
  const modalOf = /\b(should|could|would|must|might)\s+of\b/gi;
  while ((m = modalOf.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} have`,
      'grammar',
      `Use "${m[1]} have" instead of "${m[1]} of"`
    );
  }

  // 4. Basic grammar: double comparatives / superlatives
  const doubleComp = /\b(more\s+better|more\s+easier|more\s+faster|more\s+harder|most\s+best|most\s+easiest|most\s+fastest)\b/gi;
  while ((m = doubleComp.exec(text)) !== null) {
    const secondWord = m[0].split(/\s+/)[1];
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      preserveCase(m[0], secondWord),
      'grammar',
      `Avoid double comparison; use "${secondWord}"`
    );
  }

  // 5. Basic grammar: "your welcome" -> "you're welcome"
  const yourWelcome = /\b(your)\s+welcome\b/gi;
  while ((m = yourWelcome.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${preserveCase(m[1], "you're")} welcome`,
      'grammar',
      'Use "you\'re welcome" (you are welcome)'
    );
  }

  // 6. Basic grammar: high-confidence subject-verb agreement
  // 6a. "I is" -> "I am", "I are" -> "I am"
  const iBe = /\b(I)\s+(is|are)\b/g;
  while ((m = iBe.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      'I am',
      'grammar',
      'Subject-verb agreement: use "I am"'
    );
  }

  // 6b. "he/she/it are" -> "he/she/it is"; "he/she/it were" (excluding "if he/she/it were")
  const singularAre = /\b(he|she|it)\s+are\b/gi;
  while ((m = singularAre.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} is`,
      'grammar',
      `Subject-verb agreement: use "${m[1]} is"`
    );
  }

  // 6c. "they/we/you is" -> "they/we/you are"; "they/we/you was" -> "they/we/you were"
  const pluralIs = /\b(they|we|you)\s+(is|was)\b/gi;
  while ((m = pluralIs.exec(text)) !== null) {
    const fixVerb = m[2].toLowerCase() === 'is' ? 'are' : 'were';
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} ${fixVerb}`,
      'grammar',
      `Subject-verb agreement: use "${m[1]} ${fixVerb}"`
    );
  }

  // 6d. "he/she/it don't" -> "he/she/it doesn't"
  const singularDont = /\b(he|she|it)\s+don't\b/gi;
  while ((m = singularDont.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} doesn't`,
      'grammar',
      `Subject-verb agreement: use "${m[1]} doesn't"`
    );
  }

  // 6e. "they/we/you/I doesn't" -> "... don't"
  const pluralDoesnt = /\b(they|we|you|I)\s+doesn't\b/gi;
  while ((m = pluralDoesnt.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} don't`,
      'grammar',
      `Subject-verb agreement: use "${m[1]} don't"`
    );
  }

  // 6f. "there is many/several/multiple/two/three/four/five/few" -> "there are ..."
  const thereIsPlural = /\b(there)\s+is\s+(many|several|multiple|two|three|four|five|six|seven|eight|nine|ten)\b/gi;
  while ((m = thereIsPlural.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} are ${m[2]}`,
      'grammar',
      'Use "there are" with plural quantities'
    );
  }

  // 7. Basic grammar: past tense verb directly after "did" / "didn't" / "didnt" / "did not"
  const didPast = /\b(didn't|didnt|did\s+not)\s+([a-z]+)\b/gi;
  while ((m = didPast.exec(text)) !== null) {
    const verbLower = m[2].toLowerCase();
    const baseVerb = IRREGULAR_PAST_AFTER_DID[verbLower];
    if (baseVerb) {
      const normalizedAux =
        m[1].toLowerCase() === 'didnt' ? preserveCase(m[1], "didn't") : m[1];
      pushIssue(
        m.index,
        m.index + m[0].length,
        m[0],
        `${normalizedAux} ${baseVerb}`,
        'grammar',
        `Use base verb "${baseVerb}" after "${normalizedAux}"`
      );
    }
  }

  // 8. Basic "a / an" article agreement
  const articlePair = /\b(a|an)\s+([A-Za-z][A-Za-z'-]*)\b/gi;
  while ((m = articlePair.exec(text)) !== null) {
    const article = m[1];
    const nextWord = m[2];
    const lowerNext = nextWord.toLowerCase();
    // Skip uppercase acronyms like "an API", "a URL"
    if (nextWord === nextWord.toUpperCase() && nextWord.length >= 2) continue;

    const startsWithVowelSound =
      SILENT_H_AN_WORDS.has(lowerNext) ||
      (/^[aeiou]/i.test(lowerNext) && !CONSONANT_SOUND_U_WORDS.test(lowerNext));

    if (article.toLowerCase() === 'a' && startsWithVowelSound) {
      pushIssue(
        m.index,
        m.index + article.length,
        article,
        preserveCase(article, 'an'),
        'grammar',
        `Use "an" before "${nextWord}"`
      );
    } else if (article.toLowerCase() === 'an' && !startsWithVowelSound) {
      pushIssue(
        m.index,
        m.index + article.length,
        article,
        preserveCase(article, 'a'),
        'grammar',
        `Use "a" before "${nextWord}"`
      );
    }
  }

  // 9. Single-pass O(1)-lookup spelling & missing-apostrophe contractions
  const wordRegex = /\b([A-Za-z']{2,})\b/g;
  while ((m = wordRegex.exec(text)) !== null) {
    const raw = m[1];
    const lower = raw.toLowerCase();
    // Skip "id" when user intentionally writes technical uppercase "ID"
    if (raw === 'ID') continue;
    // Skip "lets" when preceded by he/she/it/that/this/which (verb: "it lets us")
    if (lower === 'lets') {
      const before = text.slice(Math.max(0, m.index - 12), m.index);
      if (/\b(he|she|it|that|this|which|what)\s+$/i.test(before)) {
        continue;
      }
    }
    const fix = COMMON_TYPOS.get(lower);
    if (fix && fix !== raw) {
      const cased = preserveCase(raw, fix);
      const isContraction = fix.includes("'");
      pushIssue(
        m.index,
        m.index + raw.length,
        raw,
        cased,
        'spelling',
        isContraction
          ? `Add missing apostrophe: "${cased}"`
          : `Spelling: "${raw}" -> "${cased}"`
      );
    }
  }

  // 10. Lowercase sentence start (start of draft or right after . ! ? + space/newline)
  const sentenceStart = /(^|[.!?]\s+)([a-z])(?=[a-z'])/g;
  while ((m = sentenceStart.exec(text)) !== null) {
    const prefix = m[1];
    const letter = m[2];
    const letterIndex = m.index + prefix.length;
    // Skip URLs or decimals like "e.g. something"
    const lookbehind = text.slice(Math.max(0, letterIndex - 5), letterIndex);
    if (/(?:e\.g\.|i\.e\.|etc\.|vs\.)\s+$/i.test(lookbehind)) continue;

    pushIssue(
      letterIndex,
      letterIndex + 1,
      letter,
      letter.toUpperCase(),
      'grammar',
      'Capitalize the start of the sentence'
    );
  }

  // 11. Multiple spaces between words (preserve line breaks)
  const doubleSpaces = /[^\S\r\n]{2,}/g;
  while ((m = doubleSpaces.exec(text)) !== null) {
    if (m.index === 0 || text[m.index - 1] === '\n') continue;
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      ' ',
      'punctuation',
      'Replace extra spaces with a single space'
    );
  }

  // 11b. Combined misplaced space around punctuation ("garden ,and" -> "garden, and")
  const swappedPunctSpace = /[^\S\r\n]+([,;!?])([A-Za-z])/g;
  while ((m = swappedPunctSpace.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} ${m[2]}`,
      'punctuation',
      `Move space after "${m[1]}"`
    );
  }

  // 12. Space placed before punctuation ("hello , world" or "done .")
  const spaceBeforePunct = /\s+([,.;:!?])(?!\.)/g;
  while ((m = spaceBeforePunct.exec(text)) !== null) {
    if (m[0].includes('\n')) continue;
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      m[1],
      'punctuation',
      `Remove space before "${m[1]}"`
    );
  }

  // 13. Missing space after comma / semicolon / colon / exclamation / question before a word
  const missingSpaceAfter = /([,;!?])([A-Za-z])/g;
  while ((m = missingSpaceAfter.exec(text)) !== null) {
    pushIssue(
      m.index,
      m.index + m[0].length,
      m[0],
      `${m[1]} ${m[2]}`,
      'punctuation',
      `Add a space after "${m[1]}"`
    );
  }

  issues.sort((a, b) => a.start - b.start);
  return issues;
}

/**
 * Applies a single offline proofreading issue cleanly without corrupting other text.
 */
export function applyOfflineIssue(
  text: string,
  issue: OfflineProofIssue
): string {
  if (
    issue.start < 0 ||
    issue.end > text.length ||
    text.slice(issue.start, issue.end) !== issue.original
  ) {
    return text;
  }
  return (
    text.slice(0, issue.start) + issue.replacement + text.slice(issue.end)
  );
}

/**
 * Applies all non-overlapping offline issues from right to left in one pass.
 */
export function applyAllOfflineIssues(
  text: string,
  issues: OfflineProofIssue[]
): string {
  const ordered = [...issues].sort((a, b) => b.start - a.start);
  let next = text;
  for (const issue of ordered) {
    if (
      issue.start >= 0 &&
      issue.end <= next.length &&
      next.slice(issue.start, issue.end) === issue.original
    ) {
      next =
        next.slice(0, issue.start) + issue.replacement + next.slice(issue.end);
    }
  }
  return next;
}

import type {
  ConversationMessage,
  ConversationPace,
  ConversationRecast,
  ConversationScenario,
  StudentProfile,
} from '../types';

export interface ConversationMetrics {
  userTurnCount: number;
  partnerTurnCount: number;
  totalUserWords: number;
  avgWordsPerUserTurn: number;
  canEvaluate: boolean;
  turnsNeeded: number;
  wordsNeeded: number;
  usedTargetVocab: string[];
}

export interface ConversationTurnRouteStep {
  model: 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';
  thinkingLabel: 'MINIMAL' | 'LOW';
  tierLabel: string;
}

export interface ConversationTurnRoutePlan {
  primary: ConversationTurnRouteStep;
  cascade: ConversationTurnRouteStep[];
  reason: string;
}

export const MIN_USER_TURNS_FOR_EVAL = 2;
export const MIN_USER_WORDS_FOR_EVAL = 20;

const BASE_SCENARIOS: ConversationScenario[] = [
  {
    id: 'technical-interview',
    title: 'Technical Screening',
    subtitle: 'Clear, spoken explanations under gentle follow-up questions',
    personaName: 'Maya Chen',
    personaRole: 'Senior Systems Engineer',
    personaInitials: 'MC',
    mode: 'technical',
    tone: 'conversational',
    openingLine:
      "Hey! Thanks for making time today. Before we dive into specifics, could you walk me through a project or technical concept you've been working on recently—just in plain English?",
    initialSparks: [
      'Walk through a recent lab or control system problem I solved',
      'Explain a core engineering concept using an everyday analogy',
      'Share a bug or failure that taught me something useful',
    ],
    settingBrief:
      'Friendly, realistic 1-on-1 engineering screening call via text. Probe gently for clarity, trade-offs, and plain-English examples.',
  },
  {
    id: 'everyday-cafe',
    title: 'Coffee Shop Banter',
    subtitle: 'Natural small talk, spontaneous stories & relaxed flow',
    personaName: 'Sam',
    personaRole: 'Neighborhood Regular',
    personaInitials: 'SM',
    mode: 'friend',
    tone: 'conversational',
    openingLine:
      "Hey, mind if I grab the seat across from you? This place is packed today. What's been keeping your week interesting so far?",
    initialSparks: [
      'Mention something surprising from my week',
      'Talk about a book, show, or habit I picked up lately',
      'Flip the question back after sharing a short update',
    ],
    settingBrief:
      'Casual, warm coffee shop conversation with a friendly acquaintance. Keep banter effortless, witty, and natural.',
  },
  {
    id: 'workplace-standup',
    title: 'Manager 1-on-1 Sync',
    subtitle: 'Crisp status updates, pushing back & aligning priorities',
    personaName: 'Jordan',
    personaRole: 'Engineering Lead',
    personaInitials: 'JD',
    mode: 'email',
    tone: 'professional-warm',
    openingLine:
      "Morning! Quick check-in before the sprint review—how are you feeling about Friday's milestone, and is anything quietly slowing you down right now?",
    initialSparks: [
      'Give a concise status update and flag one real blocker',
      'Propose cutting scope cleanly so quality stays high',
      'Ask for clarity on which deliverable matters most',
    ],
    settingBrief:
      'Realistic workplace 1-on-1 chat with an approachable engineering manager who values directness, honesty, and crisp trade-offs.',
  },
  {
    id: 'client-pitch',
    title: 'Idea Pitch & Q&A',
    subtitle: 'Persuading a sharp listener without jargon or fluff',
    personaName: 'Elena',
    personaRole: 'Product Partner',
    personaInitials: 'EL',
    mode: 'linkedin',
    tone: 'crisp-direct',
    openingLine:
      "I've got ten minutes before my next meeting—hit me with the short version. What are you building or proposing, and why should someone care right now?",
    initialSparks: [
      'Open with the real-world pain point in one sentence',
      'Compare how people do it today vs. my approach',
      'Cite a concrete result or quick example',
    ],
    settingBrief:
      'Fast-paced, constructive pitch exchange with a sharp product partner who tests assumptions kindly and pushes for clarity.',
  },
  {
    id: 'thoughtful-debate',
    title: 'Friendly Debate',
    subtitle: 'Defending a viewpoint calmly and handling counterpoints',
    personaName: 'Devon',
    personaRole: 'Thoughtful Contrarian',
    personaInitials: 'DV',
    mode: 'journal',
    tone: 'conversational',
    openingLine:
      "Okay, friendly hot take to start us off: I think most people spend way too much time optimizing tools and not enough time actually practicing the craft. Do you buy that, or am I being unfair?",
    initialSparks: [
      'Agree halfway, then introduce a nuanced counterpoint',
      'Push back directly with a personal experience',
      'Ask Devon where they draw the line between prep and practice',
    ],
    settingBrief:
      'Engaging, respectful intellectual sparring over everyday ideas, technology, and habits. Push back playfully to spark sharper phrasing.',
  },
  {
    id: 'networking-intro',
    title: 'Networking & Intro',
    subtitle: 'Memorable introductions, career stories & natural follow-ups',
    personaName: 'Marcus Vance',
    personaRole: 'Founder & Industry Mentor',
    personaInitials: 'MV',
    mode: 'creative',
    tone: 'professional-warm',
    openingLine:
      "Great running into you here! I didn't catch your story earlier—what are you focused on right now, and what kind of problems excite you most?",
    initialSparks: [
      'Share a crisp 2-sentence intro about what I study or build',
      'Highlight one project I genuinely enjoyed working on',
      'Ask Marcus what trend he is watching closely this year',
    ],
    settingBrief:
      'Warm, authentic post-event networking chat with an experienced founder who appreciates concise, human introductions over rehearsed buzzwords.',
  },
];

export function getConversationScenarios(
  studentProfile?: StudentProfile
): ConversationScenario[] {
  return BASE_SCENARIOS.map((scenario) => {
    if (
      scenario.id === 'technical-interview' &&
      studentProfile?.collegeDegree
    ) {
      const degree = studentProfile.collegeDegree.trim();
      return {
        ...scenario,
        subtitle: `Plain-English ${degree} screening & follow-up questions`,
        openingLine: `Hey! Thanks for making time today. I saw you're studying ${degree}—before we get into details, could you walk me through a concept or project you've enjoyed lately, just in plain English?`,
      };
    }
    return scenario;
  });
}

export function createCustomConversationScenario(
  promptText: string
): ConversationScenario {
  const clean = promptText.trim().slice(0, 140);
  const title =
    clean.length > 42 ? `${clean.slice(0, 39).trimEnd()}...` : clean || 'Custom Live Chat';

  return {
    id: `custom-${Date.now()}`,
    title,
    subtitle: 'Custom live conversation scenario',
    personaName: 'Alex',
    personaRole: 'Conversation Partner',
    personaInitials: 'AX',
    mode: 'friend',
    tone: 'conversational',
    openingLine: `Sounds great—let's jump right into "${clean}". Go ahead and open the conversation however you naturally would, and I'll respond in character.`,
    initialSparks: [
      'Open naturally with a quick greeting and context',
      'State your main point in one clear sentence',
      'Ask a direct opening question to set the tone',
    ],
    settingBrief: `Custom live conversation roleplay: ${clean}. Stay completely in character as a realistic human conversation partner.`,
    isCustom: true,
  };
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function detectUsedTargetWords(
  text: string,
  practicingVocab: string[]
): string[] {
  if (!text.trim() || practicingVocab.length === 0) return [];
  const lower = text.toLowerCase();
  const hits: string[] = [];
  const seen = new Set<string>();

  for (const rawWord of practicingVocab) {
    const clean = rawWord.trim();
    if (clean.length < 3) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let pattern: string;
    if (key.endsWith('e') && key.length >= 4) {
      const stem = key.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = `\\b${stem}(?:e|es|ed|ing)\\b`;
    } else if (key.endsWith('y') && key.length >= 4 && !/[aeiou]y$/.test(key)) {
      const stem = key.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = `\\b(?:${escaped}|${stem}(?:ies|ied)|${escaped}ing)\\b`;
    } else {
      pattern = `\\b${escaped}(?:s|es|ed|ing)?\\b`;
    }
    const regex = new RegExp(pattern, 'i');
    if (regex.test(lower)) {
      seen.add(key);
      hits.push(clean);
    }
  }
  return hits;
}

export function analyzeConversationMetrics(
  messages: ConversationMessage[],
  practicingVocab: string[] = []
): ConversationMetrics {
  const userMsgs = messages.filter((m) => m.role === 'user');
  const partnerMsgs = messages.filter((m) => m.role === 'partner');
  const userTurnCount = userMsgs.length;
  const totalUserWords = userMsgs.reduce((acc, m) => acc + countWords(m.text), 0);
  const avgWordsPerUserTurn =
    userTurnCount > 0 ? Math.round((totalUserWords / userTurnCount) * 10) / 10 : 0;

  const combinedUserText = userMsgs.map((m) => m.text).join('\n');
  const usedTargetVocab = detectUsedTargetWords(combinedUserText, practicingVocab);

  const turnsNeeded = Math.max(0, MIN_USER_TURNS_FOR_EVAL - userTurnCount);
  const wordsNeeded = Math.max(0, MIN_USER_WORDS_FOR_EVAL - totalUserWords);
  const canEvaluate = turnsNeeded === 0 && wordsNeeded === 0;

  return {
    userTurnCount,
    partnerTurnCount: partnerMsgs.length,
    totalUserWords,
    avgWordsPerUserTurn,
    canEvaluate,
    turnsNeeded,
    wordsNeeded,
    usedTargetVocab,
  };
}

export function buildConversationTranscript(
  messages: ConversationMessage[],
  scenario: ConversationScenario
): {
  userTurnsText: string;
  dialogueTranscript: string;
} {
  const userTurns = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
    .filter(Boolean);

  const userTurnsText = userTurns.join('\n\n');

  const dialogueTranscript = messages
    .map((m) => {
      const speaker = m.role === 'user' ? 'You' : scenario.personaName;
      return `${speaker}: ${m.text.trim()}`;
    })
    .join('\n\n');

  return { userTurnsText, dialogueTranscript };
}

/**
 * Selects the fastest suitable Gemini model & thinking tier for real-time texting turns.
 * Live texting prioritizes <2s latency (Flash Lite MINIMAL/LOW) with automatic failover to Hydrogen LOW.
 */
export function selectConversationTurnRoute(input: {
  pace: ConversationPace;
  turnCount: number;
  cooldownUntil?: Partial<Record<'gemini-3.1-flash-lite' | 'gemini-4-hydrogen', number>>;
  now?: number;
}): ConversationTurnRoutePlan {
  const now = input.now ?? Date.now();
  const flashAvailable =
    (input.cooldownUntil?.['gemini-3.1-flash-lite'] ?? 0) <= now;
  const hydrogenAvailable =
    (input.cooldownUntil?.['gemini-4-hydrogen'] ?? 0) <= now;

  const flashLow: ConversationTurnRouteStep = {
    model: 'gemini-3.1-flash-lite',
    thinkingLabel: 'LOW',
    tierLabel: 'Flash Lite · Low',
  };
  const flashMinimal: ConversationTurnRouteStep = {
    model: 'gemini-3.1-flash-lite',
    thinkingLabel: 'MINIMAL',
    tierLabel: 'Flash Lite · Instant',
  };
  const hydrogenLow: ConversationTurnRouteStep = {
    model: 'gemini-4-hydrogen',
    thinkingLabel: 'LOW',
    tierLabel: 'Hydrogen · Low',
  };

  const preferLow = input.pace === 'challenging' || input.turnCount >= 6;
  const preferredOrder: ConversationTurnRouteStep[] = preferLow
    ? [flashLow, hydrogenLow, flashMinimal]
    : [flashMinimal, flashLow, hydrogenLow];

  const available = preferredOrder.filter((step) =>
    step.model === 'gemini-3.1-flash-lite' ? flashAvailable : hydrogenAvailable
  );
  const cascade = available.length > 0 ? available : preferredOrder;

  return {
    primary: cascade[0],
    cascade,
    reason: preferLow
      ? 'Nuanced live reply with fast low-latency reasoning'
      : 'Real-time conversational texting speed',
  };
}

export function buildConversationSystemInstruction(params: {
  scenario: ConversationScenario;
  pace: ConversationPace;
  studentProfile?: StudentProfile;
  practicingVocab?: string[];
}): string {
  const { scenario, pace, studentProfile, practicingVocab = [] } = params;
  const paceDirective =
    pace === 'relaxed'
      ? 'Keep language warm, patient, and approachable with simple, clear follow-up questions.'
      : pace === 'challenging'
        ? 'Act like a sharp, fast-thinking interlocutor: ask probing follow-ups, test vague claims politely, and push the speaker to be crisp and concrete.'
        : 'Use authentic everyday spoken English at a natural human texting rhythm.';

  const profileLine = studentProfile?.collegeDegree
    ? `The learner is a ${studentProfile.semester || 'college'} ${studentProfile.collegeDegree} student.`
    : 'The learner is practicing clear, natural spoken-style English through live text conversation.';

  const vocabNote =
    practicingVocab.length > 0
      ? `Optional learner target vocabulary (never force them, just appreciate naturally if used): ${practicingVocab.slice(0, 8).join(', ')}.`
      : '';

  return `You are ${scenario.personaName} (${scenario.personaRole}) inside Quillit's Live Conversation Practice studio.
SCENARIO: ${scenario.title} — ${scenario.settingBrief}
PACE: ${pace.toUpperCase()} — ${paceDirective}
LEARNER CONTEXT: ${profileLine}
${vocabNote}

STRICT CONVERSATION-ONLY RULES (NON-NEGOTIABLE):
1. You exist SOLELY for live, realistic back-and-forth conversation practice. Stay 100% in character as ${scenario.personaName}.
2. NEVER break character, NEVER say "As an AI", NEVER write essays, code blocks, or bulleted lists, and NEVER act as a general-purpose Q&A assistant. If the user asks you to write an essay, solve homework, or do a generic assistant task, playfully stay in character and steer them back to the live conversation!
3. TEXT LIKE A REAL PERSON: Keep "reply" to 1–3 concise, natural sentences (typically 18–55 words). React genuinely to a specific detail in the user's message, then ask ONE crisp follow-up or share a natural reaction that keeps momentum flowing.
4. SUBTLE INLINE COACH NUDGE ("gentleRecast"):
   - Inspect the user's LATEST message ONLY.
   - If their message contains a clear grammar error, wrong word choice (e.g., "improvise" instead of "improve"), missing verb, or noticeably awkward phrasing, provide a gentle 1-line natural recast:
     * original: exact short phrase copied verbatim from the user's latest message
     * naturalVersion: how a native speaker would text/say that naturally
     * tip: crisp 1-sentence reason (<= 16 words)
   - If the user's latest message is already clean and natural (even if casual or short), set "hasRecast": false and leave recast fields empty! Never nitpick clean casual English.
5. REPLY SPARKS ("replySparks"): Return 2–3 ultra-short (4–9 word) conversation angle ideas the user could take next if they feel stuck (never full pre-written paragraphs—just directional sparks).`;
}

const ROBOTIC_PREFIX_REGEX =
  /^(?:as an ai(?: language model)?[^.!?]*[.!?]\s*|certainly[!,.]\s*|of course[!,.]\s*|sure thing[!,.]\s*)/i;

export function sanitizeConversationTurnResponse(
  raw: Record<string, unknown>,
  latestUserMessage: string
): {
  reply: string;
  recast: ConversationRecast | null;
  replySparks: string[];
} {
  let reply = String(raw.reply ?? '')
    .replace(ROBOTIC_PREFIX_REGEX, '')
    .replace(/\s+\n/g, '\n')
    .trim();

  if (!reply) {
    reply =
      "That's an interesting angle—tell me a bit more about what made you think of that.";
  }

  let recast: ConversationRecast | null = null;
  const hasRecast = Boolean(raw.hasRecast);
  const rawRecast =
    raw.gentleRecast && typeof raw.gentleRecast === 'object'
      ? (raw.gentleRecast as Record<string, unknown>)
      : null;

  if (hasRecast && rawRecast) {
    const orig = String(rawRecast.original ?? '').trim();
    const nat = String(rawRecast.naturalVersion ?? '').trim();
    const tip = String(rawRecast.tip ?? '').trim();
    const lowerDraft = latestUserMessage.toLowerCase();
    const isGrounded =
      orig.length >= 3 &&
      nat.length >= 3 &&
      orig.toLowerCase() !== nat.toLowerCase() &&
      lowerDraft.includes(orig.toLowerCase());

    if (isGrounded && tip.length >= 5) {
      recast = {
        original: orig,
        naturalVersion: nat,
        tip,
      };
    }
  }

  const replySparks = Array.isArray(raw.replySparks)
    ? raw.replySparks
        .map((s) => String(s ?? '').trim())
        .filter((s) => s.length >= 4 && s.length <= 75)
        .slice(0, 3)
    : [];

  return { reply, recast, replySparks };
}

export function buildOfflineConversationReply(
  scenario: ConversationScenario,
  latestUserMessage: string,
  turnNumber: number
): {
  reply: string;
  recast: ConversationRecast | null;
  replySparks: string[];
} {
  const words = countWords(latestUserMessage);
  const prompts = [
    `Got it—that makes sense. What's one concrete example from your own experience that shows how that plays out?`,
    `Interesting point. If someone pushed back on that idea, how would you explain it in one plain sentence?`,
    `I hear you. Looking back, what part of that was trickier than you first expected?`,
    `Fair take! How would you approach it differently if you had to do it again tomorrow?`,
  ];
  const shortFollowup =
    words < 6
      ? `Tell me a little more—what's the story behind that?`
      : prompts[turnNumber % prompts.length];

  return {
    reply: shortFollowup,
    recast: null,
    replySparks: scenario.initialSparks.slice(0, 3),
  };
}

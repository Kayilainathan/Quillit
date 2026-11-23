import type {
  ConversationMessage,
  ConversationPace,
  ConversationRecast,
  ConversationScenario,
  ConversationTurnInTimeAnalysis,
  StudentProfile,
} from '../types';

import {
  formatTierLabel,
  type ActiveEvalModel,
} from './evaluationRouter';

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
  model: ActiveEvalModel;
  thinkingLabel: 'MINIMAL' | 'LOW' | 'STANDARD';
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

const SCENARIO_OPENING_VARIANTS: Record<
  string,
  Array<{ openingLine: string; sparks: string[] }>
> = {
  'technical-interview': [
    {
      openingLine:
        "Hey! Thanks for making time today. Before we dive into specifics, could you walk me through a project or technical concept you've been working on recently—just in plain English?",
      sparks: [
        'Walk through a recent lab or control system problem I solved',
        'Explain a core engineering concept using an everyday analogy',
        'Share a bug or failure that taught me something useful',
      ],
    },
    {
      openingLine:
        "Glad we could connect! Let's skip the rehearsed resume pitch—tell me about the trickiest debugging moment or design trade-off you ran into recently and how you reasoned through it.",
      sparks: [
        'Describe a tricky signal or hardware bug I tracked down',
        'Explain a trade-off between accuracy, cost, and speed',
        'Walk through what broke first and how I isolated it',
      ],
    },
    {
      openingLine:
        "Welcome! Imagine I'm a teammate from another department who doesn't share your exact background. Pick one system or concept you know well and explain how it actually works in 30 seconds.",
      sparks: [
        'Explain closed-loop feedback using a thermostat or cruise control',
        'Contrast two competing approaches in plain English',
        'Highlight the one misconception people usually have about it',
      ],
    },
    {
      openingLine:
        "Hi there, good to meet you! When you're building or testing something new and the numbers don't match the theory, what's the very first thing you check?",
      sparks: [
        'Walk through my step-by-step diagnostic checklist',
        'Share a real lab measurement that surprised me',
        'Explain how I separate sensor noise from real system drift',
      ],
    },
    {
      openingLine:
        "Thanks for hopping on! I'd love to hear your take: what's one technical idea you used to find confusing until a real example finally made it click?",
      sparks: [
        'Share the analogy that finally unlocked a tough concept',
        'Contrast how textbooks teach it vs. how it behaves in practice',
        'Connect it to a hands-on experiment or project',
      ],
    },
  ],
  'everyday-cafe': [
    {
      openingLine:
        "Hey, mind if I grab the seat across from you? This place is packed today. What's been keeping your week interesting so far?",
      sparks: [
        'Mention something surprising from my week',
        'Talk about a book, show, or habit I picked up lately',
        'Flip the question back after sharing a short update',
      ],
    },
    {
      openingLine:
        "Whoa, the espresso machine is working overtime today! Are you taking a quick break from work or studying, or just escaping your desk for an hour?",
      sparks: [
        'Share what I needed a break from today',
        'Joke about my caffeine habit or favorite study spot',
        'Ask Sam what brought them to the cafe today',
      ],
    },
    {
      openingLine:
        "Good timing—I was just debating whether to order a second cup or call it quits before my hands start shaking. How's your day treating you?",
      sparks: [
        'Share an honest highlight and a minor annoyance from today',
        'Give a playful verdict on the second coffee',
        'Ask what they have planned for the rest of the day',
      ],
    },
    {
      openingLine:
        "Wait, I swear the playlist in here gets weirder every week, and yet I somehow get more done here than at home. Do you actually focus better around background noise, or do you need total quiet?",
      sparks: [
        'Describe my ideal focus environment and why it works',
        'Mention a funny distraction that threw me off recently',
        'Ask what kind of work they do in coffee shops',
      ],
    },
    {
      openingLine:
        "Hey! Look at us actually getting out of the house today. Have you stumbled onto anything fun lately—a show, a weird rabbit hole, or a new spot around town?",
      sparks: [
        'Recommend something I genuinely enjoyed recently',
        'Talk about a small hobby I started trying out',
        'Ask Sam for their latest recommendation',
      ],
    },
  ],
  'workplace-standup': [
    {
      openingLine:
        "Morning! Quick check-in before the sprint review—how are you feeling about Friday's milestone, and is anything quietly slowing you down right now?",
      sparks: [
        'Give a concise status update and flag one real blocker',
        'Propose cutting scope cleanly so quality stays high',
        'Ask for clarity on which deliverable matters most',
      ],
    },
    {
      openingLine:
        "Hey, glad we have fifteen minutes to sync. Looking at your plate this week, what's the one task that feels fuzzier or riskier than it looked on Monday?",
      sparks: [
        'Pinpoint the riskiest assumption and my backup plan',
        'Explain why one dependency took longer than estimated',
        'Ask Jordan to help unblock a cross-team decision',
      ],
    },
    {
      openingLine:
        "Good morning! Before leadership asks for an ETA later today, give me the unfiltered version—are we truly on track, or should we reset expectations early?",
      sparks: [
        'Give a transparent timeline with a clear trade-off',
        'Recommend shipping the core slice first and deferring polish',
        'Explain what specific support would keep the Friday date safe',
      ],
    },
    {
      openingLine:
        "Hey! Nice work closing out that last bug yesterday. Quick question as we plan next week: where do you think our current workflow is wasting the most of your time?",
      sparks: [
        'Point out one process bottleneck constructively',
        'Suggest a lightweight change the team can test next sprint',
        'Ask how Jordan wants to weigh speed vs. reliability',
      ],
    },
  ],
  'client-pitch': [
    {
      openingLine:
        "I've got ten minutes before my next meeting—hit me with the short version. What are you building or proposing, and why should someone care right now?",
      sparks: [
        'Open with the real-world pain point in one sentence',
        'Compare how people do it today vs. my approach',
        'Cite a concrete result or quick example',
      ],
    },
    {
      openingLine:
        "Thanks for coming in! I see a dozen pitches a week that sound great on slides and fall apart in daily use. Give me the blunt, jargon-free version of what problem you actually solve.",
      sparks: [
        'Tell a 2-sentence story of a real user hitting this problem',
        'Explain the simplest thing my solution replaces',
        'State what makes this urgent today instead of next year',
      ],
    },
    {
      openingLine:
        "Alright, I'm intrigued by your note—but play devil's advocate for me first. Why wouldn't someone just stick with their current spreadsheet or workaround instead of switching to your idea?",
      sparks: [
        'Acknowledge when a simple workaround is fine, then show where it breaks',
        'Quantify the hidden cost of the status quo',
        'Explain how fast someone sees value on day one',
      ],
    },
    {
      openingLine:
        "Good to meet you! Skip the market-size buzzwords for a second—who is the exact person who would be genuinely upset if your product disappeared tomorrow?",
      sparks: [
        'Describe one vivid target user and their daily workflow',
        'Share a specific reaction or test result I observed',
        'Ask Elena what proof point she values most at this stage',
      ],
    },
  ],
  'thoughtful-debate': [
    {
      openingLine:
        "Okay, friendly hot take to start us off: I think most people spend way too much time optimizing tools and not enough time actually practicing the craft. Do you buy that, or am I being unfair?",
      sparks: [
        'Agree halfway, then introduce a nuanced counterpoint',
        'Push back directly with a personal experience',
        'Ask Devon where they draw the line between prep and practice',
      ],
    },
    {
      openingLine:
        "Alright, test this theory with me: I'm starting to think instant AI answers are making us faster at finishing tasks, but worse at actually remembering how to think through hard problems. Agree or disagree?",
      sparks: [
        'Separate using tools as a crutch vs. using them as a sparring partner',
        'Give a concrete example from studying or engineering',
        'Challenge Devon on how people learned before modern tools',
      ],
    },
    {
      openingLine:
        "Friendly provocation for today: being 'well-rounded' is overrated—going obsessively deep on one skill beats being decent at five. Change my mind!",
      sparks: [
        'Defend T-shaped skills with a real-world example',
        'Agree with the depth point, but flag the blind spots of narrow specialists',
        'Ask Devon which side they actually live by',
      ],
    },
    {
      openingLine:
        "Here's one I've been arguing with friends about: short, blunt messages are actually kinder than long, overly polite ones because they respect everyone's time. Where do you land?",
      sparks: [
        'Distinguish crisp warmth from cold bluntness',
        'Share when extra context actually saves time',
        'Ask how tone shifts between friends and workplace chats',
      ],
    },
  ],
  'networking-intro': [
    {
      openingLine:
        "Great running into you here! I didn't catch your story earlier—what are you focused on right now, and what kind of problems excite you most?",
      sparks: [
        'Share a crisp 2-sentence intro about what I study or build',
        'Highlight one project I genuinely enjoyed working on',
        'Ask Marcus what trend he is watching closely this year',
      ],
    },
    {
      openingLine:
        "Hey! That panel ran a bit long, didn't it? I'm Marcus—always like meeting people outside my usual bubble. What brought you to this event today?",
      sparks: [
        'Share what I hoped to learn or who I wanted to meet',
        'Mention a specific topic from my field that connects here',
        'Ask Marcus how he got started in his current work',
      ],
    },
    {
      openingLine:
        "Good to finally say hi! Quick icebreaker I like better than 'what do you do'—what's a project or skill you're secretly proud of figuring out over the last few months?",
      sparks: [
        'Tell a short story about a hurdle I recently cleared',
        'Connect that skill to where I want to grow next',
        'Flip the icebreaker back to Marcus',
      ],
    },
    {
      openingLine:
        "Hey there! Grabbing coffee before the next talk? Tell me what you're working toward this year—I'm always curious what sharp students and builders are excited about right now.",
      sparks: [
        'State my main goal for this year in plain language',
        'Mention one area where I am looking for mentorship or feedback',
        'Ask Marcus what advice he gives people early in their career',
      ],
    },
  ],
};

/**
 * Picks a fresh, non-repeating opening line & matching starter sparks for a scenario.
 * Avoids repeating any line in `avoidOpenings` so every chat starts differently.
 */
export function pickFreshOpeningLine(params: {
  scenario: ConversationScenario;
  studentProfile?: StudentProfile;
  avoidOpenings?: string[];
  seedIndex?: number;
}): { openingLine: string; initialSparks: string[] } {
  const { scenario, studentProfile, avoidOpenings = [], seedIndex } = params;
  const avoidSet = new Set(
    avoidOpenings.map((s) => s.trim().toLowerCase()).filter(Boolean)
  );

  const baseVariants = SCENARIO_OPENING_VARIANTS[scenario.id];
  if (baseVariants && baseVariants.length > 0) {
    const personalized = baseVariants.map((variant, idx) => {
      if (
        scenario.id === 'technical-interview' &&
        idx === 0 &&
        studentProfile?.collegeDegree
      ) {
        const degree = studentProfile.collegeDegree.trim();
        return {
          openingLine: `Hey! Thanks for making time today. I saw you're studying ${degree}—before we get into details, could you walk me through a concept or project you've enjoyed lately, just in plain English?`,
          sparks: variant.sparks,
        };
      }
      return variant;
    });

    const freshPool = personalized.filter(
      (v) => !avoidSet.has(v.openingLine.trim().toLowerCase())
    );
    const pool = freshPool.length > 0 ? freshPool : personalized;
    const chosenIdx =
      typeof seedIndex === 'number'
        ? Math.abs(Math.floor(seedIndex)) % pool.length
        : Math.floor(Math.random() * pool.length);
    const chosen = pool[chosenIdx];
    return {
      openingLine: chosen.openingLine,
      initialSparks: chosen.sparks,
    };
  }

  // Custom scenario fallback variants
  const cleanTopic = scenario.title.replace(/\.\.\.$/, '').trim() || 'this topic';
  const customPool = [
    `Let's jump right into "${cleanTopic}". Go ahead and open the conversation however you naturally would, and I'll respond in character.`,
    `Okay, I'm ready for "${cleanTopic}"—set the scene for me in a sentence or two, and let's dive right in.`,
    `Sounds good! Picture us right in the middle of "${cleanTopic}". What's the very first thing you'd say to me?`,
  ];
  const freshCustom = customPool.filter(
    (line) => !avoidSet.has(line.trim().toLowerCase())
  );
  const pool = freshCustom.length > 0 ? freshCustom : customPool;
  const chosenIdx =
    typeof seedIndex === 'number'
      ? Math.abs(Math.floor(seedIndex)) % pool.length
      : Math.floor(Math.random() * pool.length);

  return {
    openingLine: pool[chosenIdx],
    initialSparks: scenario.initialSparks,
  };
}

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
 * Cascades seamlessly across 5 non-deprecated Gemini generations (Flash Lite 3.1 -> Flash 2.5 Lite
 * -> Gemini 3 Flash -> Gemini 2.5 Flash -> Hydrogen) so live conversation never stalls.
 */
export function selectConversationTurnRoute(input: {
  pace: ConversationPace;
  turnCount: number;
  cooldownUntil?: Partial<Record<ActiveEvalModel, number>>;
  unsupportedUntil?: Partial<Record<ActiveEvalModel, number>>;
  now?: number;
}): ConversationTurnRoutePlan {
  const now = input.now ?? Date.now();
  const cooldown = input.cooldownUntil ?? {};
  const unsupported = input.unsupportedUntil ?? {};

  const isUnsupported = (model: ActiveEvalModel): boolean =>
    (unsupported[model] ?? 0) > now;
  const isCoolingDown = (model: ActiveEvalModel): boolean =>
    (cooldown[model] ?? 0) > now;

  const flashLiteInstant: ConversationTurnRouteStep = {
    model: 'gemini-3.1-flash-lite',
    thinkingLabel: 'MINIMAL',
    tierLabel: formatTierLabel('gemini-3.1-flash-lite', 'MINIMAL'),
  };
  const flashLiteLow: ConversationTurnRouteStep = {
    model: 'gemini-3.1-flash-lite',
    thinkingLabel: 'LOW',
    tierLabel: formatTierLabel('gemini-3.1-flash-lite', 'LOW'),
  };
  const flash25Lite: ConversationTurnRouteStep = {
    model: 'gemini-2.5-flash-lite',
    thinkingLabel: 'STANDARD',
    tierLabel: formatTierLabel('gemini-2.5-flash-lite', 'STANDARD'),
  };
  const gemini3FlashLow: ConversationTurnRouteStep = {
    model: 'gemini-3-flash-preview',
    thinkingLabel: 'LOW',
    tierLabel: formatTierLabel('gemini-3-flash-preview', 'LOW'),
  };
  const gemini25Flash: ConversationTurnRouteStep = {
    model: 'gemini-2.5-flash',
    thinkingLabel: 'STANDARD',
    tierLabel: formatTierLabel('gemini-2.5-flash', 'STANDARD'),
  };
  const hydrogenLow: ConversationTurnRouteStep = {
    model: 'gemini-4-hydrogen',
    thinkingLabel: 'LOW',
    tierLabel: formatTierLabel('gemini-4-hydrogen', 'LOW'),
  };

  const preferLow = input.pace === 'challenging' || input.turnCount >= 6;
  const preferredOrder: ConversationTurnRouteStep[] = preferLow
    ? [
        flashLiteLow,
        gemini3FlashLow,
        hydrogenLow,
        gemini25Flash,
        flash25Lite,
        flashLiteInstant,
      ]
    : [
        flashLiteInstant,
        gemini3FlashLow,
        hydrogenLow,
        flash25Lite,
        gemini25Flash,
        flashLiteLow,
      ];

  const supported = preferredOrder.filter((step) => !isUnsupported(step.model));
  const pool = supported.length > 0 ? supported : preferredOrder;
  const healthy = pool.filter((step) => !isCoolingDown(step.model));
  const cooled = pool.filter((step) => isCoolingDown(step.model));
  const cascade = [...healthy, ...cooled];

  return {
    primary: cascade[0],
    cascade,
    reason: preferLow
      ? 'Nuanced live reply with fast multi-generation failover'
      : 'Real-time conversational texting speed with zero-stall failover',
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
5. REPLY SPARKS ("replySparks"): Return 2–3 ultra-short (4–9 word) conversation angle ideas the user could take next if they feel stuck (never full pre-written paragraphs—just directional sparks).
6. IN-TIME TURN MICRO-ANALYSIS ("inTimeAnalysis"):
   - Quietly grade ONLY the user's LATEST message in real time across 5 integer 1–10 micro-signals (strict, honest, zero inflation):
     * contextAlignment: How directly did this reply address and build on your previous turn?
     * toneMatch: How well did the tone/register fit ${scenario.title} at ${pace} pace?
     * grammarAccuracy: Real-time grammar, verb agreement, and mechanics cleanliness.
     * naturalness: Does it sound like natural spoken English rather than stiff textbook phrasing?
     * vocabQuality: Natural word precision (never penalize crisp plain English; lowest weight).
     * turnNote: Crisp 1-sentence real-time observation (<= 14 words) noting what worked or slipped in this turn.`;
}

const ROBOTIC_PREFIX_REGEX =
  /^(?:as an ai(?: language model)?[^.!?]*[.!?]\s*|certainly[!,.]\s*|of course[!,.]\s*|sure thing[!,.]\s*)/i;

function clampTurnScore(value: unknown, fallback = 7): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(10, Math.round(num)));
}

export function sanitizeConversationTurnResponse(
  raw: Record<string, unknown>,
  latestUserMessage: string
): {
  reply: string;
  recast: ConversationRecast | null;
  inTimeAnalysis: ConversationTurnInTimeAnalysis | null;
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

  let inTimeAnalysis: ConversationTurnInTimeAnalysis | null = null;
  const rawInTime =
    raw.inTimeAnalysis && typeof raw.inTimeAnalysis === 'object'
      ? (raw.inTimeAnalysis as Record<string, unknown>)
      : null;
  if (rawInTime) {
    const note = String(rawInTime.turnNote ?? '').trim().slice(0, 140);
    inTimeAnalysis = {
      contextAlignment: clampTurnScore(rawInTime.contextAlignment, 7),
      toneMatch: clampTurnScore(rawInTime.toneMatch, 7),
      grammarAccuracy: clampTurnScore(rawInTime.grammarAccuracy, recast ? 6 : 8),
      naturalness: clampTurnScore(rawInTime.naturalness, 7),
      vocabQuality: clampTurnScore(rawInTime.vocabQuality, 7),
      turnNote:
        note ||
        (recast
          ? 'Clear conversational flow with one small phrasing slip.'
          : 'Natural, context-aligned reply.'),
    };
  }

  const replySparks = Array.isArray(raw.replySparks)
    ? raw.replySparks
        .map((s) => String(s ?? '').trim())
        .filter((s) => s.length >= 4 && s.length <= 75)
        .slice(0, 3)
    : [];

  return { reply, recast, inTimeAnalysis, replySparks };
}

export function buildOfflineConversationReply(
  scenario: ConversationScenario,
  latestUserMessage: string,
  turnNumber: number
): {
  reply: string;
  recast: ConversationRecast | null;
  inTimeAnalysis: ConversationTurnInTimeAnalysis;
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
    inTimeAnalysis: {
      contextAlignment: words >= 8 ? 7 : 6,
      toneMatch: 7,
      grammarAccuracy: 7,
      naturalness: 7,
      vocabQuality: 7,
      turnNote:
        words >= 12
          ? 'Solid live turn with helpful detail.'
          : 'Short turn; expand with a quick example next.',
    },
    replySparks: scenario.initialSparks.slice(0, 3),
  };
}

import type {
  CalendarSlot,
  InternationalMetrics,
  LiveDraftDiagnostics,
  RubricScores,
  TopicPrompt,
  VaultPayload,
  VocabEntry,
  WritingMode,
  WritingSession,
} from '../types';
import { getSentenceSpans } from './constraintChallenges';

export const MODE_LABELS: Record<WritingMode, string> = {
  journal: 'Personal Journal',
  linkedin: 'LinkedIn Post',
  email: 'Professional Email',
  friend: 'Friend Exchange',
  technical: 'Technical & Interview',
  creative: 'Creative Writing',
};

export const TONE_LABELS: Record<string, string> = {
  'professional-warm': 'Professional-Warm',
  conversational: 'Conversational & Natural',
  'formal-executive': 'Formal & Executive',
  'academic-technical': 'Academic / EIE Technical',
  'crisp-direct': 'Crisp & Direct',
  'narrative-vivid': 'Vivid & Narrative',
};

export const RUBRIC_DIMENSIONS: Array<{
  key: keyof RubricScores;
  label: string;
  shortLabel: string;
}> = [
  { key: 'naturalVoiceFlow', label: 'Natural Voice & Flow', shortLabel: 'Voice & Flow' },
  { key: 'claritySimplicity', label: 'Clarity & Simplicity', shortLabel: 'Clarity' },
  { key: 'grammarMechanics', label: 'Grammar & Mechanics', shortLabel: 'Grammar' },
  { key: 'toneEngagement', label: 'Tone & Engagement', shortLabel: 'Tone' },
  {
    key: 'sentenceVarietyCadence',
    label: 'Sentence Variety & Cadence',
    shortLabel: 'Cadence',
  },
  {
    key: 'concisenessDirectness',
    label: 'Conciseness & Directness',
    shortLabel: 'Conciseness',
  },
];

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function countSyllablesInWord(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned) return 0;
  if (cleaned.length <= 3) return 1;
  const trimmed = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

export function computeReadabilityStats(text: string): {
  fleschReadingEase: number;
  fkGradeLevel: number;
} {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9]/.test(w));
  const wordCount = words.length;
  if (wordCount === 0) {
    return { fleschReadingEase: 0, fkGradeLevel: 0 };
  }
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sentenceCount = Math.max(1, sentences.length);
  const totalSyllables = words.reduce(
    (acc, w) => acc + Math.max(1, countSyllablesInWord(w)),
    0
  );

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = totalSyllables / wordCount;

  const rawEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const rawGrade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;

  return {
    fleschReadingEase: Number(Math.max(0, Math.min(100, rawEase)).toFixed(1)),
    fkGradeLevel: Number(Math.max(1, Math.min(18, rawGrade)).toFixed(1)),
  };
}

export function computeTotalScore(scores: RubricScores): number {
  return (
    scores.naturalVoiceFlow +
    scores.claritySimplicity +
    scores.grammarMechanics +
    scores.toneEngagement +
    scores.sentenceVarietyCadence +
    scores.concisenessDirectness
  );
}

export function computePercentage(totalScore: number): number {
  return Number(((totalScore / 60) * 100).toFixed(1));
}

export function mapPercentageToIeltsBand(percentage: number): number {
  const clamped = Math.max(0, Math.min(100, percentage));
  const raw = 4.0 + (clamped / 100) * 5.0;
  return Math.min(9.0, Math.max(4.0, Math.round(raw * 2) / 2));
}

export function mapPercentageToToefl(percentage: number): number {
  const clamped = Math.max(0, Math.min(100, percentage));
  return Math.round((clamped / 100) * 30);
}

export function deriveInternationalMetrics(
  session: Pick<WritingSession, 'scores' | 'content' | 'internationalMetrics'>
): InternationalMetrics {
  const readability = computeReadabilityStats(session.content);
  if (session.internationalMetrics) {
    return {
      ...session.internationalMetrics,
      fleschReadingEase:
        session.internationalMetrics.fleschReadingEase || readability.fleschReadingEase,
      fkGradeLevel:
        session.internationalMetrics.fkGradeLevel || readability.fkGradeLevel,
    };
  }
  const total = computeTotalScore(session.scores);
  const pct = computePercentage(total);
  const lexicalResource = Number(
    (
      (session.scores.claritySimplicity + session.scores.concisenessDirectness) /
      2
    ).toFixed(1)
  );
  const coherenceCohesion = Number(
    (
      (session.scores.naturalVoiceFlow + session.scores.sentenceVarietyCadence) /
      2
    ).toFixed(1)
  );
  const taskAchievement = Number(
    (
      (session.scores.claritySimplicity + session.scores.toneEngagement) /
      2
    ).toFixed(1)
  );
  return {
    ieltsBand: mapPercentageToIeltsBand(pct),
    toeflEquivalent: mapPercentageToToefl(pct),
    lexicalResource,
    coherenceCohesion,
    taskAchievement,
    registerControl: session.scores.toneEngagement,
    grammarAccuracy: session.scores.grammarMechanics,
    fleschReadingEase: readability.fleschReadingEase,
    fkGradeLevel: readability.fkGradeLevel,
  };
}

const FILLER_WORDS = [
  'basically',
  'actually',
  'literally',
  'honestly',
  'really',
  'very',
  'just',
  'sort of',
  'kind of',
];

export function analyzeDraftLocally(text: string): LiveDraftDiagnostics {
  const wordCount = countWords(text);
  const rawSentences = getSentenceSpans(text).map((s) => s.text);
  const sentenceCount = rawSentences.length;
  const avgWordsPerSentence =
    sentenceCount > 0 ? Number((wordCount / sentenceCount).toFixed(1)) : 0;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const lower = text.toLowerCase();
  const fillerHits: Array<{ word: string; count: number }> = [];
  for (const filler of FILLER_WORDS) {
    const escaped = filler.replace(/\s+/g, '\\s+');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      fillerHits.push({ word: filler, count: matches.length });
    }
  }
  fillerHits.sort((a, b) => b.count - a.count);

  const openerCounts = new Map<string, number>();
  for (const sentence of rawSentences) {
    const words = sentence.split(/\s+/).slice(0, 2);
    if (words.length >= 2) {
      const opener = `${words[0]} ${words[1]}`.toLowerCase();
      openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1);
    }
  }
  const repeatedOpeners = Array.from(openerCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([opener, count]) => ({ opener, count }))
    .sort((a, b) => b.count - a.count);

  const passiveMatches = lower.match(
    /\b(was|were|been|being|is|are)\s+\w+(ed|en)\b/g
  );
  const passiveMarkers = passiveMatches ? passiveMatches.length : 0;

  return {
    wordCount,
    sentenceCount,
    avgWordsPerSentence,
    readingTimeMinutes,
    fillerHits,
    repeatedOpeners,
    passiveMarkers,
  };
}

export function formatLocalDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function diffDays(aISO: string, bISO: string): number {
  const a = parseISODate(aISO).getTime();
  const b = parseISODate(bISO).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export function getTriWeeklyCycleDates(referenceDateISO: string): {
  wednesday: string;
  friday: string;
  sunday: string;
  cycleLabel: string;
} {
  const ref = parseISODate(referenceDateISO);
  const day = ref.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Active Wed/Fri/Sun cycle runs Monday through Sunday night
  const wedOffset = day === 0 ? -4 : 3 - day;
  const wedDt = new Date(ref);
  wedDt.setDate(ref.getDate() + wedOffset);

  const friDt = new Date(wedDt);
  friDt.setDate(wedDt.getDate() + 2);
  const sunDt = new Date(wedDt);
  sunDt.setDate(wedDt.getDate() + 4);

  const wednesday = formatLocalDateISO(wedDt);
  const friday = formatLocalDateISO(friDt);
  const sunday = formatLocalDateISO(sunDt);

  return {
    wednesday,
    friday,
    sunday,
    cycleLabel: `${wednesday.slice(5)} · ${friday.slice(5)} · ${sunday.slice(5)}`,
  };
}

export function needsTriWeeklyAutoReload(
  slots: CalendarSlot[],
  referenceDateISO: string
): boolean {
  const cycle = getTriWeeklyCycleDates(referenceDateISO);
  const targetDates = [cycle.wednesday, cycle.friday, cycle.sunday];
  return targetDates.some(
    (iso) => !slots.some((s) => s.scheduledDate === iso && s.isTriWeekly)
  );
}

export interface CoachPerformanceContext {
  previousSessionSummary: string;
  avgPercentage: number;
  weakestPillarLabel: string;
  weakestPillarScore: number;
  recentStrictFixes: string[];
  practicingWords: VocabEntry[];
  activeReminder: string;
}

export function summarizeCoachContext(
  sessions: WritingSession[],
  vocabulary: VocabEntry[]
): CoachPerformanceContext {
  const completed = [...sessions]
    .filter((s) => s.status === 'Completed')
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = completed[0];
  const avgRubric = computeAverageRubric(completed);
  const lever = findGrowthLever(avgRubric);
  const avgScore =
    completed.length > 0
      ? completed.reduce((acc, s) => acc + s.totalScore, 0) / completed.length
      : 0;
  const avgPercentage =
    completed.length > 0 ? computePercentage(avgScore) : 0;

  const recentStrictFixes = completed
    .slice(0, 2)
    .map((s) => s.strictImprovements)
    .filter(Boolean);

  const practicingWords = vocabulary.filter((v) => !v.mastered).slice(0, 6);
  const vocabSample = practicingWords
    .slice(0, 2)
    .map((v) => `"${v.betterAlternative.split('/')[0].trim()}"`)
    .join(' & ');

  const rawFix = latest?.strictImprovements?.trim() || '';
  let fixSnippet = 'Vary sentence openings and remove conversational fillers.';
  if (rawFix) {
    if (rawFix.length <= 128) {
      fixSnippet = rawFix;
    } else {
      const cut = rawFix.slice(0, 125);
      const lastBreak = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(' '));
      fixSnippet = `${(lastBreak > 60 ? cut.slice(0, lastBreak) : cut).trim()}…`;
    }
  }

  const activeReminder = vocabSample
    ? `Practice ${vocabSample} in this draft · Focus: ${fixSnippet}`
    : `Focus: ${fixSnippet}`;

  const previousSessionSummary = latest
    ? `Last session (${latest.date}, ${latest.promptCategory}, ${latest.totalScore}/60): Strict fixes were "${latest.strictImprovements}".`
    : '';

  return {
    previousSessionSummary,
    avgPercentage,
    weakestPillarLabel: lever?.label || 'Grammar & Mechanics',
    weakestPillarScore: lever?.score || 7.5,
    recentStrictFixes,
    practicingWords,
    activeReminder,
  };
}

export function detectPracticingVocabUsed(
  content: string,
  vocabulary: VocabEntry[]
): string[] {
  const lower = content.toLowerCase();
  if (!lower.trim()) return [];
  const matchedIds: string[] = [];

  for (const entry of vocabulary) {
    if (entry.mastered) continue;
    const candidates = entry.betterAlternative
      .split('/')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length >= 3);

    const found = candidates.some((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(lower);
    });
    if (found) {
      matchedIds.push(entry.id);
    }
  }
  return matchedIds;
}

export interface TriWeeklyTemplate {
  slotLabel: string;
  slotTime: string;
  mode: WritingMode;
  tone: WritingSession['tone'];
  promptCategory: string;
  topic: string;
  topicPrimer: string;
  pivotRule: string;
  feedbackReminder: string;
  targetWords: number;
  suggestions: string[];
}

export const UNIVERSAL_PIVOT_RULE =
  'Universal Pivot: Swap to any familiar lab circuit, sensor, internship email, or personal story if this scenario feels unfamiliar.';

export const TRI_WEEKLY_TOPIC_POOL: Record<
  'technical-concept' | 'linkedin-email' | 'creative-story',
  TriWeeklyTemplate[]
> = {
  'technical-concept': [
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Defend 4–20 mA Current Loops Over 0–10 V Signals in an Interview',
      topicPrimer:
        'Industrial transmitters carry process values over long factory cable runs where copper resistance and motor EMI corrupt tiny voltages. A 4–20 mA loop drives constant current regardless of wire length, while the 4 mA live zero immediately distinguishes a zero reading from a snapped cable.',
      pivotRule:
        'Universal Pivot: Swap to any sensor signal-conditioning setup from your 6th-sem EIE lab (e.g., thermocouple, ultrasonic, or strain gauge).',
      feedbackReminder:
        'Use vocal signposts between stages and replace weak verbs with "stabilizes" or "interfaces with".',
      targetWords: 220,
      suggestions: [
        'Contrast cable voltage drop vs current-loop immunity in plain spoken English.',
        'Explain why 4 mA live-zero catches open-wire faults instantly.',
        'Anchor with a 6th-sem Process Control transmitter calibration example.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Explain Instrumentation Amplifiers & CMRR in a Wheatstone Bridge',
      topicPrimer:
        'A Wheatstone bridge outputs millivolt differences sitting on top of large common-mode supply or 50 Hz mains noise. The 3-op-amp instrumentation amplifier buffers both high-impedance bridge legs equally and amplifies only the true transducer difference.',
      pivotRule:
        'Universal Pivot: Swap to explaining any op-amp comparator, differential amp, or ADC front-end you wired in lab.',
      feedbackReminder:
        'Break long clauses into crisp 15-word steps; try "diagnosed" and "digitizes".',
      targetWords: 210,
      suggestions: [
        'Define Common-Mode Rejection Ratio (CMRR) without hiding behind formulas.',
        'Walk through input buffering before the difference stage.',
        'Relate back to an RTD or strain-gauge bridge demo.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Defend PID Anti-Windup & Derivative-on-Measurement Trade-offs',
      topicPrimer:
        'When a setpoint jumps suddenly, standard derivative control spikes the actuator (derivative kick), and an un-clamped integrator saturates during slow thermal climbs (integral windup). Industrial PID blocks fix both by differentiating the process variable and freezing integration at actuator limits.',
      pivotRule:
        'Universal Pivot: Swap to tuning any closed-loop motor speed, heater, or level controller you know well.',
      feedbackReminder:
        'Keep verbs active ("clamps", "prevents") and avoid starting back-to-back sentences with "This".',
      targetWords: 220,
      suggestions: [
        'Describe derivative kick as a sudden punch on a step change.',
        'Explain clamping the integral term when the valve hits 100%.',
        'Give a concrete PT100 thermal chamber tuning takeaway.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'SAR vs Delta-Sigma ADCs: Picking the Right Converter for PLC Cards',
      topicPrimer:
        'Successive Approximation (SAR) ADCs deliver microsecond speed for fast multiplexed signals, whereas Delta-Sigma ADCs oversample and noise-shape slow sensor inputs up to 24-bit resolution. Choosing the wrong converter either bottlenecks throughput or floods slow thermocouple channels with switching noise.',
      pivotRule:
        'Universal Pivot: Swap to comparing any two lab hardware choices (e.g., SPI vs I2C, or Hall-effect vs optical encoder).',
      feedbackReminder:
        'Practice "digitizes" and "critical bottleneck"; check subject-verb agreement cleanly.',
      targetWords: 210,
      suggestions: [
        'Lead with the design constraint: speed vs noise rejection.',
        'Explain why PLC RTD cards prefer Delta-Sigma filtering.',
        'Keep every sentence crisp and interview-speakable.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Cold-Junction Compensation in Thermocouples Explained Simply',
      topicPrimer:
        'A thermocouple measures the temperature difference between its hot probe tip and the screw terminals where it meets your copper PCB—not absolute temperature. Unless firmware reads that terminal temperature with a local thermistor or RTD and adds it back, your furnace reading drifts with room air conditioning.',
      pivotRule:
        'Universal Pivot: Swap to explaining any sensor calibration error (zero-shift, span drift, or hysteresis) you observed in lab.',
      feedbackReminder:
        'Vary your sentence lengths and verify articles ("an RTD", "a thermocouple").',
      targetWords: 205,
      suggestions: [
        'Start with the mental trap: why two dissimilar metals create voltage at both ends.',
        'Explain the reference junction correction in two plain sentences.',
        'Close with one quick interview insight on terminal block placement.',
      ],
    },
  ],
  'linkedin-email': [
    {
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      mode: 'linkedin',
      tone: 'professional-warm',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'LinkedIn Post: What Oscilloscope Ringing Taught Me About Ground Loops',
      topicPrimer:
        'Recruiters love hardware stories that show calm troubleshooting rather than textbook definitions. Sharing a brief before-and-after debugging moment on a shared breadboard ground rail proves real bench ownership.',
      pivotRule:
        'Universal Pivot: Swap to any real lab setback (a loose jumper, wrong baud rate, or burnt op-amp) and what it taught you.',
      feedbackReminder:
        'Trim filler words ("basically", "actually") and use "diagnosed" or "resolved".',
      targetWords: 180,
      suggestions: [
        'Hook with the exact symptom you saw on the scope screen.',
        'Show one systematic check that isolated the ground path.',
        'End with an encouraging, non-preachy takeaway for peers.',
      ],
    },
    {
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      mode: 'email',
      tone: 'formal-executive',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'Cold Email to a Process Automation Lead for a Summer EIE Internship',
      topicPrimer:
        'Busy engineering leads scan cold emails in under 15 seconds for relevance, specificity, and low-friction asks. Opening with one concrete 6th-semester instrumentation outcome sets you apart from generic resume blasts.',
      pivotRule:
        'Universal Pivot: Swap to emailing a professor for capstone mentorship, or an alumni engineer for a 10-minute coffee chat.',
      feedbackReminder:
        'Check modal verbs ("couldn\'t", not "couldn\'t even able") and keep under 3 tight paragraphs.',
      targetWords: 165,
      suggestions: [
        'Write a crisp subject line naming EIE instrumentation & PLC/embedded focus.',
        'Summarize one tangible lab circuit or calibration project in two lines.',
        'Close with a polite, specific 10-minute call window.',
      ],
    },
    {
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      mode: 'email',
      tone: 'professional-warm',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'Diplomatic Team Update: Explaining a Capstone PCB Delay Without Blame',
      topicPrimer:
        'In group projects, owning a schedule slip constructively builds trust faster than excuses. A strong status note pairs the root cause cleanly with a concrete recovery plan and clear owner dates.',
      pivotRule:
        'Universal Pivot: Swap to any tough coordination message (rescheduling a lab demo, or clarifying split responsibilities).',
      feedbackReminder:
        'Replace passive blaming ("got missed") with active ownership ("overlooked", "stabilized").',
      targetWords: 175,
      suggestions: [
        'State the revised milestone upfront in the first sentence.',
        'Explain the technical blocker concisely without pointing fingers.',
        'Propose two concrete parallel tasks to recover lost bench time.',
      ],
    },
    {
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      mode: 'linkedin',
      tone: 'professional-warm',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'LinkedIn Reflection: Bridging PLC Ladder Logic & Edge Telemetry in 6th Sem',
      topicPrimer:
        'Connecting traditional industrial controllers with modern cloud telemetry sits right at the heart of Industry 4.0 instrumentation roles. Highlighting why deterministic scan cycles matter before streaming data shows mature engineering judgment.',
      pivotRule:
        'Universal Pivot: Swap to any bridge between classroom theory and hands-on hardware you built this semester.',
      feedbackReminder:
        'Use "critical bottleneck" or "scattered guesswork" cleanly; vary sentence openings.',
      targetWords: 185,
      suggestions: [
        'Contrast classroom simulation with real hardware scan timing.',
        'Describe one measurable improvement in signal visibility.',
        'Invite practicing automation engineers to weigh in.',
      ],
    },
    {
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      mode: 'email',
      tone: 'formal-executive',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'Post-Interview Thank-You Note Reinforcing Your Design Trade-off Answer',
      topicPrimer:
        'A sharp follow-up email within 24 hours lets you clarify one technical nuance you wished you had phrased even tighter during the interview. Keep it appreciative, grounded, and specific to the team’s stack.',
      pivotRule:
        'Universal Pivot: Swap to following up with a hackathon judge, workshop speaker, or lab coordinator.',
      feedbackReminder:
        'Watch "didn\'t + base verb" mechanics and keep every clause tight and respectful.',
      targetWords: 160,
      suggestions: [
        'Reference one specific question the interviewer asked you.',
        'Add one concise 2-sentence engineering follow-through.',
        'Reaffirm enthusiasm without sounding rehearsed.',
      ],
    },
  ],
  'creative-story': [
    {
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'The Clockwork Cartographer: An Irreversible Choice in a Sunken Brass City',
      topicPrimer:
        'Below the tide-wall, every district runs on pressurized brine pipes and brass gear-trains that hiss when storms roll in. Tonight your apprentice cartographer discovers the city’s pressure map omits an entire submerged ward—and the floodgates open in ten minutes.',
      pivotRule:
        'Universal Pivot: Swap to any character facing an urgent moral dilemma in a world or memory you love.',
      feedbackReminder:
        'Show emotion through physical gestures and cadence rather than flat labels like "felt scared".',
      targetWords: 240,
      suggestions: [
        'Ground the opening in two sharp sensory textures (salt crust, lantern hiss).',
        'Reveal character conflict through a short exchange of dialogue.',
        'Close on an irreversible choice rather than a tidy summary.',
      ],
    },
    {
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'The Glass Frequency: Hearing a Forbidden Signal Inside a Quiet Valley',
      topicPrimer:
        'In a valley where messages travel as sung harmonics through quartz pylons, your protagonist works the graveyard listening watch. At 3:00 AM a crystalline tone pulses through the receiver—one carrying a voice everyone believed was lost.',
      pivotRule:
        'Universal Pivot: Swap to any sci-fi, fantasy, or grounded midnight-shift scene driven by a mysterious signal.',
      feedbackReminder:
        'Vary short punchy sentences with longer lyrical ones to build vocal cadence.',
      targetWords: 240,
      suggestions: [
        'Describe the exact acoustic feel of the forbidden frequency.',
        'Contrast mundane night-watch routine with sudden wonder.',
        'End right as the protagonist decides whether to log it or hide it.',
      ],
    },
    {
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'Last Watch at the Sky-Lock Lighthouse Before the Iron Storm Arrives',
      topicPrimer:
        'Perched above a cloud sea, the lighthouse guides iron airships using burning copper mirrors. With lightning arcing across the catwalk and one last ship off-course, the retiring keeper has to trust an unproven apprentice at the shutter lever.',
      pivotRule:
        'Universal Pivot: Swap to any mentor-apprentice handoff scene under high physical stakes.',
      feedbackReminder:
        'Eliminate passive "was/were" narration in favor of vivid active verbs.',
      targetWords: 235,
      suggestions: [
        'Use dialogue that reveals years of unspoken trust or friction.',
        'Let the wind and copper sparks pace the tension.',
        'End with one unforgettable sensory image.',
      ],
    },
    {
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'The Memory Alchemist’s Scale: Trading One Summer for Unshakable Focus',
      topicPrimer:
        'In a quiet back-alley apothecary, memories weigh in brass grains—joy feels warm like cedar, regret heavy as wet lead. A tired scholar steps up to pawn a childhood afternoon in exchange for clarity before dawn.',
      pivotRule:
        'Universal Pivot: Swap to any quiet bargain scene exploring what a character is willing to sacrifice.',
      feedbackReminder:
        'Practice crisp imagery and avoid repeating the same sentence opener.',
      targetWords: 240,
      suggestions: [
        'Give the memory vial concrete color, scent, and temperature.',
        'Show hesitation through small hand movements, not exposition.',
        'Leave a lingering emotional echo in the final sentence.',
      ],
    },
    {
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'Train Platform Nine Under Rain: Two Old Friends Who Took Different Roads',
      topicPrimer:
        'Not all storytelling needs dragons—sometimes two minutes on a rain-slicked railway platform holds an entire world. Two former lab partners cross paths three years after graduation with five minutes before the express departs.',
      pivotRule:
        'Universal Pivot: Swap to any grounded dialogue scene between two characters with shared history.',
      feedbackReminder:
        'Focus on natural spoken dialogue and expressive subtext.',
      targetWords: 230,
      suggestions: [
        'Let an everyday object (a scuffed notebook or coffee cup) anchor the memory.',
        'Keep dialogue slightly asymmetrical—what goes unsaid matters most.',
        'End as the departure whistle cuts the conversation short.',
      ],
    },
  ],
};

export function buildDefaultTriWeeklySlots(
  referenceDateISO: string,
  coachContext?: CoachPerformanceContext
): CalendarSlot[] {
  const cycle = getTriWeeklyCycleDates(referenceDateISO);
  const reminder =
    coachContext?.activeReminder ||
    'Watch articles/tense mechanics & actively use "diagnosed", "stabilizes", or "digitizes".';

  const specs: Array<{
    date: string;
    dayOfWeek: 'Wednesday' | 'Friday' | 'Sunday';
    suffix: string;
    pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
    template: TriWeeklyTemplate;
  }> = [
    {
      date: cycle.wednesday,
      dayOfWeek: 'Wednesday',
      suffix: 'wed',
      pillar: 'technical-concept',
      template: TRI_WEEKLY_TOPIC_POOL['technical-concept'][0],
    },
    {
      date: cycle.friday,
      dayOfWeek: 'Friday',
      suffix: 'fri',
      pillar: 'linkedin-email',
      template: TRI_WEEKLY_TOPIC_POOL['linkedin-email'][0],
    },
    {
      date: cycle.sunday,
      dayOfWeek: 'Sunday',
      suffix: 'sun',
      pillar: 'creative-story',
      template: TRI_WEEKLY_TOPIC_POOL['creative-story'][0],
    },
  ];

  return specs.map(({ date, dayOfWeek, suffix, pillar, template }) => ({
    id: `tri-${date}-${suffix}`,
    dayOfWeek,
    slotLabel: template.slotLabel,
    slotTime: template.slotTime,
    scheduledDate: date,
    mode: template.mode,
    tone: template.tone,
    promptCategory: template.promptCategory,
    topic: template.topic,
    topicPrimer: template.topicPrimer,
    pivotRule: template.pivotRule,
    feedbackReminder: coachContext ? reminder : template.feedbackReminder,
    targetWords: template.targetWords,
    completed: false,
    isTriWeekly: true,
    pillar,
    suggestions: [...template.suggestions],
  }));
}

export function getMonthTriWeeklyDates(
  year: number,
  monthIndex0: number
): Array<{
  scheduledDate: string;
  dayOfWeek: 'Wednesday' | 'Friday' | 'Sunday';
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
}> {
  const result: Array<{
    scheduledDate: string;
    dayOfWeek: 'Wednesday' | 'Friday' | 'Sunday';
    pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
  }> = [];
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dt = new Date(year, monthIndex0, day);
    const wd = dt.getDay();
    if (wd === 3) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Wednesday',
        pillar: 'technical-concept',
      });
    } else if (wd === 5) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Friday',
        pillar: 'linkedin-email',
      });
    } else if (wd === 0) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Sunday',
        pillar: 'creative-story',
      });
    }
  }
  return result;
}

export function buildMonthTriWeeklySlots(
  year: number,
  monthIndex0: number,
  existingSlots: CalendarSlot[],
  coachContext?: CoachPerformanceContext
): CalendarSlot[] {
  const monthDates = getMonthTriWeeklyDates(year, monthIndex0);
  const existingDateSet = new Set(
    existingSlots.filter((s) => s.isTriWeekly).map((s) => s.scheduledDate)
  );
  const counters: Record<
    'technical-concept' | 'linkedin-email' | 'creative-story',
    number
  > = {
    'technical-concept': 0,
    'linkedin-email': 0,
    'creative-story': 0,
  };

  const created: CalendarSlot[] = [];
  for (const item of monthDates) {
    const pool = TRI_WEEKLY_TOPIC_POOL[item.pillar];
    const idx = counters[item.pillar] % pool.length;
    counters[item.pillar] += 1;

    if (existingDateSet.has(item.scheduledDate)) continue;
    const template = pool[idx];
    const suffix =
      item.dayOfWeek === 'Wednesday'
        ? 'wed'
        : item.dayOfWeek === 'Friday'
          ? 'fri'
          : 'sun';

    created.push({
      id: `tri-${item.scheduledDate}-${suffix}`,
      dayOfWeek: item.dayOfWeek,
      slotLabel: template.slotLabel,
      slotTime: template.slotTime,
      scheduledDate: item.scheduledDate,
      mode: template.mode,
      tone: template.tone,
      promptCategory: template.promptCategory,
      topic: template.topic,
      topicPrimer: template.topicPrimer,
      pivotRule: template.pivotRule,
      feedbackReminder:
        coachContext?.activeReminder || template.feedbackReminder,
      targetWords: template.targetWords,
      completed: false,
      isTriWeekly: true,
      pillar: item.pillar,
      suggestions: [...template.suggestions],
    });
  }

  return created;
}

export function swapSingleTriWeeklySlot(
  slot: CalendarSlot,
  existingTopics: string[] = []
): CalendarSlot {
  const pillar =
    slot.pillar ??
    (slot.dayOfWeek === 'Wednesday'
      ? 'technical-concept'
      : slot.dayOfWeek === 'Friday'
        ? 'linkedin-email'
        : 'creative-story');
  const pool = TRI_WEEKLY_TOPIC_POOL[pillar];
  const currentIdx = pool.findIndex((item) => item.topic === slot.topic);
  const usedSet = new Set(existingTopics);
  let picked = pool[(currentIdx + 1) % pool.length];
  for (let offset = 1; offset <= pool.length; offset += 1) {
    const candidate = pool[(currentIdx + offset + pool.length) % pool.length];
    if (candidate.topic !== slot.topic && !usedSet.has(candidate.topic)) {
      picked = candidate;
      break;
    }
  }
  return {
    ...slot,
    slotLabel: picked.slotLabel,
    slotTime: picked.slotTime,
    mode: picked.mode,
    tone: picked.tone,
    promptCategory: picked.promptCategory,
    topic: picked.topic,
    topicPrimer: picked.topicPrimer,
    pivotRule: picked.pivotRule,
    feedbackReminder: slot.feedbackReminder || picked.feedbackReminder,
    targetWords: picked.targetWords,
    suggestions: [...picked.suggestions],
  };
}

export function buildQueuedProvisionalEvaluation(
  content: string,
  mode: WritingMode,
  tone: WritingSession['tone']
): {
  scores: RubricScores;
  cefrLevel: string;
  internationalMetrics: InternationalMetrics;
  toneVerdict: string;
  flowVerdict: string;
  feedbackImplemented: 'Baseline' | 'Yes' | 'Partial' | 'No';
  whatImproved: string;
  strictImprovements: string;
  grammarFixes: Array<{
    original: string;
    corrected: string;
    rule: string;
    category: string;
  }>;
  vocabUpgrades: Array<{
    used: string;
    betterAlternative: string;
    explanation: string;
    contextSnippet: string;
  }>;
} {
  const diag = analyzeDraftLocally(content);
  const read = computeReadabilityStats(content);

  const fillerPenalty = Math.min(3, diag.fillerHits.length);
  const passivePenalty = Math.min(2, Math.floor(diag.passiveMarkers / 2));
  const lengthBonus = diag.wordCount >= 120 ? 1 : 0;
  const cadenceScore =
    diag.avgWordsPerSentence >= 11 && diag.avgWordsPerSentence <= 23 ? 8 : 7;

  const scores: RubricScores = {
    naturalVoiceFlow: Math.max(5, Math.min(9, 7 + lengthBonus - fillerPenalty)),
    claritySimplicity: Math.max(5, Math.min(9, 8 - passivePenalty)),
    grammarMechanics: Math.max(6, Math.min(9, 8 - Math.min(2, fillerPenalty))),
    toneEngagement: Math.max(6, Math.min(9, 7 + lengthBonus)),
    sentenceVarietyCadence: Math.max(
      5,
      Math.min(9, cadenceScore - Math.min(2, diag.repeatedOpeners.length))
    ),
    concisenessDirectness: Math.max(
      5,
      Math.min(9, 8 - fillerPenalty - passivePenalty)
    ),
  };

  const total = computeTotalScore(scores);
  const pct = computePercentage(total);
  const cefrLevel = pct >= 82 ? 'C1' : pct >= 72 ? 'B2+' : 'B2';

  const internationalMetrics = deriveInternationalMetrics({
    scores,
    content,
  });

  const grammarFixes = diag.fillerHits.slice(0, 3).map((hit) => ({
    original: hit.word,
    corrected: 'omit or replace with a precise verb',
    rule: `Remove conversational filler "${hit.word}" (${hit.count}×) to tighten ${TONE_LABELS[tone] || tone} register.`,
    category: 'Conciseness & Register',
  }));

  return {
    scores,
    cefrLevel,
    internationalMetrics,
    toneVerdict: `Writing accepted for ${MODE_LABELS[mode]} (${TONE_LABELS[tone] || tone}). Provisional local linguistic benchmark recorded while AI quota resets.`,
    flowVerdict: `${diag.wordCount} words across ${diag.sentenceCount} sentences (${diag.avgWordsPerSentence} avg words/sentence, FK Grade ${read.fkGradeLevel}).`,
    feedbackImplemented: 'Partial',
    whatImproved:
      'Draft structure and local readability metrics were captured immediately so your writing streak and progress stay uninterrupted.',
    strictImprovements:
      'Full AI deep-rubric evaluation is queued and will automatically finalize as soon as the API rate limit window resets.',
    grammarFixes,
    vocabUpgrades: [],
  };
}

export function computeTaskStreak(
  slots: CalendarSlot[],
  referenceDateISO: string
): {
  currentTaskStreak: number;
  longestTaskStreak: number;
  totalTasksCompleted: number;
  weeklyCompleted: number;
  weeklyTarget: number;
} {
  const ordered = [...slots].sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate)
  );
  const totalTasksCompleted = ordered.filter((s) => s.completed).length;

  const cycle = getTriWeeklyCycleDates(referenceDateISO);
  const cycleDates = new Set([cycle.wednesday, cycle.friday, cycle.sunday]);
  const weeklySlots = ordered.filter((s) => cycleDates.has(s.scheduledDate));
  const weeklyCompleted = weeklySlots.filter((s) => s.completed).length;
  const weeklyTarget = Math.max(3, weeklySlots.length || 3);

  let longestTaskStreak = 0;
  let running = 0;
  for (const slot of ordered) {
    if (slot.completed) {
      running += 1;
      if (running > longestTaskStreak) longestTaskStreak = running;
    } else if (slot.scheduledDate < referenceDateISO) {
      running = 0;
    }
  }

  let currentTaskStreak = 0;
  const dueOrCompleted = ordered.filter(
    (s) => s.completed || s.scheduledDate <= referenceDateISO
  );
  for (let i = dueOrCompleted.length - 1; i >= 0; i -= 1) {
    const slot = dueOrCompleted[i];
    if (slot.completed) {
      currentTaskStreak += 1;
    } else if (slot.scheduledDate < referenceDateISO) {
      break;
    }
  }

  return {
    currentTaskStreak,
    longestTaskStreak: Math.max(longestTaskStreak, currentTaskStreak),
    totalTasksCompleted,
    weeklyCompleted,
    weeklyTarget,
  };
}

export function buildMonthMatrix(
  year: number,
  monthIndex0: number
): Array<{
  iso: string;
  dayNum: number;
  inCurrentMonth: boolean;
  weekdayIndex: number; // 0=Mon .. 6=Sun
}> {
  const firstDay = new Date(year, monthIndex0, 1);
  const startMonIndex = (firstDay.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const startDate = new Date(year, monthIndex0, 1 - startMonIndex);

  const lastDay = new Date(year, monthIndex0 + 1, 0);
  const totalDaysInMonth = lastDay.getDate();
  const cellsNeeded = startMonIndex + totalDaysInMonth > 35 ? 42 : 35;

  const cells = [];
  for (let i = 0; i < cellsNeeded; i += 1) {
    const dt = new Date(startDate);
    dt.setDate(startDate.getDate() + i);
    cells.push({
      iso: formatLocalDateISO(dt),
      dayNum: dt.getDate(),
      inCurrentMonth: dt.getMonth() === monthIndex0 && dt.getFullYear() === year,
      weekdayIndex: i % 7,
    });
  }
  return cells;
}

export function computeStreaks(
  sessions: WritingSession[],
  referenceDateISO: string
): { currentStreak: number; longestStreak: number; activeDates: string[] } {
  const completedDates = Array.from(
    new Set(sessions.filter((s) => s.status === 'Completed').map((s) => s.date))
  ).sort();

  if (completedDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, activeDates: [] };
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < completedDates.length; i += 1) {
    if (diffDays(completedDates[i], completedDates[i - 1]) === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  const latest = completedDates[completedDates.length - 1];
  const gapFromToday = diffDays(referenceDateISO, latest);
  let currentStreak = 0;

  if (gapFromToday <= 1 && gapFromToday >= -1) {
    currentStreak = 1;
    for (let i = completedDates.length - 1; i > 0; i -= 1) {
      if (diffDays(completedDates[i], completedDates[i - 1]) === 1) {
        currentStreak += 1;
      } else {
        break;
      }
    }
  }

  return { currentStreak, longestStreak, activeDates: completedDates };
}

export function computeMonthlyEntries(
  sessions: WritingSession[],
  referenceDateISO: string
): number {
  const monthPrefix = referenceDateISO.slice(0, 7); // YYYY-MM
  return sessions.filter(
    (s) => s.status === 'Completed' && s.date.startsWith(monthPrefix)
  ).length;
}

export function computeVocabularyStats(
  vocabulary: VocabEntry[],
  referenceDateISO: string
): {
  weekCount: number;
  monthCount: number;
  yearCount: number;
  totalCount: number;
  masteredCount: number;
} {
  const yearPrefix = referenceDateISO.slice(0, 4);
  const monthPrefix = referenceDateISO.slice(0, 7);

  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;
  let masteredCount = 0;

  for (const item of vocabulary) {
    if (item.mastered) masteredCount += 1;
    if (item.dateAdded.startsWith(yearPrefix)) yearCount += 1;
    if (item.dateAdded.startsWith(monthPrefix)) monthCount += 1;
    const daysAgo = diffDays(referenceDateISO, item.dateAdded);
    if (daysAgo >= 0 && daysAgo <= 6) {
      weekCount += 1;
    }
  }

  return {
    weekCount,
    monthCount,
    yearCount,
    totalCount: vocabulary.length,
    masteredCount,
  };
}

export function computeAverageRubric(sessions: WritingSession[]): RubricScores {
  const completed = sessions.filter((s) => s.status === 'Completed');
  if (completed.length === 0) {
    return {
      naturalVoiceFlow: 0,
      claritySimplicity: 0,
      grammarMechanics: 0,
      toneEngagement: 0,
      sentenceVarietyCadence: 0,
      concisenessDirectness: 0,
    };
  }
  const sum = completed.reduce(
    (acc, s) => ({
      naturalVoiceFlow: acc.naturalVoiceFlow + s.scores.naturalVoiceFlow,
      claritySimplicity: acc.claritySimplicity + s.scores.claritySimplicity,
      grammarMechanics: acc.grammarMechanics + s.scores.grammarMechanics,
      toneEngagement: acc.toneEngagement + s.scores.toneEngagement,
      sentenceVarietyCadence:
        acc.sentenceVarietyCadence + s.scores.sentenceVarietyCadence,
      concisenessDirectness:
        acc.concisenessDirectness + s.scores.concisenessDirectness,
    }),
    {
      naturalVoiceFlow: 0,
      claritySimplicity: 0,
      grammarMechanics: 0,
      toneEngagement: 0,
      sentenceVarietyCadence: 0,
      concisenessDirectness: 0,
    }
  );
  const n = completed.length;
  return {
    naturalVoiceFlow: Number((sum.naturalVoiceFlow / n).toFixed(1)),
    claritySimplicity: Number((sum.claritySimplicity / n).toFixed(1)),
    grammarMechanics: Number((sum.grammarMechanics / n).toFixed(1)),
    toneEngagement: Number((sum.toneEngagement / n).toFixed(1)),
    sentenceVarietyCadence: Number((sum.sentenceVarietyCadence / n).toFixed(1)),
    concisenessDirectness: Number((sum.concisenessDirectness / n).toFixed(1)),
  };
}

export function computeAverageInternationalMetrics(
  sessions: WritingSession[]
): InternationalMetrics {
  const completed = sessions.filter((s) => s.status === 'Completed');
  if (completed.length === 0) {
    return {
      ieltsBand: 0,
      toeflEquivalent: 0,
      lexicalResource: 0,
      coherenceCohesion: 0,
      taskAchievement: 0,
      registerControl: 0,
      grammarAccuracy: 0,
      fleschReadingEase: 0,
      fkGradeLevel: 0,
    };
  }
  const derived = completed.map((s) => deriveInternationalMetrics(s));
  const n = derived.length;
  const avg = (fn: (m: InternationalMetrics) => number) =>
    Number((derived.reduce((acc, m) => acc + fn(m), 0) / n).toFixed(1));

  const rawIelts = derived.reduce((acc, m) => acc + m.ieltsBand, 0) / n;
  return {
    ieltsBand: Math.round(rawIelts * 2) / 2,
    toeflEquivalent: Math.round(
      derived.reduce((acc, m) => acc + m.toeflEquivalent, 0) / n
    ),
    lexicalResource: avg((m) => m.lexicalResource),
    coherenceCohesion: avg((m) => m.coherenceCohesion),
    taskAchievement: avg((m) => m.taskAchievement),
    registerControl: avg((m) => m.registerControl),
    grammarAccuracy: avg((m) => m.grammarAccuracy),
    fleschReadingEase: avg((m) => m.fleschReadingEase),
    fkGradeLevel: avg((m) => m.fkGradeLevel),
  };
}

export function applyMultipleReplacements(
  text: string,
  replacements: Array<{ original: string; replacement: string }>
): { updatedText: string; appliedCount: number } {
  let updatedText = text;
  let appliedCount = 0;

  for (const item of replacements) {
    const cleanOrig = item.original.trim();
    // If model returns alternatives separated by '/', use the first crisp option
    const cleanRep = item.replacement.split('/')[0].trim();
    if (!cleanOrig || !cleanRep) continue;
    if (updatedText.includes(cleanOrig)) {
      updatedText = updatedText.replace(cleanOrig, cleanRep);
      appliedCount += 1;
    }
  }

  return { updatedText, appliedCount };
}

export interface ModeBreakdownItem {
  mode: WritingMode;
  label: string;
  sessionCount: number;
  avgScore: number;
  avgPercentage: number;
  totalWords: number;
}

export function computeModeBreakdown(
  sessions: WritingSession[]
): ModeBreakdownItem[] {
  const completed = sessions.filter((s) => s.status === 'Completed');
  const modes = Object.keys(MODE_LABELS) as WritingMode[];
  return modes
    .map((mode) => {
      const matching = completed.filter((s) => s.mode === mode);
      const count = matching.length;
      if (count === 0) {
        return {
          mode,
          label: MODE_LABELS[mode],
          sessionCount: 0,
          avgScore: 0,
          avgPercentage: 0,
          totalWords: 0,
        };
      }
      const sumScore = matching.reduce((acc, s) => acc + s.totalScore, 0);
      const totalWords = matching.reduce((acc, s) => acc + s.wordCount, 0);
      const avgScore = Number((sumScore / count).toFixed(1));
      return {
        mode,
        label: MODE_LABELS[mode],
        sessionCount: count,
        avgScore,
        avgPercentage: computePercentage(avgScore),
        totalWords,
      };
    })
    .sort((a, b) => b.sessionCount - a.sessionCount || b.avgPercentage - a.avgPercentage);
}

export function findGrowthLever(
  avgRubric: RubricScores
): { label: string; score: number } | null {
  const entries = RUBRIC_DIMENSIONS.map((d) => ({
    label: d.label,
    score: avgRubric[d.key],
  }));
  if (entries.every((e) => e.score === 0)) return null;
  entries.sort((a, b) => a.score - b.score);
  return entries[0];
}

function csvEscape(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSessionsToCsv(sessions: WritingSession[]): string {
  const headers = [
    'Session ID',
    'Date',
    'Day & Slot',
    'Prompt Category',
    'Topic Description',
    'Word Count',
    'Natural Voice & Flow (/10)',
    'Clarity & Simplicity (/10)',
    'Grammar & Mechanics (/10)',
    'Tone & Engagement (/10)',
    'Sentence Variety & Cadence (/10)',
    'Conciseness & Directness (/10)',
    'Total Score (/60)',
    'Percentage (%)',
    'CEFR Level',
    'IELTS Band',
    'TOEFL (/30)',
    'Feedback Implemented?',
    'What Improved Since Last Session',
    'Strict Improvements & Pinpointed Fixes',
    'Vocabulary Upgrades (Used -> Better Alternative)',
    'Status',
  ];

  const rows = sessions.map((s) => {
    const intl = deriveInternationalMetrics(s);
    const vocabStr = s.vocabUpgrades
      .map((v) => `${v.used} -> ${v.betterAlternative}`)
      .join('; ');
    return [
      s.id,
      s.date,
      s.daySlot,
      s.promptCategory,
      s.topicDescription,
      s.wordCount,
      s.scores.naturalVoiceFlow,
      s.scores.claritySimplicity,
      s.scores.grammarMechanics,
      s.scores.toneEngagement,
      s.scores.sentenceVarietyCadence,
      s.scores.concisenessDirectness,
      s.totalScore,
      `${s.percentage.toFixed(1)}%`,
      s.cefrLevel,
      intl.ieltsBand.toFixed(1),
      intl.toeflEquivalent,
      s.feedbackImplemented,
      s.whatImproved,
      s.strictImprovements,
      vocabStr,
      s.status,
    ]
      .map(csvEscape)
      .join(',');
  });

  return [headers.map(csvEscape).join(','), ...rows].join('\n');
}

export const CURATED_EIE_PROMPTS: TopicPrompt[] = [
  {
    id: 'prompt-eie-1',
    mode: 'technical',
    tone: 'academic-technical',
    category: 'Technical & Interview Expression',
    title: 'Explaining PID Loop Tuning to a Non-Control Engineer',
    guidance:
      'Break down Proportional, Integral, and Derivative action using an everyday analogy, then link it to a 6th-semester Process Control lab setup.',
    targetWords: 220,
  },
  {
    id: 'prompt-eie-2',
    mode: 'linkedin',
    tone: 'professional-warm',
    category: 'LinkedIn & Soft Skills',
    title: 'What a Noisy Wheatstone Bridge Taught Me About Grounding',
    guidance:
      'Open with a punchy one-line lab observation, explain the root cause in plain language, and end with a practical engineering takeaway.',
    targetWords: 200,
  },
  {
    id: 'prompt-eie-3',
    mode: 'email',
    tone: 'formal-executive',
    category: 'Professional Email',
    title: 'Summer Core EIE Internship Follow-Up to Instrumentation Lead',
    guidance:
      'Keep it under 150 words. Reference your 6th-semester PLC/SCADA & embedded instrumentation coursework without sounding rehearsed.',
    targetWords: 140,
  },
  {
    id: 'prompt-eie-4',
    mode: 'friend',
    tone: 'conversational',
    category: 'Friend Exchange',
    title: 'Catching Up After a Marathon 6th-Semester Mini-Project Week',
    guidance:
      'Write a warm, natural message to a friend about surviving lab demos, swapping weekend plans, and staying sane.',
    targetWords: 160,
  },
  {
    id: 'prompt-eie-5',
    mode: 'journal',
    tone: 'conversational',
    category: 'Personal Journal',
    title: 'Mid-Semester Clarity Check: Where My Confidence Grew This Week',
    guidance:
      'Reflect honestly on one technical concept that finally clicked and one communication habit you want to sharpen next week.',
    targetWords: 240,
  },
  {
    id: 'prompt-eie-6',
    mode: 'creative',
    tone: 'narrative-vivid',
    category: 'Creative Writing',
    title: 'Character Turning Point: The Last Signal Operator of Frosthold Ridge',
    guidance:
      'Build character through small physical choices and sensory world-building in a quiet fantasy relay outpost.',
    targetWords: 240,
  },
];

export function createSeedVaultPayload(todayISO = '2026-11-18'): VaultPayload {
  const sessions: WritingSession[] = [
    {
      id: 'SESSION_20261108_W1',
      date: '2026-11-08',
      daySlot: 'Sunday - Slot 3',
      mode: 'technical',
      promptCategory: 'Technical Deep-Dive',
      tone: 'academic-technical',
      topicDescription:
        'Explaining How a Sensor Talks to a Microcontroller in Plain English',
      content:
        'When a physical sensor measures temperature or pressure, it speaks in tiny analog voltage shifts rather than digital ones and zeros. A microcontroller cannot interpret raw millivolts directly without distortion, so an instrumentation amplifier and low-pass filter clean and scale the signal first. Once conditioned, an analog-to-digital converter samples the voltage at fixed intervals and translates it into binary numbers the firmware can act on.',
      wordCount: 280,
      scores: {
        naturalVoiceFlow: 9,
        claritySimplicity: 9,
        grammarMechanics: 8,
        toneEngagement: 9,
        sentenceVarietyCadence: 8,
        concisenessDirectness: 8,
      },
      totalScore: 51,
      percentage: 85.0,
      cefrLevel: 'C1',
      toneVerdict: 'Clear, accessible engineering voice with confident pacing.',
      flowVerdict: 'Strong conversational rhythm overall.',
      feedbackImplemented: 'Baseline',
      whatImproved: 'N/A (Initial baseline session)',
      strictImprovements:
        'Read out loud: smooth out clunky clause in sentence 3; strong conversational rhythm overall.',
      grammarFixes: [],
      vocabUpgrades: [
        {
          used: 'talks to',
          betterAlternative: 'communicates with / interfaces with',
          explanation: 'More precise engineering verb for hardware links.',
        },
        {
          used: 'plain English',
          betterAlternative: 'intuitive analogy',
          explanation: 'Elevates tone while keeping clarity high.',
        },
      ],
      status: 'Completed',
      createdAt: '2026-11-08T18:30:00.000Z',
    },
    {
      id: 'SESSION_20261111_W1',
      date: '2026-11-11',
      daySlot: 'Wednesday - Slot 1',
      mode: 'technical',
      promptCategory: 'Technical & Interview Expression',
      tone: 'academic-technical',
      topicDescription:
        'Sensor to Microcontroller Signal Chain (RTD / Pressure Transducer to ADC)',
      content:
        'In a practical instrumentation loop, an RTD changes resistance gradually with temperature, so we first excite it inside a Wheatstone bridge to convert resistance into a differential voltage. Next, an instrumentation amplifier rejects common-mode noise before an anti-aliasing filter limits bandwidth. Finally, a 16-bit ADC digitizes the conditioned signal so the microcontroller computes calibrated engineering units cleanly.',
      wordCount: 215,
      scores: {
        naturalVoiceFlow: 9,
        claritySimplicity: 9,
        grammarMechanics: 8,
        toneEngagement: 9,
        sentenceVarietyCadence: 8,
        concisenessDirectness: 9,
      },
      totalScore: 52,
      percentage: 86.7,
      cefrLevel: 'C1',
      toneVerdict: 'Interview-ready precision with clean stage signposting.',
      flowVerdict: 'Vocal signposts keep the three-stage chain effortless to follow.',
      feedbackImplemented: 'Yes',
      whatImproved:
        'Vocal signposts added between signal conditioning stages; eliminated sentence 3 clause stutter.',
      strictImprovements:
        'Smooth run-on sentences; break up multi-step signal conditioning chains with clear vocal signposts and transition breaths.',
      grammarFixes: [],
      vocabUpgrades: [
        {
          used: 'hook up',
          betterAlternative: 'interface',
          explanation: 'Standard electronics terminology for connecting subsystems.',
        },
        {
          used: 'turns into',
          betterAlternative: 'digitizes / converts',
          explanation: 'Pinpoints the exact ADC signal transformation.',
        },
        {
          used: 'keeps steady',
          betterAlternative: 'stabilizes',
          explanation: 'Tighter single-word technical verb.',
        },
      ],
      status: 'Completed',
      createdAt: '2026-11-11T09:15:00.000Z',
    },
    {
      id: 'SESSION_SAMPLE_W1',
      date: '2026-11-13',
      daySlot: 'Friday - Slot 2',
      mode: 'linkedin',
      promptCategory: 'LinkedIn / Soft Skills',
      tone: 'professional-warm',
      topicDescription: 'Explaining a Lab Debugging Failure',
      content:
        'Spent two hours wondering why our op-amp comparator kept oscillating in lab yesterday. I checked every resistor value twice before noticing a floating ground rail on the breadboard. Engineering labs rarely reward rushing—stepping back to verify fundamentals first saved the entire afternoon demo.',
      wordCount: 260,
      scores: {
        naturalVoiceFlow: 8,
        claritySimplicity: 8,
        grammarMechanics: 8,
        toneEngagement: 9,
        sentenceVarietyCadence: 7,
        concisenessDirectness: 8,
      },
      totalScore: 48,
      percentage: 80.0,
      cefrLevel: 'B2+',
      toneVerdict: 'Authentic vulnerability balanced with professional reflection.',
      flowVerdict: 'Strong opening hook; watch repetitive sentence starters.',
      feedbackImplemented: 'Partial',
      whatImproved:
        'Highly conversational hook; strong vulnerability in admitting debugging error without defensive hedging.',
      strictImprovements:
        "Cut filler 'basically' and 'actually' (used 4 times); vary sentence openings instead of starting 3 lines with 'I then'.",
      grammarFixes: [],
      vocabUpgrades: [
        {
          used: 'got fixed',
          betterAlternative: 'resolved',
          explanation: 'Cleaner active verb for LinkedIn storytelling.',
        },
        {
          used: 'very big problem',
          betterAlternative: 'critical bottleneck',
          explanation: 'Replaces vague intensifier with crisp impact.',
        },
        {
          used: 'looked into',
          betterAlternative: 'diagnosed',
          explanation: 'Communicates structured root-cause engineering.',
        },
      ],
      status: 'Completed',
      createdAt: '2026-11-13T16:45:00.000Z',
    },
    {
      id: 'SESSION_20261114_W1',
      date: '2026-11-14',
      daySlot: 'Friday - Slot 2',
      mode: 'linkedin',
      promptCategory: 'LinkedIn & Soft Skills',
      tone: 'professional-warm',
      topicDescription: 'S02: TI SR Flip-Flop Lab Debugging Lesson',
      content:
        'Yesterday our SR flip-flop circuit refused to latch during evaluation. First I swapped the IC thinking it was faulty, then realized a loose pull-down resistor had been overlooked on the breadboard. Systematic pin-by-pin checks always beat scattered guesswork under lab pressure.',
      wordCount: 198,
      scores: {
        naturalVoiceFlow: 7,
        claritySimplicity: 8,
        grammarMechanics: 5,
        toneEngagement: 7,
        sentenceVarietyCadence: 7,
        concisenessDirectness: 7,
      },
      totalScore: 41,
      percentage: 68.3,
      cefrLevel: 'B2',
      toneVerdict: 'Direct hook; tighten register for LinkedIn audience.',
      flowVerdict: 'Clear chronological signposting across debugging steps.',
      feedbackImplemented: 'Partial',
      whatImproved:
        'Strong punchy opening hook; clear chronological signposting (First / Then) across debugging steps.',
      strictImprovements:
        "Fix grammar/mechanics (couldn't even able -> couldn't, didn't worked -> didn't work, a important -> an important); replace casual ADHD reference for LinkedIn professionalism; tighten second line after hook.",
      grammarFixes: [
        {
          original: "couldn't even able",
          corrected: "couldn't",
          rule: "Avoid combining modal 'couldn't' with 'able'; use 'couldn't' or 'wasn't able to'.",
          category: 'Modal Verbs',
        },
        {
          original: "didn't worked",
          corrected: "didn't work",
          rule: "After 'did/didn't', always use the base infinitive verb.",
          category: 'Verb Tense',
        },
        {
          original: 'a important',
          corrected: 'an important',
          rule: "Use 'an' before vowel sounds.",
          category: 'Articles',
        },
      ],
      vocabUpgrades: [
        {
          used: 'got missed',
          betterAlternative: 'overlooked',
          explanation: 'Concise active/past participle for professional posts.',
        },
        {
          used: 'acting as i have adhd',
          betterAlternative: 'troubleshooting erratically',
          explanation: 'Professional, descriptive phrasing suitable for LinkedIn.',
        },
        {
          used: 'made it to latch',
          betterAlternative: 'stabilized the latch / resolved',
          explanation: 'Natural technical phrasing.',
        },
        {
          used: 'messing up with random thoughts',
          betterAlternative: 'scattered guesswork',
          explanation: 'Crisp metaphor contrasting systematic debugging.',
        },
      ],
      status: 'Completed',
      createdAt: '2026-11-14T19:10:00.000Z',
    },
  ];

  const vocabulary: VocabEntry[] = [
    {
      id: 'vocab-1',
      used: 'talks to',
      betterAlternative: 'interfaces with',
      explanation: 'Precise engineering verb for hardware communication.',
      contextSnippet: 'Explaining how a sensor interfaces with a microcontroller.',
      mode: 'technical',
      dateAdded: '2026-11-08',
      mastered: true,
      sessionId: 'SESSION_20261108_W1',
    },
    {
      id: 'vocab-2',
      used: 'plain English',
      betterAlternative: 'intuitive analogy',
      explanation: 'Clearer phrasing for technical explanations.',
      contextSnippet: 'Frame ADC sampling with an intuitive analogy.',
      mode: 'technical',
      dateAdded: '2026-11-08',
      mastered: true,
      sessionId: 'SESSION_20261108_W1',
    },
    {
      id: 'vocab-3',
      used: 'hook up',
      betterAlternative: 'interface',
      explanation: 'Standard technical terminology in EIE labs.',
      contextSnippet: 'Interface the RTD bridge to the instrumentation amp.',
      mode: 'technical',
      dateAdded: '2026-11-11',
      mastered: true,
      sessionId: 'SESSION_20261111_W1',
    },
    {
      id: 'vocab-4',
      used: 'turns into',
      betterAlternative: 'digitizes',
      explanation: 'Describes analog-to-digital conversion accurately.',
      contextSnippet: 'The 16-bit ADC digitizes the conditioned voltage.',
      mode: 'technical',
      dateAdded: '2026-11-11',
      mastered: false,
      sessionId: 'SESSION_20261111_W1',
    },
    {
      id: 'vocab-5',
      used: 'keeps steady',
      betterAlternative: 'stabilizes',
      explanation: 'Concise verb for control loops and signal levels.',
      contextSnippet: 'Feedback stabilizes the output against drift.',
      mode: 'technical',
      dateAdded: '2026-11-11',
      mastered: false,
      sessionId: 'SESSION_20261111_W1',
    },
    {
      id: 'vocab-6',
      used: 'very big problem',
      betterAlternative: 'critical bottleneck',
      explanation: 'High-impact phrase for professional posts.',
      contextSnippet: 'Ground noise became a critical bottleneck during testing.',
      mode: 'linkedin',
      dateAdded: '2026-11-13',
      mastered: false,
      sessionId: 'SESSION_SAMPLE_W1',
    },
    {
      id: 'vocab-7',
      used: 'looked into',
      betterAlternative: 'diagnosed',
      explanation: 'Highlights systematic root-cause analysis.',
      contextSnippet: 'I diagnosed the oscillating comparator stage by stage.',
      mode: 'linkedin',
      dateAdded: '2026-11-13',
      mastered: false,
      sessionId: 'SESSION_SAMPLE_W1',
    },
    {
      id: 'vocab-8',
      used: 'got missed',
      betterAlternative: 'overlooked',
      explanation: 'Stronger, cleaner past-tense verb.',
      contextSnippet: 'A loose pull-down resistor had been overlooked.',
      mode: 'linkedin',
      dateAdded: '2026-11-14',
      mastered: false,
      sessionId: 'SESSION_20261114_W1',
    },
    {
      id: 'vocab-9',
      used: 'messing up with random thoughts',
      betterAlternative: 'scattered guesswork',
      explanation: 'Crisp, memorable phrasing for LinkedIn takeaways.',
      contextSnippet: 'Pin-by-pin checks beat scattered guesswork.',
      mode: 'linkedin',
      dateAdded: '2026-11-14',
      mastered: false,
      sessionId: 'SESSION_20261114_W1',
    },
  ];

  const coachCtx = summarizeCoachContext(sessions, vocabulary);
  const currentCycle = buildDefaultTriWeeklySlots(todayISO, coachCtx).map((slot) =>
    slot.scheduledDate < todayISO
      ? { ...slot, completed: true, linkedSessionId: 'SESSION_20261111_W1' }
      : slot
  );

  const calendarSlots: CalendarSlot[] = [
    {
      id: 'tri-seed-prev-wed',
      dayOfWeek: 'Wednesday',
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '6:19 PM',
      scheduledDate: '2026-11-11',
      mode: 'technical',
      tone: 'academic-technical',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Sensor to Microcontroller Signal Chain (RTD / Pressure Transducer to ADC)',
      topicPrimer:
        'Millivolt transducer shifts cannot feed a microcontroller ADC directly without noise amplification or impedance mismatch. A Wheatstone bridge converts resistance into differential voltage before conditioning and digitization.',
      pivotRule: UNIVERSAL_PIVOT_RULE,
      feedbackReminder: 'Add vocal signposts between stages and practice "stabilizes".',
      targetWords: 210,
      completed: true,
      linkedSessionId: 'SESSION_20261111_W1',
      isTriWeekly: true,
      pillar: 'technical-concept',
    },
    {
      id: 'tri-seed-prev-fri',
      dayOfWeek: 'Friday',
      slotLabel: 'Slot 2 · LinkedIn & Email',
      slotTime: '6:19 PM',
      scheduledDate: '2026-11-13',
      mode: 'linkedin',
      tone: 'professional-warm',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic: 'Explaining a Lab Debugging Failure',
      topicPrimer:
        'Sharing an honest hardware debugging setback demonstrates methodical thinking better than polished success stories. Ground your hook in one real oscilloscope or breadboard detail.',
      pivotRule: UNIVERSAL_PIVOT_RULE,
      feedbackReminder: 'Trim conversational fillers and vary sentence openings.',
      targetWords: 200,
      completed: true,
      linkedSessionId: 'SESSION_SAMPLE_W1',
      isTriWeekly: true,
      pillar: 'linkedin-email',
    },
    {
      id: 'tri-seed-prev-sun',
      dayOfWeek: 'Sunday',
      slotLabel: 'Slot 3 · Creative & Fantasy',
      slotTime: '6:19 PM',
      scheduledDate: '2026-11-15',
      mode: 'creative',
      tone: 'narrative-vivid',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic: 'The Signal Relay Outpost — Character Micro-Scene',
      topicPrimer:
        'A remote relay tower listens for coded acoustic bells across a frozen ridge. Show your operator’s conflict through small physical gestures when a bell rings twice out of schedule.',
      pivotRule: UNIVERSAL_PIVOT_RULE,
      feedbackReminder: 'Practice sensory pacing and active verbs instead of "was/were".',
      targetWords: 220,
      completed: true,
      linkedSessionId: 'SESSION_20261114_W1',
      isTriWeekly: true,
      pillar: 'creative-story',
    },
    ...currentCycle,
  ];

  return {
    version: 1,
    createdAt: '2026-11-08T18:00:00.000Z',
    updatedAt: new Date().toISOString(),
    sessions,
    vocabulary,
    calendarSlots,
    settings: {
      semesterLabel: '3rd Year · 6th Semester EIE',
      dailyWordGoal: 200,
      autoSaveVocab: true,
      focusModeDefault: false,
      autoReloadSchedule: true,
    },
  };
}

export function mergeVaultPayloads(
  local: VaultPayload,
  remote: Partial<Pick<VaultPayload, 'sessions' | 'vocabulary' | 'calendarSlots' | 'settings'>>
): VaultPayload {
  const sessionMap = new Map<string, WritingSession>();
  for (const s of local.sessions) {
    sessionMap.set(s.id, s);
  }
  for (const s of remote.sessions ?? []) {
    const existing = sessionMap.get(s.id);
    if (!existing) {
      sessionMap.set(s.id, s);
    } else if (existing.evaluationPending && !s.evaluationPending) {
      sessionMap.set(s.id, s);
    }
  }

  const slotMap = new Map<string, CalendarSlot>();
  for (const slot of local.calendarSlots) {
    slotMap.set(slot.id, slot);
  }
  for (const slot of remote.calendarSlots ?? []) {
    const existing = slotMap.get(slot.id);
    if (!existing) {
      slotMap.set(slot.id, slot);
    } else {
      slotMap.set(slot.id, {
        ...existing,
        ...slot,
        completed: existing.completed || slot.completed,
        linkedSessionId: slot.linkedSessionId || existing.linkedSessionId,
      });
    }
  }

  const vocabMap = new Map<string, VocabEntry>();
  const vocabPairs = new Set<string>();
  for (const v of local.vocabulary) {
    vocabMap.set(v.id, v);
    vocabPairs.add(`${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`);
  }
  for (const v of remote.vocabulary ?? []) {
    const existing = vocabMap.get(v.id);
    const pairKey = `${v.used.toLowerCase()}->${v.betterAlternative.toLowerCase()}`;
    if (existing) {
      vocabMap.set(v.id, {
        ...existing,
        ...v,
        mastered: existing.mastered || v.mastered,
      });
    } else if (!vocabPairs.has(pairKey)) {
      vocabMap.set(v.id, v);
      vocabPairs.add(pairKey);
    }
  }

  return {
    ...local,
    updatedAt: new Date().toISOString(),
    sessions: Array.from(sessionMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    calendarSlots: Array.from(slotMap.values()).sort((a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate)
    ),
    vocabulary: Array.from(vocabMap.values()),
    settings: remote.settings
      ? { ...local.settings, ...remote.settings }
      : local.settings,
  };
}

const PREDEFINED_SEED_SESSION_IDS = new Set([
  'SESSION_20261108_W1',
  'SESSION_20261111_W1',
  'SESSION_SAMPLE_W1',
  'SESSION_20261114_W1',
]);

const PREDEFINED_SEED_VOCAB_IDS = new Set([
  'vocab-1',
  'vocab-2',
  'vocab-3',
  'vocab-4',
  'vocab-5',
  'vocab-6',
  'vocab-7',
  'vocab-8',
  'vocab-9',
]);

const PREDEFINED_TRI_WEEKLY_TOPICS = new Set(
  Object.values(TRI_WEEKLY_TOPIC_POOL)
    .flat()
    .map((tpl) => tpl.topic)
);

export function isPredefinedSeedSlot(slot: CalendarSlot): boolean {
  if (
    slot.completed &&
    slot.linkedSessionId &&
    !PREDEFINED_SEED_SESSION_IDS.has(slot.linkedSessionId)
  ) {
    return false;
  }
  if (
    slot.id.startsWith('tri-seed-') ||
    slot.id.startsWith('tri-auto-') ||
    slot.id.startsWith('tri-month-')
  ) {
    return true;
  }
  return (
    slot.id.startsWith('tri-') && PREDEFINED_TRI_WEEKLY_TOPICS.has(slot.topic)
  );
}

export function createEmptyVaultPayload(): VaultPayload {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    sessions: [],
    vocabulary: [],
    calendarSlots: [],
    settings: {
      semesterLabel: '3rd Year · 6th Semester EIE',
      dailyWordGoal: 200,
      autoSaveVocab: true,
      focusModeDefault: false,
      autoReloadSchedule: false,
    },
  };
}

export function stripPredefinedSeedData(payload: VaultPayload): {
  cleaned: VaultPayload;
  removedSessionIds: string[];
  removedSlotIds: string[];
  removedVocabIds: string[];
  changed: boolean;
} {
  const removedSessionIds: string[] = [];
  const removedSlotIds: string[] = [];
  const removedVocabIds: string[] = [];

  const sessions = payload.sessions.filter((s) => {
    if (PREDEFINED_SEED_SESSION_IDS.has(s.id)) {
      removedSessionIds.push(s.id);
      return false;
    }
    return true;
  });

  const calendarSlots = payload.calendarSlots.filter((slot) => {
    if (isPredefinedSeedSlot(slot)) {
      removedSlotIds.push(slot.id);
      return false;
    }
    return true;
  });

  const vocabulary = payload.vocabulary.filter((v) => {
    if (PREDEFINED_SEED_VOCAB_IDS.has(v.id)) {
      removedVocabIds.push(v.id);
      return false;
    }
    return true;
  });

  const autoReloadChanged = payload.settings.autoReloadSchedule !== false;
  const changed =
    removedSessionIds.length > 0 ||
    removedSlotIds.length > 0 ||
    removedVocabIds.length > 0 ||
    autoReloadChanged;

  return {
    cleaned: {
      ...payload,
      sessions,
      calendarSlots,
      vocabulary,
      settings: {
        ...payload.settings,
        autoReloadSchedule: false,
      },
    },
    removedSessionIds,
    removedSlotIds,
    removedVocabIds,
    changed,
  };
}

export type InternationalHeatmapMetricKey =
  | 'registerControl'
  | 'grammarAccuracy'
  | 'lexicalResource'
  | 'coherenceCohesion'
  | 'taskAchievement'
  | 'ieltsCalibration';

export interface InternationalHeatmapMetricMeta {
  key: InternationalHeatmapMetricKey;
  label: string;
  shortLabel: string;
  standard: string;
}

export const INTERNATIONAL_HEATMAP_METRICS: InternationalHeatmapMetricMeta[] = [
  {
    key: 'registerControl',
    label: 'Tone & Register',
    shortLabel: 'Tone & Register',
    standard: 'Cambridge Pragmatics',
  },
  {
    key: 'grammarAccuracy',
    label: 'Grammar & Syntax',
    shortLabel: 'Grammar & Syntax',
    standard: 'IELTS Grammatical Range',
  },
  {
    key: 'lexicalResource',
    label: 'Lexical Resource',
    shortLabel: 'Lexical Resource',
    standard: 'IELTS / CEFR Vocabulary',
  },
  {
    key: 'coherenceCohesion',
    label: 'Coherence & Cohesion',
    shortLabel: 'Coherence & Cohesion',
    standard: 'IELTS Discourse Flow',
  },
  {
    key: 'taskAchievement',
    label: 'Task Achievement',
    shortLabel: 'Task Achievement',
    standard: 'TOEFL Independent Rubric',
  },
  {
    key: 'ieltsCalibration',
    label: 'IELTS / TOEFL Index',
    shortLabel: 'IELTS / TOEFL Index',
    standard: 'IELTS 4–9 · TOEFL /30',
  },
];

export interface FluencyHeatmapWeek {
  weekKey: string;
  startDate: string;
  endDate: string;
  shortLabel: string;
  monthLabel: string | null;
  sessionCount: number;
  topics: string[];
}

export interface FluencyHeatmapCell {
  metricKey: InternationalHeatmapMetricKey;
  metricLabel: string;
  standard: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  weekIndex: number;
  value: number | null;
  nativeDisplay: string;
  deltaFromPrev: number | null;
  sessionCount: number;
  topics: string[];
}

export interface FluencyHeatmapMetricSummary {
  key: InternationalHeatmapMetricKey;
  label: string;
  standard: string;
  average: number | null;
  delta: number | null;
  latestValue: number | null;
}

export interface FluencyHeatmapDataset {
  windowStartISO: string;
  windowEndISO: string;
  weeks: FluencyHeatmapWeek[];
  metrics: InternationalHeatmapMetricMeta[];
  cells: FluencyHeatmapCell[];
  metricSummaries: FluencyHeatmapMetricSummary[];
  activeWeeksCount: number;
  totalSessionsInWindow: number;
}

export function buildFluencyHeatmapData(
  sessions: WritingSession[],
  referenceDateISO: string
): FluencyHeatmapDataset {
  const refDate = parseISODate(referenceDateISO);
  const windowStartDate = new Date(
    refDate.getFullYear(),
    refDate.getMonth() - 3,
    refDate.getDate()
  );
  const windowStartISO = formatLocalDateISO(windowStartDate);

  // Align grid columns cleanly to Monday-first weeks covering [windowStartDate, refDate]
  const startDowMon = (windowStartDate.getDay() + 6) % 7;
  const firstMonday = new Date(windowStartDate);
  firstMonday.setDate(windowStartDate.getDate() - startDowMon);

  const endDowMon = (refDate.getDay() + 6) % 7;
  const lastMonday = new Date(refDate);
  lastMonday.setDate(refDate.getDate() - endDowMon);

  const inWindowCompleted = sessions
    .filter(
      (s) =>
        s.status === 'Completed' &&
        s.date >= windowStartISO &&
        s.date <= referenceDateISO
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const weeks: FluencyHeatmapWeek[] = [];
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  let prevMonthKey = '';

  const cursor = new Date(firstMonday);
  while (cursor.getTime() <= lastMonday.getTime()) {
    const startISO = formatLocalDateISO(cursor);
    const sunDate = new Date(cursor);
    sunDate.setDate(cursor.getDate() + 6);
    const rawEndISO = formatLocalDateISO(sunDate);
    const endISO = rawEndISO > referenceDateISO ? referenceDateISO : rawEndISO;

    // Label month based on Thursday of that week (standard ISO week month affinity) or first week
    const midWeek = new Date(cursor);
    midWeek.setDate(cursor.getDate() + 3);
    const monthKey = `${midWeek.getFullYear()}-${midWeek.getMonth()}`;
    const monthLabel =
      monthKey !== prevMonthKey ? monthNames[midWeek.getMonth()] : null;
    prevMonthKey = monthKey;

    const weekSessions = inWindowCompleted.filter(
      (s) => s.date >= startISO && s.date <= endISO
    );

    weeks.push({
      weekKey: startISO,
      startDate: startISO,
      endDate: endISO,
      shortLabel: `${startISO.slice(5, 7)}/${startISO.slice(8, 10)}`,
      monthLabel,
      sessionCount: weekSessions.length,
      topics: weekSessions.map((s) => s.topicDescription),
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  const cells: FluencyHeatmapCell[] = [];
  const metricSummaries: FluencyHeatmapMetricSummary[] = [];

  for (const metric of INTERNATIONAL_HEATMAP_METRICS) {
    let prevValue: number | null = null;
    const populatedValues: number[] = [];

    weeks.forEach((week, weekIndex) => {
      const weekSessions = inWindowCompleted.filter(
        (s) => s.date >= week.startDate && s.date <= week.endDate
      );

      if (weekSessions.length === 0) {
        cells.push({
          metricKey: metric.key,
          metricLabel: metric.label,
          standard: metric.standard,
          weekKey: week.weekKey,
          weekStart: week.startDate,
          weekEnd: week.endDate,
          weekIndex,
          value: null,
          nativeDisplay: 'No sessions',
          deltaFromPrev: null,
          sessionCount: 0,
          topics: [],
        });
        return;
      }

      const derived = weekSessions.map((s) => deriveInternationalMetrics(s));
      let avgVal = 0;
      let nativeDisplay = '';

      if (metric.key === 'ieltsCalibration') {
        const avgBand =
          derived.reduce((acc, d) => acc + d.ieltsBand, 0) / derived.length;
        const avgToefl = Math.round(
          derived.reduce((acc, d) => acc + d.toeflEquivalent, 0) / derived.length
        );
        avgVal = Number(((avgBand / 9) * 10).toFixed(1));
        nativeDisplay = `Band ${avgBand.toFixed(1)} · TOEFL ${avgToefl}/30`;
      } else {
        const key = metric.key;
        avgVal = Number(
          (
            derived.reduce((acc, d) => acc + d[key], 0) / derived.length
          ).toFixed(1)
        );
        nativeDisplay = `${avgVal.toFixed(1)}/10`;
      }

      const deltaFromPrev =
        prevValue !== null ? Number((avgVal - prevValue).toFixed(1)) : null;
      prevValue = avgVal;
      populatedValues.push(avgVal);

      cells.push({
        metricKey: metric.key,
        metricLabel: metric.label,
        standard: metric.standard,
        weekKey: week.weekKey,
        weekStart: week.startDate,
        weekEnd: week.endDate,
        weekIndex,
        value: avgVal,
        nativeDisplay,
        deltaFromPrev,
        sessionCount: weekSessions.length,
        topics: week.topics,
      });
    });

    const avgAll =
      populatedValues.length > 0
        ? Number(
            (
              populatedValues.reduce((a, b) => a + b, 0) / populatedValues.length
            ).toFixed(1)
          )
        : null;
    const latestValue =
      populatedValues.length > 0
        ? populatedValues[populatedValues.length - 1]
        : null;
    const overallDelta =
      populatedValues.length >= 2
        ? Number(
            (
              populatedValues[populatedValues.length - 1] - populatedValues[0]
            ).toFixed(1)
          )
        : null;

    metricSummaries.push({
      key: metric.key,
      label: metric.label,
      standard: metric.standard,
      average: avgAll,
      delta: overallDelta,
      latestValue,
    });
  }

  return {
    windowStartISO,
    windowEndISO: referenceDateISO,
    weeks,
    metrics: INTERNATIONAL_HEATMAP_METRICS,
    cells,
    metricSummaries,
    activeWeeksCount: weeks.filter((w) => w.sessionCount > 0).length,
    totalSessionsInWindow: inWindowCompleted.length,
  };
}

export const INTERNAL_REMINDER_HOUR = 18;
export const INTERNAL_REMINDER_MINUTE = 19;

export function formatStudentProfileLabel(
  profile?: VaultPayload['settings']['studentProfile']
): string {
  if (!profile || !profile.onboardingCompleted) {
    return 'Personal Writing Studio';
  }
  const parts = [
    profile.semester?.trim(),
    profile.collegeDegree?.trim(),
  ].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return profile.collegeName?.trim() || 'Personal Writing Studio';
}

export function getRollingMonthTriWeeklyDates(
  startISO: string,
  daysAhead = 30
): Array<{
  scheduledDate: string;
  dayOfWeek: 'Wednesday' | 'Friday' | 'Sunday';
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
}> {
  const start = parseISODate(startISO);
  const result: Array<{
    scheduledDate: string;
    dayOfWeek: 'Wednesday' | 'Friday' | 'Sunday';
    pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
  }> = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + offset);
    const wd = dt.getDay();
    if (wd === 3) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Wednesday',
        pillar: 'technical-concept',
      });
    } else if (wd === 5) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Friday',
        pillar: 'linkedin-email',
      });
    } else if (wd === 0) {
      result.push({
        scheduledDate: formatLocalDateISO(dt),
        dayOfWeek: 'Sunday',
        pillar: 'creative-story',
      });
    }
  }

  return result;
}

function adaptTemplateForStudentProfile(
  template: TriWeeklyTemplate,
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story',
  profile: NonNullable<VaultPayload['settings']['studentProfile']>,
  rotationIndex: number
): Pick<
  TriWeeklyTemplate,
  'topic' | 'topicPrimer' | 'pivotRule' | 'suggestions' | 'promptCategory'
> {
  const rawDegree = (profile.collegeDegree || '').trim();
  const rawSem = (profile.semester || '').trim();
  const college = (profile.collegeName || '').trim();

  if (!rawDegree && !rawSem) {
    const universalPool: Record<
      'technical-concept' | 'linkedin-email' | 'creative-story',
      Array<{ topic: string; primer: string; suggestions: string[]; category: string }>
    > = {
      'technical-concept': [
        {
          topic: 'Explain a Complex Idea Simply to a Curious Friend',
          primer:
            'Clarity shines when you strip away jargon and explain how something works using one everyday analogy.',
          suggestions: [
            'Open with a plain-English hook in one crisp sentence.',
            'Use one familiar analogy instead of technical terms.',
            'End with a single memorable takeaway.',
          ],
          category: 'Clear Explanation',
        },
        {
          topic: 'Break Down a Decision You Recently Changed Your Mind About',
          primer:
            'Tracing how your thinking evolved shows calm analytical depth and honest reflection.',
          suggestions: [
            'Name what you initially assumed and why it felt right.',
            'Describe the exact moment or evidence that shifted your view.',
            'Keep paragraphs tight and direct.',
          ],
          category: 'Analytical Writing',
        },
        {
          topic: 'Redesign One Everyday Habit or Object From Scratch',
          primer:
            'Pick something ordinary—an alarm, a note system, a commute—and argue how you would make it calmer and better.',
          suggestions: [
            'Identify the exact friction point in the current version.',
            'Propose one concrete improvement and its trade-off.',
            'Write in crisp, active verbs.',
          ],
          category: 'Structured Argument',
        },
      ],
      'linkedin-email': [
        {
          topic: 'A Practical Lesson From Something That Went Sideways This Month',
          primer:
            'Honest, grounded reflections resonate far more than polished announcements. Share one moment that sharpened how you work.',
          suggestions: [
            'Hook with the exact surprise in the opening line.',
            'Share what you changed in two concise paragraphs.',
            'Close warmly without sounding preachy.',
          ],
          category: 'Reflection & Outreach',
        },
        {
          topic: 'Write a Thoughtful Note Reaching Out to Someone Whose Work You Admire',
          primer:
            'Specificity beats flattery. Reference one detail that stayed with you and keep your ask respectful and easy to answer.',
          suggestions: [
            'Open with one concrete detail from their work.',
            'Connect it briefly to what you are exploring right now.',
            'End with a low-pressure closing line.',
          ],
          category: 'Professional Note',
        },
        {
          topic: 'A Calm Update Navigating a Delayed Plan or Shifting Timeline',
          primer:
            'Communicating clearly when plans slip builds trust. Pair what happened with a clean next step.',
          suggestions: [
            'Lead directly with the updated plan in the first line.',
            'State the cause objectively without over-apologizing.',
            'Propose two concrete next steps.',
          ],
          category: 'Clear Communication',
        },
      ],
      'creative-story': [
        {
          topic: 'An Ordinary Place That Feels Completely Different After Midnight',
          primer:
            'Anchor a short descriptive vignette in two sensory contrasts—light, sound, or stillness.',
          suggestions: [
            'Open directly inside a concrete sensory detail.',
            'Contrast two moods without over-explaining.',
            'Let the final sentence linger quietly.',
          ],
          category: 'Creative Vignette',
        },
        {
          topic: 'A Short Conversation With a Stranger That Stayed With You',
          primer:
            'Capture a brief exchange—real or imagined—where one understated line shifts the mood.',
          suggestions: [
            'Drop straight into the moment with a single line of dialogue.',
            'Keep descriptions lean and visual.',
            'End on an unspoken realization.',
          ],
          category: 'Narrative',
        },
        {
          topic: 'Write a Letter to Yourself One Year From Today',
          primer:
            'Capture what currently matters, what feels uncertain, and one quiet hope worth remembering.',
          suggestions: [
            'Mention one small detail from your week right now.',
            'Name one habit you want to keep.',
            'Keep the voice natural and unhurried.',
          ],
          category: 'Personal Essay',
        },
      ],
    };

    const list = universalPool[pillar];
    const item = list[rotationIndex % list.length];
    return {
      topic: item.topic,
      topicPrimer: item.primer,
      pivotRule:
        'Swap to any topic, idea, or story you feel drawn to write about today.',
      suggestions: item.suggestions,
      promptCategory: item.category,
    };
  }

  const degree = rawDegree || 'Engineering';
  const sem = rawSem || 'Current Semester';
  const isEIE = /\beie\b|electronics|instrumentation/i.test(degree);

  if (isEIE) {
    return {
      topic: template.topic,
      topicPrimer: template.topicPrimer,
      pivotRule: `Universal Pivot: Swap to any ${sem} ${degree} lab, internship email, or personal story if this topic feels unfamiliar.`,
      suggestions: [...template.suggestions],
      promptCategory: template.promptCategory,
    };
  }

  const genericTechPool = [
    {
      topic: `Explain a Core ${degree} Concept Simply in a Mock Interview`,
      primer: `Interviewers test whether you truly understand ${degree} fundamentals by asking you to explain them without textbook jargon. Pick one foundational ${sem} system or trade-off and walk through it clearly.`,
      suggestions: [
        `Frame the core problem your ${degree} concept solves in one crisp sentence.`,
        `Contrast two real-world design trade-offs from your ${sem} coursework.`,
        'Close with a concise spoken takeaway an interviewer would remember.',
      ],
    },
    {
      topic: `Defend a Key Project Design Trade-off From ${sem}`,
      primer: `Strong candidates explain why they rejected alternative approaches, not just what they built. Walk through one architecture, algorithm, or hardware decision from ${college || 'your coursework'} and justify the constraints.`,
      suggestions: [
        'State the original constraint and what failed on your first attempt.',
        'Compare the chosen approach against one realistic alternative.',
        'Summarize the measurable outcome without filler words.',
      ],
    },
    {
      topic: `Break Down a Complex ${degree} Failure & Root-Cause Fix`,
      primer: `Debugging under pressure reveals structured thinking. Describe a real problem you encountered in ${sem} and walk through how you isolated the cause step by step.`,
      suggestions: [
        'Describe the exact symptom before jumping to the solution.',
        'Show two diagnostic checks that narrowed down the root cause.',
        'End with one preventive habit you now apply in every project.',
      ],
    },
    {
      topic: `Compare Two Core Tools or Frameworks Used in ${degree}`,
      primer: `Choosing the right tool depends on constraints like speed, cost, accuracy, or scale. Compare two staples from your ${degree} curriculum as if advising a teammate before a sprint.`,
      suggestions: [
        'Open with the single constraint that separates both options.',
        'Give one concrete scenario where each option wins cleanly.',
        'Keep sentences crisp and directly speakable aloud.',
      ],
    },
    {
      topic: `Teach a First-Year Student Your Favorite ${sem} Topic`,
      primer: `Clarity shows when you strip away acronyms and build an intuitive mental model. Explain one concept from ${degree} so an incoming student at ${college || 'your college'} grasps it in two minutes.`,
      suggestions: [
        'Lead with an everyday analogy before introducing formal terms.',
        'Walk through cause and effect in short, active sentences.',
        'Verify there are zero unexplained acronyms.',
      ],
    },
  ];

  const genericCareerPool = [
    {
      topic: `LinkedIn Post: A Practical Lesson From My ${sem} ${degree} Work`,
      primer: `Peers and recruiters engage with honest, concrete reflections far more than generic announcements. Share one moment from ${college || 'campus'} that sharpened how you work.`,
      suggestions: [
        'Hook with the exact challenge or surprise in the first line.',
        'Show what changed in your approach in two crisp paragraphs.',
        'End with an open, non-preachy question for your network.',
      ],
    },
    {
      topic: `Cold Email to a Hiring Manager for a ${degree} Internship`,
      primer: `Busy team leads scan outreach in under 15 seconds for relevance and proof of work. Connect one concrete ${sem} project directly to the team’s goals with a low-friction ask.`,
      suggestions: [
        `Write a specific subject line referencing ${degree} and your key skill.`,
        'Highlight one measurable project outcome in two tight lines.',
        'Ask politely for a brief 10-minute chat.',
      ],
    },
    {
      topic: `Diplomatic Team Update: Navigating a ${sem} Project Delay`,
      primer: `Owning a schedule slip calmly builds credibility faster than excuses. Pair the root cause cleanly with a realistic recovery timeline and clear next steps.`,
      suggestions: [
        'Lead with the revised milestone in the first sentence.',
        'Summarize the blocker objectively without blaming teammates.',
        'Propose two parallel actions to get back on track.',
      ],
    },
    {
      topic: `Post-Interview Follow-Up Reinforcing Your ${degree} Strengths`,
      primer: `A thoughtful 24-hour follow-up lets you sharpen one nuanced point from the conversation while expressing genuine interest in the team’s mission.`,
      suggestions: [
        'Reference one specific question from the interview.',
        'Add a tight two-sentence insight reinforcing your thinking.',
        'Close warmly without sounding templated.',
      ],
    },
    {
      topic: `LinkedIn Reflection: Bridging Classroom Theory and Real Projects in ${sem}`,
      primer: `Showing how academic concepts behave differently outside textbooks signals maturity to employers. Contrast one expectation from class with what actually happened in practice.`,
      suggestions: [
        'Start with the exact gap between theory and practice.',
        'Share one concrete takeaway you will carry forward.',
        'Keep paragraphs punchy and scannable.',
      ],
    },
  ];

  if (pillar === 'technical-concept') {
    const item = genericTechPool[rotationIndex % genericTechPool.length];
    return {
      topic: item.topic,
      topicPrimer: item.primer,
      pivotRule: `Universal Pivot: Swap to any ${sem} ${degree} topic, lab, or project trade-off you prefer.`,
      suggestions: item.suggestions,
      promptCategory: 'Technical & Interview Expression',
    };
  }

  if (pillar === 'linkedin-email') {
    const item = genericCareerPool[rotationIndex % genericCareerPool.length];
    return {
      topic: item.topic,
      topicPrimer: item.primer,
      pivotRule: `Universal Pivot: Swap to any internship email, LinkedIn story, or campus leadership message.`,
      suggestions: item.suggestions,
      promptCategory: 'LinkedIn, Email & Soft Skills',
    };
  }

  return {
    topic: template.topic,
    topicPrimer: template.topicPrimer,
    pivotRule: UNIVERSAL_PIVOT_RULE,
    suggestions: [...template.suggestions],
    promptCategory: template.promptCategory,
  };
}

export function buildPersonalizedMonthSchedule(
  startISO: string,
  profile: NonNullable<VaultPayload['settings']['studentProfile']>,
  existingSlots: CalendarSlot[],
  coachContext?: CoachPerformanceContext,
  daysAhead = 30
): CalendarSlot[] {
  const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ] as const;
  const PILLAR_CYCLE: Array<
    'technical-concept' | 'linkedin-email' | 'creative-story'
  > = ['technical-concept', 'linkedin-email', 'creative-story'];

  const customDays =
    Array.isArray(profile.preferredDays) && profile.preferredDays.length > 0
      ? new Set(profile.preferredDays.filter((d) => d >= 0 && d <= 6))
      : null;

  const targetDates: Array<{
    scheduledDate: string;
    dayOfWeek: string;
    pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
  }> = customDays
    ? (() => {
        const start = parseISODate(startISO);
        const list: Array<{
          scheduledDate: string;
          dayOfWeek: string;
          pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
        }> = [];
        let seq = 0;
        for (let offset = 0; offset <= daysAhead; offset += 1) {
          const dt = new Date(start);
          dt.setDate(start.getDate() + offset);
          const wd = dt.getDay();
          if (!customDays.has(wd)) continue;
          const pillar =
            wd === 3
              ? 'technical-concept'
              : wd === 5
                ? 'linkedin-email'
                : wd === 0
                  ? 'creative-story'
                  : PILLAR_CYCLE[seq % PILLAR_CYCLE.length];
          seq += 1;
          list.push({
            scheduledDate: formatLocalDateISO(dt),
            dayOfWeek: WEEKDAY_NAMES[wd],
            pillar,
          });
        }
        return list;
      })()
    : getRollingMonthTriWeeklyDates(startISO, daysAhead);

  const existingDateSet = new Set(
    existingSlots.filter((s) => s.isTriWeekly !== false).map((s) => s.scheduledDate)
  );
  const counters: Record<
    'technical-concept' | 'linkedin-email' | 'creative-story',
    number
  > = {
    'technical-concept': 0,
    'linkedin-email': 0,
    'creative-story': 0,
  };

  const reminderTime = profile.reminderTime || '18:19';
  const created: CalendarSlot[] = [];
  for (const item of targetDates) {
    const pool = TRI_WEEKLY_TOPIC_POOL[item.pillar];
    const idx = counters[item.pillar];
    counters[item.pillar] += 1;

    if (existingDateSet.has(item.scheduledDate)) continue;

    const template = pool[idx % pool.length];
    const adapted = adaptTemplateForStudentProfile(
      template,
      item.pillar,
      profile,
      idx
    );
    const suffix = item.dayOfWeek.slice(0, 3).toLowerCase();

    created.push({
      id: `plan-${item.scheduledDate}-${suffix}`,
      dayOfWeek: item.dayOfWeek,
      slotLabel: template.slotLabel,
      slotTime: reminderTime,
      scheduledDate: item.scheduledDate,
      mode: profile.defaultMode ?? template.mode,
      tone: template.tone,
      promptCategory: adapted.promptCategory,
      topic: adapted.topic,
      topicPrimer: adapted.topicPrimer,
      pivotRule: adapted.pivotRule,
      feedbackReminder:
        coachContext?.activeReminder || template.feedbackReminder,
      targetWords: profile.targetWordGoal || template.targetWords,
      completed: false,
      isTriWeekly: true,
      pillar: item.pillar,
      suggestions: adapted.suggestions,
    });
  }

  return created;
}

export function getVisibleWritePageTasks(
  slots: CalendarSlot[],
  todayISO: string
): {
  todayTasks: CalendarSlot[];
  pastIncompleteTasks: CalendarSlot[];
  nextUpcomingTask: CalendarSlot | null;
} {
  const sorted = [...slots].sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate)
  );
  const todayTasks = sorted.filter((s) => s.scheduledDate === todayISO);
  const pastIncompleteTasks = sorted.filter(
    (s) => s.scheduledDate < todayISO && !s.completed
  );
  const nextUpcomingTask =
    sorted.find((s) => s.scheduledDate > todayISO && !s.completed) ?? null;

  return {
    todayTasks,
    pastIncompleteTasks,
    nextUpcomingTask,
  };
}



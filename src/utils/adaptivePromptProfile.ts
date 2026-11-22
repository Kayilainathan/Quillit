import type {
  CalendarSlot,
  StudentProfile,
  VocabEntry,
  WritingMode,
  WritingSession,
} from '../types';
import { MODE_LABELS } from './analytics';

const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function formatWeekdayFromISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y || 2026, (m || 1) - 1, d || 1);
  return FULL_WEEKDAYS[dt.getDay()] ?? 'Wednesday';
}

export type PromptPillar =
  | 'technical-concept'
  | 'linkedin-email'
  | 'creative-story';

export interface AdaptiveWritingProfile {
  personaSummary: string;
  domainTrack: 'eie-engineering' | 'stem-technical' | 'general-writer';
  academicStage: string;
  ageBand: 'teen' | 'college' | 'early-career' | 'experienced' | 'unspecified';
  recentTopics: string[];
  favoriteModes: string[];
  recurringGrammarRules: string[];
  practicingVocab: string[];
  avgWordCount: number;
  spokenFirstGuidance: string;
}

export interface PreferredDateSpec {
  scheduledDate: string;
  dayOfWeek: string;
  pillar: PromptPillar;
}

const EIE_KEYWORDS =
  /\b(eie|electronics|instrumentation|embedded|control\s+systems|plc|sensor|adc|pcb|microcontroller|signal\s+conditioning|vlsi|ece|eee)\b/i;

const STEM_KEYWORDS =
  /\b(engineering|computer\s+science|cs|software|mechanical|civil|electrical|physics|math|data\s+science|biotech|robotics|ai|ml)\b/i;

function inferAgeBand(age?: number): AdaptiveWritingProfile['ageBand'] {
  if (!age || !Number.isFinite(age)) return 'unspecified';
  if (age <= 18) return 'teen';
  if (age <= 23) return 'college';
  if (age <= 30) return 'early-career';
  return 'experienced';
}

function resolveAcademicStage(
  profile: StudentProfile | undefined,
  todayISO: string
): string {
  const rawSem = (profile?.semester || '').trim();
  const month = Number(todayISO.split('-')[1] || 0);

  // Respect late-5th-sem transition into 6th semester around Nov/Dec
  if (rawSem && /\b5(th)?\b/i.test(rawSem) && (month === 11 || month === 12)) {
    return 'End of 5th Semester, transitioning into 6th Semester';
  }
  if (rawSem) return rawSem;
  if (profile?.collegeDegree?.trim()) return 'Undergraduate';
  return 'Independent writer';
}

/**
 * Synthesizes a writer-specific adaptive profile from BOTH their personal metadata
 * (age, degree/field, semester, goals) AND their own writing history (recent topics,
 * recurring grammar fixes, practicing vocabulary, and preferred modes).
 * Ensures EIE students get deep hardware/instrumentation context while any generic
 * user gets prompts shaped naturally around their age, life stage, and writing voice.
 */
export function buildAdaptivePromptContext(
  profile: StudentProfile | undefined,
  sessions: WritingSession[],
  vocabulary: VocabEntry[],
  todayISO: string
): AdaptiveWritingProfile {
  const completed = sessions
    .filter((s) => s.status !== 'Draft')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const combinedProfileText = [
    profile?.collegeDegree || '',
    profile?.collegeName || '',
    ...completed.slice(0, 6).map((s) => s.topicDescription),
  ].join(' ');

  let domainTrack: AdaptiveWritingProfile['domainTrack'] = 'general-writer';
  if (EIE_KEYWORDS.test(combinedProfileText)) {
    domainTrack = 'eie-engineering';
  } else if (STEM_KEYWORDS.test(combinedProfileText)) {
    domainTrack = 'stem-technical';
  }

  const academicStage = resolveAcademicStage(profile, todayISO);
  const ageBand = inferAgeBand(profile?.age);

  const recentTopics = completed
    .slice(0, 8)
    .map((s) => s.topicDescription.trim())
    .filter(Boolean);

  // Count writer's most-used modes from their own writing history
  const modeCounts = new Map<WritingMode, number>();
  for (const s of completed.slice(0, 15)) {
    modeCounts.set(s.mode, (modeCounts.get(s.mode) || 0) + 1);
  }
  const favoriteModes = Array.from(modeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MODE_LABELS[m]);

  // Extract top 2 recurring grammar / flow rules from recent evaluations
  const ruleFreq = new Map<string, number>();
  for (const s of completed.slice(0, 8)) {
    for (const fix of s.grammarFixes || []) {
      const rule = (fix.rule || '').trim();
      if (!rule) continue;
      ruleFreq.set(rule, (ruleFreq.get(rule) || 0) + 1);
    }
  }
  const recurringGrammarRules = Array.from(ruleFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([rule]) => rule);

  const practicingVocab = vocabulary
    .filter((v) => !v.mastered)
    .slice(0, 3)
    .map((v) => v.betterAlternative.trim())
    .filter(Boolean);

  const avgWordCount =
    completed.length > 0
      ? Math.round(
          completed
            .slice(0, 10)
            .reduce((sum, s) => sum + (s.wordCount || 0), 0) /
            Math.min(10, completed.length)
        )
      : 0;

  const ageSegment = profile?.age ? `Age ${profile.age}` : '';
  const degreeSegment = profile?.collegeDegree?.trim() || '';
  const collegeSegment = profile?.collegeName?.trim() || '';

  let personaSummary: string;
  if (domainTrack === 'eie-engineering') {
    personaSummary = [
      'Electronics and Instrumentation Engineering (EIE) undergraduate',
      academicStage,
      collegeSegment,
      ageSegment,
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (degreeSegment) {
    personaSummary = [degreeSegment, academicStage, collegeSegment, ageSegment]
      .filter(Boolean)
      .join(' · ');
  } else if (ageBand === 'teen') {
    personaSummary = `Young writer (${ageSegment}) building natural spoken flow and expressive clarity`;
  } else if (ageBand === 'college') {
    personaSummary = `College-age writer (${ageSegment}) sharpening expressive English, career notes, and storytelling`;
  } else if (ageBand === 'early-career' || ageBand === 'experienced') {
    personaSummary = `Adult writer (${ageSegment}) refining clear communication, workplace voice, and narrative range`;
  } else {
    personaSummary =
      'Everyday writer building natural spoken flow, expressive English, and storytelling range';
  }

  const spokenFirstGuidance =
    'Frame every prompt around how the words sound spoken aloud (e.g., explaining to a curious friend or narrating a scene aloud), with zero word-count pressure inside the prompt text.';

  return {
    personaSummary,
    domainTrack,
    academicStage,
    ageBand,
    recentTopics,
    favoriteModes,
    recurringGrammarRules,
    practicingVocab,
    avgWordCount,
    spokenFirstGuidance,
  };
}

const PILLAR_ROTATION: PromptPillar[] = [
  'technical-concept',
  'linkedin-email',
  'creative-story',
];

/**
 * Generates dynamic calendar date specs for a given month using the writer's
 * actual chosen practice weekdays (0=Sun..6=Sat), cycling smoothly across all
 * 3 expressive pillars without hardcoding Wed/Fri/Sun.
 */
export function getMonthPreferredDaySpecs(
  year: number,
  monthIndex0: number,
  preferredDays?: number[],
  minDateISO?: string
): PreferredDateSpec[] {
  const validDays = Array.from(
    new Set(
      (preferredDays && preferredDays.length > 0 ? preferredDays : [3, 5, 0]).filter(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      )
    )
  );
  const daySet = new Set(validDays);
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();

  const specs: PreferredDateSpec[] = [];
  let pillarIdx = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dt = new Date(year, monthIndex0, day);
    const dow = dt.getDay();
    if (!daySet.has(dow)) continue;

    const scheduledDate = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`;

    if (minDateISO && scheduledDate < minDateISO) continue;

    // Preserve classic Wed->Tech, Fri->LinkedIn/Email, Sun->Creative when using default Wed/Fri/Sun,
    // and cycle evenly across the 3 pillars for any custom weekday schedule.
    let pillar: PromptPillar;
    if (dow === 3 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'technical-concept';
    } else if (dow === 5 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'linkedin-email';
    } else if (dow === 0 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'creative-story';
    } else {
      pillar = PILLAR_ROTATION[pillarIdx % PILLAR_ROTATION.length];
      pillarIdx += 1;
    }

    specs.push({
      scheduledDate,
      dayOfWeek: formatWeekdayFromISO(scheduledDate),
      pillar,
    });
  }

  return specs;
}

/**
 * Returns the next 3 upcoming practice dates matching the user's preferred weekdays
 * starting on or after todayISO.
 */
export function getNextPreferredCycleSpecs(
  todayISO: string,
  preferredDays?: number[],
  count = 3
): PreferredDateSpec[] {
  const validDays = Array.from(
    new Set(
      (preferredDays && preferredDays.length > 0 ? preferredDays : [3, 5, 0]).filter(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      )
    )
  );
  const daySet = new Set(validDays);
  const [y, m, d] = todayISO.split('-').map(Number);
  const start = new Date(y || 2026, (m || 1) - 1, d || 1);

  const specs: PreferredDateSpec[] = [];
  let pillarIdx = 0;

  for (let offset = 0; offset < 28 && specs.length < count; offset += 1) {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const dow = dt.getDay();
    if (!daySet.has(dow)) continue;

    const scheduledDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(dt.getDate()).padStart(2, '0')}`;

    let pillar: PromptPillar;
    if (dow === 3 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'technical-concept';
    } else if (dow === 5 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'linkedin-email';
    } else if (dow === 0 && daySet.has(3) && daySet.has(5) && daySet.has(0) && daySet.size === 3) {
      pillar = 'creative-story';
    } else {
      pillar = PILLAR_ROTATION[pillarIdx % PILLAR_ROTATION.length];
      pillarIdx += 1;
    }

    specs.push({
      scheduledDate,
      dayOfWeek: formatWeekdayFromISO(scheduledDate),
      pillar,
    });
  }

  return specs;
}

/**
 * Helper to check whether a slot matches any scheduled date in a list of specs.
 */
export function filterNewScheduledSlots(
  existingSlots: CalendarSlot[],
  generated: CalendarSlot[]
): CalendarSlot[] {
  const completedDates = new Set(
    existingSlots.filter((s) => s.completed).map((s) => s.scheduledDate)
  );
  return generated.filter((s) => !completedDates.has(s.scheduledDate));
}

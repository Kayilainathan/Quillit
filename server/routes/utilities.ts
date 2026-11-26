import { Router } from 'express';
import { Type } from '@google/genai';
import {
  buildServerQueuedEvaluation,
  executeCascadingJsonCall,
  getCascadeHealthSnapshot,
  isQuotaOrOverloadError,
  makeCacheKey,
} from '../lib/geminiCascade';
import {
  RealtimeAssistRequestSchema,
  buildErrorEnvelope,
  createRequestId,
} from '../lib/validation';

interface FallbackSlotTemplate {
  slotLabel: string;
  slotTime: string;
  mode: 'technical' | 'linkedin' | 'email' | 'creative';
  tone: string;
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
  promptCategory: string;
  topic: string;
  topicPrimer: string;
  pivotRule: string;
  feedbackReminder: string;
  targetWords: number;
  suggestions: string[];
}

const FALLBACK_POOLS: Record<
  'technical-concept' | 'linkedin-email' | 'creative-story',
  FallbackSlotTemplate[]
> = {
  'technical-concept': [
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '18:19',
      mode: 'technical',
      tone: 'academic-technical',
      pillar: 'technical-concept',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Defend 4–20 mA Current Loops Over 0–10 V Signals in an Interview',
      topicPrimer:
        'Industrial transmitters carry process signals across noisy plant floors where copper resistance drops small voltages. A 4–20 mA loop holds constant current regardless of run length, while the 4 mA live zero separates a true zero from an open wire.',
      pivotRule:
        'Universal Pivot: Swap to any sensor signal-conditioning setup from your 6th-sem EIE lab.',
      feedbackReminder:
        'Add clear spoken transitions and try active verbs like "stabilizes" or "interfaces with".',
      targetWords: 220,
      suggestions: [
        'Contrast voltage drop vs current-loop immunity in plain spoken English.',
        'Explain why 4 mA live zero detects snapped wires immediately.',
        'Anchor with a Process Control transmitter calibration bench example.',
      ],
    },
    {
      slotLabel: 'Slot 1 · Tech & Interview',
      slotTime: '18:19',
      mode: 'technical',
      tone: 'academic-technical',
      pillar: 'technical-concept',
      promptCategory: 'Technical & Interview Expression',
      topic: 'Explain Instrumentation Amplifiers & CMRR in a Wheatstone Bridge',
      topicPrimer:
        'A Wheatstone bridge delivers millivolt differentials riding on large common-mode supply or 50 Hz mains hum. The 3-op-amp instrumentation amplifier buffers both bridge legs equally and amplifies only the true transducer difference.',
      pivotRule:
        'Universal Pivot: Swap to any differential amp, comparator, or ADC front-end you wired in lab.',
      feedbackReminder:
        'Break stacked clauses into 15-word steps; try "diagnosed" and "digitizes".',
      targetWords: 210,
      suggestions: [
        'Define Common-Mode Rejection Ratio (CMRR) without hiding behind algebra.',
        'Walk through input buffering before the difference amplifier.',
        'Tie back to an RTD or strain-gauge bridge demonstration.',
      ],
    },
  ],
  'linkedin-email': [
    {
      slotLabel: 'LinkedIn, Email & Soft Skills',
      slotTime: '18:19',
      mode: 'email',
      tone: 'formal-executive',
      pillar: 'linkedin-email',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic:
        'Crisp 15-Minute Feedback Email on Your Capstone Hardware Architecture',
      topicPrimer:
        'Strong professional emails respect the reader’s time: lead with brief context, state one specific question or bottleneck you are facing, and make it effortless to say yes.',
      pivotRule:
        'Universal Pivot: Swap to a cold LinkedIn message to a recruiter or a diplomatic note to a teammate about a missed deadline.',
      feedbackReminder:
        'Sound respectful and confident without sounding needy or vague, and cut filler phrases.',
      targetWords: 170,
      suggestions: [
        'Open with one clear sentence of context on your hardware architecture.',
        'Ask one specific technical question they can react to quickly.',
        'Offer two easy 15-minute windows so replying takes ten seconds.',
      ],
    },
    {
      slotLabel: 'LinkedIn, Email & Soft Skills',
      slotTime: '18:19',
      mode: 'linkedin',
      tone: 'professional-warm',
      pillar: 'linkedin-email',
      promptCategory: 'LinkedIn, Email & Soft Skills',
      topic:
        'LinkedIn Reflection: What Oscilloscope Ringing Taught Me About Ground Loops',
      topicPrimer:
        'Hiring managers remember honest bench debugging notes far more than textbook summaries. Walking readers through one noisy scope trace and how you isolated the return path proves real ownership.',
      pivotRule:
        'Universal Pivot: Swap to any real lab setback (loose jumper, baud mismatch, or op-amp drift) and its lesson.',
      feedbackReminder:
        'Tell it as if sharing a story over coffee with an engineering mentor, eliminating filler words.',
      targetWords: 185,
      suggestions: [
        'Hook with the surprising waveform or failure you first noticed.',
        'Explain one methodical test that isolated the real root cause.',
        'End with a crisp takeaway for fellow builders.',
      ],
    },
  ],
  'creative-story': [
    {
      slotLabel: 'Creative & Storytelling',
      slotTime: '18:19',
      mode: 'creative',
      tone: 'narrative-vivid',
      pillar: 'creative-story',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic:
        'A Veteran Alchemist and a Runaway Apprentice Trapped Inside a Cellar During an Elemental Storm',
      topicPrimer:
        'Keep spoken lines brief and natural, letting pauses, gestures, and background thunder carry the unspoken tension between them. Neither fully trusts the other, yet the cellar door will not hold until dawn.',
      pivotRule:
        'Universal Pivot: Swap to any two contrasting characters stuck together during a crisis.',
      feedbackReminder:
        'Read dialogue aloud in your head so each line carries natural spoken cadence and subtext.',
      targetWords: 220,
      suggestions: [
        'Open mid-gesture as thunder shakes dust from the cellar beams.',
        'Use short, charged dialogue where what they hide matters most.',
        'End on a quiet shift in trust or a revealing gesture.',
      ],
    },
    {
      slotLabel: 'Creative & Storytelling',
      slotTime: '18:19',
      mode: 'creative',
      tone: 'narrative-vivid',
      pillar: 'creative-story',
      promptCategory: 'Creative Fantasy & Expressive Storytelling',
      topic:
        'The Clockwork Cartographer: An Irreversible Choice in a Sunken Brass City',
      topicPrimer:
        'Beneath a sea wall, a brass city runs on pressurized brine mains and ticking gear-trains. Tonight an apprentice cartographer discovers an unmapped submerged ward ten minutes before the floodgates open.',
      pivotRule:
        'Universal Pivot: Swap to any character facing a time-critical moral choice in a world you invent.',
      feedbackReminder:
        'Show emotion through physical detail and vocal cadence rather than flat adjectives.',
      targetWords: 230,
      suggestions: [
        'Anchor the opening in two physical textures (salt crust, lantern hiss).',
        'Reveal tension through a short, sharp exchange of dialogue.',
        'End on an irreversible decision.',
      ],
    },
  ],
};

let fallbackRotationCounter = 0;

function pickFallbackTemplate(
  pillar: 'technical-concept' | 'linkedin-email' | 'creative-story',
  offset: number,
  customReminder?: string
): FallbackSlotTemplate & { feedbackReminder: string } {
  const pool = FALLBACK_POOLS[pillar];
  const tpl = pool[(fallbackRotationCounter + offset) % pool.length];
  return {
    ...tpl,
    feedbackReminder: customReminder || tpl.feedbackReminder,
  };
}

export function createUtilitiesRouter(): Router {
  const router = Router();

  router.get('/api/health', (_req, res) => {
    res.json(getCascadeHealthSnapshot());
  });

  router.post('/api/realtime-assist', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const parsedReq = RealtimeAssistRequestSchema.safeParse(req.body ?? {});

    if (!parsedReq.success) {
      const msg =
        parsedReq.error.issues[0]?.message ||
        'Write at least a sentence before running live vocabulary & grammar assist.';
      res.status(400).json(
        buildErrorEnvelope({
          code: 'INVALID_INPUT',
          message: msg,
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const { content: trimmedContent, mode, tone } = parsedReq.data;
    const wordCount = trimmedContent.split(/\s+/).filter(Boolean).length;
    const cacheKey = makeCacheKey('realtime-assist', {
      content: trimmedContent,
      mode,
      tone,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached, latencyMs } =
        await executeCascadingJsonCall({
          cacheKey,
          task: 'realtime',
          preferFastTier: true,
          complexityMetric: wordCount,
          contents: `Mode:${mode}|Tone:${tone}\nDraft:\n"""\n${trimmedContent}\n"""`,
          systemInstruction:
            'Concise live English editor for an EIE student. Return 1-sentence toneAlignment, 1-line clarityNudge, up to 3 exact grammarAlerts, and up to 4 vocabUpgrades from draft phrases.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              toneAlignment: { type: Type.STRING },
              clarityNudge: { type: Type.STRING },
              grammarAlerts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    rule: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['original', 'corrected', 'rule', 'category'],
                },
              },
              vocabUpgrades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    used: { type: Type.STRING },
                    betterAlternative: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    contextSnippet: { type: Type.STRING },
                  },
                  required: [
                    'used',
                    'betterAlternative',
                    'explanation',
                    'contextSnippet',
                  ],
                },
              },
            },
            required: [
              'toneAlignment',
              'clarityNudge',
              'grammarAlerts',
              'vocabUpgrades',
            ],
          },
        });

      res.json({
        ok: true,
        ...parsed,
        modelUsed,
        thinkingLevelUsed,
        downgraded,
        cached,
        quotaQueued: false,
        meta: { requestId, modelUsed, latencyMs },
      });
    } catch (err) {
      if (isQuotaOrOverloadError(err)) {
        const provisional = buildServerQueuedEvaluation(
          trimmedContent,
          String(mode),
          String(tone)
        );
        res.json({
          ok: true,
          toneAlignment: `Live check accepted (${mode} · ${tone}). Deep AI suggestions will resume automatically when the API rate limit resets.`,
          clarityNudge: provisional.flowVerdict,
          grammarAlerts: provisional.grammarFixes,
          vocabUpgrades: [],
          modelUsed: 'queued-pending-reset',
          thinkingLevelUsed: 'LOCAL',
          downgraded: true,
          quotaQueued: true,
        });
        return;
      }

      const raw = err instanceof Error ? err.message : String(err);
      res.status(500).json(
        buildErrorEnvelope({
          code: 'REALTIME_ASSIST_FAILED',
          message: raw || 'Live assist request failed.',
          retryable: true,
          requestId,
          startedAtMs: startedAt,
        })
      );
    }
  });

  router.post('/api/topics', async (req, res) => {
    const {
      mode = 'Technical & Interview',
      tone = 'Professional-Warm',
      focusArea,
      existingTopics = [],
      studentProfile,
      adaptiveWritingProfile,
    } = req.body ?? {};
    const avoidSample = Array.isArray(existingTopics)
      ? existingTopics.slice(-40).map(String).join('; ')
      : '';
    const persona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile?.collegeDegree
        ? `${studentProfile.semester || 'Undergraduate'} ${studentProfile.collegeDegree}`
        : 'focused writer building natural spoken flow and expressive English');
    const cacheKey = makeCacheKey('topics-v2', {
      mode,
      tone,
      focusArea,
      persona,
      avoidLen: avoidSample.length,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'topics',
          preferFastTier: true,
          complexityMetric: 60,
        contents: `4 fresh, spoken-first, non-repeating writing prompts tailored for: ${persona}.
Mode: ${mode} | Tone: ${tone} | Focus: ${focusArea || 'EIE instrumentation & embedded interviews, clear system explanations, outreach emails, or vivid stories'}
Strictly avoid repeating any of these past/scheduled topics: ${avoidSample || 'none'}`,
        systemInstruction:
          'Return 4 crisp, engaging, non-generic writing prompts (no em-dashes, no word-count rules inside titles). Frame guidance around explaining cleanly aloud plus a 1-sentence pivot permission. Strictly avoid repeating past topics.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  guidance: { type: Type.STRING },
                  category: { type: Type.STRING },
                  targetWords: { type: Type.INTEGER },
                },
                required: ['title', 'guidance', 'category', 'targetWords'],
              },
            },
          },
          required: ['prompts'],
        },
      });

      res.json({ ok: true, ...parsed, modelUsed, thinkingLevelUsed, downgraded, cached });
    } catch {
      res.json({
        ok: true,
        modelUsed: 'curated-eie-pool',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        prompts: [
          {
            title:
              'Calibrating a 3-Wire PT100 RTD Bridge Against Ambient Lead Resistance in Lab',
            guidance:
              'Explain lead-wire cancellation aloud to a lab partner. Swap to any sensor bridge bench test you know well.',
            category: String(mode),
            targetWords: 200,
          },
          {
            title:
              'Cold Outreach Note After Reading a Core Embedded Team Engineer Article',
            guidance:
              'Reference one specific firmware or ADC detail they wrote about and ask concisely for a 15-minute chat.',
            category: String(mode),
            targetWords: 150,
          },
          {
            title:
              'Walking a Placement Panel Through Why Your Signal Conditioning Op-Amp Saturated',
            guidance:
              'State the symptom, rail headroom constraint, and measured fix clearly without apologizing.',
            category: String(mode),
            targetWords: 195,
          },
          {
            title:
              'The Brass Chronometer: When the Station Master Clock Skipped a Beat at Dusk',
            guidance:
              'Narrate urgency through sensory mechanical details and tight spoken dialogue.',
            category: String(mode),
            targetWords: 225,
          },
        ],
      });
    }
  });

  router.post('/api/schedule-triweekly', async (req, res) => {
    const {
      cycleDates,
      customDates,
      todayISO,
      existingTopics,
      focusNote,
      performanceContext,
      studentProfile,
      adaptiveWritingProfile,
    } = req.body ?? {};

    type DateSpec = {
      scheduledDate: string;
      dayOfWeek: string;
      pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
    };

    const VALID_PILLARS = new Set([
      'technical-concept',
      'linkedin-email',
      'creative-story',
    ]);
    const PILLAR_CYCLE: DateSpec['pillar'][] = [
      'technical-concept',
      'linkedin-email',
      'creative-story',
    ];
    const minDateISO =
      typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
        ? todayISO
        : '';

    let targetSpecs: DateSpec[] = [];

    if (Array.isArray(customDates) && customDates.length > 0) {
      targetSpecs = customDates
        .slice(0, 31)
        .map((item: Record<string, unknown>, idx: number) => {
          const day = String(item.dayOfWeek || 'Wednesday');
          const rawPillar = String(item.pillar || '');
          const safePillar: DateSpec['pillar'] = VALID_PILLARS.has(rawPillar)
            ? (rawPillar as DateSpec['pillar'])
            : day === 'Wednesday'
              ? 'technical-concept'
              : day === 'Friday'
                ? 'linkedin-email'
                : day === 'Sunday'
                  ? 'creative-story'
                  : PILLAR_CYCLE[idx % PILLAR_CYCLE.length];
          return {
            scheduledDate: String(item.scheduledDate),
            dayOfWeek: day,
            pillar: safePillar,
          };
        })
        .filter((spec) => !minDateISO || spec.scheduledDate >= minDateISO);
    } else {
      const wed = String(cycleDates?.wednesday || '');
      const fri = String(cycleDates?.friday || '');
      const sun = String(cycleDates?.sunday || '');
      if (!wed || !fri || !sun) {
        res.status(400).json({
          error:
            'Either cycleDates (wednesday, friday, sunday) or customDates array is required.',
        });
        return;
      }
      const defaultCycle: DateSpec[] = [
        { scheduledDate: wed, dayOfWeek: 'Wednesday', pillar: 'technical-concept' },
        { scheduledDate: fri, dayOfWeek: 'Friday', pillar: 'linkedin-email' },
        { scheduledDate: sun, dayOfWeek: 'Sunday', pillar: 'creative-story' },
      ];
      targetSpecs = defaultCycle.filter(
        (spec) => !minDateISO || spec.scheduledDate >= minDateISO
      );
    }

    if (targetSpecs.length === 0) {
      res.json({
        slots: [],
        modelUsed: 'none-remaining',
        thinkingLevelUsed: 'LOCAL',
        downgraded: false,
      });
      return;
    }

    const normalizeTopicKey = (val: string) =>
      val
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const existingTopicKeys = new Set(
      Array.isArray(existingTopics)
        ? existingTopics.map((t: unknown) => normalizeTopicKey(String(t || '')))
        : []
    );

    const avoidList = Array.isArray(existingTopics)
      ? existingTopics.slice(-48).join('; ')
      : '';

    const practicingList = Array.isArray(performanceContext?.practicingWords)
      ? performanceContext.practicingWords.slice(0, 3)
      : Array.isArray(adaptiveWritingProfile?.practicingVocab)
        ? adaptiveWritingProfile.practicingVocab.slice(0, 3)
        : [];

    const recurringRules = Array.isArray(adaptiveWritingProfile?.recurringGrammarRules)
      ? adaptiveWritingProfile.recurringGrammarRules.slice(0, 2)
      : Array.isArray(performanceContext?.recentStrictFixes)
        ? performanceContext.recentStrictFixes.slice(0, 2)
        : [];

    const perfSummary = performanceContext
      ? `Avg:${performanceContext.avgPercentage || 75}% | Weakest Pillar:${performanceContext.weakestPillarLabel || 'Natural Voice & Flow'} (${performanceContext.weakestPillarScore || 7.5}/10) | Practicing Vocab:${practicingList.length > 0 ? practicingList.join(', ') : 'None yet'} | Recurring Fixes:${recurringRules.length > 0 ? recurringRules.join(' ; ') : 'Vary sentence rhythm'}`
      : 'Baseline writer (no prior score history yet)';

    const writerPersona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile && studentProfile.collegeDegree
        ? `${studentProfile.semester || 'Current Semester'} · ${studentProfile.collegeDegree}${studentProfile.collegeName ? ` · ${studentProfile.collegeName}` : ''}`
        : 'Electronics and Instrumentation Engineering (EIE) undergraduate');

    const cacheKey = makeCacheKey('schedule-adaptive-v2', {
      targetSpecs,
      avoidList,
      focusNote,
      perfSummary,
      writerPersona,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'schedule',
          complexityMetric: targetSpecs.length,
          contents: `Slots to generate (${targetSpecs.length}): ${targetSpecs
            .map((t) => `${t.dayOfWeek}=${t.scheduledDate} (${t.pillar})`)
            .join(', ')}
Writer Persona: ${writerPersona}
Performance & Closed-Loop Targets: ${perfSummary}
Avoid repeating: ${avoidList || 'none'}
Focus note: ${focusNote || 'Fresh 10-minute spoken-first expressive rotation'}`,
          systemInstruction: `You design expressive, 10-minute spoken-first writing prompts tailored to ${writerPersona}. Never use em-dashes or word-count restrictions inside the prompt text. Return crisp topic, 2-sentence topicPrimer, 1-sentence pivotRule, 1-sentence feedbackReminder, targetWords (140-240), and 3 short suggestions.`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dayOfWeek: { type: Type.STRING },
                    scheduledDate: { type: Type.STRING },
                    slotLabel: { type: Type.STRING },
                    mode: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    pillar: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    topicPrimer: { type: Type.STRING },
                    pivotRule: { type: Type.STRING },
                    feedbackReminder: { type: Type.STRING },
                    targetWords: { type: Type.INTEGER },
                    suggestions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'dayOfWeek',
                    'scheduledDate',
                    'slotLabel',
                    'mode',
                    'tone',
                    'pillar',
                    'topic',
                    'topicPrimer',
                    'pivotRule',
                    'feedbackReminder',
                    'targetWords',
                    'suggestions',
                  ],
                },
              },
            },
            required: ['slots'],
          },
        });

      const rawSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
      const seenBatchKeys = new Set<string>(existingTopicKeys);

      const normalized = targetSpecs.map((spec, idx) => {
        const s = (rawSlots[idx] || {}) as Record<string, unknown>;
        const fb = pickFallbackTemplate(spec.pillar, idx);
        const safeMode =
          spec.pillar === 'technical-concept'
            ? 'technical'
            : spec.pillar === 'linkedin-email'
              ? s.mode === 'email'
                ? 'email'
                : 'linkedin'
              : 'creative';
        const safeTone =
          spec.pillar === 'technical-concept'
            ? 'academic-technical'
            : spec.pillar === 'linkedin-email'
              ? safeMode === 'email'
                ? 'formal-executive'
                : 'professional-warm'
              : 'narrative-vivid';

        let candidateTopic = String(s.topic || fb.topic).trim();
        const candidateKey = normalizeTopicKey(candidateTopic);
        if (!candidateTopic || seenBatchKeys.has(candidateKey)) {
          candidateTopic = `${fb.topic} (${spec.dayOfWeek} ${spec.scheduledDate.slice(5)})`;
        }
        seenBatchKeys.add(normalizeTopicKey(candidateTopic));

        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: String(s.slotLabel || fb.slotLabel),
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: safeMode,
          tone: safeTone,
          promptCategory:
            safeMode === 'technical'
              ? 'Technical & Interview Expression'
              : safeMode === 'email' || safeMode === 'linkedin'
                ? 'LinkedIn, Email & Soft Skills'
                : 'Creative Fantasy & Expressive Storytelling',
          topic: candidateTopic,
          topicPrimer: String(s.topicPrimer || fb.topicPrimer),
          pivotRule: String(s.pivotRule || fb.pivotRule),
          feedbackReminder: String(s.feedbackReminder || fb.feedbackReminder),
          targetWords: Math.max(140, Math.min(300, Number(s.targetWords) || fb.targetWords)),
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          source: 'ai-adapted',
          suggestions:
            Array.isArray(s.suggestions) && s.suggestions.length > 0
              ? s.suggestions.slice(0, 3).map(String)
              : fb.suggestions,
        };
      });

      res.json({ ok: true, slots: normalized, modelUsed, thinkingLevelUsed, downgraded });
    } catch {
      const customReminder =
        practicingList.length > 0 || recurringRules.length > 0
          ? `Practice target: ${recurringRules[0] || `strengthen ${performanceContext?.weakestPillarLabel || 'spoken flow'}`}${practicingList.length > 0 ? ` and weave in: ${practicingList.join(', ')}` : ''}.`
          : undefined;

      const slots = targetSpecs.map((spec, idx) => {
        const tpl = pickFallbackTemplate(spec.pillar, idx, customReminder);
        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: tpl.slotLabel,
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: tpl.mode,
          tone: tpl.tone,
          promptCategory: tpl.promptCategory,
          topic: tpl.topic,
          topicPrimer: tpl.topicPrimer,
          pivotRule: tpl.pivotRule,
          feedbackReminder: tpl.feedbackReminder,
          targetWords: tpl.targetWords,
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          suggestions: [...tpl.suggestions],
        };
      });
      fallbackRotationCounter += 1;

      res.json({
        ok: true,
        slots,
        modelUsed: 'curated-eie-rotation',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        quotaQueued: true,
      });
    }
  });

  const handlePivotTopic = async (
    req: Parameters<Parameters<Router['post']>[1]>[0],
    res: Parameters<Parameters<Router['post']>[1]>[1]
  ) => {
    const { slot, customFocus } = req.body ?? {};
    if (!slot || typeof customFocus !== 'string' || customFocus.trim().length < 3) {
      res.status(400).json({ error: 'Provide a topic or gadget focus to pivot onto.' });
      return;
    }

    const focus = customFocus.trim();
    const cacheKey = makeCacheKey('pivot-topic', {
      mode: slot.mode,
      tone: slot.tone,
      focus,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: true,
          task: 'pivot',
          preferFastTier: true,
          complexityMetric: 60,
          contents: `Student pivoted to familiar focus: "${focus}"
Target Mode: ${slot.mode} | Target Tone: ${slot.tone} | Day: ${slot.dayOfWeek || 'Scheduled'}`,
          systemInstruction:
            'Apply the Universal Pivot Rule for an EIE student: keep the exact target writing mode/tone, reframe the prompt around their familiar focus with a concise topic title, a 2-sentence beginner-friendly topicPrimer, and 3 crisp writing angles.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              topicPrimer: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['topic', 'topicPrimer', 'suggestions'],
          },
        });

      res.json({
        ok: true,
        topic: String(parsed.topic || focus),
        topicPrimer: String(parsed.topicPrimer || ''),
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.slice(0, 3).map(String)
          : [],
        modelUsed,
        thinkingLevelUsed,
        downgraded,
      });
    } catch {
      res.json({
        ok: true,
        topic: `${focus} (${slot.mode === 'creative' ? 'Character Scene' : 'Focused Breakdown'})`,
        topicPrimer: `Pivoted to your chosen focus: ${focus}. Explain or depict the core mechanism, human decision, or outcome clearly in crisp ${slot.tone} English.`,
        suggestions: [
          `Open immediately with a concrete detail from ${focus}.`,
          'Keep verbs active and cut unnecessary throat-clearing fillers.',
          'Close with one memorable takeaway or decision.',
        ],
        modelUsed: 'local-pivot',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
      });
    }
  };

  router.post('/api/pivot-topic', handlePivotTopic);
  router.post('/api/pivot', handlePivotTopic);

  router.post('/api/suggest-first-month', async (req, res) => {
    const {
      todayISO,
      targetSpecs = [],
      studentProfile,
      adaptiveWritingProfile,
      existingTopics = [],
    } = req.body ?? {};

    const minDate =
      typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)
        ? todayISO
        : new Date().toISOString().slice(0, 10);

    type FirstSpec = {
      scheduledDate: string;
      dayOfWeek: string;
      pillar: 'technical-concept' | 'linkedin-email' | 'creative-story';
    };

    const validSpecs: FirstSpec[] = Array.isArray(targetSpecs)
      ? targetSpecs
          .slice(0, 31)
          .map((item: Record<string, unknown>, idx: number) => {
            const p = String(item.pillar || '');
            const safePillar: FirstSpec['pillar'] =
              p === 'technical-concept' ||
              p === 'linkedin-email' ||
              p === 'creative-story'
                ? p
                : (['technical-concept', 'linkedin-email', 'creative-story'] as const)[
                    idx % 3
                  ];
            return {
              scheduledDate: String(item.scheduledDate || minDate),
              dayOfWeek: String(item.dayOfWeek || 'Today'),
              pillar: safePillar,
            };
          })
          .filter((s) => s.scheduledDate >= minDate)
      : [];

    if (validSpecs.length === 0) {
      res.json({ slots: [], modelUsed: 'none-remaining', downgraded: false });
      return;
    }

    const persona =
      adaptiveWritingProfile?.personaSummary ||
      (studentProfile?.collegeDegree
        ? `${studentProfile.semester || 'Undergraduate'} ${studentProfile.collegeDegree}`
        : 'focused writer building natural spoken flow and expressive English');
    const avoidSample = Array.isArray(existingTopics)
      ? existingTopics.slice(-30).map(String).join('; ')
      : '';

    const cacheKey = makeCacheKey('first-month-v1', {
      minDate,
      count: validSpecs.length,
      persona,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'schedule',
          complexityMetric: validSpecs.length,
          preferFastTier: true,
          contents: `Create a welcoming, inspiring first-month writing plan (${validSpecs.length} dates starting on/after ${minDate}) for: ${persona}.
Dates: ${validSpecs.map((s) => `${s.dayOfWeek}=${s.scheduledDate} (${s.pillar})`).join(', ')}
Make the VERY FIRST slot extra inviting, concrete, and immediately enjoyable to write right now.
Never repeat any topic within this list or from: ${avoidSample || 'none'}.`,
          systemInstruction: `Design a crisp, non-repeating spoken-first starter schedule tailored to ${persona}. Zero em-dashes, zero word-count rules in titles.`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              slots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    mode: { type: Type.STRING },
                    tone: { type: Type.STRING },
                    topic: { type: Type.STRING },
                    topicPrimer: { type: Type.STRING },
                    pivotRule: { type: Type.STRING },
                    feedbackReminder: { type: Type.STRING },
                    targetWords: { type: Type.INTEGER },
                    suggestions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'mode',
                    'tone',
                    'topic',
                    'topicPrimer',
                    'pivotRule',
                    'feedbackReminder',
                    'targetWords',
                    'suggestions',
                  ],
                },
              },
            },
            required: ['slots'],
          },
        });

      const rawSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
      const seenTitles = new Set<string>();
      const slots = validSpecs.map((spec, idx) => {
        const s = (rawSlots[idx] || {}) as Record<string, unknown>;
        const fb = pickFallbackTemplate(spec.pillar, idx);
        const safeMode =
          spec.pillar === 'technical-concept'
            ? 'technical'
            : spec.pillar === 'linkedin-email'
              ? s.mode === 'email'
                ? 'email'
                : 'linkedin'
              : 'creative';
        const safeTone =
          spec.pillar === 'technical-concept'
            ? 'academic-technical'
            : spec.pillar === 'linkedin-email'
              ? safeMode === 'email'
                ? 'formal-executive'
                : 'professional-warm'
              : 'narrative-vivid';

        let cleanTopic = String(s.topic || fb.topic).trim();
        const key = cleanTopic.toLowerCase();
        if (!cleanTopic || seenTitles.has(key)) {
          cleanTopic = fb.topic;
        }
        seenTitles.add(cleanTopic.toLowerCase());

        return {
          id: `plan-${spec.scheduledDate}-${spec.dayOfWeek.slice(0, 3).toLowerCase()}`,
          dayOfWeek: spec.dayOfWeek,
          slotLabel: idx === 0 ? 'First Topic · AI Starter' : fb.slotLabel,
          slotTime: '18:19',
          scheduledDate: spec.scheduledDate,
          mode: safeMode,
          tone: safeTone,
          promptCategory: fb.promptCategory,
          topic: cleanTopic,
          topicPrimer: String(s.topicPrimer || fb.topicPrimer),
          pivotRule: String(s.pivotRule || fb.pivotRule),
          feedbackReminder: String(s.feedbackReminder || fb.feedbackReminder),
          targetWords: Math.max(
            150,
            Math.min(280, Number(s.targetWords) || fb.targetWords)
          ),
          completed: false,
          isTriWeekly: true,
          pillar: spec.pillar,
          source: 'ai-adapted',
          suggestions:
            Array.isArray(s.suggestions) && s.suggestions.length > 0
              ? s.suggestions.slice(0, 3).map(String)
              : fb.suggestions,
        };
      });

      res.json({ ok: true, slots, modelUsed, thinkingLevelUsed, downgraded });
    } catch {
      res.status(503).json({
        error: 'AI starter schedule temporarily unavailable; falling back to 52-week roadmap.',
      });
    }
  });

  router.post('/api/categorize-vocab', async (req, res) => {
    const { entries = [] } = req.body ?? {};
    if (!Array.isArray(entries) || entries.length === 0) {
      res.json({ ok: true, categories: {}, modelUsed: 'none', downgraded: false });
      return;
    }

    const ALLOWED_CATEGORIES = [
      'Technical & Engineering',
      'Professional & Outreach',
      'Storytelling & Vivid',
      'Precision & Clarity',
      'Everyday Expression',
    ] as const;

    const compactEntries = entries.slice(0, 80).map((e: Record<string, unknown>) => ({
      id: String(e.id || ''),
      word: String(e.betterAlternative || ''),
      replaces: String(e.used || ''),
      meaning: String(e.explanation || '').slice(0, 120),
      mode: String(e.mode || 'journal'),
    }));

    const cacheKey = makeCacheKey('categorize-vocab-v1', compactEntries);

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, cached } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: true,
          task: 'topics',
          complexityMetric: compactEntries.length,
          preferFastTier: true,
          contents: `Categorize each vocabulary item into EXACTLY ONE of these 5 categories:
${ALLOWED_CATEGORIES.join(' | ')}

Entries:
${compactEntries.map((e) => `${e.id}: "${e.word}" (replaces "${e.replaces}", mode=${e.mode}) - ${e.meaning}`).join('\n')}`,
          systemInstruction:
            'Assign each vocabulary entry ID to the single most useful semantic category from the 5 provided categories so a writer can browse their personal lexicon cleanly.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    category: { type: Type.STRING },
                  },
                  required: ['id', 'category'],
                },
              },
            },
            required: ['items'],
          },
        });

      const allowedSet = new Set<string>(ALLOWED_CATEGORIES);
      const categories: Record<string, string> = {};
      if (Array.isArray(parsed.items)) {
        for (const row of parsed.items as Array<Record<string, unknown>>) {
          const id = String(row.id || '');
          const cat = String(row.category || '');
          if (id && allowedSet.has(cat)) {
            categories[id] = cat;
          }
        }
      }

      res.json({ ok: true, categories, modelUsed, thinkingLevelUsed, downgraded, cached });
    } catch {
      res.status(503).json({
        error: 'AI categorization temporarily unavailable.',
      });
    }
  });

  return router;
}

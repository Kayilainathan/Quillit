import { Router } from 'express';
import { Type } from '@google/genai';
import {
  buildConversationSystemInstruction,
  pickFreshOpeningLine,
  sanitizeConversationTurnResponse,
  selectConversationTurnRoute,
} from '../../src/utils/conversationEngine';
import {
  getModelStepTimeoutMs,
  type ActiveEvalModel,
} from '../../src/utils/evaluationRouter';
import { buildFencedCoachPreferences } from '../../src/utils/proseDiagnostics';
import type {
  CoachPresetId,
  ConversationPace,
  ConversationScenario,
} from '../../src/types';
import {
  buildModelRequestConfig,
  executeCascadingJsonCall,
  getAiClient,
  makeCacheKey,
  modelCooldownUntil,
  modelUnsupportedUntil,
  recordModelFailure,
  recordModelSuccess,
} from '../lib/geminiCascade';
import {
  ConverseOpeningRequestSchema,
  ConverseTurnRequestSchema,
  buildErrorEnvelope,
  createRequestId,
  extractSafeJsonObject,
} from '../lib/validation';

export function createConverseRouter(): Router {
  const router = Router();

  router.post('/api/converse-opening', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const parsedReq = ConverseOpeningRequestSchema.safeParse(req.body ?? {});
    if (!parsedReq.success) {
      const firstIssue =
        parsedReq.error.issues[0]?.message || 'Valid conversation scenario is required.';
      res.status(400).json(
        buildErrorEnvelope({
          code: 'INVALID_SCENARIO',
          message: firstIssue,
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const { scenario, pace, studentProfile, avoidOpenings } = parsedReq.data;
    const safePace: ConversationPace = pace;
    const typedScenario = scenario as unknown as ConversationScenario;
    const avoidList = avoidOpenings
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);

    const profileHint = studentProfile?.collegeDegree
      ? `Learner is a ${studentProfile.semester || 'college'} ${studentProfile.collegeDegree} student.`
      : 'Learner is practicing realistic conversational English.';

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cacheKey = makeCacheKey('converse-opening', {
      id: typedScenario.id,
      title: typedScenario.title,
      pace: safePace,
      nonce,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, latencyMs } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'topics',
          preferFastTier: true,
          complexityMetric: 40,
          contents: `Persona: ${typedScenario.personaName} (${typedScenario.personaRole})
Scenario: ${typedScenario.title} — ${typedScenario.settingBrief}
Pace: ${safePace}
${profileHint}
Fresh Variation Seed: ${nonce}
Previously used openings to STRICTLY AVOID repeating or paraphrasing closely:
${avoidList.length > 0 ? avoidList.map((o, i) => `${i + 1}. "${o}"`).join('\n') : '(none yet)'}`,
          systemInstruction:
            'You are opening a brand-new live text conversation in character as the persona. Craft ONE fresh, completely original, natural human opening message (1–2 sentences, 16–42 words) with a fresh angle/hook and ONE engaging opening question so every practice session starts differently. Never say "As an AI", never repeat or closely paraphrase any avoided opening. Also return 3 crisp 4–9 word replySparks tailored specifically to this new opening line.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              openingLine: { type: Type.STRING },
              initialSparks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['openingLine', 'initialSparks'],
          },
        });

      const openingLine = String(parsed.openingLine ?? '').trim();
      const sparks = Array.isArray(parsed.initialSparks)
        ? parsed.initialSparks
            .map((s) => String(s ?? '').trim())
            .filter((s) => s.length >= 4 && s.length <= 80)
            .slice(0, 3)
        : [];

      if (openingLine.length < 12) {
        throw new Error('Opening line too short');
      }

      res.json({
        ok: true,
        openingLine,
        initialSparks:
          sparks.length >= 2 ? sparks : typedScenario.initialSparks.slice(0, 3),
        modelUsed,
        thinkingLevelUsed,
        source: 'ai',
        meta: { requestId, modelUsed, latencyMs },
      });
    } catch {
      const localFresh = pickFreshOpeningLine({
        scenario: typedScenario,
        studentProfile: studentProfile as unknown as Parameters<typeof pickFreshOpeningLine>[0]['studentProfile'],
        avoidOpenings: avoidList,
      });
      res.json({
        ok: true,
        openingLine: localFresh.openingLine,
        initialSparks: localFresh.initialSparks,
        modelUsed: 'local-rotation',
        source: 'local-rotation',
        meta: {
          requestId,
          modelUsed: 'local-rotation',
          latencyMs: Math.max(1, Date.now() - startedAt),
        },
      });
    }
  });

  router.post('/api/converse', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const parsedReq = ConverseTurnRequestSchema.safeParse(req.body ?? {});

    if (!parsedReq.success) {
      const msg =
        parsedReq.error.issues[0]?.message ||
        'Valid conversation scenario and message are required.';
      res.status(400).json(
        buildErrorEnvelope({
          code: 'INVALID_CONVERSE_INPUT',
          message: msg,
          requestId,
          startedAtMs: startedAt,
        })
      );
      return;
    }

    const {
      scenario,
      pace: safePace,
      history: rawHistory,
      latestUserMessage: cleanUserMsg,
      studentProfile,
      practicingVocab,
      customCoachPrompt,
      coachPresets,
    } = parsedReq.data;

    const typedScenario = scenario as unknown as ConversationScenario;
    const vocabList = practicingVocab.slice(0, 10).map(String);

    const sdkHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const item of rawHistory.slice(-16)) {
      if (!item || typeof item !== 'object') continue;
      const text = String((item as Record<string, unknown>).text ?? '').trim();
      if (!text) continue;
      const role =
        (item as Record<string, unknown>).role === 'user' ? 'user' : 'model';
      if (sdkHistory.length === 0 && role === 'model') {
        sdkHistory.push({
          role: 'user',
          parts: [{ text: `(Joined live conversation: ${typedScenario.title})` }],
        });
      }
      if (sdkHistory.length > 0 && sdkHistory[sdkHistory.length - 1].role === role) {
        sdkHistory[sdkHistory.length - 1].parts[0].text += `\n${text}`;
      } else {
        sdkHistory.push({ role, parts: [{ text }] });
      }
    }
    if (sdkHistory.length > 0 && sdkHistory[sdkHistory.length - 1].role === 'user') {
      sdkHistory.pop();
    }

    const turnCount =
      rawHistory.filter((h: Record<string, unknown>) => h?.role === 'user').length + 1;

    const baseInstruction = buildConversationSystemInstruction({
      scenario: typedScenario,
      pace: safePace,
      studentProfile: studentProfile as Parameters<
        typeof buildConversationSystemInstruction
      >[0]['studentProfile'],
      practicingVocab: vocabList,
    });

    const fencedPreferences = buildFencedCoachPreferences({
      customCoachPrompt,
      coachPresets: coachPresets as CoachPresetId[] | undefined,
    });

    const systemInstruction = fencedPreferences
      ? `${baseInstruction}\n\n${fencedPreferences}`
      : baseInstruction;

    const routePlan = selectConversationTurnRoute({
      pace: safePace,
      turnCount,
      cooldownUntil: modelCooldownUntil,
      unsupportedUntil: modelUnsupportedUntil,
    });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
        hasRecast: { type: Type.BOOLEAN },
        gentleRecast: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING },
            naturalVersion: { type: Type.STRING },
            tip: { type: Type.STRING },
          },
          required: ['original', 'naturalVersion', 'tip'],
        },
        inTimeAnalysis: {
          type: Type.OBJECT,
          properties: {
            contextAlignment: { type: Type.INTEGER },
            toneMatch: { type: Type.INTEGER },
            grammarAccuracy: { type: Type.INTEGER },
            naturalness: { type: Type.INTEGER },
            vocabQuality: { type: Type.INTEGER },
            turnNote: { type: Type.STRING },
          },
          required: [
            'contextAlignment',
            'toneMatch',
            'grammarAccuracy',
            'naturalness',
            'vocabQuality',
            'turnNote',
          ],
        },
        replySparks: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['reply', 'hasRecast', 'inTimeAnalysis', 'replySparks'],
    };

    try {
      const ai = getAiClient();
      const failedModelsThisRequest = new Set<ActiveEvalModel>();
      let lastErr: unknown;

      for (let i = 0; i < routePlan.cascade.length; i += 1) {
        const step = routePlan.cascade[i];
        const now = Date.now();

        if (
          failedModelsThisRequest.has(step.model) ||
          modelUnsupportedUntil[step.model] > now
        ) {
          continue;
        }

        const stepTimeoutMs = getModelStepTimeoutMs(
          step.model,
          step.thinkingLabel,
          'converse'
        );
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
          const config = buildModelRequestConfig({
            model: step.model,
            thinkingLabel: step.thinkingLabel,
            systemInstruction,
            responseSchema,
            includeSeed: false,
          });

          const chat = ai.chats.create({
            model: step.model,
            history: sdkHistory,
            config,
          });

          const response = await Promise.race([
            chat.sendMessage({ message: cleanUserMsg }),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(
                  new Error(
                    `STEP_TIMEOUT: ${step.model} (${step.thinkingLabel}) exceeded ${stepTimeoutMs}ms`
                  )
                );
              }, stepTimeoutMs);
            }),
          ]);
          if (timeoutHandle) clearTimeout(timeoutHandle);

          const rawText = (response.text ?? '').trim();
          if (!rawText) {
            throw new Error(`Empty conversation reply from ${step.model}`);
          }

          const parsed = extractSafeJsonObject(rawText);
          const sanitized = sanitizeConversationTurnResponse(parsed, cleanUserMsg);
          recordModelSuccess(step.model, i > 0);
          const latencyMs = Math.max(1, Date.now() - startedAt);

          res.json({
            ok: true,
            reply: sanitized.reply,
            recast: sanitized.recast,
            inTimeAnalysis: sanitized.inTimeAnalysis,
            replySparks: sanitized.replySparks,
            modelUsed: step.model,
            thinkingLevelUsed: step.thinkingLabel,
            tierLabel: step.tierLabel,
            latencyMs,
            meta: { requestId, modelUsed: step.model, latencyMs },
          });
          return;
        } catch (err) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          lastErr = err;
          recordModelFailure(step.model, err);
          failedModelsThisRequest.add(step.model);
        }
      }

      throw lastErr || new Error('Conversation partner temporarily busy.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const userMsg = msg.includes('GEMINI_API_KEY')
        ? msg
        : 'Conversation partner is briefly unavailable. Please try again.';
      res.status(503).json(
        buildErrorEnvelope({
          code: 'CONVERSE_UNAVAILABLE',
          message: userMsg,
          retryable: true,
          requestId,
          startedAtMs: startedAt,
        })
      );
    }
  });

  return router;
}

import { Router } from 'express';
import { Type } from '@google/genai';
import {
  extractSentenceSkeletonClues,
  findBestTopicSkeletonPassage,
  getInitialSkeletonClues,
  isCustomUserTopic,
  type SkeletonPassage,
} from '../../src/utils/skeletonDrill';
import {
  executeCascadingJsonCall,
  makeCacheKey,
} from '../lib/geminiCascade';
import {
  SkeletonPassageRequestSchema,
  createRequestId,
} from '../lib/validation';

export function createDrillsRouter(): Router {
  const router = Router();

  /**
   * POST /api/skeleton-passage
   * Generates a crisp 3–4 sentence Benjamin Franklin master passage adapted to the user's
   * active topic & writing mode, plus 1 concise structural keyword clue per sentence (max 4 words)
   * and 3 signature verb/cadence moves.
   * Preserves PSR-10 Flash Lite-first 5-generation cascade (15s timeout) with topic-matched offline fallback.
   */
  router.post('/api/skeleton-passage', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const parsedReq = SkeletonPassageRequestSchema.safeParse(req.body ?? {});

    const mode = parsedReq.success ? parsedReq.data.mode : 'technical';
    const rawTopic = parsedReq.success ? parsedReq.data.topic : '';
    const focusTheme = parsedReq.success ? parsedReq.data.focusTheme : '';
    const domainFilter = parsedReq.success ? parsedReq.data.domain : 'all';
    const excludeIds = parsedReq.success ? parsedReq.data.excludeIds : [];
    const studentProfile = parsedReq.success ? parsedReq.data.studentProfile : undefined;

    const activeTopic = (rawTopic || focusTheme || '').trim();
    const hasTopic = isCustomUserTopic(activeTopic);

    const studentDescriptor =
      studentProfile && typeof studentProfile.collegeDegree === 'string'
        ? `${String(studentProfile.semester || 'college')} ${studentProfile.collegeDegree} student`
        : 'Electronics & Instrumentation Engineering student practicing crisp spoken English';

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cacheKey = makeCacheKey('skeleton-passage-v2', {
      mode,
      domainFilter,
      activeTopic,
      nonce,
    });

    try {
      const { parsed, modelUsed, thinkingLevelUsed, downgraded, latencyMs } =
        await executeCascadingJsonCall({
          cacheKey,
          allowCache: false,
          task: 'topics',
          preferFastTier: true,
          overrideTimeoutMs: 15_000,
          complexityMetric: 45,
          contents: `Generate ONE Benjamin Franklin Skeleton Reconstruction master passage for a ${studentDescriptor}.
Mode: ${mode}
Style lens: ${domainFilter === 'all' ? mode : domainFilter}
${
  hasTopic
    ? `Required Topic (write the passage DIRECTLY about this exact subject): "${activeTopic}"`
    : `Focus theme: ${focusTheme || 'real-world engineering clarity, builder reflection, or vivid storytelling'}`
}
Seed: ${nonce}`,
          systemInstruction:
            'Craft ONE masterfully written 3 to 4 sentence English passage (42–68 words total) with crisp active verbs, natural spoken rhythm, concrete detail, and a punchy closing beat. If a Required Topic is given, the passage MUST explain or illuminate that exact topic concretely. Also return: title (4–8 words), sentenceClues (EXACTLY 1 structural keyword hint per sentence in order, each 2–4 words max, capturing the core causal/structural beat of that sentence without copying full clauses), and signatureMoves (3 memorable active verb/cadence phrases verbatim from the passage). Zero thesaurus-slop, zero em-dashes.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              text: { type: Type.STRING },
              sentenceClues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              signatureMoves: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['title', 'text', 'sentenceClues', 'signatureMoves'],
          },
        });

      const title = String(parsed.title || '').trim();
      const text = String(parsed.text || '').trim();
      const rawSentenceClues = Array.isArray(parsed.sentenceClues)
        ? parsed.sentenceClues
            .slice(0, 4)
            .map((c) =>
              String(c || '')
                .trim()
                .replace(/[,;•·]+/g, ' ')
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 4)
                .join(' ')
            )
            .filter(Boolean)
        : [];
      const signatureMoves = Array.isArray(parsed.signatureMoves)
        ? parsed.signatureMoves.slice(0, 3).map(String).filter(Boolean)
        : [];

      if (text.split(/\s+/).length < 25) {
        throw new Error('Generated skeleton passage too brief');
      }

      const sentenceClues =
        rawSentenceClues.length >= 2
          ? rawSentenceClues
          : extractSentenceSkeletonClues(text, 4);

      const resolvedDomain: SkeletonPassage['domain'] =
        domainFilter !== 'all'
          ? domainFilter
          : mode === 'linkedin'
            ? 'linkedin'
            : mode === 'email'
              ? 'email'
              : mode === 'creative'
                ? 'creative'
                : 'technical';

      const passage: SkeletonPassage = {
        id: `skel-ai-${requestId}`,
        title: title || (hasTopic ? activeTopic.slice(0, 64) : 'Master Cadence Passage'),
        domain: resolvedDomain,
        mode,
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        sentenceClues,
        signatureMoves,
        adaptedToTopic: hasTopic ? activeTopic : undefined,
      };

      res.json({
        ok: true,
        passage,
        suggestedClues: sentenceClues,
        sentenceClues,
        adaptedToTopic: hasTopic ? activeTopic : undefined,
        source: 'ai',
        modelUsed,
        thinkingLevelUsed,
        downgraded,
        meta: {
          requestId,
          modelUsed,
          latencyMs,
        },
      });
    } catch {
      const { passage: fallback, topicMatched } = findBestTopicSkeletonPassage({
        topic: activeTopic,
        mode,
        completedIds: excludeIds,
        domainFilter,
      });
      const sentenceClues = getInitialSkeletonClues(fallback);

      res.json({
        ok: true,
        passage: {
          ...fallback,
          sentenceClues,
        },
        suggestedClues: sentenceClues,
        sentenceClues,
        adaptedToTopic: topicMatched ? activeTopic : undefined,
        source: 'curated-bank',
        modelUsed: 'curated-skeleton-bank',
        thinkingLevelUsed: 'LOCAL',
        downgraded: true,
        meta: {
          requestId,
          modelUsed: 'curated-skeleton-bank',
          latencyMs: Math.max(1, Date.now() - startedAt),
        },
      });
    }
  });

  return router;
}

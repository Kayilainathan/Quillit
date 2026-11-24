import { Router } from 'express';
import { Type } from '@google/genai';
import {
  pickOfflineSkeletonPassage,
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
   * Generates a crisp 4-sentence master passage + 4-word skeleton clues + rhetorical moves
   * using the Flash Lite-first 5-generation cascade (15s timeout) with 12-passage offline bank fallback.
   */
  router.post('/api/skeleton-passage', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const parsedReq = SkeletonPassageRequestSchema.safeParse(req.body ?? {});

    const mode = parsedReq.success ? parsedReq.data.mode : 'technical';
    const focusTheme = parsedReq.success ? parsedReq.data.focusTheme : '';
    const excludeIds = parsedReq.success ? parsedReq.data.excludeIds : [];
    const studentProfile = parsedReq.success ? parsedReq.data.studentProfile : undefined;

    const studentDescriptor =
      studentProfile && typeof studentProfile.collegeDegree === 'string'
        ? `${String(studentProfile.semester || 'college')} ${studentProfile.collegeDegree} student`
        : 'Electronics & Instrumentation Engineering student practicing crisp spoken English';

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cacheKey = makeCacheKey('skeleton-passage-v1', {
      mode,
      focusTheme,
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
Focus theme: ${focusTheme || 'real-world engineering clarity, builder reflection, or vivid storytelling'}
Seed: ${nonce}`,
          systemInstruction:
            'Craft ONE masterfully written 4-sentence English passage (42–65 words total) with crisp active verbs, natural spoken rhythm, and a punchy closing beat. Also return: title (4–8 words), suggestedClues (exactly 4 clues, each <= 4 words, capturing the structural spine without giving away verbatim phrasing), and signatureMoves (3 memorable verb phrases from the passage). Zero thesaurus-slop, zero em-dashes.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              text: { type: Type.STRING },
              suggestedClues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              signatureMoves: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['title', 'text', 'suggestedClues', 'signatureMoves'],
          },
        });

      const title = String(parsed.title || '').trim();
      const text = String(parsed.text || '').trim();
      const suggestedClues = Array.isArray(parsed.suggestedClues)
        ? parsed.suggestedClues
            .slice(0, 4)
            .map((c) =>
              String(c || '')
                .trim()
                .split(/\s+/)
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

      const domain: SkeletonPassage['domain'] =
        mode === 'linkedin'
          ? 'linkedin'
          : mode === 'email'
            ? 'email'
            : mode === 'creative'
              ? 'creative'
              : 'technical';

      const passage: SkeletonPassage = {
        id: `skel-ai-${requestId}`,
        title: title || 'Master Cadence Passage',
        domain,
        mode,
        text,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        signatureMoves,
      };

      res.json({
        ok: true,
        passage,
        suggestedClues,
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
      const fallback = pickOfflineSkeletonPassage(mode, excludeIds);
      const sentences = fallback.text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const autoClues = sentences.slice(0, 4).map((s) =>
        s
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 4)
          .join(' ')
      );

      res.json({
        ok: true,
        passage: fallback,
        suggestedClues: autoClues,
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

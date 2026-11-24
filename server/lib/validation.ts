import crypto from 'crypto';
import { z } from 'zod';

export interface StructuredErrorBody {
  ok: false;
  data: null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  meta: {
    requestId: string;
    modelUsed?: string;
    latencyMs: number;
  };
}

export function createRequestId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function buildErrorEnvelope(params: {
  code: string;
  message: string;
  retryable?: boolean;
  requestId: string;
  startedAtMs: number;
  modelUsed?: string;
}): StructuredErrorBody & { errorMessage: string } {
  return {
    ok: false,
    data: null,
    error: {
      code: params.code,
      message: params.message,
      retryable: Boolean(params.retryable),
    },
    // Backwards compatibility for legacy callers reading `res.error` string or `errorMessage`
    errorMessage: params.message,
    meta: {
      requestId: params.requestId,
      modelUsed: params.modelUsed,
      latencyMs: Math.max(1, Date.now() - params.startedAtMs),
    },
  };
}

/**
 * Safely extracts a JSON object from Gemini output even if wrapped in markdown fences
 * or preceded by stray whitespace.
 */
export function extractSafeJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Empty JSON response payload');
  }

  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    // Fall through to fenced/brace extraction
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    const parsed = JSON.parse(fenceMatch[1].trim());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(sliced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error('Malformed JSON object in model output');
}

export const CoachPresetIdSchema = z.enum([
  'brutally-honest',
  'technical-interview-clarity',
  'ban-corporate-slop',
  'flag-literal-translations',
  'short-punchy-sentences',
]);

export const AudienceOptionSchema = z.enum([
  'Interviewer',
  'Hiring Manager',
  'Professor',
  'LinkedIn Reader',
  'Friend',
]);

export const DrillTypeSchema = z.enum([
  'standard',
  'compression-432',
  'skeleton',
  'three-rooms',
  'time-capsule',
]);

export const DrillContextSchema = z
  .object({
    drillType: DrillTypeSchema.optional(),
    drillPayload: z
      .object({
        rounds: z.array(z.string().max(4000)).max(3).optional(),
        roundWordCounts: z.tuple([z.number(), z.number(), z.number()]).optional(),
        masterPassage: z.string().max(2000).optional(),
        skeletonTitle: z.string().max(200).optional(),
        skeletonClues: z.array(z.string().max(80)).max(6).optional(),
        roomA: z.string().max(3000).optional(),
        roomB: z.string().max(3000).optional(),
        constraintLabel: z.string().max(180).optional(),
        constraintRule: z.string().max(260).optional(),
        constraintPassed: z.boolean().optional(),
        constraintViolations: z.number().int().min(0).max(500).optional(),
        constraintAdherenceScore: z.number().int().min(0).max(100).optional(),
        constraintExcerpts: z.array(z.string().max(120)).max(6).optional(),
        pastDraft: z.string().max(6000).optional(),
        pastScore: z.number().min(0).max(60).optional(),
        pastDate: z.string().max(32).optional(),
        noBackspaceUsed: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export const EvaluateRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(20, 'Please write at least 20 characters before requesting an evaluation.')
    .max(20000, 'Draft exceeds maximum evaluation length (20,000 characters).'),
  mode: z.string().max(80).optional().default('Personal Journal'),
  tone: z.string().max(80).optional().default('Professional-Warm'),
  topic: z.string().max(260).optional().default(''),
  needsAutoTitle: z.boolean().optional().default(false),
  previousSessionSummary: z.string().max(1500).optional().default(''),
  practicingVocab: z.array(z.string().max(120)).max(24).optional().default([]),
  topicPrimer: z.string().max(1000).optional().default(''),
  studentProfile: z.record(z.string(), z.unknown()).optional(),
  conversationContext: z.record(z.string(), z.unknown()).optional(),
  audience: AudienceOptionSchema.optional(),
  customCoachPrompt: z.string().max(500).optional(),
  coachPresets: z.array(CoachPresetIdSchema).max(8).optional(),
  drillContext: DrillContextSchema,
});

export const RealtimeAssistRequestSchema = z.object({
  content: z
    .string()
    .trim()
    .min(15, 'Write at least a sentence before running live vocabulary & grammar assist.')
    .max(12000),
  mode: z.string().max(80).optional().default('Personal Journal'),
  tone: z.string().max(80).optional().default('Professional-Warm'),
});

export const SkeletonPassageRequestSchema = z.object({
  mode: z
    .enum(['journal', 'linkedin', 'email', 'friend', 'technical', 'creative'])
    .optional()
    .default('technical'),
  focusTheme: z.string().max(180).optional().default(''),
  excludeIds: z.array(z.string().max(64)).max(30).optional().default([]),
  studentProfile: z.record(z.string(), z.unknown()).optional(),
});

export const ConverseTurnRequestSchema = z.object({
  scenario: z.object({
    id: z.string(),
    title: z.string(),
    personaName: z.string(),
    personaRole: z.string().optional().default('Conversation Partner'),
    settingBrief: z.string().optional().default(''),
    mode: z.string().optional().default('technical'),
    tone: z.string().optional().default('conversational'),
    openingLine: z.string().optional().default(''),
    initialSparks: z.array(z.string()).optional().default([]),
    subtitle: z.string().optional().default(''),
    personaInitials: z.string().optional().default('AI'),
  }),
  pace: z.enum(['relaxed', 'natural', 'challenging']).optional().default('natural'),
  history: z.array(z.record(z.string(), z.unknown())).max(60).optional().default([]),
  latestUserMessage: z
    .string()
    .trim()
    .min(1, 'Please enter a message between 1 and 2000 characters.')
    .max(2000, 'Please enter a message between 1 and 2000 characters.'),
  studentProfile: z.record(z.string(), z.unknown()).optional(),
  practicingVocab: z.array(z.string().max(120)).max(16).optional().default([]),
  customCoachPrompt: z.string().max(500).optional(),
  coachPresets: z.array(CoachPresetIdSchema).max(8).optional(),
});

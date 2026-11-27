import type { InternationalMetrics, RubricScores } from '../types';
import { analyzeWritingSample } from './textAnalysis';

export type EieReadinessBand =
  | 'Panel Ready'
  | 'Competitive'
  | 'Calibrating'
  | 'Early Draft';

export interface EieEvaluationMetrics {
  /** Core placement technical & HR interview delivery readiness (0-100) */
  placementPanelScore: number;
  /** Systems cause-and-effect rigor, concise framing & signal strength (0-100) */
  technicalClarityScore: number;
  readinessBand: EieReadinessBand;
  /** Highest-leverage single action for an EIE 6th-semester writer */
  focusLever: string;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Derives practical EIE 6th-semester engineering evaluation metrics on top of
 * the saved 6-pillar RubricScores: live placement panel readiness and
 * systems technical clarity.
 */
export function deriveEieEvaluationMetrics(params: {
  scores: RubricScores;
  content: string;
  modeLabel?: string;
  spokenReadinessScore?: number;
  signalNoiseRatio?: number;
  internationalMetrics?: InternationalMetrics;
}): EieEvaluationMetrics {
  const { scores, content, spokenReadinessScore, signalNoiseRatio } = params;

  const trimmed = content.trim();
  const sampleAnalysis = trimmed
    ? analyzeWritingSample({ text: trimmed, vocabulary: [] })
    : null;

  // 1. Placement & Panel Readiness: weighted toward natural spoken flow, tone, and structure
  const flowComponent =
    typeof spokenReadinessScore === 'number'
      ? spokenReadinessScore
      : ((scores.naturalVoiceFlow + scores.claritySimplicity) / 20) * 100;

  const panelRaw =
    flowComponent * 0.48 +
    ((scores.sentenceVarietyCadence + scores.toneEngagement) / 20) * 100 * 0.32 +
    (scores.concisenessDirectness / 10) * 100 * 0.2;

  // 2. Technical Clarity & Signal: clarity + directness + mechanics precision + signal/noise ratio
  const snrComponent =
    typeof signalNoiseRatio === 'number'
      ? signalNoiseRatio
      : sampleAnalysis
        ? sampleAnalysis.scores.clarity
        : (scores.concisenessDirectness / 10) * 100;

  const techClarityRaw =
    ((scores.claritySimplicity * 0.38 +
      scores.concisenessDirectness * 0.34 +
      scores.grammarMechanics * 0.28) /
      10) *
      100 *
      0.68 +
    snrComponent * 0.32;

  const placementPanelScore = clampPct(panelRaw);
  const technicalClarityScore = clampPct(techClarityRaw);

  const avg = Math.round((placementPanelScore + technicalClarityScore) / 2);

  const readinessBand: EieReadinessBand =
    avg >= 82
      ? 'Panel Ready'
      : avg >= 68
        ? 'Competitive'
        : avg >= 52
          ? 'Calibrating'
          : 'Early Draft';

  let focusLever =
    'Hold this structure and anchor every claim with one measured bench number.';
  if (technicalClarityScore <= placementPanelScore && technicalClarityScore < 85) {
    focusLever =
      'Lead with cause, constraint, and measured result — tighten mechanics and cut filler clauses.';
  } else if (placementPanelScore < 85) {
    focusLever =
      'Deliver the core answer in the opening 2 lines as if speaking directly to a live interview panel.';
  }

  return {
    placementPanelScore,
    technicalClarityScore,
    readinessBand,
    focusLever,
  };
}

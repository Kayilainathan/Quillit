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
  /** Lab manual, IEEE abstract & professional email precision (0-100) */
  ieeeDocPolishScore: number;
  readinessBand: EieReadinessBand;
  /** Highest-leverage single action for an EIE 6th-semester writer */
  focusLever: string;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Derives practical EIE 6th-semester engineering evaluation metrics on top of
 * the saved 6-pillar RubricScores so Firestore documents stay 100% compatible
 * while surfacing actionable placement, technical clarity, and IEEE documentation signals.
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

  // 1. Placement & Panel Readiness: weighted toward natural spoken flow, clarity, and structure
  const flowComponent =
    typeof spokenReadinessScore === 'number'
      ? spokenReadinessScore
      : ((scores.naturalVoiceFlow + scores.claritySimplicity) / 20) * 100;

  const panelRaw =
    flowComponent * 0.48 +
    ((scores.sentenceVarietyCadence + scores.toneEngagement) / 20) * 100 * 0.32 +
    (scores.concisenessDirectness / 10) * 100 * 0.2;

  // 2. Technical Clarity & Signal: clarity + directness + measured signal/noise ratio
  const snrComponent =
    typeof signalNoiseRatio === 'number'
      ? signalNoiseRatio
      : sampleAnalysis
        ? sampleAnalysis.scores.clarity
        : (scores.concisenessDirectness / 10) * 100;

  const techClarityRaw =
    ((scores.claritySimplicity * 0.42 +
      scores.concisenessDirectness * 0.38 +
      scores.sentenceVarietyCadence * 0.2) /
      10) *
      100 *
      0.65 +
    snrComponent * 0.35;

  // 3. IEEE & Lab Doc Polish: grammar mechanics + tone precision + EIE mechanics
  const grammarComponent = sampleAnalysis
    ? sampleAnalysis.scores.grammar
    : (scores.grammarMechanics / 10) * 100;

  const docPolishRaw =
    (scores.grammarMechanics / 10) * 100 * 0.52 +
    (scores.toneEngagement / 10) * 100 * 0.28 +
    grammarComponent * 0.2;

  const placementPanelScore = clampPct(panelRaw);
  const technicalClarityScore = clampPct(techClarityRaw);
  const ieeeDocPolishScore = clampPct(docPolishRaw);

  const avg = Math.round(
    (placementPanelScore + technicalClarityScore + ieeeDocPolishScore) / 3
  );

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
  if (
    technicalClarityScore <= placementPanelScore &&
    technicalClarityScore <= ieeeDocPolishScore &&
    technicalClarityScore < 85
  ) {
    focusLever =
      'Lead with cause, constraint, and measured result — trim filler clauses.';
  } else if (
    ieeeDocPolishScore <= placementPanelScore &&
    ieeeDocPolishScore <= technicalClarityScore &&
    ieeeDocPolishScore < 85
  ) {
    focusLever =
      'Verify SI unit spacing (e.g. 5 V, 20 mA), tense consistency, and tight mechanics.';
  } else if (placementPanelScore < 85) {
    focusLever =
      'Deliver the core answer in the opening 2 lines as if facing a live panel.';
  }

  return {
    placementPanelScore,
    technicalClarityScore,
    ieeeDocPolishScore,
    readinessBand,
    focusLever,
  };
}

import type { WritingMode } from '../types';

export interface SkeletonPassage {
  id: string;
  title: string;
  domain: 'technical' | 'linkedin' | 'creative' | 'email';
  mode: WritingMode;
  text: string;
  wordCount: number;
  /** Key strong verbs / cadence anchors highlighted in Side-by-Side Diff */
  signatureMoves: string[];
}

/**
 * Curated 12-passage high-craft bank for zero-latency offline Skeleton Reconstruction
 * across EIE/Technical Explanations, LinkedIn Builder Reflections, Crisp Emails, and Vivid Stories.
 */
export const SKELETON_PASSAGE_BANK: SkeletonPassage[] = [
  {
    id: 'skel-tech-01',
    title: 'Why 4–20 mA Survives Noisy Factory Floors',
    domain: 'technical',
    mode: 'technical',
    text: 'Long copper runs steal voltage from weak sensor signals. Push a steady current instead, and wire resistance stops rewriting your measurement. Even better, starting at four milliamps creates a live zero: zero milliamps immediately screams broken wire instead of an empty tank.',
    wordCount: 44,
    signatureMoves: ['steal voltage', 'stops rewriting', 'immediately screams'],
  },
  {
    id: 'skel-tech-02',
    title: 'How PID Control Stops Overshoot',
    domain: 'technical',
    mode: 'technical',
    text: 'Proportional gain pushes hard when error is wide, yet it always stops short of the setpoint. Integral action remembers stubborn drift and closes the remaining gap. Derivative action spots how fast you are approaching and taps the brakes before the system swings past target.',
    wordCount: 45,
    signatureMoves: ['pushes hard', 'remembers stubborn drift', 'taps the brakes'],
  },
  {
    id: 'skel-tech-03',
    title: 'Why Op-Amp Buffers Protect Weak Sensors',
    domain: 'technical',
    mode: 'technical',
    text: 'A raw transducer can generate clean voltage, yet collapse the moment an ADC draws current from it. Place a unity-gain op-amp buffer between them. Its huge input impedance barely sips current from the sensor while its stiff output drives the converter cleanly.',
    wordCount: 43,
    signatureMoves: ['collapse the moment', 'barely sips current', 'stiff output drives'],
  },
  {
    id: 'skel-tech-04',
    title: 'Sampling Rate Without Aliasing',
    domain: 'technical',
    mode: 'technical',
    text: 'Sample a fast wave too slowly and your ADC invents phantom low-frequency ripples that never existed in hardware. Nyquist sets the floor at twice the highest signal frequency. In real labs, engineers filter first and sample five to ten times faster so waveforms stay faithful.',
    wordCount: 46,
    signatureMoves: ['invents phantom', 'sets the floor', 'waveforms stay faithful'],
  },
  {
    id: 'skel-li-01',
    title: 'The Ground Loop That Cost Three Hours',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'Our sensor trace looked haunted until we stopped blaming the code. Two breadboards shared power through different ground paths, turning a simple jumper wire into a 50 Hz antenna. One star-ground connection flattened the noise floor in ten seconds. Hardware bugs love hiding behind software assumptions.',
    wordCount: 47,
    signatureMoves: ['looked haunted', 'flattened the noise floor', 'hiding behind software assumptions'],
  },
  {
    id: 'skel-li-02',
    title: 'Why Boring Documentation Wins Teams',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'Nobody applauds a clean pinout diagram at midnight, until a teammate has to swap a fried regulator ten minutes before a demo. Clear notes turn frantic guesswork into calm execution. Good engineering is rarely about looking clever; it is about making the next hour effortless for whoever touches the bench.',
    wordCount: 51,
    signatureMoves: ['applauds a clean pinout', 'calm execution', 'making the next hour effortless'],
  },
  {
    id: 'skel-li-03',
    title: 'What Failed Benchmarks Actually Teach',
    domain: 'linkedin',
    mode: 'linkedin',
    text: 'My first prototype hit every textbook equation and failed on the real bench. Ambient heat drifted the bridge resistor faster than my calibration loop could react. Measuring real failure taught me more in one afternoon than three clean simulations ever did.',
    wordCount: 41,
    signatureMoves: ['hit every textbook equation', 'drifted the bridge', 'taught me more'],
  },
  {
    id: 'skel-email-01',
    title: 'Asking a Senior Engineer for 15 Minutes',
    domain: 'email',
    mode: 'email',
    text: 'I read your write-up on analog front-end layout and applied your guard-ring trick to our capstone RTD board. Noise dropped by half, though our cold-junction compensation still drifts after warm-up. Could I borrow fifteen minutes Thursday or Friday afternoon to walk you through one schematic page?',
    wordCount: 47,
    signatureMoves: ['applied your guard-ring trick', 'dropped by half', 'borrow fifteen minutes'],
  },
  {
    id: 'skel-email-02',
    title: 'Owning a Demo Delay Cleanly',
    domain: 'email',
    mode: 'email',
    text: 'Our PCB demo will move from Wednesday to Friday at 4 PM. Yesterday’s bench test exposed a thermal shutdown on the buck converter under peak load. I have ordered the higher-rated regulator and already verified the firmware on the backup supply so Friday stays locked.',
    wordCount: 45,
    signatureMoves: ['exposed a thermal shutdown', 'already verified', 'Friday stays locked'],
  },
  {
    id: 'skel-story-01',
    title: 'The Quiet Before the Monsoon',
    domain: 'creative',
    mode: 'creative',
    text: 'Heat clung to the tin roof long after sunset. Down the lane, a vendor snapped his wooden shutters closed one by one, racing the first smell of wet dust. Then the wind shifted, cool and sudden, lifting stray paper across the dark courtyard.',
    wordCount: 43,
    signatureMoves: ['Heat clung', 'snapped his wooden shutters', 'lifting stray paper'],
  },
  {
    id: 'skel-story-02',
    title: 'Last Train Out of the Brass Station',
    domain: 'creative',
    mode: 'creative',
    text: 'Steam hissed beneath the iron carriages as the station clock clicked toward eleven. Maya held the folded telegram against her coat, afraid the ink might smudge before she spoke. When the guard raised his brass lantern, she stepped aboard without looking back.',
    wordCount: 42,
    signatureMoves: ['Steam hissed', 'clicked toward eleven', 'stepped aboard without looking back'],
  },
  {
    id: 'skel-story-03',
    title: 'Workshop at Two in the Morning',
    domain: 'creative',
    mode: 'creative',
    text: 'Rosin smoke drifted past the desk lamp in thin silver curls. Outside, rain tapped steadily on the hostel window while the oscilloscope traced a clean green line at last. He leaned back, exhaled slowly, and switched the soldering iron off.',
    wordCount: 40,
    signatureMoves: ['thin silver curls', 'rain tapped steadily', 'switched the soldering iron off'],
  },
];

/**
 * Parses a comma/newline-separated clue input into up to 4 crisp skeleton clues
 * (max 4 words each) for memory-based structural reconstruction.
 */
export function parseSkeletonClues(rawInput: string): string[] {
  if (!rawInput || !rawInput.trim()) return [];
  const rawParts = rawInput
    .split(/[\n,;•·]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return rawParts.slice(0, 4).map((part) => {
    const words = part.split(/\s+/).filter(Boolean).slice(0, 4);
    return words.join(' ');
  });
}

export function validateSkeletonClues(clues: string[]): {
  valid: boolean;
  message: string;
} {
  if (clues.length === 0) {
    return {
      valid: false,
      message: 'Jot 3–4 short clues (max 4 words each) before hiding the passage.',
    };
  }
  const tooLong = clues.find((c) => c.split(/\s+/).filter(Boolean).length > 4);
  if (tooLong) {
    return {
      valid: false,
      message: `Trim "${tooLong}" to 4 words max so you rebuild from structure, not rote copying.`,
    };
  }
  return {
    valid: true,
    message: `${clues.length} structural clue${clues.length === 1 ? '' : 's'} locked.`,
  };
}

/**
 * Picks a Skeleton passage matching the user's writing mode (or rotates cleanly through the bank).
 */
export function pickOfflineSkeletonPassage(
  mode: WritingMode,
  excludeIds: string[] = []
): SkeletonPassage {
  const excluded = new Set(excludeIds);
  const matching = SKELETON_PASSAGE_BANK.filter(
    (p) => p.mode === mode && !excluded.has(p.id)
  );
  if (matching.length > 0) return matching[0];

  const anyFresh = SKELETON_PASSAGE_BANK.filter((p) => !excluded.has(p.id));
  if (anyFresh.length > 0) return anyFresh[0];

  return SKELETON_PASSAGE_BANK[0];
}

/**
 * Deterministic structural comparison between the original master passage and the user's reconstruction.
 * Rewards original wording + crisp cadence rather than verbatim memorization.
 */
export function compareSkeletonReconstruction(
  originalText: string,
  userText: string
): {
  originalWords: number;
  userWords: number;
  wordRatioPct: number;
  originalityPct: number;
  cadenceNote: string;
} {
  const tokenize = (s: string) =>
    (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);

  const origTokens = tokenize(originalText);
  const userTokens = tokenize(userText);
  const originalWords = originalText.trim().split(/\s+/).filter(Boolean).length;
  const userWords = userText.trim().split(/\s+/).filter(Boolean).length;

  const origSet = new Set(origTokens);
  let overlap = 0;
  for (const t of userTokens) {
    if (origSet.has(t)) overlap += 1;
  }
  const overlapPct =
    userTokens.length > 0 ? Math.round((overlap / userTokens.length) * 100) : 0;
  const originalityPct = Math.max(0, Math.min(100, 100 - overlapPct));
  const wordRatioPct =
    originalWords > 0 ? Math.round((userWords / originalWords) * 100) : 0;

  let cadenceNote = 'Balanced structural rebuild with your own phrasing.';
  if (userWords === 0) {
    cadenceNote = 'Reconstruct the passage from your clues to compare cadence.';
  } else if (overlapPct > 75) {
    cadenceNote =
      'Close to verbatim memory — try recasting the middle beats in your own verbs next pass.';
  } else if (wordRatioPct > 145) {
    cadenceNote =
      'Your rebuild ran longer than the model — tighten transitions to match its crisp beat.';
  } else if (wordRatioPct < 65) {
    cadenceNote =
      'Tight summary! Make sure the causal bridge in the middle stayed concrete.';
  }

  return {
    originalWords,
    userWords,
    wordRatioPct,
    originalityPct,
    cadenceNote,
  };
}

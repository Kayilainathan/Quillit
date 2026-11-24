/**
 * Subtle mechanical keycap / detent Web Audio synthesis for tactile controls.
 * Completely silent when disabled, muted, or running in non-browser/SSR contexts.
 */

let sharedAudioCtx: AudioContext | null = null;
let soundEnabled = false;

export function setTactileSoundEnabled(enabled: boolean): void {
  soundEnabled = Boolean(enabled);
}

export function isTactileSoundEnabled(): boolean {
  return soundEnabled;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Plays a crisp, ultra-short (~18ms) muted mechanical click at low gain.
 */
export function playTactileClick(
  enabledOrKind?: boolean | 'tap' | 'latch' | 'thud',
  maybeKind?: 'tap' | 'latch' | 'thud'
): void {
  let effectiveEnabled = soundEnabled;
  let kind: 'tap' | 'latch' | 'thud' = 'tap';

  if (typeof enabledOrKind === 'boolean') {
    effectiveEnabled = enabledOrKind;
    kind = maybeKind ?? 'tap';
  } else if (enabledOrKind) {
    kind = enabledOrKind;
  }

  if (!effectiveEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (kind === 'latch') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.028);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.032);
    } else if (kind === 'thud') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.045);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.052);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.016);
      gain.gain.setValueAtTime(0.022, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    }
  } catch {
    // Never throw from optional audio feedback
  }
}


export function playSearchCompleteChime(): void {
  playToneSequence([523.25, 659.25, 784], 0.11, 0.07)
}

export function playNewJobsAlert(): void {
  playToneSequence([880, 1174.66], 0.09, 0.09)
}

function playToneSequence(
  notes: number[],
  gapSec: number,
  peakGain: number,
): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const now = ctx.currentTime

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = now + i * gapSec
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.32)
    })

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined)
    }, 1200)
  } catch {

  }
}

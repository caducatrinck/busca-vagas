import type { SearchProgress, SearchProgressCallback } from '../../types.js'

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export class ProgressEmitter {
  readonly startedAt = Date.now()
  private descriptionsStartedAt: number | null = null
  private last: SearchProgress | null = null

  constructor(
    private onProgress: SearchProgressCallback | undefined,
    private fetchDescriptions: boolean,
    private pageSize: number,
  ) {}

  markDescriptionsStarted() {
    this.descriptionsStartedAt = Date.now()
  }

  private etaSeconds(
    phase: SearchProgress['phase'],
    listing: SearchProgress['listing'],
    descriptions: SearchProgress['descriptions'],
  ): number | null {
    const elapsed = Date.now() - this.startedAt
    if (elapsed < 1200) return null

    if (phase === 'listing') {
      const { current, total } = listing
      if (current < 4) return null
      const msPerJob = elapsed / current
      const remainingListing =
        total != null
          ? Math.max(0, total - current) * msPerJob
          : Math.max(this.pageSize, current * 0.25) * msPerJob
      const descExtra = this.fetchDescriptions
        ? (total ?? Math.ceil(current * 1.15)) * 380
        : 0
      return Math.max(1, Math.ceil((remainingListing + descExtra) / 1000))
    }

    if (phase === 'descriptions') {
      const { current, total } = descriptions
      if (current < 2 || total <= 0) return null
      const descElapsed = Date.now() - (this.descriptionsStartedAt ?? this.startedAt)
      const msPer = descElapsed / Math.max(current, 1)
      return Math.max(1, Math.ceil(((total - current) * msPer) / 1000))
    }

    if (phase === 'saving') return 1
    return 0
  }

  emit(
    patch: Omit<
      SearchProgress,
      'overallPercent' | 'startedAt' | 'elapsedMs' | 'etaSeconds'
    > & { overallPercent?: number },
  ) {
    if (!this.onProgress) return

    const listing = patch.listing
    const descriptions = patch.descriptions
    let overall = patch.overallPercent

    if (overall == null) {
      if (patch.phase === 'done') {
        overall = 100
      } else if (patch.phase === 'error') {
        overall = 0
      } else if (patch.phase === 'saving') {
        overall = this.fetchDescriptions ? 97 : 95
      } else if (patch.phase === 'descriptions') {
        const descRatio =
          descriptions.total > 0 ? descriptions.current / descriptions.total : 1
        overall = 48 + descRatio * 48
      } else {
        const total = listing.total
        if (total != null && total > 0) {
          const ratio = Math.min(1, listing.current / total)
          overall = ratio * (this.fetchDescriptions ? 48 : 92)
        } else {
          const soft = 1 - Math.exp(-(listing.current || 1) / 90)
          overall = soft * (this.fetchDescriptions ? 42 : 85)
        }
      }
    }

    const progress: SearchProgress = {
      phase: patch.phase,
      label: patch.label,
      message: patch.message,
      listing,
      descriptions,
      overallPercent: clampPercent(overall),
      startedAt: this.startedAt,
      elapsedMs: Date.now() - this.startedAt,
      etaSeconds: this.etaSeconds(patch.phase, listing, descriptions),
      cancelled: patch.cancelled,
    }
    this.last = progress
    this.onProgress(progress)
  }

  snapshot(): SearchProgress | null {
    return this.last
  }
}

import type { Job, JobStatus } from './types'

export function jobStatus(job: Job): JobStatus {
  if (
    job.status === 'viewed' ||
    job.status === 'applied' ||
    job.status === 'discarded'
  ) {
    return job.status
  }
  return job.applied ? 'applied' : 'viewed'
}

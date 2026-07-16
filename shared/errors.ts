import type { Job } from './domain.js'

export class SearchCancelledError extends Error {
  jobs: Job[]

  constructor(jobs: Job[] = []) {
    super('Busca cancelada')
    this.name = 'SearchCancelledError'
    this.jobs = jobs
  }
}

import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { localizeVisibleError } from '../lib/localizeVisibleError'
import { formatBadgeCount } from '../lib/notificationsModel'
import type { JobStatus } from '../lib/types'
import { Alert, Button, Field, TextInput } from '../ui'
import './SearchPanel.css'
import './JobsPanel.css'

const DELETE_JOBS_CODE = 'DELETE'

type Props = {
  subTab: JobStatus
  counts: Record<JobStatus, number>
  unreadTotal?: number
  onSubTabChange: (value: JobStatus) => void
  onRefresh: () => void
  onClearStatus: (status: 'applied' | 'discarded') => Promise<void>
  onDeleteAll: () => Promise<void>
}

const SUB_TAB_IDS: JobStatus[] = ['viewed', 'applied', 'discarded']

export function JobsPanel({
  subTab,
  counts,
  unreadTotal = 0,
  onSubTabChange,
  onRefresh,
  onClearStatus,
  onDeleteAll,
}: Props) {
  const { t } = useI18n()
  const [clearing, setClearing] = useState<'applied' | 'discarded' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const notifBadge = formatBadgeCount(unreadTotal)
  const totalJobs = useMemo(
    () => counts.viewed + counts.applied + counts.discarded,
    [counts],
  )

  const subTabLabel = (id: JobStatus) =>
    id === 'viewed'
      ? t('jobs.pending')
      : id === 'applied'
        ? t('jobs.applied')
        : t('jobs.discarded')

  async function handleClear(status: 'applied' | 'discarded') {
    const count = counts[status]
    if (count <= 0) return

    const label =
      status === 'applied' ? t('jobs.labelApplied') : t('jobs.labelDiscarded')
    const ok = window.confirm(
      t('jobs.clearConfirm', { n: count, label }),
    )
    if (!ok) return

    setClearing(status)
    try {
      await onClearStatus(status)
    } finally {
      setClearing(null)
    }
  }

  function openDeleteModal() {
    setConfirmDelete(true)
    setDeleteCode('')
    setDeleteError(null)
  }

  function closeDeleteModal() {
    if (deleting) return
    setConfirmDelete(false)
    setDeleteCode('')
    setDeleteError(null)
  }

  async function handleDeleteAll() {
    if (deleteCode !== DELETE_JOBS_CODE) {
      setDeleteError(t('jobs.deleteAllMismatch'))
      return
    }
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteAll()
      setConfirmDelete(false)
      setDeleteCode('')
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : t('err.clearJobs'),
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <aside className="search-panel search-panel--compact">
      <p className="search-panel__lead">{t('jobs.lead')}</p>

      <div className="jobs-tabs" role="tablist" aria-label={t('jobs.tabs')}>
        {SUB_TAB_IDS.map((id) => {
          const isPending = id === 'viewed'
          const showNotif = isPending && notifBadge
          const showCount = !showNotif && counts[id] > 0
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              className={`jobs-tabs__btn${subTab === id ? ' jobs-tabs__btn--active' : ''}`}
              onClick={() => onSubTabChange(id)}
            >
              {subTabLabel(id)}
              {showNotif ? (
                <span
                  className="jobs-tabs__alert"
                  title={t('nav.newJobsPooling')}
                  aria-label={t('nav.unread', { n: unreadTotal })}
                >
                  {notifBadge}
                </span>
              ) : showCount ? (
                <span className="jobs-tabs__count">{counts[id]}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="jobs-clear">
        <Button
          variant="ghost"
          size="sm"
          className="jobs-clear__btn"
          disabled={counts.applied <= 0 || clearing !== null || deleting}
          onClick={() => void handleClear('applied')}
        >
          {clearing === 'applied'
            ? t('jobs.clearing')
            : `${t('jobs.clearApplied')} (${counts.applied})`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="jobs-clear__btn"
          disabled={counts.discarded <= 0 || clearing !== null || deleting}
          onClick={() => void handleClear('discarded')}
        >
          {clearing === 'discarded'
            ? t('jobs.clearing')
            : `${t('jobs.clearDiscarded')} (${counts.discarded})`}
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="jobs-delete-all__btn"
          disabled={totalJobs <= 0 || clearing !== null || deleting}
          onClick={openDeleteModal}
        >
          {t('jobs.deleteAll', { n: totalJobs })}
        </Button>
      </div>

      <Button fullWidth variant="soft" onClick={onRefresh}>
        {t('jobs.refresh')}
      </Button>

      {confirmDelete ? (
        <div
          className="jobs-modal-backdrop"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="jobs-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-all-jobs-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-all-jobs-title">{t('jobs.deleteAllTitle')}</h3>
            <p>
              {t('jobs.deleteAllBody', {
                n: totalJobs,
                code: DELETE_JOBS_CODE,
              })}
            </p>
            <Field label={t('jobs.deleteAllPh')}>
              <TextInput
                value={deleteCode}
                placeholder={DELETE_JOBS_CODE}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={deleting}
                onChange={(e) => {
                  setDeleteCode(e.target.value)
                  setDeleteError(null)
                }}
              />
            </Field>
            {deleteError ? (
              <Alert tone="danger">{localizeVisibleError(deleteError, t)}</Alert>
            ) : null}
            <div className="jobs-modal__actions">
              <Button
                variant="ghost"
                disabled={deleting}
                onClick={closeDeleteModal}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deleting || deleteCode !== DELETE_JOBS_CODE}
                onClick={() => void handleDeleteAll()}
              >
                {deleting ? t('jobs.deleting') : t('jobs.deleteAllConfirm')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )
}

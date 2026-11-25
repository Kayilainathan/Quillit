import { FileSpreadsheet, FileText, ShieldCheck, X } from 'lucide-react';

export type WorkspaceSyncTarget = 'sheets' | 'docs';

interface WorkspaceSyncConfirmModalProps {
  target: WorkspaceSyncTarget;
  sessionsCount: number;
  slotsCount: number;
  vocabCount: number;
  hasExistingFile: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WorkspaceSyncConfirmModal({
  target,
  sessionsCount,
  slotsCount,
  vocabCount,
  hasExistingFile,
  busy,
  onConfirm,
  onCancel,
}: WorkspaceSyncConfirmModalProps) {
  const isSheets = target === 'sheets';
  const fileTitle = isSheets
    ? 'Quillit · Writing Progress & Evaluation Tracker'
    : 'Quillit · Writing Journal & Evaluation Archive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-sync-confirm-title"
      className="modal-scrim fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="modal-panel mobile-sheet-panel max-w-md w-full max-h-[92dvh] overflow-y-auto rounded-b-none rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 safe-area-pb space-y-5">
        <div
          className="sm:hidden w-10 h-1 rounded-full bg-border-strong/80 mx-auto -mt-1 mb-1"
          aria-hidden="true"
        />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono-tabular uppercase tracking-wider text-ink-muted">
              {isSheets ? (
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                {isSheets ? 'Google Sheets Sync' : 'Google Docs Sync'}
              </span>
            </div>
            <h2
              id="workspace-sync-confirm-title"
              className="font-display text-lg sm:text-xl font-medium text-ink-primary"
            >
              {hasExistingFile
                ? `Update ${isSheets ? 'Google Sheet' : 'Google Doc'}?`
                : `Create & Sync ${isSheets ? 'Google Sheet' : 'Google Doc'}?`}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel Google Workspace sync"
            className="btn-ghost p-1.5"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 rounded-lg border border-border-subtle bg-subtle space-y-2.5 text-xs">
          <div className="font-medium text-ink-primary">
            Target File: <span className="text-ink-secondary">{fileTitle}</span>
          </div>
          <p className="text-ink-secondary leading-relaxed">
            {isSheets
              ? hasExistingFile
                ? 'This will overwrite the 4 tracker tabs (Profile, Evaluations Log, Topic Rotation Schedule, and Vocabulary & Expression Bank) in your Google Sheet with your latest vault records.'
                : 'This will create a new 4-tab spreadsheet in your Google Drive and write your profile, evaluations, monthly schedule, and vocabulary bank.'
              : hasExistingFile
                ? 'This will replace the body of your Quillit Google Doc archive with your latest student profile, writing drafts, and coach evaluations.'
                : 'This will create a new Google Doc in your Google Drive containing your writing journal drafts, rubric scores, and coach feedback.'}
          </p>

          <div className="pt-2.5 border-t border-border-subtle grid grid-cols-3 gap-2 font-mono-tabular text-[11px] text-ink-primary">
            <div>
              <span className="text-ink-muted block">Sessions</span>
              <span className="font-semibold">{sessionsCount}</span>
            </div>
            <div>
              <span className="text-ink-muted block">Schedule</span>
              <span className="font-semibold">{slotsCount}</span>
            </div>
            <div>
              <span className="text-ink-muted block">Vocab</span>
              <span className="font-semibold">{vocabCount}</span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-ink-muted">
          <ShieldCheck
            className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>
            Quillit only accesses files it creates in your Google Drive and never modifies other personal documents.
          </span>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary px-4 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-primary px-4 py-2 text-xs font-medium"
          >
            {busy
              ? 'Syncing...'
              : isSheets
                ? 'Confirm Sync to Google Sheets'
                : 'Confirm Sync to Google Docs'}
          </button>
        </div>
      </div>
    </div>
  );
}

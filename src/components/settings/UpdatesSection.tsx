/**
 * @file Settings > Software Update: check, download, install. VISUAL.
 */

import { ArrowDownToLine, Check, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';

import { SettingTooltip } from '../TvSlider';
import { BUTTON, BUTTON_PRIMARY, GLASS_CARD, SECTION_HEADING, cx } from '../ui/styles';
import { formatBytes } from '../../lib/updates';
import type { UseAppUpdateResult } from '../../hooks/useAppUpdate';

export interface UpdatesSectionProps {
  update: UseAppUpdateResult;
  onInteract: () => void;
}

function relativeDay(timestamp: number | null): string {
  if (timestamp === null) return 'not yet';
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The wide status line. One sentence, no jargon, readable from the sofa. */
function StatusLine({ update }: { update: UseAppUpdateResult }) {
  const { checkState, status, errorMessage, update: available } = update;

  if (status.state === 'error') {
    return (
      <p className="flex items-center gap-3 text-tv-sm text-red-300">
        <TriangleAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
        {status.error || 'The download failed.'}
      </p>
    );
  }

  if (status.state === 'downloading') {
    return (
      <p className="text-tv-sm text-white/80">
        Downloading version {status.versionName}
        {status.progress >= 0 ? ` — ${status.progress}%` : '…'}
      </p>
    );
  }

  if (status.state === 'verifying') {
    return <p className="text-tv-sm text-white/80">Checking the download is intact…</p>;
  }

  if (status.state === 'ready') {
    return (
      <p className="text-tv-sm text-canvas-gold">
        Version {status.versionName} is ready to install.
      </p>
    );
  }

  if (status.state === 'installing') {
    return (
      <p className="text-tv-sm text-white/80">
        Follow the prompt on screen to finish installing. The app will restart.
      </p>
    );
  }

  if (checkState === 'checking') {
    return <p className="text-tv-sm text-white/65">Looking for a newer version…</p>;
  }

  if (checkState === 'error') {
    return (
      <p className="flex items-center gap-3 text-tv-sm text-red-300">
        <TriangleAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
        {errorMessage}
      </p>
    );
  }

  if (checkState === 'available' && available) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="flex shrink-0 items-center gap-3 text-tv-sm text-canvas-gold">
          <ArrowDownToLine className="h-6 w-6 shrink-0" aria-hidden="true" />
          Version {available.versionName} is available
          {available.sizeBytes > 0 ? ` (${formatBytes(available.sizeBytes)})` : ''}.
        </p>
        {available.notes ? (
          /*
           * WEB-25: was a flat `max-h-32`. Now it takes the room the pane has
           * left, which is far more, so most release notes will not scroll at
           * all. Release bodies are arbitrary-length remote text, so this keeps
           * a scroll box — tabIndex is what lets a remote actually scroll it.
           */
          <p
            className="tv-scroll min-h-0 flex-1 pr-2 text-tv-xs leading-relaxed whitespace-pre-line text-white/65"
            tabIndex={0}
            role="region"
            aria-label="Release notes"
          >
            {available.notes}
          </p>
        ) : null}
      </div>
    );
  }

  if (checkState === 'current') {
    return (
      <p className="flex items-center gap-3 text-tv-sm text-canvas-sage">
        <Check className="h-6 w-6 shrink-0" aria-hidden="true" />
        This is the latest version.
      </p>
    );
  }

  return (
    <p className="text-tv-sm text-white/60">Last checked {relativeDay(update.lastCheckedAt)}.</p>
  );
}

export function UpdatesSection({ update, onInteract }: UpdatesSectionProps) {
  const { supported, installedVersionName, checkState, status, needsInstallPermission } = update;

  /*
   * Off-device this section is a dead end: a browser cannot install an APK, and
   * a button that silently does nothing is worse than no button. Say so plainly
   * instead.
   */
  if (!supported) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-6">
        <h3 className={SECTION_HEADING}>
          Software Update
          <SettingTooltip text="Installs new versions of Ambient Canvas straight from the TV." />
        </h3>
        <p className="text-tv-sm text-white/60">
          Updates install on the TV. This preview is running in a browser, which cannot install
          apps.
        </p>
      </section>
    );
  }

  const busy =
    checkState === 'checking' ||
    status.state === 'downloading' ||
    status.state === 'verifying' ||
    status.state === 'installing';

  return (
    <section className="flex h-full min-h-0 flex-col gap-6">
      <h3 className={SECTION_HEADING}>
        Software Update
        <SettingTooltip text="Installs new versions of Ambient Canvas straight from the TV." />
      </h3>

      {/* Fixed row layout, no breakpoints — see the note in DisplaySection. */}
      <div
        className={cx(
          GLASS_CARD,
          'flex min-h-0 flex-1 flex-row items-start justify-between gap-8 p-8',
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <p className="font-mono text-tv-xs tracking-[0.2em] text-white/55 uppercase">
            Installed{installedVersionName ? ` — version ${installedVersionName}` : ''}
          </p>
          <StatusLine update={update} />

          {needsInstallPermission ? (
            <p className="flex items-start gap-3 text-tv-xs leading-relaxed text-canvas-gold/80">
              <ShieldAlert className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
              Android needs your permission before this app can install an update. Choose
              &ldquo;Allow&rdquo; on the next screen, then start the download again.
            </p>
          ) : null}
        </div>

        {/* Only ever one obvious next action, whatever state we are in. */}
        <div className="flex shrink-0 flex-wrap gap-4">
          {needsInstallPermission ? (
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                update.grantInstallPermission();
                onInteract();
              }}
            >
              Open permission screen
            </button>
          ) : status.state === 'ready' ? (
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                update.install();
                onInteract();
              }}
            >
              Install now
            </button>
          ) : checkState === 'available' && status.state === 'idle' ? (
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                update.download();
                onInteract();
              }}
            >
              Download
            </button>
          ) : null}

          {status.state === 'downloading' || status.state === 'verifying' ? (
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                update.cancel();
                onInteract();
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className={cx(BUTTON, busy && 'pointer-events-none opacity-40')}
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                update.check();
                onInteract();
              }}
            >
              <RefreshCw
                className={cx('mr-3 inline h-5 w-5', checkState === 'checking' && 'animate-spin')}
                aria-hidden="true"
              />
              Check now
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

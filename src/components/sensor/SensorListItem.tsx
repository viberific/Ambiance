/**
 * @file One sensor row: name, address, select, rename, forget. VISUAL.
 */

import { Trash2 } from 'lucide-react';

import { BUTTON, FIELD, cx } from '../ui/styles';
import { displayName } from '../../lib/sensor-utils';
import type { SensorInfo } from '../../lib/types';

export interface SensorListItemProps {
  sensor: SensorInfo;
  isActive: boolean;
  isBusy: boolean;
  renameDraft: string;
  hasPendingRename: boolean;
  onRenameDraftChange: (value: string) => void;
  onSelect: () => void;
  onRename: () => void;
  onForget: () => void;
  onSecure: () => void;
}

export function SensorListItem(props: SensorListItemProps) {
  const {
    sensor,
    isActive,
    isBusy,
    renameDraft,
    hasPendingRename,
    onRenameDraftChange,
    onSelect,
    onRename,
    onForget,
    onSecure,
  } = props;

  const label = displayName(sensor.name);

  return (
    <div
      className={cx(
        'mb-3 space-y-2 rounded-2xl border p-3 transition-colors duration-300 last:mb-0',
        isActive ? 'border-canvas-gold/45 bg-canvas-gold/[0.1]' : 'border-white/10 bg-white/[0.04]',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-tv-sm text-white">{label}</span>
          <span className="truncate font-mono text-tv-xs text-white/55">
            {sensor.hostname ? `${sensor.hostname}.local` : sensor.ip || 'unknown host'}
            {sensor.firmwareVersion ? (
              <span className="text-white/40"> · fw {sensor.firmwareVersion}</span>
            ) : null}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onSelect}
            className={cx(
              'tv-focusable rounded-full border px-5 py-2 text-tv-xs font-bold tracking-[0.15em] uppercase transition-colors duration-200 disabled:opacity-50',
              isActive
                ? 'border-canvas-gold/60 bg-canvas-gold/20 text-canvas-gold'
                : 'border-white/12 bg-white/[0.07] text-white/75 hover:bg-white/15 focus-visible:bg-white/15',
            )}
          >
            {isActive ? 'Active' : 'Select'}
          </button>

          <button
            type="button"
            aria-label={`Forget ${label}`}
            onClick={onForget}
            className="tv-focusable rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-red-200 focus-visible:bg-white/10 focus-visible:text-red-200"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          maxLength={24}
          value={renameDraft}
          placeholder="Room name"
          aria-label={`Rename ${label}`}
          onChange={(event) => onRenameDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onRename();
            }
          }}
          className={FIELD}
        />
        <button
          type="button"
          disabled={isBusy}
          onClick={onRename}
          className={cx(BUTTON, 'shrink-0 disabled:opacity-50')}
        >
          Save
        </button>
      </div>

      {hasPendingRename ? (
        <p className="text-tv-xs tracking-[0.2em] text-canvas-sage uppercase">
          Rename queued — will sync when the sensor is online
        </p>
      ) : null}

      {/* WEB-03: the firmware refuses pairing with 428 until this is done. */}
      {sensor.passwordNeedsChange ? (
        <button
          type="button"
          onClick={onSecure}
          className="tv-focusable w-full truncate rounded-xl border border-amber-300/35 bg-amber-300/[0.12] px-4 py-2 text-left text-tv-xs tracking-[0.15em] text-amber-100 uppercase transition-colors hover:bg-amber-300/20 focus-visible:bg-amber-300/20"
        >
          Factory password still set — press to secure
        </button>
      ) : null}
    </div>
  );
}

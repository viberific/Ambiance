/**
 * @file Settings > Media: image source, rotation speed, pause. VISUAL.
 */

import { FolderOpen, Image as ImageIcon, Pause, Play } from 'lucide-react';

import { SettingTooltip } from '../TvSlider';
import {
  CHIP,
  CHIP_OFF,
  CHIP_ON,
  LABEL,
  SECTION_HEADING,
  TOGGLE,
  TOGGLE_OFF,
  TOGGLE_ON,
  TOGGLE_ON_SAGE,
  cx,
} from '../ui/styles';
import type { Settings } from '../../lib/settings';

const ROTATION_CHOICES = [5, 10, 30, 60];

export interface MediaSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  localCount: number;
  onPickLocalFolder: () => void;
  onInteract: () => void;
}

export function MediaSection(props: MediaSectionProps) {
  const { settings, setSetting, localCount, onPickLocalFolder, onInteract } = props;

  /*
   * WEB-43: an album does not survive a restart (see Known gaps), but the
   * "local" choice did, so after every reboot this screen lit up Local Albums
   * while the TV was plainly showing the curated paintings. The highlight now
   * follows what is actually on screen.
   */
  const showingLocal = settings.imageSource === 'local' && localCount > 0;

  const sourceTile = (active: boolean) =>
    cx(TOGGLE, 'flex-row justify-start gap-4 p-6', active ? TOGGLE_ON : TOGGLE_OFF);

  return (
    <section className="flex h-full min-h-0 flex-col gap-8">
      <h3 className={SECTION_HEADING}>
        Media &amp; Rotation
        <SettingTooltip text="Where images come from and how often they change." />
      </h3>

      {/* Fixed columns, no breakpoints — see the note in DisplaySection. */}
      <div className="grid grid-cols-3 gap-8">
        <button
          type="button"
          aria-pressed={!showingLocal}
          onClick={() => {
            setSetting('imageSource', 'curated');
            onInteract();
          }}
          className={sourceTile(!showingLocal)}
        >
          <ImageIcon
            className={cx('h-7 w-7', !showingLocal ? 'text-canvas-gold' : 'text-white/45')}
            aria-hidden="true"
          />
          <span className="text-tv-sm font-bold tracking-widest text-white/80 uppercase">
            Curated
          </span>
        </button>

        <button
          type="button"
          aria-pressed={showingLocal}
          onClick={() => {
            onPickLocalFolder();
            onInteract();
          }}
          className={sourceTile(showingLocal)}
        >
          <FolderOpen
            className={cx('h-7 w-7', showingLocal ? 'text-canvas-gold' : 'text-white/45')}
            aria-hidden="true"
          />
          <span className="text-left text-tv-sm font-bold tracking-widest text-white/80 uppercase">
            Local Albums
            {localCount > 0 && (
              <span className="block font-mono text-tv-xs tracking-normal text-canvas-sage normal-case">
                {localCount} image{localCount === 1 ? '' : 's'} loaded
              </span>
            )}
          </span>
        </button>

        <div className="flex flex-col justify-between gap-3">
          <div className={cx(LABEL, 'flex items-center justify-between')}>
            <span className="flex items-center gap-2">
              Cycle Time
              <SettingTooltip text="How often the artwork changes." />
            </span>
            <span className="font-mono text-tv-sm text-canvas-sage">
              {settings.rotationMinutes}M
            </span>
          </div>

          <div className="flex gap-2">
            {ROTATION_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={settings.rotationMinutes === minutes}
                onClick={() => {
                  setSetting('rotationMinutes', minutes);
                  onInteract();
                }}
                className={cx(CHIP, settings.rotationMinutes === minutes ? CHIP_ON : CHIP_OFF)}
              >
                {minutes}
              </button>
            ))}
          </div>

          {/* WEB-21: isStatic was read by the rotation effect but no control set it. */}
          <button
            type="button"
            aria-pressed={settings.isStatic}
            onClick={() => {
              setSetting('isStatic', !settings.isStatic);
              onInteract();
            }}
            className={cx(
              TOGGLE,
              'flex-row gap-2 rounded-xl px-4 py-2 text-tv-xs font-bold tracking-[0.2em] uppercase',
              settings.isStatic ? TOGGLE_ON_SAGE : TOGGLE_OFF,
            )}
          >
            {settings.isStatic ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {settings.isStatic ? 'Rotation paused' : 'Rotation on'}
          </button>
        </div>
      </div>
    </section>
  );
}

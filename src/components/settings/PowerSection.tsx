/**
 * @file Settings > Power: sleep timer, black mode, motion sensitivity, OLED saver. VISUAL.
 */

import { EyeOff, Sun } from 'lucide-react';

import { SettingTooltip, TvSlider } from '../TvSlider';
import {
  CHIP,
  CHIP_OFF,
  CHIP_ON_SAGE,
  SECTION_HEADING,
  TOGGLE,
  TOGGLE_OFF,
  TOGGLE_ON,
  TOGGLE_ON_SAGE,
  LABEL,
  cx,
} from '../ui/styles';
import { ScreensaverCard } from './ScreensaverCard';
import { canOpenScreensaverSettings } from '../../lib/native';
import { BRAND } from '../../lib/theme';
import type { Settings } from '../../lib/settings';

const SENSITIVITY_CHOICES = [1, 3, 5, 10];
const OLED_CHOICES = [5, 10, 30, 60];

export interface PowerSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onInteract: () => void;
}

export function PowerSection({ settings, setSetting, onInteract }: PowerSectionProps) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-8">
      <h3 className={SECTION_HEADING}>
        Power &amp; Sleep
        <SettingTooltip text="Motion, blackout, and panel protection behaviour." />
      </h3>

      {/* Fixed columns, no breakpoints — see the note in DisplaySection. */}
      <div className="grid grid-cols-2 gap-8">
        <TvSlider
          label="Sleep Timer"
          tooltip="Minutes without motion before the screen blacks out."
          value={settings.powerSafeMinutes}
          min={1}
          max={60}
          step={1}
          suffix="M"
          gradientClasses="bg-linear-to-r from-canvas-sage/10 to-canvas-sage/60"
          thumbColor={BRAND.sage}
          onChange={(value) => {
            setSetting('powerSafeMinutes', value);
            onInteract();
          }}
        />

        <TvSlider
          label="Black Threshold"
          tooltip="Below this lux level the screen stays black when Black Mode is on."
          value={settings.blackModeThreshold}
          min={0}
          max={50}
          step={1}
          suffix=" LUX"
          gradientClasses="bg-linear-to-r from-black/70 to-canvas-sage/40"
          thumbColor={BRAND.shadow}
          onChange={(value) => {
            setSetting('blackModeThreshold', value);
            onInteract();
          }}
        />
      </div>

      {/*
       * WEB-25: these two tiles carry a sentence each. In the old half-width
       * column they wrapped to four lines and each tile grew to ~150px, a large
       * part of why the menu overflowed. At full pane width they are one or two
       * lines; `line-clamp-2` makes that a hard ceiling, so the tile height
       * stays predictable even if the wording changes later.
       */}
      <div className="grid grid-cols-2 gap-8">
        <button
          type="button"
          aria-pressed={settings.blackModeEnabled}
          onClick={() => {
            setSetting('blackModeEnabled', !settings.blackModeEnabled);
            onInteract();
          }}
          className={cx(TOGGLE, settings.blackModeEnabled ? TOGGLE_ON_SAGE : TOGGLE_OFF)}
        >
          <EyeOff className="h-7 w-7" aria-hidden="true" />
          <span className="text-tv-xs font-bold tracking-widest uppercase">Black Mode</span>
          <span className="line-clamp-2 text-center text-tv-xs normal-case opacity-70">
            Recommended for OLED and Mini-LED panels
          </span>
        </button>

        <button
          type="button"
          aria-pressed={settings.keepScreenAwake}
          onClick={() => {
            setSetting('keepScreenAwake', !settings.keepScreenAwake);
            onInteract();
          }}
          className={cx(TOGGLE, settings.keepScreenAwake ? TOGGLE_ON : TOGGLE_OFF)}
        >
          <Sun className="h-7 w-7" aria-hidden="true" />
          <span className="text-tv-xs font-bold tracking-widest uppercase">Keep Awake</span>
          <span className="line-clamp-2 text-center text-tv-xs normal-case opacity-70">
            Stops the TV sleeping on its own timer
          </span>
        </button>
      </div>

      {canOpenScreensaverSettings() ? <ScreensaverCard onInteract={onInteract} /> : null}

      <div className="grid grid-cols-2 gap-8">
        <div>
          <div className={cx(LABEL, 'mb-2 flex items-center gap-2')}>
            Motion Sensitivity
            <SettingTooltip text="How many consecutive motion readings are needed before the display wakes." />
          </div>
          <div className="flex gap-2">
            {SENSITIVITY_CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.motionSensitivity === value}
                onClick={() => {
                  setSetting('motionSensitivity', value);
                  onInteract();
                }}
                className={cx(CHIP, settings.motionSensitivity === value ? CHIP_ON_SAGE : CHIP_OFF)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={cx(LABEL, 'mb-2 flex items-center gap-2')}>
            OLED Saver
            <SettingTooltip text="Minutes of stillness before overlays dim, reducing burn-in risk." />
          </div>
          <div className="flex gap-2">
            {OLED_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={settings.oledSaverMinutes === minutes}
                onClick={() => {
                  setSetting('oledSaverMinutes', minutes);
                  onInteract();
                }}
                className={cx(
                  CHIP,
                  settings.oledSaverMinutes === minutes ? CHIP_ON_SAGE : CHIP_OFF,
                )}
              >
                {minutes}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

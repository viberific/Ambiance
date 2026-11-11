/**
 * @file Settings > Display: brightness, warmth, grain, overlays, font, units. VISUAL.
 */

import { Clock, Cloud } from 'lucide-react';

import { SettingTooltip, TvSlider } from '../TvSlider';
import {
  CHIP,
  CHIP_OFF,
  CHIP_ON,
  GLASS_CARD,
  LABEL,
  SECTION_HEADING,
  TOGGLE,
  TOGGLE_OFF,
  TOGGLE_ON,
  cx,
} from '../ui/styles';
import { BRAND } from '../../lib/theme';
import type { Settings } from '../../lib/settings';
import type { OverlayFont, TemperatureUnit } from '../../lib/types';

const FONTS: OverlayFont[] = ['serif', 'sans', 'mono', 'script'];
const UNITS: TemperatureUnit[] = ['c', 'f'];

export interface DisplaySectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  luminance: number;
  warmth: number;
  onLuminanceChange: (value: number) => void;
  onWarmthChange: (value: number) => void;
  onCommitProfile: () => void;
  onToggleWeather: () => void;
  onInteract: () => void;
}

export function DisplaySection(props: DisplaySectionProps) {
  const {
    settings,
    setSetting,
    luminance,
    warmth,
    onLuminanceChange,
    onWarmthChange,
    onCommitProfile,
    onToggleWeather,
    onInteract,
  } = props;

  return (
    <section className="flex h-full min-h-0 flex-col gap-8">
      <h3 className={SECTION_HEADING}>
        Display
        <SettingTooltip text="Picture tuning and overlay controls for the artwork screen." />
      </h3>

      {/*
       * WEB-25: fixed column counts, deliberately no `lg:`/`xl:` breakpoints.
       * Those read the *whole window* width while this section lived inside a
       * half-width column, so on a 1920px screen it tried to be four columns
       * inside 636px — the main reason the old menu looked jumbled. The section
       * now owns the full pane, and because every rem scales with the viewport
       * (see --tv-scale in index.css) the pane is always the same width in rem.
       * There is nothing left for a breakpoint to respond to.
       */}
      <div className="grid grid-cols-3 gap-8">
        <TvSlider
          label="Brightness"
          tooltip="Artwork brightness after ambient adjustments are applied."
          value={luminance}
          min={0}
          max={100}
          step={5}
          suffix="%"
          gradientClasses="bg-linear-to-r from-black/40 to-white/60"
          thumbColor={BRAND.gold}
          onChange={(value) => {
            onLuminanceChange(value);
            onInteract();
          }}
          onSave={onCommitProfile}
        />

        <TvSlider
          label="Warmth"
          tooltip="Warms or cools the image tone to match room lighting."
          value={warmth}
          min={-500}
          max={500}
          step={50}
          suffix="K"
          gradientClasses="bg-linear-to-r from-sky-300/50 via-white/10 to-orange-300/60"
          thumbColor={BRAND.warm}
          onChange={(value) => {
            onWarmthChange(value);
            onInteract();
          }}
          onSave={onCommitProfile}
        />

        <TvSlider
          label="Grain"
          tooltip="Adds paper-like texture over the artwork."
          value={settings.grainIntensity}
          min={0}
          max={100}
          step={5}
          suffix="%"
          gradientClasses="bg-linear-to-r from-transparent to-canvas-sage/50"
          thumbColor={BRAND.sage}
          onChange={(value) => {
            setSetting('grainIntensity', value);
            onInteract();
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="grid grid-cols-2 gap-6">
          <button
            type="button"
            aria-pressed={settings.showClock}
            onClick={() => {
              setSetting('showClock', !settings.showClock);
              onInteract();
            }}
            title="Toggle the clock overlay."
            className={cx(TOGGLE, settings.showClock ? TOGGLE_ON : TOGGLE_OFF)}
          >
            <Clock className="h-7 w-7" aria-hidden="true" />
            <span className="text-tv-xs font-bold tracking-widest uppercase">Clock</span>
          </button>

          <button
            type="button"
            aria-pressed={settings.showWeather}
            onClick={() => {
              onToggleWeather();
              onInteract();
            }}
            title="Toggle the weather overlay. Requires location permission."
            className={cx(TOGGLE, settings.showWeather ? TOGGLE_ON : TOGGLE_OFF)}
          >
            <Cloud className="h-7 w-7" aria-hidden="true" />
            <span className="text-tv-xs font-bold tracking-widest uppercase">Weather</span>
          </button>
        </div>

        {/*
         * WEB-25: Overlay Font and Units used to share one `flex-wrap` row with
         * four children, so the two labels and their two chip groups wrapped
         * independently and landed in a lopsided arrangement. Two labelled rows
         * instead — each label stays with the chips it belongs to.
         */}
        <div className={cx(GLASS_CARD, 'flex flex-col justify-center gap-5 px-6 py-5')}>
          <div className="flex flex-col gap-2">
            <span className={cx(LABEL, 'flex items-center gap-2')}>
              Overlay Font
              <SettingTooltip text="Text style used by the time and weather overlays." />
            </span>
            <div className="flex gap-2">
              {FONTS.map((font) => (
                <button
                  key={font}
                  type="button"
                  aria-pressed={settings.overlayFont === font}
                  onClick={() => {
                    setSetting('overlayFont', font);
                    onInteract();
                  }}
                  className={cx(
                    CHIP,
                    'tracking-widest uppercase',
                    settings.overlayFont === font ? CHIP_ON : CHIP_OFF,
                  )}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={LABEL}>Units</span>
            <div className="flex gap-2">
              {UNITS.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={settings.temperatureUnit === unit}
                  onClick={() => {
                    setSetting('temperatureUnit', unit);
                    onInteract();
                  }}
                  className={cx(
                    CHIP,
                    'uppercase',
                    settings.temperatureUnit === unit ? CHIP_ON : CHIP_OFF,
                  )}
                >
                  °{unit}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

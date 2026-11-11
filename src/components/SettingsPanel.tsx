/**
 * @file The settings menu shell. Sections live in components/settings/. VISUAL.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Image as ImageIcon,
  Moon,
  Radio,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { DisplaySection } from './settings/DisplaySection';
import { MediaSection } from './settings/MediaSection';
import { PowerSection } from './settings/PowerSection';
import { UpdatesSection } from './settings/UpdatesSection';
import { SensorPanel, type SensorPanelProps } from './SensorPanel';
import { GLASS_PANEL, cx } from './ui/styles';
import type { Settings } from '../lib/settings';
import type { UseAppUpdateResult } from '../hooks/useAppUpdate';

/*
 * WEB-25: this panel used to lay all five sections out at once in a scrolling
 * two-column grid. At 1080p that stack measured ~1120px against a 972px cap, so
 * the menu always scrolled, the Close button sat below the fold, and the inner
 * grids — which read *viewport* breakpoints while living in a half-width column
 * — fought each other for space. It looked jumbled because it was.
 *
 * One section at a time, chosen from a rail, is the standard TV settings
 * pattern (Android TV, Apple TV, Roku all do this) and it is what actually
 * makes the menu fit: each pane holds a fraction of the old content, so it can
 * be sized generously and still never overflow.
 */

const SECTIONS = [
  { id: 'display', label: 'Display', Icon: SlidersHorizontal },
  { id: 'media', label: 'Media', Icon: ImageIcon },
  { id: 'power', label: 'Power', Icon: Moon },
  { id: 'sensors', label: 'Sensors', Icon: Radio },
  { id: 'updates', label: 'Updates', Icon: ArrowDownToLine },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

/*
 * Controls the D-pad can land on, in DOM order.
 *
 * `[role="note"]` is excluded deliberately: that is the little "(i)" badge from
 * SettingTooltip, and every section heading starts with one. Without the
 * exclusion, pressing Right from the rail landed on an info badge instead of
 * the first actual setting. The badges stay reachable by continuing to
 * navigate — they are just never the entry point.
 */
const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]):not([role="note"])';

const RAIL_ITEM =
  'tv-focusable flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-tv-xs font-bold tracking-[0.2em] uppercase transition-colors duration-200';

export interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  luminance: number;
  warmth: number;
  onLuminanceChange: (value: number) => void;
  onWarmthChange: (value: number) => void;
  onCommitProfile: () => void;
  onInteract: () => void;
  onClose: () => void;
  onPickLocalFolder: () => void;
  localCount: number;
  onToggleWeather: () => void;
  sensorPanel: SensorPanelProps;
  update: UseAppUpdateResult;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    open,
    settings,
    setSetting,
    luminance,
    warmth,
    onLuminanceChange,
    onWarmthChange,
    onCommitProfile,
    onInteract,
    onClose,
    onPickLocalFolder,
    localCount,
    onToggleWeather,
    sensorPanel,
    update,
  } = props;

  const [active, setActive] = useState<SectionId>('display');
  const railRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  /*
   * WEB-13: this panel was previously always mounted and merely hidden with
   * `opacity-0 pointer-events-none`. pointer-events does not affect keyboard or
   * D-pad focus, so arrowing from the artwork screen walked straight into an
   * invisible menu and the TV appeared frozen. Conditional rendering (below)
   * removes the problem at the source.
   */
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      // Land on the rail, not on whatever control happens to be first in the
      // pane — the rail is where a remote user expects to start.
      railRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const focusPane = useCallback(() => {
    paneRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, []);

  const focusRail = useCallback(() => {
    railRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, []);

  /*
   * The rail is a roving tabindex group: only the selected item is reachable,
   * so the whole rail is one D-pad stop rather than five. Moving the selection
   * switches the visible section immediately — no separate confirm press, which
   * is how every TV settings menu behaves and lets you browse at a glance.
   */
  const onRailKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = SECTIONS.findIndex((section) => section.id === active);
    const onClose = event.target === closeRef.current;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;

      /*
       * WEB-41: Up and Down used to wrap around the five sections forever, and
       * because this handler swallows both keys, nothing could ever carry the
       * remote down to Close. It was on screen and unreachable. The rail now
       * has real ends: Down from the last section lands on Close, and Up from
       * Close returns to the section you were on.
       */
      if (onClose) {
        if (delta === -1) focusRail();
        return;
      }
      const next = SECTIONS[index + delta];
      if (!next) {
        if (delta === 1) closeRef.current?.focus();
        return;
      }
      setActive(next.id);
      onInteract();
      // The tabindex moves with the selection, so focus after React repaints.
      requestAnimationFrame(focusRail);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusPane();
    }
  };

  /*
   * Left from the pane returns to the rail, but only from the first control —
   * otherwise it would break left/right movement along the chip rows. TvSlider
   * already stops arrow keys while a slider is being adjusted, so this cannot
   * fire mid-adjustment either.
   */
  const onPaneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft') return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    if (paneRef.current?.querySelector<HTMLElement>(FOCUSABLE) !== target) return;
    event.preventDefault();
    focusRail();
  };

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-8"
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Backspace') {
          const target = event.target as HTMLElement;
          if (target.tagName === 'INPUT' && event.key === 'Backspace') return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {/*
       * The dimming layer is a sibling of the panel, not its parent. A parent
       * that is fading in cuts the panel's frosted blur off from the artwork
       * behind it, so the glass would look flat until the fade finished.
       */}
      <div aria-hidden="true" className="animate-dialog-backdrop absolute inset-0 bg-black/25" />

      {/*
       * Fixed height, not max-height: the panel must not resize as you move
       * between sections, and `overflow-hidden` makes scrolling structurally
       * impossible rather than merely unnecessary.
       *
       * The height is measured: the tallest section (Power) needs 27.8rem
       * including padding and the rail needs 25.1rem, so 29rem covers both with
       * a little slack and the content fills the panel instead of huddling at
       * the top. Sections shorter than that keep the same panel rather than
       * making it resize as you move between them.
       *
       * Because every rem scales with the viewport (see --tv-scale in
       * index.css), 29rem x 78rem resolves to at most 43% of viewport height
       * and 65% of its width at *any* screen size or aspect ratio — it can
       * never overflow. The max- caps are belt and braces.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ambient Canvas settings"
        className={cx(
          GLASS_PANEL,
          'animate-dialog-panel relative grid h-[29rem] max-h-[90vh] w-[78rem] max-w-[94vw] grid-cols-[13rem_1fr] gap-10 overflow-hidden rounded-[2rem] p-10',
        )}
      >
        <div
          ref={railRef}
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="flex flex-col gap-2 border-r border-white/10 pr-10"
          onKeyDown={onRailKeyDown}
        >
          {SECTIONS.map(({ id, label, Icon }) => {
            const selected = id === active;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  setActive(id);
                  onInteract();
                }}
                className={cx(
                  RAIL_ITEM,
                  selected
                    ? 'border-white/15 bg-white/[0.1] text-canvas-gold shadow-[inset_0_0.0625rem_0_rgba(255,255,255,0.12)]'
                    : 'border-transparent text-white/55 hover:bg-white/5 hover:text-white/80',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {label}
              </button>
            );
          })}

          {/*
           * Close sits at the foot of the rail so it is permanently on screen.
           * It used to be the last cell of the scrolling grid, which is exactly
           * why it disappeared whenever the menu overflowed.
           */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={cx(
              RAIL_ITEM,
              'mt-auto border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10 hover:text-white/90 focus-visible:bg-white/10 focus-visible:text-white/90',
            )}
          >
            <X className="h-5 w-5 shrink-0" aria-hidden="true" />
            Close
          </button>
        </div>

        {/* Keyed on the section so each one drifts in as you move down the rail. */}
        <div
          key={active}
          ref={paneRef}
          // The negative margin and matching padding give focus rings room to
          // show; without it the clip cut them off on controls at the pane edge.
          className="animate-pane-in -m-4 min-w-0 overflow-hidden p-4"
          onKeyDown={onPaneKeyDown}
        >
          {active === 'display' ? (
            <DisplaySection
              settings={settings}
              setSetting={setSetting}
              luminance={luminance}
              warmth={warmth}
              onLuminanceChange={onLuminanceChange}
              onWarmthChange={onWarmthChange}
              onCommitProfile={onCommitProfile}
              onToggleWeather={onToggleWeather}
              onInteract={onInteract}
            />
          ) : null}

          {active === 'media' ? (
            <MediaSection
              settings={settings}
              setSetting={setSetting}
              localCount={localCount}
              onPickLocalFolder={onPickLocalFolder}
              onInteract={onInteract}
            />
          ) : null}

          {active === 'power' ? (
            <PowerSection settings={settings} setSetting={setSetting} onInteract={onInteract} />
          ) : null}

          {active === 'sensors' ? <SensorPanel {...sensorPanel} /> : null}

          {active === 'updates' ? <UpdatesSection update={update} onInteract={onInteract} /> : null}
        </div>
      </div>
    </div>
  );
}

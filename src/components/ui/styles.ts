/**
 * @file Shared control styling. Edit here to restyle every control at once. VISUAL.
 */

/*
 * SettingsPanel and SensorPanel each defined their own near-identical
 * `buttonClass` / `fieldClass` / `chipBase` / `toggleBase` constants, so the
 * two halves of the same menu drifted apart visually and any restyle meant
 * editing several files and hoping you caught them all.
 *
 * One definition each, used everywhere.
 *
 * WEB-40: the whole interface is now translucent glass. Surfaces are a thin
 * wash of white over a blurred view of the artwork, so the painting stays the
 * subject and the controls float on top of it. Three rules keep it readable
 * from the sofa:
 *   - only the two big surfaces (GLASS_PANEL, GLASS_POPOVER) blur what is
 *     behind them; everything inside them is a plain translucent fill, because
 *     stacking blurs is what makes a TV box drop frames;
 *   - "selected" is a soft gold tint, never a solid block, so it cannot be
 *     mistaken for the solid gold focus ring that shows where the remote is;
 *   - text never drops below 55% white on glass.
 */

/** The large frosted surface: the settings menu and dialogs. */
export const GLASS_PANEL =
  'border border-white/15 bg-canvas-ink/45 bg-linear-to-b from-white/[0.11] to-white/[0.03] shadow-[0_2rem_6rem_rgba(0,0,0,0.5),inset_0_0.0625rem_0_rgba(255,255,255,0.16)] backdrop-blur-[2.25rem] backdrop-saturate-150';

/** Small frosted surface floating directly over the artwork: pills, tooltips. */
export const GLASS_POPOVER =
  'border border-white/15 bg-canvas-ink/40 shadow-[0_0.75rem_2.5rem_rgba(0,0,0,0.35),inset_0_0.0625rem_0_rgba(255,255,255,0.14)] backdrop-blur-[1.5rem] backdrop-saturate-150';

/** A grouped area inside a glass panel. No blur of its own. */
export const GLASS_CARD = 'rounded-2xl border border-white/10 bg-white/[0.05]';

/** A deeper well inside a panel, for lists and read-only text. */
export const GLASS_WELL = 'rounded-2xl border border-white/[0.07] bg-black/15';

/** Text input. */
export const FIELD =
  'tv-focusable w-full rounded-xl border border-white/12 bg-black/20 px-4 py-3 font-mono text-tv-xs text-white/90 outline-none transition-colors placeholder:text-white/35 focus:border-canvas-gold/60 focus:bg-black/30';

const PRESSABLE =
  'tv-focusable transition-[background-color,border-color,color,filter,transform] duration-200 active:scale-[0.97]';

/** Secondary action button. */
export const BUTTON = `${PRESSABLE} rounded-xl border border-white/12 bg-white/[0.07] px-4 py-3 text-tv-xs font-bold tracking-[0.2em] text-white/75 uppercase hover:bg-white/[0.14] focus-visible:bg-white/[0.14] focus-visible:text-white`;

/** Primary action button. */
export const BUTTON_PRIMARY = `${PRESSABLE} rounded-xl border border-canvas-gold/70 bg-canvas-gold/85 px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-canvas-surface uppercase hover:brightness-110 focus-visible:bg-canvas-gold`;

/** Destructive action button. */
export const BUTTON_DANGER = `${PRESSABLE} rounded-xl border border-red-300/40 bg-red-400/15 px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-red-100 uppercase hover:bg-red-400/25 focus-visible:bg-red-400/25`;

/** Neutral dialog-sized button, the same footprint as primary and danger. */
export const BUTTON_SECONDARY = `${PRESSABLE} rounded-xl border border-white/15 bg-white/[0.07] px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-white/75 uppercase hover:bg-white/[0.14] focus-visible:bg-white/[0.14] focus-visible:text-white`;

/** Small square-ish value chip, e.g. the 5/10/30/60 minute pickers. */
export const CHIP = `${PRESSABLE} flex-1 rounded-xl border px-3 py-2 font-mono text-tv-xs`;

/** Chip in its selected state. Append to CHIP. */
export const CHIP_ON = 'border-canvas-gold/60 bg-canvas-gold/20 text-canvas-gold';

/** Chip in its unselected state. Append to CHIP. */
export const CHIP_OFF =
  'border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:text-white/90';

/** Sage-tinted selected chip, used by the power/sleep controls. */
export const CHIP_ON_SAGE = 'border-canvas-sage/60 bg-canvas-sage/20 text-canvas-sage';

/** Large icon toggle tile. */
export const TOGGLE = `${PRESSABLE} flex flex-col items-center justify-center gap-1 rounded-2xl border p-4`;

/** Icon toggle in its active state. Append to TOGGLE. */
export const TOGGLE_ON = 'border-canvas-gold/55 bg-canvas-gold/[0.14] text-canvas-gold';

/** Sage-tinted active toggle, used by the power/sleep controls. */
export const TOGGLE_ON_SAGE = 'border-canvas-sage/55 bg-canvas-sage/[0.14] text-canvas-sage';

/** Icon toggle in its inactive state. Append to TOGGLE. */
export const TOGGLE_OFF =
  'border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:text-white/85';

/** Small uppercase label above a control. */
export const LABEL = 'text-tv-xs font-bold tracking-[0.25em] text-white/60 uppercase';

/** Section heading inside the settings menu. */
export const SECTION_HEADING =
  'flex items-center gap-2 border-b border-white/10 pb-2 text-tv-xs font-bold tracking-[0.3em] text-canvas-gold uppercase';

/** Joins class fragments, dropping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

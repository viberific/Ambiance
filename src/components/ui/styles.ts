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
 */

/** Text input. */
export const FIELD =
  'tv-focusable w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 font-mono text-tv-xs text-white/85 outline-none focus:border-canvas-gold/60';

/** Secondary action button. */
export const BUTTON =
  'tv-focusable rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-tv-xs font-bold tracking-[0.2em] text-white/70 uppercase transition-[background-color,transform] hover:bg-white/15 active:scale-[0.97]';

/** Primary action button. */
export const BUTTON_PRIMARY =
  'tv-focusable rounded-lg border border-canvas-gold bg-canvas-gold px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-canvas-surface uppercase transition-[filter,transform] hover:brightness-110 active:scale-[0.97]';

/** Destructive action button. */
export const BUTTON_DANGER =
  'tv-focusable rounded-lg border border-red-400/60 bg-red-500/15 px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-red-200 uppercase transition-[background-color,transform] hover:bg-red-500/25 active:scale-[0.97]';

/** Neutral dialog-sized button, the same footprint as primary and danger. */
export const BUTTON_SECONDARY =
  'tv-focusable rounded-lg border border-white/20 bg-white/5 px-8 py-3 text-tv-xs font-bold tracking-[0.25em] text-white/70 uppercase transition-[background-color,transform] hover:bg-white/10 active:scale-[0.97]';

/** Small square-ish value chip, e.g. the 5/10/30/60 minute pickers. */
export const CHIP =
  'tv-focusable flex-1 rounded-lg border px-3 py-2 font-mono text-tv-xs transition-all active:scale-[0.97]';

/** Chip in its selected state. Append to CHIP. */
export const CHIP_ON = 'border-canvas-gold bg-canvas-gold text-canvas-surface';

/** Chip in its unselected state. Append to CHIP. */
export const CHIP_OFF = 'border-white/10 text-white/60 hover:bg-white/5';

/** Sage-tinted selected chip, used by the power/sleep controls. */
export const CHIP_ON_SAGE = 'border-canvas-sage bg-canvas-sage text-canvas-surface';

/** Large icon toggle tile. */
export const TOGGLE =
  'tv-focusable flex flex-col items-center justify-center gap-1 rounded-xl border p-4 transition-all active:scale-[0.97]';

/** Icon toggle in its active state. Append to TOGGLE. */
export const TOGGLE_ON = 'border-canvas-gold bg-canvas-gold/10 text-canvas-gold';

/** Icon toggle in its inactive state. Append to TOGGLE. */
export const TOGGLE_OFF = 'border-white/10 text-white/40 hover:bg-white/5';

/** Section heading inside the settings menu. */
export const SECTION_HEADING =
  'flex items-center gap-2 border-b border-white/10 pb-2 text-tv-xs font-bold tracking-[0.3em] text-canvas-gold uppercase';

/** Joins class fragments, dropping falsy ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

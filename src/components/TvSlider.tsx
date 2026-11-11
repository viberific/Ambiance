/**
 * @file D-pad operable slider + tooltip. VISUAL.
 */
import { useCallback, useRef, useState } from 'react';
import { Info } from 'lucide-react';

import { cx } from './ui/styles';

/**
 * WEB-23: this control had no ARIA role, no value semantics and no label
 * association, so it was invisible to accessibility services and to Android
 * TV's own focus engine. It is now a proper slider.
 *
 * BUILD-05: every prop was typed `any`.
 */
export interface TvSliderProps {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  gradientClasses: string;
  thumbColor: string;
  onChange: (value: number) => void;
  onSave?: (value: number) => void;
}

export function SettingTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        role="note"
        aria-label={text}
        className="tv-focusable inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-white/15 bg-white/10 text-canvas-gold/90"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </span>
      {/*
       * WEB-25: this was centred on the badge (`left-1/2 -translate-x-1/2`)
       * with a fixed `w-64`, so near a panel edge it ran off the screen — in
       * the reported screenshot it was clipped off the left. Anchored to the
       * badge's start edge and sized to its content instead, so it always opens
       * into the panel rather than out of it.
       */}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-7 left-0 z-50 w-max max-w-64 translate-y-1 rounded-xl border border-white/15 bg-canvas-ink/92 px-4 py-3 text-tv-xs leading-relaxed font-normal tracking-normal text-white/85 normal-case opacity-0 shadow-[0_0.75rem_2rem_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function TvSlider(props: TvSliderProps) {
  const {
    label,
    tooltip,
    value,
    min,
    max,
    step,
    suffix = '',
    gradientClasses,
    thumbColor,
    onChange,
    onSave,
  } = props;

  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
   * WEB-42: this ran on every blur, edited or not. Simply moving the remote
   * past Brightness on the way to something else "saved" the current values as
   * the learned look for the room's present light level, which quietly froze
   * the automatic brightness for that level. Only an actual adjustment saves.
   */
  const commit = useCallback(() => {
    if (!isEditing) return;
    setIsEditing(false);
    onSave?.(value);
  }, [isEditing, onSave, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isEditing) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          setIsEditing(true);
        }
        return;
      }

      switch (event.key) {
        case 'Escape':
        case 'Enter':
        case 'Backspace':
          event.preventDefault();
          event.stopPropagation();
          commit();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          event.stopPropagation();
          onChange(Math.max(min, value - step));
          break;
        case 'ArrowRight':
          event.preventDefault();
          event.stopPropagation();
          onChange(Math.min(max, value + step));
          break;
        case 'Home':
          event.preventDefault();
          event.stopPropagation();
          onChange(min);
          break;
        case 'End':
          event.preventDefault();
          event.stopPropagation();
          onChange(max);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          // Swallow vertical movement so the D-pad cannot silently jump out of
          // a slider the user is mid-adjustment on.
          event.preventDefault();
          event.stopPropagation();
          break;
        default:
          break;
      }
    },
    [isEditing, commit, onChange, min, max, step, value],
  );

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-tv-xs font-bold tracking-[0.25em] text-white/60 uppercase">
        <span className="flex items-center gap-2">
          {label}
          {tooltip ? <SettingTooltip text={tooltip} /> : null}
        </span>
        <span
          className={cx(
            'font-mono text-tv-sm transition-colors duration-200',
            isEditing ? 'text-canvas-gold' : 'text-canvas-sage',
          )}
        >
          {isEditing ? <span aria-hidden="true">‹ </span> : null}
          {value}
          {suffix}
          {isEditing ? <span aria-hidden="true"> ›</span> : null}
        </span>
      </div>

      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${value}${suffix}`}
        className="tv-focusable relative flex h-6 cursor-pointer items-center rounded-full outline-none select-none"
        onClick={() => {
          if (!isEditing) {
            setIsEditing(true);
            containerRef.current?.focus();
          }
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      >
        {/* The track is a glass groove; the tint on top says what the control does. */}
        <div
          className={cx(
            'relative w-full rounded-full bg-white/10 shadow-[inset_0_0.0625rem_0.125rem_rgba(0,0,0,0.35)] transition-[height] duration-200',
            isEditing ? 'h-3.5' : 'h-2.5',
          )}
        >
          <div className={`absolute inset-0 rounded-full ${gradientClasses}`} />
          <div
            className={cx(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-[0_0.125rem_0.5rem_rgba(0,0,0,0.45)] transition-all duration-200',
              isEditing ? 'h-7 w-7' : 'h-5 w-5',
            )}
            style={{
              backgroundColor: thumbColor,
              left: `${percent}%`,
              boxShadow: isEditing ? `0 0 1.25rem ${thumbColor}` : undefined,
            }}
          />
        </div>
      </div>
    </div>
  );
}

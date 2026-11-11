/**
 * @file Live lux / Kelvin / motion readout, or an honest "no sensor" state. VISUAL.
 */

import { GLASS_CARD, cx } from '../ui/styles';
import type { ConnectionState, Telemetry } from '../../lib/types';

export interface TelemetryReadoutProps {
  telemetry: Telemetry;
  connection: ConnectionState;
}

function Row({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0">
      <span className="text-tv-xs font-bold tracking-[0.25em] text-white/60 uppercase">
        {label}
      </span>
      <span className="font-mono text-tv-xl leading-none text-canvas-gold">
        {value}
        {unit ? <span className="text-tv-sm text-canvas-sage"> {unit}</span> : null}
      </span>
    </div>
  );
}

export function TelemetryReadout({ telemetry, connection }: TelemetryReadoutProps) {
  /*
   * WEB-18: this used to render the seeded default telemetry regardless of
   * whether a sensor existed, so an unpaired TV showed a plausible live
   * reading. There is no honest number to show when nothing is connected.
   */
  if (connection !== 'connected') {
    return (
      <div
        className={cx(
          GLASS_CARD,
          'flex h-full flex-col items-center justify-center gap-3 p-6 text-center',
        )}
      >
        <p className="text-tv-sm font-bold text-white/70 uppercase">
          {connection === 'searching' ? 'Searching for a sensor…' : 'No live readings'}
        </p>
        <p className="max-w-sm text-tv-xs leading-relaxed text-white/60">
          Brightness and warmth stay where you set them in Display until a sensor is connected.
        </p>
      </div>
    );
  }

  return (
    <div className={cx(GLASS_CARD, 'flex h-full flex-col justify-center gap-6 p-6')}>
      <Row label="Luminance" value={String(Math.round(telemetry.lux))} unit="LUX" />
      <Row
        label="Temperature"
        value={telemetry.temp > 0 ? String(Math.round(telemetry.temp)) : '—'}
        unit="K"
      />
      <Row label="Motion" value={telemetry.motion ? 'Detected' : 'Still'} />
    </div>
  );
}

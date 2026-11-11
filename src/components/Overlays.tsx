/**
 * @file Clock and weather drawn over the artwork. VISUAL.
 */
import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  WifiOff,
} from 'lucide-react';

import { formatTemperature, weatherIconFor } from '../lib/weather';
import type { ConnectionState, OverlayFont, TemperatureUnit } from '../lib/types';

export function overlayFontClass(font: OverlayFont): string {
  switch (font) {
    case 'serif':
      return 'font-serif';
    case 'mono':
      return 'font-mono';
    case 'sans':
      return 'font-sans';
    case 'script':
      return '';
    default:
      return '';
  }
}

export function overlayFontStyle(font: OverlayFont): React.CSSProperties | undefined {
  return font === 'script' ? { fontFamily: 'var(--font-script)' } : undefined;
}

/** WEB-10: icon selection is driven by the shared WMO mapping, not inline ranges. */
export function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const shared = className ?? 'h-10 w-10 text-canvas-gold opacity-90';
  switch (weatherIconFor(code)) {
    case 'clear':
      return <Sun className={shared} aria-hidden="true" />;
    case 'partly-cloudy':
    case 'cloudy':
      return <Cloud className={shared} aria-hidden="true" />;
    case 'fog':
      return <CloudFog className={shared} aria-hidden="true" />;
    case 'drizzle':
      return <CloudDrizzle className={shared} aria-hidden="true" />;
    case 'rain':
      return <CloudRain className={shared} aria-hidden="true" />;
    case 'snow':
      return <CloudSnow className={shared} aria-hidden="true" />;
    case 'thunderstorm':
      // WEB-10: previously unreachable — storms rendered as a snow cloud.
      return <CloudLightning className={shared} aria-hidden="true" />;
    default:
      return <Cloud className={shared} aria-hidden="true" />;
  }
}

export interface OverlaysProps {
  showClock: boolean;
  showWeather: boolean;
  font: OverlayFont;
  unit: TemperatureUnit;
  weatherTemp: number | null;
  weatherCode: number;
  weatherLabel: string;
  connection: ConnectionState;
  isScreenBlack: boolean;
  isOledDimmed: boolean;
  overlayOpacity: number;
  /** Suppresses the connection chip in screensaver mode. */
  compact?: boolean;
}

export function Overlays(props: OverlaysProps) {
  const {
    showClock,
    showWeather,
    font,
    unit,
    weatherTemp,
    weatherCode,
    weatherLabel,
    connection,
    isScreenBlack,
    isOledDimmed,
    overlayOpacity,
    compact = false,
  } = props;

  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fontClass = overlayFontClass(font);
  const fontStyle = overlayFontStyle(font);
  const dimClass = isOledDimmed ? 'opacity-20' : 'opacity-100';

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-30 flex w-full items-start justify-between p-14 transition-all duration-1000"
      style={{ opacity: isScreenBlack ? 0 : 0.15 + overlayOpacity * 0.85 }}
    >
      <div className={`transition-opacity duration-[3000ms] ${showClock ? dimClass : 'opacity-0'}`}>
        <div
          className={`text-tv-clock leading-none tracking-tighter text-canvas-parchment drop-shadow-2xl ${fontClass}`}
          style={fontStyle}
        >
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          className={`mt-4 text-tv-xs font-bold tracking-[0.3em] text-canvas-sage uppercase opacity-80 drop-shadow-md ${fontClass}`}
          style={fontStyle}
        >
          {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>

        {/*
          WEB-18: with no sensor the app used to render its seeded default
          telemetry as though it were live. The user had no way to tell an
          unpaired TV from a working one. This chip states it plainly.
        */}
        {!compact && connection !== 'connected' ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-tv-xs tracking-[0.22em] text-white/70 uppercase shadow-[inset_0_0.0625rem_0_rgba(255,255,255,0.1)]">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            {connection === 'searching' ? 'Looking for sensor' : 'No sensor connected'}
          </div>
        ) : null}
      </div>

      <div
        className={`text-right transition-opacity duration-[3000ms] ${showWeather ? dimClass : 'opacity-0'}`}
      >
        <div className="flex flex-col items-end gap-2">
          <div
            className={`text-tv-2xl leading-none tracking-tighter text-canvas-parchment drop-shadow-2xl ${fontClass}`}
            style={fontStyle}
          >
            {formatTemperature(weatherTemp, unit)}
          </div>
          <div className="flex h-12 origin-right scale-110 items-center justify-end">
            <WeatherIcon code={weatherCode} />
          </div>
        </div>
        <div
          className={`mt-4 max-w-[26rem] truncate text-tv-xs font-bold tracking-[0.3em] text-canvas-sage uppercase opacity-80 drop-shadow-md ${fontClass}`}
          style={fontStyle}
        >
          {weatherLabel}
        </div>
      </div>
    </div>
  );
}

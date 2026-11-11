/**
 * @file Owns weather state and refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchWeather, getCurrentPosition } from '../lib/weather';

const REFRESH_MS = 15 * 60 * 1000;

export type WeatherStatus = 'disabled' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'error';

export interface UseWeatherResult {
  status: WeatherStatus;
  temperatureC: number | null;
  code: number;
  location: string;
  label: string;
  refresh: () => void;
  requestPermission: () => Promise<boolean>;
}

function labelFor(status: WeatherStatus, location: string): string {
  switch (status) {
    case 'disabled':
      return 'Weather Off';
    case 'locating':
      return 'Locating…';
    case 'denied':
      return 'Location Access Denied';
    case 'unavailable':
      return 'Location Unavailable';
    case 'error':
      return 'Weather Unavailable';
    default:
      return location;
  }
}

export function useWeather(enabled: boolean): UseWeatherResult {
  const [status, setStatus] = useState<WeatherStatus>('disabled');
  const [temperatureC, setTemperatureC] = useState<number | null>(null);
  const [code, setCode] = useState(0);
  const [location, setLocation] = useState('');

  // Guards against a late response from a previous enable/disable cycle
  // overwriting current state.
  const generation = useRef(0);

  const run = useCallback(async () => {
    const id = ++generation.current;
    // Only the first lookup says "Locating…". The 15-minute refresh used to
    // say it too, blinking the place name off the screen four times an hour.
    setStatus((current) => (current === 'ready' ? current : 'locating'));

    const coords = await getCurrentPosition();
    if (id !== generation.current) return;

    if (!coords) {
      setStatus(
        typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'denied' : 'unavailable',
      );
      setTemperatureC(null);
      return;
    }

    /*
     * WEB-11: the previous implementation read
     * `data.current_weather.temperature` with no validation, from inside an
     * async geolocation callback that the enclosing try/catch could not cover.
     * A rate-limited or malformed response threw an unhandled rejection and the
     * overlay silently kept showing stale numbers. fetchWeather now validates
     * the payload shape and returns null instead of throwing.
     */
    const reading = await fetchWeather(coords);
    if (id !== generation.current) return;

    if (!reading) {
      // A failed refresh keeps the last good reading rather than blanking a
      // working overlay over one dropped request; it is at most minutes old.
      setStatus((current) => (current === 'ready' ? current : 'error'));
      return;
    }

    setTemperatureC(reading.temperatureC);
    setCode(reading.code);
    setLocation(reading.location);
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!enabled) {
      generation.current += 1;
      setStatus('disabled');
      setTemperatureC(null);
      setLocation('');
      return;
    }

    void run();
    const timer = setInterval(() => void run(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, run]);

  const requestPermission = useCallback(async () => {
    const coords = await getCurrentPosition();
    return coords !== null;
  }, []);

  return {
    status,
    temperatureC,
    code,
    location,
    label: labelFor(status, location),
    refresh: () => void run(),
    requestPermission,
  };
}

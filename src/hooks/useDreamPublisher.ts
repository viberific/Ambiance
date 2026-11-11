/**
 * @file Publishes a state snapshot for the screensaver to render.
 */

import { useEffect, useRef } from 'react';

import { publishDreamState, type DreamState } from '../lib/native';

const PUBLISH_INTERVAL_MS = 30_000;

/**
 * AND-06: the screensaver (AmbientDreamService) runs a WebView with no
 * Capacitor bridge, on a file:// origin, so it shares no localStorage with the
 * app and cannot reach the sensor. It previously rendered hardcoded defaults
 * forever while retrying requests that could never succeed.
 *
 * The main activity pushes a snapshot through the native bridge; the dream
 * reads it back on load. Published on change and on a slow timer, so a long
 * idle period still leaves the screensaver with something recent.
 */
export function useDreamPublisher(state: DreamState): void {
  const stateRef = useRef(state);
  stateRef.current = state;

  /*
   * WEB-48: this republished whenever the snapshot object changed, and the
   * snapshot carries the live sensor reading, which is a new object every
   * second. So the TV wrote the screensaver snapshot to its flash storage once
   * a second, around the clock. The screensaver never draws the raw reading,
   * so it is left out of the "has anything changed" test; the 30-second timer
   * below still keeps it reasonably fresh.
   */
  const { telemetry: _telemetry, ...visible } = state;
  const fingerprint = JSON.stringify(visible);

  useEffect(() => {
    publishDreamState(stateRef.current);
  }, [fingerprint]);

  useEffect(() => {
    const timer = setInterval(() => publishDreamState(stateRef.current), PUBLISH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
}

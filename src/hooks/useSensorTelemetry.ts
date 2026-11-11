/**
 * @file Owns the telemetry polling loop for the selected sensor.
 */

import { useEffect, useRef } from 'react';

import { readSensor } from '../lib/sensor';
import { sensorFromStatus, telemetryFrom } from '../lib/sensor-utils';
import { EMPTY_TELEMETRY } from '../lib/sensor-store';
import type { SensorInfo, Telemetry } from '../lib/types';

/**
 * WEB-14: the old interval was 250ms — four HTTP round trips per second to an
 * ESP32 whose sensor integration time is 50ms and whose single-threaded web
 * server also serves the admin UI. One second is well inside what the UI needs
 * and leaves the device able to breathe.
 */
const TELEMETRY_INTERVAL_MS = 1000;
const TELEMETRY_TIMEOUT_MS = 900;

/**
 * WEB-47: one missed reading used to mean "sensor lost". An ESP32 on Wi-Fi
 * drops the odd request as a matter of course, and each drop flashed the "No
 * sensor connected" badge, woke a sleeping screen and restarted the sleep
 * countdown — so in a home with patchy Wi-Fi the TV might never sleep at all.
 * The sensor is only declared lost after this many misses in a row.
 */
const MISSES_BEFORE_LOST = 4;

export interface UseSensorTelemetryOptions {
  selectedSensorId: string;
  /** Getter backed by a ref, so the sensor map is never an effect dependency. */
  getSensor: (id: string) => SensorInfo | undefined;
  onTelemetry: (telemetry: Telemetry) => void;
  onSensorSeen: (sensor: SensorInfo) => void;
  onConnectionChange: (connected: boolean) => void;
  /** Runs after a successful read, to flush anything queued while offline. */
  onReachable: (sensor: SensorInfo) => void;
}

export function useSensorTelemetry(options: UseSensorTelemetryOptions): void {
  const {
    selectedSensorId,
    getSensor,
    onTelemetry,
    onSensorSeen,
    onConnectionChange,
    onReachable,
  } = options;

  const callbacks = useRef({
    getSensor,
    onTelemetry,
    onSensorSeen,
    onConnectionChange,
    onReachable,
  });
  callbacks.current = {
    getSensor,
    onTelemetry,
    onSensorSeen,
    onConnectionChange,
    onReachable,
  };

  /** Prevents overlapping polls when the device is slow to answer. */
  const inFlight = useRef(false);
  const misses = useRef(0);
  /*
   * The address that last answered. Each sensor has up to three (its .local
   * name, the bare name, its IP) and they were tried in the same order every
   * second. On the many Android TVs that cannot resolve .local names, every
   * single reading waited out two failed lookups before reaching the IP.
   */
  const lastGoodTarget = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedSensorId) {
      onTelemetry(EMPTY_TELEMETRY);
      return;
    }

    let stopped = false;
    misses.current = 0;
    lastGoodTarget.current = undefined;

    const poll = async () => {
      if (inFlight.current || stopped) return;

      const sensor = callbacks.current.getSensor(selectedSensorId);
      if (!sensor) return;

      inFlight.current = true;
      try {
        const result = await readSensor(sensor, TELEMETRY_TIMEOUT_MS, lastGoodTarget.current);
        if (stopped) return;

        if (!result) {
          misses.current += 1;
          if (misses.current >= MISSES_BEFORE_LOST) {
            lastGoodTarget.current = undefined;
            callbacks.current.onConnectionChange(false);
          }
          return;
        }
        misses.current = 0;
        lastGoodTarget.current = result.target;

        callbacks.current.onTelemetry(telemetryFrom(result.status));
        callbacks.current.onConnectionChange(true);
        callbacks.current.onSensorSeen(sensorFromStatus(result.status, result.target));
        callbacks.current.onReachable(sensor);
      } finally {
        inFlight.current = false;
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), TELEMETRY_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
    // Deliberately depends only on the selected id. See WEB-04 in
    // useSensorDiscovery.ts for why the sensor map must never appear here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSensorId]);
}

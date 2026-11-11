/**
 * @file Composes sensor state, discovery, telemetry and actions into one API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSensorDiscovery } from './useSensorDiscovery';
import { useSensorTelemetry } from './useSensorTelemetry';
import {
  changeSensorPassword,
  pairSensor,
  probeTarget,
  renameSensor,
  unpairSensor,
} from '../lib/sensor';
import { DEFAULT_ADMIN_USER, normaliseSensorName, sensorFromStatus } from '../lib/sensor-utils';
import {
  EMPTY_TELEMETRY,
  isSameSensor,
  loadSensorMap,
  mergeSensor,
  stableTvId,
} from '../lib/sensor-store';
import { debouncedSave, load, save } from '../lib/storage';
import type {
  ConnectionState,
  SensorCallOutcome,
  SensorCredentials,
  SensorInfo,
  Telemetry,
} from '../lib/types';

export interface UseSensorNetworkResult {
  sensors: Record<string, SensorInfo>;
  selectedSensorId: string;
  selectedSensor: SensorInfo | null;
  telemetry: Telemetry;
  connection: ConnectionState;
  isScanning: boolean;
  tvId: string;
  credentials: SensorCredentials | null;
  pendingRenames: Record<string, string>;

  rescan: () => void;
  selectSensor: (id: string) => void;
  forgetSensor: (id: string) => void;
  addManualSensor: (address: string) => Promise<{ outcome: SensorCallOutcome; sensorId: string }>;
  setCredentials: (credentials: SensorCredentials | null) => void;
  rename: (id: string, name: string) => Promise<SensorCallOutcome>;
  pair: (id: string) => Promise<SensorCallOutcome>;
  unpair: (id: string) => Promise<SensorCallOutcome>;
  changePassword: (id: string, newPassword: string) => Promise<SensorCallOutcome>;
}

export function useSensorNetwork(): UseSensorNetworkResult {
  const [sensors, setSensors] = useState<Record<string, SensorInfo>>(loadSensorMap);
  const [selectedSensorId, setSelectedSensorId] = useState<string>(() =>
    load<string>('selectedSensorId', ''),
  );
  const [pendingRenames, setPendingRenames] = useState<Record<string, string>>(() =>
    load<Record<string, string>>('pendingRenames', {}),
  );
  const [telemetry, setTelemetry] = useState<Telemetry>(EMPTY_TELEMETRY);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [isScanning, setIsScanning] = useState(true);
  const [credentials, setCredentialsState] = useState<SensorCredentials | null>(() => {
    const stored = load<SensorCredentials | null>('sensorCredentials', null);
    return stored && typeof stored.user === 'string' && typeof stored.password === 'string'
      ? stored
      : null;
  });

  const tvId = useMemo(stableTvId, []);

  /*
   * WEB-04: these mirrors exist so no effect ever has to depend on the sensor
   * map. Depending on it caused discovery to retrigger itself endlessly.
   */
  const sensorsRef = useRef(sensors);
  sensorsRef.current = sensors;
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;
  const selectedIdRef = useRef(selectedSensorId);
  selectedIdRef.current = selectedSensorId;
  const renameFlushing = useRef(false);
  const pendingRenamesRef = useRef(pendingRenames);
  pendingRenamesRef.current = pendingRenames;

  const persistSensors = useMemo(
    () => debouncedSave<Record<string, SensorInfo>>('sensors', 5000),
    [],
  );

  // WEB-28: release the writer (and its entry in the module flush set) on
  // unmount, after committing anything still pending.
  useEffect(() => persistSensors.dispose, [persistSensors]);

  /* ------------------------------------------------------------------- state */

  const upsertSensor = useCallback(
    (incoming: SensorInfo) => {
      setSensors((previous) => {
        const existing = previous[incoming.id];
        const merged = mergeSensor(existing, incoming);
        // WEB-14: bail out when nothing meaningful changed.
        if (isSameSensor(existing, merged)) return previous;

        const next = { ...previous, [incoming.id]: merged };
        persistSensors(next);
        return next;
      });
    },
    [persistSensors],
  );

  const selectSensor = useCallback((id: string) => {
    setSelectedSensorId(id);
    save('selectedSensorId', id);
  }, []);

  const setCredentials = useCallback((next: SensorCredentials | null) => {
    setCredentialsState(next);
    save('sensorCredentials', next);
  }, []);

  const forgetSensor = useCallback(
    (id: string) => {
      setSensors((previous) => {
        const next = { ...previous };
        delete next[id];
        persistSensors(next);
        return next;
      });
      setSelectedSensorId((current) => {
        if (current !== id) return current;
        save('selectedSensorId', '');
        return '';
      });
    },
    [persistSensors],
  );

  const clearPendingRename = useCallback((id: string) => {
    setPendingRenames((previous) => {
      if (!(id in previous)) return previous;
      const next = { ...previous };
      delete next[id];
      save('pendingRenames', next);
      return next;
    });
  }, []);

  const rescan = useCallback(() => setIsScanning(true), []);

  /* --------------------------------------------------------------- lifecycle */

  useSensorDiscovery({
    isScanning,
    knownSensors: useCallback(() => Object.values(sensorsRef.current), []),
    hasSelection: Boolean(selectedSensorId),
    connection,
    onFound: useCallback(
      (sensor: SensorInfo) => {
        upsertSensor(sensor);
        if (!selectedIdRef.current) selectSensor(sensor.id);
      },
      [upsertSensor, selectSensor],
    ),
    onSettled: useCallback((found: boolean) => {
      setConnection(found ? 'connected' : 'lost');
      setIsScanning(false);
    }, []),
    onRetry: rescan,
  });

  useSensorTelemetry({
    selectedSensorId,
    getSensor: useCallback((id: string) => sensorsRef.current[id], []),
    onTelemetry: setTelemetry,
    onSensorSeen: upsertSensor,
    onConnectionChange: useCallback(
      (connected: boolean) => setConnection(connected ? 'connected' : 'lost'),
      [],
    ),
    // Flush a rename queued while the sensor was unreachable.
    onReachable: useCallback(
      (sensor: SensorInfo) => {
        const queued = pendingRenamesRef.current[sensor.id];
        if (!queued || renameFlushing.current) return;
        /*
         * WEB-49: this runs after every successful reading, i.e. once a second,
         * and only ever let go of a queued rename when the sensor accepted it.
         * With a wrong or missing password the sensor refused it every second,
         * forever — and five refusals lock the sensor for a minute, so it
         * stayed locked and could not be paired or renamed at all. One attempt
         * at a time, and any definite answer ends the queue.
         */
        renameFlushing.current = true;
        void renameSensor(sensor, queued, credentialsRef.current)
          .then((outcome) => {
            if (outcome !== 'unreachable') clearPendingRename(sensor.id);
          })
          .finally(() => {
            renameFlushing.current = false;
          });
      },
      [clearPendingRename],
    ),
  });

  /* ----------------------------------------------------------------- actions */

  const withSensor = useCallback(
    (id: string, action: (sensor: SensorInfo) => Promise<SensorCallOutcome>) => {
      const sensor = sensorsRef.current[id];
      if (!sensor) return Promise.resolve<SensorCallOutcome>('unreachable');
      return action(sensor);
    },
    [],
  );

  const rename = useCallback(
    async (id: string, rawName: string): Promise<SensorCallOutcome> => {
      const formatted = normaliseSensorName(rawName);
      if (!formatted) return 'bad_request';

      // Optimistic local update so the UI responds immediately.
      const existing = sensorsRef.current[id];
      if (existing) upsertSensor({ ...existing, name: formatted, lastSeen: Date.now() });

      const outcome = await withSensor(id, (sensor) =>
        renameSensor(sensor, formatted, credentialsRef.current),
      );

      if (outcome === 'unreachable') {
        setPendingRenames((previous) => {
          const next = { ...previous, [id]: formatted };
          save('pendingRenames', next);
          return next;
        });
      } else if (outcome === 'ok') {
        clearPendingRename(id);
      }

      return outcome;
    },
    [upsertSensor, withSensor, clearPendingRename],
  );

  const pair = useCallback(
    async (id: string): Promise<SensorCallOutcome> => {
      const outcome = await withSensor(id, (sensor) =>
        pairSensor(sensor, tvId, credentialsRef.current),
      );
      if (outcome === 'ok') {
        const existing = sensorsRef.current[id];
        if (existing) upsertSensor({ ...existing, pairedTvId: tvId, lastSeen: Date.now() });
        selectSensor(id);
      }
      return outcome;
    },
    [tvId, upsertSensor, withSensor, selectSensor],
  );

  const unpair = useCallback(
    async (id: string): Promise<SensorCallOutcome> => {
      const outcome = await withSensor(id, (sensor) =>
        unpairSensor(sensor, credentialsRef.current),
      );
      if (outcome === 'ok') {
        const existing = sensorsRef.current[id];
        if (existing) {
          const { pairedTvId: _cleared, ...rest } = existing;
          upsertSensor({ ...rest, lastSeen: Date.now() });
        }
      }
      return outcome;
    },
    [upsertSensor, withSensor],
  );

  const changePassword = useCallback(
    async (id: string, newPassword: string): Promise<SensorCallOutcome> => {
      const outcome = await withSensor(id, (sensor) =>
        changeSensorPassword(sensor, newPassword, credentialsRef.current),
      );
      if (outcome === 'ok') {
        setCredentials({
          user: credentialsRef.current?.user ?? DEFAULT_ADMIN_USER,
          password: newPassword,
        });
        const existing = sensorsRef.current[id];
        if (existing) upsertSensor({ ...existing, passwordNeedsChange: false });
      }
      return outcome;
    },
    [setCredentials, upsertSensor, withSensor],
  );

  const addManualSensor = useCallback(
    async (address: string): Promise<{ outcome: SensorCallOutcome; sensorId: string }> => {
      // People type what the sensor's own page shows them: tolerate a pasted
      // "http://" and a trailing path.
      const target = address
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '');
      if (!target) return { outcome: 'bad_request', sensorId: '' };

      const result = await probeTarget(target, 3000);
      if (!result) return { outcome: 'unreachable', sensorId: '' };

      const sensor = sensorFromStatus(result.status, result.target);
      const sensorId = sensor.id;
      upsertSensor(sensor);

      if (sensor.pairedTvId && sensor.pairedTvId !== tvId) {
        return { outcome: 'already_paired_elsewhere', sensorId };
      }

      const outcome = await pairSensor(sensor, tvId, credentialsRef.current);
      if (outcome === 'ok') {
        upsertSensor({ ...sensor, pairedTvId: tvId });
        selectSensor(sensor.id);
      }
      return { outcome, sensorId };
    },
    [tvId, upsertSensor, selectSensor],
  );

  return {
    sensors,
    selectedSensorId,
    selectedSensor: selectedSensorId ? (sensors[selectedSensorId] ?? null) : null,
    telemetry,
    connection,
    isScanning,
    tvId,
    credentials,
    pendingRenames,
    rescan,
    selectSensor,
    forgetSensor,
    addManualSensor,
    setCredentials,
    rename,
    pair,
    unpair,
    changePassword,
  };
}

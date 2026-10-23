/**
 * @file Sensor HTTP calls + outcome classification. Pure helpers live in sensor-utils.ts.
 */
/**
 * The one and only place sensor HTTP calls are made.
 *
 * WEB-01: the previous client fetched `http://<target>/` and called res.json()
 * on the result. The firmware changed `/` to a 302 redirect to `/ui`, which
 * serves the HTML admin page. Parsing that as JSON threw on every poll, so the
 * connection state was pinned to 'lost' and telemetry never updated. The same
 * dead endpoint backed pairSensor()'s fallback probe.
 *
 * Pure helpers (naming, addressing, validation) live in sensor-utils.ts and are
 * re-exported here so callers have a single import site.
 */

import { sensorRequest } from './http';
import { isSensorStatus, sensorTargets, statusUrl } from './sensor-utils';
import type { SensorCallOutcome, SensorCredentials, SensorInfo, SensorStatus } from './types';

export {
  DEFAULT_ADMIN_USER,
  MIN_ADMIN_PASSWORD_LENGTH,
  SENSOR_NAME_MAX,
  SENSOR_NAME_SUFFIX,
  SETUP_PORTAL_SSID,
  displayName,
  isIpv4,
  isSensorStatus,
  normaliseSensorName,
  sensorFromStatus,
  sensorTargets,
  statusUrl,
  telemetryFrom,
} from './sensor-utils';

export interface ProbeResult {
  status: SensorStatus;
  target: string;
}

/** Reads /api/status from a single host. */
export async function probeTarget(
  target: string,
  timeoutMs = 1200,
  signal?: AbortSignal,
): Promise<ProbeResult | null> {
  const result = await sensorRequest<SensorStatus>(statusUrl(target), {
    timeoutMs,
    ...(signal ? { signal } : {}),
  });
  if (!result.ok || !isSensorStatus(result.data)) return null;
  return { status: result.data, target };
}

/** Tries each known name/address for a sensor until one answers. */
export async function readSensor(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  timeoutMs = 1200,
): Promise<ProbeResult | null> {
  for (const target of sensorTargets(sensor)) {
    const result = await probeTarget(target, timeoutMs);
    if (result) return result;
  }
  return null;
}

/**
 * Maps firmware HTTP semantics onto a single outcome the UI can act on.
 *
 * WEB-02/WEB-03: 401 (missing credentials) and 428 (factory password still set)
 * were both previously invisible. 401 fell through every branch of the old
 * pairSensor() and surfaced to the user as "unreachable", which sends people
 * chasing a network fault instead of entering a password.
 */
function classify(status: number, ok: boolean): SensorCallOutcome {
  if (ok) return 'ok';
  switch (status) {
    case 401:
      return 'unauthorized';
    case 428:
      return 'password_change_required';
    case 409:
      return 'already_paired_elsewhere';
    // FW-12: the firmware's wrong-password lockout. This used to fall through to
    // 'bad_request' and tell the user to update the sensor's firmware.
    case 429:
      return 'locked_out';
    case 400:
      return 'bad_request';
    case 0:
      return 'unreachable';
    default:
      return status >= 500 ? 'unreachable' : 'bad_request';
  }
}

async function writeToSensor(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  path: string,
  body: unknown,
  credentials: SensorCredentials | null,
): Promise<SensorCallOutcome> {
  let lastOutcome: SensorCallOutcome = 'unreachable';

  for (const target of sensorTargets(sensor)) {
    const result = await sensorRequest(`http://${target}${path}`, {
      method: 'POST',
      body,
      credentials,
      timeoutMs: 4000,
    });

    const outcome = classify(result.status, result.ok);
    if (outcome === 'ok') return 'ok';

    // A definitive answer from the device: stop trying other addresses, because
    // the problem is not connectivity.
    if (outcome !== 'unreachable') return outcome;
    lastOutcome = outcome;
  }

  return lastOutcome;
}

export function pairSensor(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  tvId: string,
  credentials: SensorCredentials | null,
): Promise<SensorCallOutcome> {
  return writeToSensor(sensor, '/api/pair', { tvId }, credentials);
}

export function unpairSensor(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  credentials: SensorCredentials | null,
): Promise<SensorCallOutcome> {
  return writeToSensor(sensor, '/api/unpair', {}, credentials);
}

export function renameSensor(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  name: string,
  credentials: SensorCredentials | null,
): Promise<SensorCallOutcome> {
  return writeToSensor(sensor, '/api/name', { name }, credentials);
}

export function changeSensorPassword(
  sensor: Pick<SensorInfo, 'ip' | 'hostname'>,
  newPassword: string,
  credentials: SensorCredentials | null,
): Promise<SensorCallOutcome> {
  return writeToSensor(sensor, '/api/admin-password', { password: newPassword }, credentials);
}

/** Human-readable, actionable text for each failure mode. */
export function describeOutcome(outcome: SensorCallOutcome): string {
  switch (outcome) {
    case 'ok':
      return 'Done.';
    case 'unauthorized':
      return 'The sensor rejected the admin password. Re-enter it under Set Password.';
    case 'password_change_required':
      return 'This sensor still has its factory password. Set a new one before pairing.';
    case 'already_paired_elsewhere':
      return 'This sensor is already paired to a different TV.';
    case 'locked_out':
      return 'Too many wrong passwords. The sensor is locked for one minute — wait, then try again.';
    case 'bad_request':
      return 'The sensor rejected the request. Check that its firmware is up to date.';
    case 'unreachable':
      return 'Could not reach the sensor. Check it is powered on and on the same network.';
    default:
      return 'Unknown error.';
  }
}

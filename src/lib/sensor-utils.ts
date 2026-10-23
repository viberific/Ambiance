/**
 * @file Pure sensor helpers (names, addresses, validation). No I/O. Mirrors firmware rules.
 */
/**
 * Pure sensor helpers: naming, addressing, payload validation.
 *
 * Deliberately free of any I/O import. sensor.ts pulls in CapacitorHttp, which
 * cannot load outside a native runtime, so keeping these functions here is what
 * makes them unit-testable — and it keeps the address/name rules, which must
 * stay in lockstep with the firmware, in one small auditable file.
 */

import type { SensorInfo, SensorStatus, Telemetry } from './types';

export const SENSOR_NAME_SUFFIX = ' - ambient tv sensor';
/** Must match SENSOR_NAME_MAX in firmware/ambient_sensor.ino. */
export const SENSOR_NAME_MAX = 24;
export const SETUP_PORTAL_SSID = 'Ambient Setup';
export const DEFAULT_ADMIN_USER = 'admin';
export const MIN_ADMIN_PASSWORD_LENGTH = 10;

/**
 * Candidate hostnames for a sensor, most-likely-first.
 *
 * The mDNS name is tried before the cached IP because DHCP leases move and the
 * `.local` name does not.
 */
export function sensorTargets(sensor: Pick<SensorInfo, 'ip' | 'hostname'>): string[] {
  const targets: string[] = [];
  const push = (value: string | undefined) => {
    if (value && !targets.includes(value)) targets.push(value);
  };

  if (sensor.hostname) {
    const bare = sensor.hostname.replace(/\.local$/, '');
    push(`${bare}.local`);
    push(bare);
  }
  push(sensor.ip);
  return targets;
}

/** The /24 prefix of a dotted-quad, or null if it is not one. */
export function subnetOf(ip: string): string | null {
  if (!isIpv4(ip)) return null;
  return ip.split('.').slice(0, 3).join('.');
}

export function isIpv4(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  return match.slice(1).every((octet) => {
    const n = Number(octet);
    return n >= 0 && n <= 255;
  });
}

/**
 * WEB-01: JSON lives at /api/status. The old client polled `/`, which the
 * firmware 302-redirects to the HTML admin page at /ui.
 */
export function statusUrl(target: string): string {
  return `http://${target}/api/status`;
}

/**
 * Reduces a stored sensor name to the bare room name.
 *
 * FW-11: firmware before phase6 re-formatted its stored name on every boot,
 * cutting it to 24 characters *including* the old suffix and appending a new
 * one, so "Living Room" came back from a power cut as "Living Room - ambient
 * tv - ambient tv sensor". The damage signature (exactly 24 characters ending
 * in a cut-off start of the suffix) is recognised and repaired here, so the
 * app shows the right name even for a sensor that has not been reflashed.
 *
 * Mirrors stripBroadcastSuffix() in firmware/ambient_sensor.ino.
 */
export function stripSensorNameSuffix(name: string): string {
  let base = name;
  while (base.endsWith(SENSOR_NAME_SUFFIX)) base = base.slice(0, -SENSOR_NAME_SUFFIX.length);

  if (base.length === SENSOR_NAME_MAX) {
    for (let cut = SENSOR_NAME_SUFFIX.length - 1; cut >= 3; cut--) {
      if (base.endsWith(SENSOR_NAME_SUFFIX.slice(0, cut))) {
        base = base.slice(0, -cut);
        break;
      }
    }
  }
  return base;
}

/** Strips the broadcast suffix so the rename field shows just the room name. */
export function displayName(name: string): string {
  return stripSensorNameSuffix(name).trim();
}

/**
 * Mirrors buildBroadcastName() in the firmware so the UI predicts exactly what
 * the device will store, rather than showing a name the sensor then rejects.
 *
 * FW-06: quotes and backslashes are stripped because the firmware interpolates
 * this value straight into its JSON response without escaping.
 */
export function normaliseSensorName(raw: string): string {
  const cleaned = stripSensorNameSuffix(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/["\\]/g, '')
    .trim()
    .slice(0, SENSOR_NAME_MAX)
    .trim();
  if (!cleaned) return '';
  return cleaned + SENSOR_NAME_SUFFIX;
}

export function isSensorStatus(value: unknown): value is SensorStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.lux === 'number' &&
    typeof v.temp === 'number' &&
    typeof v.motion === 'boolean'
  );
}

export function telemetryFrom(status: SensorStatus): Telemetry {
  return {
    // The TCS34725 can emit nonsense while it settles after power-on.
    lux: Number.isFinite(status.lux) ? Math.max(0, status.lux) : 0,
    temp: Number.isFinite(status.temp) ? Math.max(0, status.temp) : 0,
    motion: status.motion === true,
  };
}

export function sensorFromStatus(status: SensorStatus, target: string): SensorInfo {
  return {
    id: status.id,
    name: status.name || 'Unknown Sensor',
    ip: isIpv4(target) ? target : '',
    hostname: status.hostname || undefined,
    lastSeen: Date.now(),
    pairedTvId: status.pairedTvId || undefined,
    firmwareVersion: status.firmwareVersion,
    passwordNeedsChange: status.passwordNeedsChange === true,
  };
}

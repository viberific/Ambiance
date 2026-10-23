/**
 * @file Shared vocabulary for the whole app. Read this first when touching TypeScript.
 */
/** Shared domain types for Ambient Canvas. */

/** Live readings from an ESP32 ambient sensor. */
export interface Telemetry {
  lux: number;
  /** Correlated colour temperature in Kelvin. 0 when the room is too dark to measure. */
  temp: number;
  motion: boolean;
}

/**
 * WEB-18: the app used to seed telemetry with `{lux:15, temp:2800, motion:true}`
 * and render it identically whether or not a sensor existed, so a user with no
 * hardware saw a plausible-looking live reading. Connection state is now
 * explicit and the UI is required to represent it honestly.
 */
export type ConnectionState = 'idle' | 'searching' | 'connected' | 'lost';

/** A learned brightness/warmth pairing for one ambient-light bucket. */
export interface RoomProfile {
  luminance: number;
  warmth: number;
}

export interface SensorInfo {
  id: string;
  name: string;
  ip: string;
  hostname?: string;
  lastSeen: number;
  pairedTvId?: string;
  firmwareVersion?: string;
  /** Firmware still has the factory admin password; writes will be rejected with 428. */
  passwordNeedsChange?: boolean;
}

/** Shape of GET /api/status as served by firmware/ambient_sensor.ino. */
export interface SensorStatus {
  id: string;
  name: string;
  lux: number;
  temp: number;
  motion: boolean;
  hostname: string;
  paired: boolean;
  pairedTvId: string;
  firmwareVersion: string;
  authRequired: boolean;
  adminUser: string;
  adminUiPath: string;
  setupPortalSsid: string;
  passwordMinLength: number;
  passwordNeedsChange: boolean;
}

/**
 * WEB-02/WEB-03: pairing, rename and unpair all require HTTP Basic auth, and
 * the firmware additionally returns 428 for sensitive writes while the default
 * password is still in place. The old client sent no credentials and handled
 * neither status, so every failure surfaced as a generic "unreachable".
 */
export type SensorCallOutcome =
  | 'ok'
  | 'unauthorized'
  | 'password_change_required'
  | 'already_paired_elsewhere'
  /** 429: five wrong passwords in a row; the firmware refuses writes for a minute. */
  | 'locked_out'
  | 'bad_request'
  | 'unreachable';

export interface SensorCredentials {
  user: string;
  password: string;
}

export type ImageSource = 'curated' | 'local';

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  url: string;
  /** True when bundled in the APK, i.e. usable with no network. */
  local?: boolean;
}

export type OverlayFont = 'serif' | 'sans' | 'mono' | 'script';
export type TemperatureUnit = 'c' | 'f';

import { describe, expect, it } from 'vitest';

import {
  displayName,
  isIpv4,
  normaliseSensorName,
  sensorTargets,
  statusUrl,
  subnetOf,
} from '../src/lib/sensor-utils';
import { activeArtwork, nextIndex, previousIndex, artworkAt } from '../src/lib/artwork';
import { normaliseSettings, DEFAULT_SETTINGS } from '../src/lib/settings';

describe('sensor endpoints', () => {
  /**
   * WEB-01 regression. The client polled `http://<host>/`, which the firmware
   * 302-redirects to the HTML admin page at /ui. JSON parsing threw on every
   * poll and the connection state was pinned to "lost".
   */
  it('targets /api/status, not /', () => {
    expect(statusUrl('192.168.1.50')).toBe('http://192.168.1.50/api/status');
    expect(statusUrl('ambient-abc.local')).toContain('/api/status');
  });

  it('prefers the stable mDNS name over a DHCP address', () => {
    const targets = sensorTargets({ ip: '192.168.1.50', hostname: 'ambient-aabbcc' });
    expect(targets[0]).toBe('ambient-aabbcc.local');
    expect(targets).toContain('192.168.1.50');
  });

  it('does not duplicate an already-suffixed hostname', () => {
    const targets = sensorTargets({ ip: '', hostname: 'ambient-aabbcc.local' });
    expect(targets.filter((t) => t.endsWith('.local')).length).toBe(1);
  });
});

describe('sensor names', () => {
  it('mirrors the firmware broadcast-name format', () => {
    expect(normaliseSensorName('Living Room')).toBe('Living Room - ambient tv sensor');
  });

  it('strips characters that would corrupt the firmware JSON', () => {
    // FW-06: the device interpolates this value into JSON unescaped.
    expect(normaliseSensorName('Den "A"\\B')).toBe('Den AB - ambient tv sensor');
  });

  it('enforces the 24 character device limit', () => {
    const long = 'A'.repeat(80);
    const result = normaliseSensorName(long);
    expect(result.replace(' - ambient tv sensor', '').length).toBe(24);
  });

  it('rejects whitespace-only names', () => {
    expect(normaliseSensorName('   ')).toBe('');
  });

  it('round-trips through displayName', () => {
    expect(displayName(normaliseSensorName('Kitchen'))).toBe('Kitchen');
  });

  // FW-11: formatting a name twice must not change it. Old firmware did this on
  // every boot and the name gained junk each time.
  it('is unchanged by formatting an already-formatted name', () => {
    const once = normaliseSensorName('Living Room');
    expect(normaliseSensorName(once)).toBe(once);
  });

  it('repairs names damaged by older firmware', () => {
    expect(displayName('Living Room - ambient tv - ambient tv sensor')).toBe('Living Room');
    expect(displayName('New Sensor - ambient tv  - ambient tv sensor')).toBe('New Sensor');
    expect(normaliseSensorName('Living Room - ambient tv - ambient tv sensor')).toBe(
      'Living Room - ambient tv sensor',
    );
  });

  it('leaves a short name that happens to end like the suffix alone', () => {
    expect(displayName('Shed - a - ambient tv sensor')).toBe('Shed - a');
  });

  it('keeps a full 24 character name intact', () => {
    const full = 'Upstairs Master Bedroom2';
    expect(full).toHaveLength(24);
    expect(displayName(normaliseSensorName(full))).toBe(full);
  });
});

describe('address helpers', () => {
  it('validates IPv4 including octet range', () => {
    expect(isIpv4('192.168.1.1')).toBe(true);
    expect(isIpv4('999.1.1.1')).toBe(false);
    expect(isIpv4('ambient-abc.local')).toBe(false);
  });

  it('derives a /24 subnet', () => {
    expect(subnetOf('192.168.86.42')).toBe('192.168.86');
    expect(subnetOf('nonsense')).toBeNull();
  });
});

describe('artwork rotation', () => {
  /**
   * WEB-07 regression. Rotation used `(prev + 1) % ARTWORK.length` hardcoded to
   * the 5-item curated array while rendering indexed into localFiles, so a
   * local album of any size only ever cycled its first five images.
   */
  it('cycles the full length of a local album', () => {
    const local = Array.from({ length: 200 }, (_, i) => ({
      id: `local-${i}`,
      title: `Photo ${i}`,
      artist: '',
      url: `blob:${i}`,
    }));

    const list = activeArtwork('local', local);
    expect(list.length).toBe(200);

    let index = 0;
    for (let i = 0; i < 199; i += 1) index = nextIndex(index, list.length);
    expect(index).toBe(199);
    expect(artworkAt(list, index)?.id).toBe('local-199');

    index = nextIndex(index, list.length);
    expect(index).toBe(0);
  });

  it('wraps backwards without going negative', () => {
    expect(previousIndex(0, 5)).toBe(4);
  });

  it('falls back to curated art when a local album is empty', () => {
    expect(activeArtwork('local', []).length).toBeGreaterThan(0);
  });

  it('never returns undefined for an out-of-range index', () => {
    const list = activeArtwork('curated', []);
    expect(artworkAt(list, 9999)).not.toBeNull();
    expect(artworkAt([], 0)).toBeNull();
  });
});

describe('settings normalisation', () => {
  // WEB-15: settings come off disk on an appliance nobody can easily debug.
  it('repairs a corrupt document instead of propagating it', () => {
    const result = normaliseSettings({
      grainIntensity: 'banana',
      rotationMinutes: -12,
      motionSensitivity: 0,
      overlayFont: 'comic-sans',
      showClock: 'yes',
    });

    expect(result.grainIntensity).toBe(DEFAULT_SETTINGS.grainIntensity);
    expect(result.rotationMinutes).toBe(1);
    expect(result.motionSensitivity).toBe(1);
    expect(result.overlayFont).toBe(DEFAULT_SETTINGS.overlayFont);
    expect(result.showClock).toBe(DEFAULT_SETTINGS.showClock);
  });

  it('accepts numeric strings from the pre-v3 storage format', () => {
    expect(normaliseSettings({ blackModeThreshold: '12' }).blackModeThreshold).toBe(12);
  });

  it('returns defaults for junk input', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });
});

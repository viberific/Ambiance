/**
 * Mock ambient sensor.
 *
 * Reproduces the exact HTTP contract of firmware/ambient_sensor.ino, including
 * the failure modes that were previously invisible to the app: 401 when no
 * credentials are sent, 428 while the factory password is still set, 409
 * when the sensor is already paired to another TV, and 429 for a minute after
 * five wrong passwords.
 *
 * Without this, those three paths could only be exercised by physically
 * reflashing an ESP32, which is why they went unnoticed for so long.
 *
 *   npm run mock:sensor
 *   npm run mock:sensor -- --port 8080 --secured --paired
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';

import { normaliseSensorName } from '../src/lib/sensor-utils';

interface MockState {
  id: string;
  name: string;
  hostname: string;
  pairedTvId: string;
  adminPassword: string;
  passwordNeedsChange: boolean;
  lux: number;
  temp: number;
  motion: boolean;
}

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const PORT = portIndex >= 0 ? Number(args[portIndex + 1]) : 8080;
const START_SECURED = args.includes('--secured');
const START_PAIRED = args.includes('--paired');

const state: MockState = {
  id: 'AA:BB:CC:DD:EE:FF',
  name: 'Living Room - ambient tv sensor',
  hostname: 'ambient-aabbccddeeff',
  pairedTvId: START_PAIRED ? 'some-other-tv-id' : '',
  adminPassword: START_SECURED ? 'correcthorsebattery' : 'changeme',
  passwordNeedsChange: !START_SECURED,
  lux: 15,
  temp: 2800,
  motion: true,
};

/** Slow drift so the smoothing and bucketing logic has something to chew on. */
setInterval(() => {
  const drift = (Math.random() - 0.5) * 6;
  state.lux = Math.max(0, Math.round((state.lux + drift) * 10) / 10);
  state.temp = Math.max(0, Math.round(state.temp + (Math.random() - 0.5) * 120));
  if (Math.random() < 0.1) state.motion = !state.motion;
}, 1000);

const app = express();
app.use(express.json({ limit: '16kb' }));

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,X-Firmware-Version,X-Firmware-SHA256',
  );
  next();
});

app.options('*', (_req: Request, res: Response) => res.status(204).end());

function statusPayload() {
  return {
    id: state.id,
    name: state.name,
    lux: state.lux,
    temp: state.temp,
    motion: state.motion,
    hostname: state.hostname,
    paired: state.pairedTvId.length > 0,
    pairedTvId: state.pairedTvId,
    firmwareVersion: 'mock-v1',
    authRequired: true,
    adminUser: 'admin',
    adminUiPath: '/ui',
    setupPortalSsid: 'Ambient Setup',
    passwordMinLength: 10,
    passwordNeedsChange: state.passwordNeedsChange,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

/** WEB-01: `/` redirects to the HTML admin page, exactly as the firmware does. */
app.get('/', (_req: Request, res: Response) => res.redirect(302, '/ui'));

app.get('/ui', (_req: Request, res: Response) =>
  res.type('html').send('<!doctype html><title>Mock Ambient Sensor</title><h1>Mock sensor</h1>'),
);

app.get('/api/status', (_req: Request, res: Response) => res.json(statusPayload()));
app.get('/api/root-status', (_req: Request, res: Response) => res.json(statusPayload()));

/** FW-12: mirrors the firmware's lockout: five failures, then 429 for a minute. */
const AUTH_LOCK_MS = 60_000;
let failedAuthCount = 0;
let authLockStartMs: number | null = null;

/** WEB-02: mirrors the firmware's HTTP Basic requirement. */
function requireAuth(req: Request, res: Response): boolean {
  if (authLockStartMs !== null) {
    if (Date.now() - authLockStartMs < AUTH_LOCK_MS) {
      res.status(429).json({ ok: false, error: 'too many attempts, try again shortly' });
      return false;
    }
    authLockStartMs = null;
  }

  const fail = () => {
    failedAuthCount += 1;
    if (failedAuthCount >= 5) {
      authLockStartMs = Date.now();
      failedAuthCount = 0;
    }
    res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="Ambient Sensor"')
      .json({ ok: false, error: 'authentication required' });
    return false;
  };

  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return fail();

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  if (user !== 'admin' || password !== state.adminPassword) return fail();

  failedAuthCount = 0;
  return true;
}

/** WEB-03: mirrors the firmware's 428 gate on sensitive writes. */
function requireRotatedPassword(res: Response): boolean {
  if (!state.passwordNeedsChange) return true;
  res.status(428).json({ ok: false, error: 'change default admin password first' });
  return false;
}

app.post('/api/name', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  if (!name) return res.status(400).json({ ok: false, error: 'missing name field' });
  // Stored exactly as the firmware's buildBroadcastName() would store it.
  state.name = normaliseSensorName(name) || 'New Sensor - ambient tv sensor';
  return res.json({ ok: true, name: state.name });
});

app.post('/api/pair', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!requireRotatedPassword(res)) return;

  const tvId = typeof req.body?.tvId === 'string' ? req.body.tvId : '';
  if (!tvId) return res.status(400).json({ ok: false, error: 'missing tvId' });
  if (state.pairedTvId && state.pairedTvId !== tvId) {
    return res.status(409).json({ ok: false, error: 'already paired' });
  }
  state.pairedTvId = tvId;
  return res.json({ ok: true, paired: true });
});

app.post('/api/unpair', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!requireRotatedPassword(res)) return;
  state.pairedTvId = '';
  return res.json({ ok: true, paired: false });
});

app.post('/api/admin-password', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (password.length < 10) {
    return res.status(400).json({ ok: false, error: 'password too short' });
  }
  state.adminPassword = password;
  state.passwordNeedsChange = false;
  return res.json({ ok: true });
});

app.post('/api/factory-reset', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!requireRotatedPassword(res)) return;
  state.pairedTvId = '';
  state.name = 'New Sensor - ambient tv sensor';
  state.adminPassword = 'changeme';
  state.passwordNeedsChange = true;
  return res.json({ ok: true, reset: true, restarting: true });
});

app.listen(PORT, () => {
  console.log(`Mock ambient sensor listening on http://localhost:${PORT}`);
  console.log(`  status            GET  /api/status`);
  console.log(`  admin password    ${state.adminPassword}`);
  console.log(`  needs rotation    ${state.passwordNeedsChange}`);
  console.log(`  paired to         ${state.pairedTvId || '(nothing)'}`);
  console.log(`\nAdd it in the app with the manual IP field: localhost:${PORT}`);
});

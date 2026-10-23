/*
 * Ambient Canvas sensor firmware (ESP32 + TCS34725 + PIR)
 *
 * Serves lux / correlated colour temperature / motion to a paired Google TV
 * running the Ambient Canvas app, plus a small local admin UI.
 *
 * Security model, stated plainly: this device speaks plaintext HTTP on the
 * local network. Admin credentials protect it from casual access by other
 * devices on the same LAN; they do not protect against an attacker who can
 * already sniff that LAN. Do not expose this device to the internet, and do not
 * port-forward to it.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <ESPmDNS.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <mbedtls/sha256.h>
#include <mbedtls/base64.h>
#include "Adafruit_TCS34725.h"

/* ------------------------------------------------------------------ config */

static const char *FIRMWARE_VERSION = "phase6-hardened-v1";
static const char *ADMIN_USER = "admin";
static const char *DEFAULT_ADMIN_PASSWORD = "changeme";
static const char *SETUP_PORTAL_SSID = "Ambient Setup";
static const size_t MIN_ADMIN_PASSWORD_LENGTH = 10;
/* Must match SENSOR_NAME_MAX in src/lib/sensor-utils.ts. */
static const size_t SENSOR_NAME_MAX = 24;
/* Must match SENSOR_NAME_SUFFIX in src/lib/sensor-utils.ts. */
static const char *SENSOR_NAME_SUFFIX = " - ambient tv sensor";

static const int MOTION_PIN = 27;
static const int SENSOR_LED_PIN = 14;   // wire the sensor's LED pin here
static const int RESET_BUTTON_PIN = 26;

static const unsigned long RESET_HOLD_MS = 8000;
static const unsigned long AUTH_LOCK_MS = 60000;
static const int AUTH_MAX_FAILURES = 5;
static const unsigned long SENSOR_INTERVAL_MS = 250;
static const unsigned long SERIAL_INTERVAL_MS = 2000;
static const unsigned long OTA_HEALTH_DELAY_MS = 15000;

WebServer server(80);
Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);
Preferences preferences;

/* ------------------------------------------------------------------- state */

uint16_t currentLux = 0;
uint16_t currentTemp = 0;
bool isMotion = false;

float luxAverage = 0.0f;
float tempAverage = 0.0f;
bool haveFirstSample = false;

unsigned long lastReadTime = 0;
unsigned long lastSerialPrint = 0;
unsigned long bootMillis = 0;
bool otaValidityMarked = false;

String macAddress = "";
String hostName = "";
String roomName = "New Sensor";
String pairedTvId = "";

/* FW-07: only a salted hash of the admin password is persisted. */
String adminPasswordHash = "";
String adminPasswordSalt = "";
bool usingDefaultPassword = true;

int failedAuthCount = 0;
/* FW-12: a start time plus a flag, never an absolute deadline. See checkAdminCredentials(). */
bool authLocked = false;
unsigned long authLockStartMs = 0;
unsigned long resetPressStartMs = 0;

/* OTA */
bool otaChecksumActive = false;
bool otaValidationFailed = false;
String otaFailureReason = "";
char otaSha256Expected[65] = {0};
unsigned char otaSha256Digest[32] = {0};
mbedtls_sha256_context otaSha256Ctx;

/*
 * FW-08: the original relied entirely on the Arduino IDE's automatic prototype
 * generation, and called sendCors() from requireAdminAuth() before either was
 * declared. That generation is fragile and is not performed at all by
 * arduino-cli or PlatformIO in some configurations, producing confusing
 * "not declared in this scope" errors. Explicit prototypes.
 */
void sendCors();
enum AuthResult { AUTH_OK, AUTH_LOCKED, AUTH_BAD };
AuthResult checkAdminCredentials();
bool requireAdminAuth();
void eraseEverythingAndRestart();
bool requirePasswordRotationForSensitiveWrite();
String buildStatusJson();
String buildAdminPageHtml();
String jsonEscape(const String &value);
void handleOptions();
void handleRoot();
void handleStatus();
void handleAdminUi();
void handleRename();
void handlePair();
void handleUnpair();
void handleFactoryReset();
void handleAdminPasswordChange();
void handleOtaFinish();
void handleOtaUpload();
void setupNetwork();
void setupMdns();

/* ------------------------------------------------------------ small helpers */

/*
 * FW-06: buildStatusJson() interpolated roomName and pairedTvId straight into
 * a JSON string with no escaping. A single backslash or quote in a device name
 * produced malformed JSON, which the TV app could not parse — the sensor
 * appeared to be offline until it was factory reset. Quotes were stripped on
 * the rename path but pairedTvId came from a POST body and was never filtered
 * at all.
 */
String jsonEscape(const String &value) {
  String out;
  out.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n";  break;
      case '\r': out += "\\r";  break;
      case '\t': out += "\\t";  break;
      default:
        if ((unsigned char)c < 0x20) {
          char buf[7];
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

String toHex(const unsigned char *data, size_t length) {
  String out;
  out.reserve(length * 2);
  char buf[3];
  for (size_t i = 0; i < length; i++) {
    snprintf(buf, sizeof(buf), "%02x", data[i]);
    out += buf;
  }
  return out;
}

/*
 * FW-03: mbedtls_sha256_starts_ret / _update_ret / _finish_ret DO NOT EXIST in
 * the mbedTLS bundled with current Arduino-ESP32 (3.x, ESP-IDF 5.4, mbedTLS
 * 3.6). They were a transitional 2.7-era naming that has since been removed, so
 * this firmware did not compile at all. The unsuffixed names are correct on
 * modern cores; the macro keeps 2.x cores working.
 */
#if defined(MBEDTLS_VERSION_NUMBER) && MBEDTLS_VERSION_NUMBER < 0x03000000
  #define AMBIENT_SHA256_STARTS(ctx, is224) mbedtls_sha256_starts_ret((ctx), (is224))
  #define AMBIENT_SHA256_UPDATE(ctx, in, len) mbedtls_sha256_update_ret((ctx), (in), (len))
  #define AMBIENT_SHA256_FINISH(ctx, out) mbedtls_sha256_finish_ret((ctx), (out))
#else
  #define AMBIENT_SHA256_STARTS(ctx, is224) mbedtls_sha256_starts((ctx), (is224))
  #define AMBIENT_SHA256_UPDATE(ctx, in, len) mbedtls_sha256_update((ctx), (in), (len))
  #define AMBIENT_SHA256_FINISH(ctx, out) mbedtls_sha256_finish((ctx), (out))
#endif

String sha256Hex(const String &input) {
  unsigned char digest[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  AMBIENT_SHA256_STARTS(&ctx, 0);
  AMBIENT_SHA256_UPDATE(&ctx, (const unsigned char *)input.c_str(), input.length());
  AMBIENT_SHA256_FINISH(&ctx, digest);
  mbedtls_sha256_free(&ctx);
  return toHex(digest, sizeof(digest));
}

String randomSalt() {
  char buf[17];
  for (int i = 0; i < 16; i += 4) {
    uint32_t r = esp_random();
    snprintf(&buf[i], 5, "%04x", (unsigned int)(r & 0xFFFF));
  }
  buf[16] = '\0';
  return String(buf);
}

/** Constant-time comparison so auth timing cannot leak the stored hash. */
bool secureEquals(const String &a, const String &b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) {
    diff |= (uint8_t)(a.charAt(i) ^ b.charAt(i));
  }
  return diff == 0;
}

void storeAdminPassword(const String &password) {
  adminPasswordSalt = randomSalt();
  adminPasswordHash = sha256Hex(adminPasswordSalt + password);
  usingDefaultPassword = (password == DEFAULT_ADMIN_PASSWORD);
  preferences.putString("pwSalt", adminPasswordSalt);
  preferences.putString("pwHash", adminPasswordHash);
  preferences.putBool("pwDefault", usingDefaultPassword);
}

bool verifyAdminPassword(const String &candidate) {
  if (adminPasswordHash.length() == 0) return false;
  return secureEquals(sha256Hex(adminPasswordSalt + candidate), adminPasswordHash);
}

bool isDefaultPasswordActive() {
  return usingDefaultPassword;
}

/*
 * FW-11: the stored name already carries the broadcast suffix, and setup() ran
 * it through buildBroadcastName() again on every boot. That cut it to 24
 * characters *including* the old suffix and appended a fresh one, so a sensor
 * renamed "Living Room" came back from its next power cut as
 * "Living Room - ambient tv". Names are now reduced to the bare room name
 * before formatting, which makes formatting safe to repeat, and names already
 * damaged that way are repaired.
 *
 * Mirrored by stripSensorNameSuffix() in src/lib/sensor-utils.ts.
 */
String stripBroadcastSuffix(const String &name) {
  const String suffix = SENSOR_NAME_SUFFIX;
  String base = name;
  while (base.endsWith(suffix)) base = base.substring(0, base.length() - suffix.length());

  // Damage signature: exactly 24 characters, ending in a cut-off start of the suffix.
  if (base.length() == SENSOR_NAME_MAX) {
    for (size_t cut = suffix.length() - 1; cut >= 3; cut--) {
      if (base.endsWith(suffix.substring(0, cut))) {
        base = base.substring(0, base.length() - cut);
        break;
      }
    }
  }
  return base;
}

String buildBroadcastName(const String &baseName) {
  String trimmed = stripBroadcastSuffix(baseName);
  trimmed.trim();
  trimmed.replace("\"", "");
  trimmed.replace("\\", "");
  if (trimmed.length() > SENSOR_NAME_MAX) trimmed = trimmed.substring(0, SENSOR_NAME_MAX);
  trimmed.trim();
  if (trimmed.length() == 0) trimmed = "New Sensor";
  return trimmed + SENSOR_NAME_SUFFIX;
}

/* --------------------------------------------------------------------- CORS */

/*
 * FW-01: server.header("Origin") always returned an EMPTY STRING, because the
 * ESP32 WebServer only parses a small default set of request headers unless
 * collectHeaders() is called first. The original never called it.
 *
 * The knock-on effects were severe and non-obvious:
 *   - The same-origin test below could never pass, so no CORS header was ever
 *     emitted and every browser fetch from the TV was blocked.
 *   - handleOtaUpdate() read X-Firmware-Version and X-Firmware-SHA256 the same
 *     way, so OTA ALWAYS failed with "invalid or unchanged firmware version"
 *     no matter what the client sent.
 *
 * setup() now calls collectHeaders() for exactly the headers we read.
 *
 * The app itself no longer depends on CORS at all — it uses native HTTP via
 * CapacitorHttp — but the admin UI and any browser client still do.
 */
void sendCors() {
  String origin = server.header("Origin");
  if (origin.length() > 0) {
    /*
     * FW-15: this used to test `origin.indexOf(localIp) >= 0`, a substring
     * match, so a website at http://192.168.1.50.example.com was treated as
     * the sensor itself. Origins are now compared exactly.
     */
    String localIp = WiFi.localIP().toString();
    bool sameHostOrigin =
      origin == "http://" + localIp ||
      (hostName.length() > 0 &&
       (origin == "http://" + hostName || origin == "http://" + hostName + ".local"));
    if (sameHostOrigin) {
      server.sendHeader("Access-Control-Allow-Origin", origin);
      server.sendHeader("Vary", "Origin");
    }
  }
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers",
                    "Content-Type,X-Firmware-Version,X-Firmware-SHA256,Authorization");
}

void handleOptions() {
  sendCors();
  server.send(204);
}

/* --------------------------------------------------------------------- auth */

/*
 * FW-07: authentication is performed manually rather than via
 * server.authenticate(), because that helper requires the plaintext password to
 * be held in RAM and stored in NVS. We now keep only a salted SHA-256 hash.
 *
 * FW-12: the lockout used to store an absolute deadline, `millis() + 60000`,
 * and test `deadline > now`. millis() wraps to zero every 49.7 days, and after
 * the wrap any old deadline is far in the future again: a lockout triggered on
 * day 40 of uptime came back after the wrap and lasted another 40 days, during
 * which the TV could not pair or rename. Elapsed time (`now - start`) is the
 * only comparison that survives the wrap.
 *
 * Checks the request's credentials without responding or counting a failure,
 * so the OTA upload can call it before writing anything (FW-10).
 */
AuthResult checkAdminCredentials() {
  if (authLocked) {
    if (millis() - authLockStartMs < AUTH_LOCK_MS) return AUTH_LOCKED;
    authLocked = false;
  }

  String header = server.header("Authorization");
  if (!header.startsWith("Basic ")) return AUTH_BAD;

  String encoded = header.substring(6);
  encoded.trim();

  unsigned char decoded[128];
  size_t decodedLen = 0;
  int rc = mbedtls_base64_decode(decoded, sizeof(decoded) - 1, &decodedLen,
                                 (const unsigned char *)encoded.c_str(), encoded.length());
  if (rc != 0 || decodedLen == 0) return AUTH_BAD;
  decoded[decodedLen] = '\0';

  String pair = String((char *)decoded);
  int colon = pair.indexOf(':');
  if (colon <= 0) return AUTH_BAD;

  String user = pair.substring(0, colon);
  String password = pair.substring(colon + 1);
  return (user == ADMIN_USER && verifyAdminPassword(password)) ? AUTH_OK : AUTH_BAD;
}

/** Checks credentials, counts failures, and sends the refusal itself. */
bool requireAdminAuth() {
  AuthResult result = checkAdminCredentials();

  if (result == AUTH_LOCKED) {
    sendCors();
    server.send(429, "application/json",
                "{\"ok\":false,\"error\":\"too many attempts, try again shortly\"}");
    return false;
  }

  if (result == AUTH_BAD) {
    failedAuthCount++;
    if (failedAuthCount >= AUTH_MAX_FAILURES) {
      authLocked = true;
      authLockStartMs = millis();
      failedAuthCount = 0;
    }
    sendCors();
    server.sendHeader("WWW-Authenticate", "Basic realm=\"Ambient Sensor\"");
    server.send(401, "application/json", "{\"ok\":false,\"error\":\"authentication required\"}");
    return false;
  }

  failedAuthCount = 0;
  return true;
}

bool requirePasswordRotationForSensitiveWrite() {
  if (!isDefaultPasswordActive()) return true;
  sendCors();
  server.send(428, "application/json",
              "{\"ok\":false,\"error\":\"change default admin password first\"}");
  return false;
}

/* ------------------------------------------------------------------ payload */

String buildStatusJson() {
  String json = "{";
  json += "\"id\":\"" + jsonEscape(macAddress) + "\",";
  json += "\"name\":\"" + jsonEscape(roomName) + "\",";
  json += "\"lux\":" + String(currentLux) + ",";
  json += "\"temp\":" + String(currentTemp) + ",";
  json += "\"motion\":" + String(isMotion ? "true" : "false") + ",";
  json += "\"hostname\":\"" + jsonEscape(hostName) + "\",";
  json += "\"paired\":" + String(pairedTvId.length() > 0 ? "true" : "false") + ",";
  json += "\"pairedTvId\":\"" + jsonEscape(pairedTvId) + "\",";
  json += "\"firmwareVersion\":\"" + jsonEscape(String(FIRMWARE_VERSION)) + "\",";
  json += "\"authRequired\":true,";
  json += "\"adminUser\":\"" + jsonEscape(String(ADMIN_USER)) + "\",";
  json += "\"adminUiPath\":\"/ui\",";
  json += "\"setupPortalSsid\":\"" + jsonEscape(String(SETUP_PORTAL_SSID)) + "\",";
  json += "\"passwordMinLength\":" + String(MIN_ADMIN_PASSWORD_LENGTH) + ",";
  json += "\"uptimeSeconds\":" + String((millis() - bootMillis) / 1000) + ",";
  json += "\"passwordNeedsChange\":" + String(isDefaultPasswordActive() ? "true" : "false");
  json += "}";
  return json;
}

String buildAdminPageHtml() {
  String html =
    "<!doctype html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Ambient Sensor Admin</title><style>"
    "body{background:radial-gradient(1200px 700px at 20% -10%,#303727 0%,#0d0f0b 45%,#080906 100%);color:#eae6da;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:24px;line-height:1.45}"
    ".card{max-width:760px;margin:0 auto;background:linear-gradient(180deg,rgba(33,37,28,.95),rgba(20,23,16,.95));border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.55)}"
    "h1{font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#d4cda4;margin:0 0 8px}"
    ".muted{opacity:.74;font-size:13px;margin-bottom:16px}"
    ".row{display:grid;grid-template-columns:185px 1fr;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)}"
    ".k{opacity:.75;text-transform:uppercase;font-size:11px;letter-spacing:.12em}"
    ".v{font-family:monospace;font-size:14px;text-align:right;word-break:break-all;justify-self:end;max-width:100%}"
    ".actions{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}"
    ".btn{background:rgba(212,205,164,.12);border:1px solid #d4cda4;color:#d4cda4;padding:11px 12px;border-radius:10px;cursor:pointer;text-transform:uppercase;font-size:11px;letter-spacing:.12em}"
    ".btn:hover{background:rgba(212,205,164,.2);color:#fff}"
    ".ok{color:#a3b18a;font-size:12px;margin-top:10px;min-height:18px}.err{color:#e58b8b}"
    "input{width:100%;box-sizing:border-box;margin-top:8px;background:rgba(0,0,0,.35);color:#eae6da;border:1px solid rgba(255,255,255,.18);padding:11px;border-radius:10px}"
    "a{color:#a3b18a}</style></head><body><div class='card'>"
    "<h1>Ambient Sensor</h1>"
    "<div class='muted'>Local network admin. This device speaks plaintext HTTP; do not expose it to the internet.</div>"
    "<div class='muted' style='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);padding:10px;border-radius:8px;margin-bottom:12px'>"
    "Admin UI at <b>/ui</b>, JSON at <b>/api/status</b>. If unreachable, rejoin the setup network <b>";
  html += SETUP_PORTAL_SSID;
  html +=
    "</b>. The default login is <b>admin / changeme</b> and must be changed before pairing, OTA or factory reset will work."
    "</div>"
    "<div class='row'><div class='k'>Sensor Name</div><div class='v' id='name'>-</div></div>"
    "<div class='row'><div class='k'>Sensor ID</div><div class='v' id='id'>-</div></div>"
    "<div class='row'><div class='k'>Hostname</div><div class='v' id='host'>-</div></div>"
    "<div class='row'><div class='k'>Paired</div><div class='v' id='paired'>-</div></div>"
    "<div class='row'><div class='k'>Paired TV ID</div><div class='v' id='tvid'>-</div></div>"
    "<div class='row'><div class='k'>Firmware</div><div class='v' id='fw'>-</div></div>"
    "<div class='row'><div class='k'>Uptime</div><div class='v' id='uptime'>-</div></div>"
    "<div class='row'><div class='k'>Admin Password</div><div class='v' id='pwstate'>-</div></div>"
    "<div class='row'><div class='k'>Lux / Temp / Motion</div><div class='v' id='telemetry'>-</div></div>"
    "<div style='margin-top:14px'><div class='k'>Change Admin Password</div>"
    "<input id='passwordInput' type='password' maxlength='64' placeholder='New password, then press Enter'/></div>"
    "<div style='margin-top:14px'><div class='k'>Rename Sensor</div>"
    "<input id='renameInput' maxlength='24' placeholder='Living Room'/></div>"
    "<div class='actions'><button class='btn' id='renameBtn'>Save Name</button>"
    "<button class='btn' id='refreshBtn'>Refresh</button></div>"
    "<div class='actions'><button class='btn' id='unpairBtn'>Unpair TV</button>"
    "<button class='btn' id='resetBtn'>Factory Reset</button></div>"
    "<div style='margin-top:14px'><div class='k'>Firmware OTA (.bin)</div>"
    "<input id='otaFile' type='file' accept='.bin,application/octet-stream'/></div>"
    "<div class='actions'><button class='btn' id='otaBtn'>Upload Firmware</button>"
    "<button class='btn' id='otaInfoBtn'>OTA Notes</button></div>"
    "<div id='msg' class='ok'></div>"
    "<div class='muted' style='margin-top:8px'>JSON: <a href='/api/status'>/api/status</a></div>"
    "</div><script>"
    "const $=id=>document.getElementById(id);"
    "const msg=(t,e=false)=>{$('msg').textContent=t;$('msg').className=e?'ok err':'ok';};"
    "async function load(){try{const r=await fetch('/api/status');const d=await r.json();"
    "$('name').textContent=d.name||'-';$('id').textContent=d.id||'-';$('host').textContent=d.hostname||'-';"
    "$('paired').textContent=d.paired?'Yes':'No';$('tvid').textContent=d.pairedTvId||'-';"
    "$('fw').textContent=d.firmwareVersion||'-';"
    "$('uptime').textContent=(d.uptimeSeconds??0)+'s';"
    "$('pwstate').textContent=d.passwordNeedsChange?'Change Required':'Set';"
    "$('telemetry').textContent=`${d.lux??'-'} lx / ${d.temp??'-'} K / ${d.motion?'motion':'no motion'}`;"
    "msg('');}catch(e){msg('Unable to fetch status. Check local network access.',true);}}"
    "$('refreshBtn').addEventListener('click',load);"
    "$('renameBtn').addEventListener('click',async()=>{const name=$('renameInput').value.trim();"
    "if(!name){msg('Enter a name before saving.',true);return;}"
    "try{const r=await fetch('/api/name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});"
    "if(!r.ok){msg('Rename failed ('+r.status+').',true);return;}msg('Name updated.');$('renameInput').value='';load();}"
    "catch(e){msg('Rename failed: device unreachable.',true);}});"
    "$('passwordInput').addEventListener('keydown',async(e)=>{if(e.key!=='Enter')return;"
    "const password=$('passwordInput').value.trim();";
  html += "if(password.length<";
  html += String(MIN_ADMIN_PASSWORD_LENGTH);
  html +=
    "){msg('Password must be at least ";
  html += String(MIN_ADMIN_PASSWORD_LENGTH);
  html +=
    " characters.',true);return;}"
    "try{const r=await fetch('/api/admin-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});"
    "if(!r.ok){msg('Password update failed ('+r.status+').',true);return;}"
    "msg('Admin password updated. You will be asked to sign in again.');$('passwordInput').value='';load();}"
    "catch(e2){msg('Password update failed: device unreachable.',true);}});"
    "$('unpairBtn').addEventListener('click',async()=>{if(!confirm('Unpair this sensor from its current TV?'))return;"
    "try{const r=await fetch('/api/unpair',{method:'POST'});if(!r.ok){msg('Unpair failed ('+r.status+').',true);return;}"
    "msg('Sensor unpaired.');load();}catch(e){msg('Unpair failed: device unreachable.',true);}});"
    "$('resetBtn').addEventListener('click',async()=>{if(!confirm('Factory reset? This erases the name, pairing, admin password and Wi-Fi network. The sensor restarts into setup mode.'))return;"
    "try{const r=await fetch('/api/factory-reset',{method:'POST'});if(!r.ok){msg('Factory reset failed ('+r.status+').',true);return;}"
    "msg('Reset requested. Sensor is restarting...');}catch(e){msg('Factory reset failed: device unreachable.',true);}});"
    "$('otaInfoBtn').addEventListener('click',()=>msg('Upload a compiled ESP32 .bin. The device verifies a SHA-256 you supply, then restarts. Rollback protection only commits once the new image boots and reconnects.',false));"
    "$('otaBtn').addEventListener('click',async()=>{const file=$('otaFile').files&&$('otaFile').files[0];"
    "if(!file){msg('Choose a .bin file first.',true);return;}if(!confirm('Install new firmware now?'))return;"
    "try{msg('Calculating checksum...');const buffer=await file.arrayBuffer();"
    "const digest=await crypto.subtle.digest('SHA-256',buffer);"
    "const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');"
    "const ver=prompt('New firmware version label (must differ from the current one):','');"
    "if(!ver){msg('OTA cancelled: a firmware version label is required.',true);return;}"
    "const fd=new FormData();fd.append('firmware',file);"
    "msg('Uploading...');"
    "const r=await fetch('/api/ota',{method:'POST',headers:{'X-Firmware-Version':ver,'X-Firmware-SHA256':hex},body:fd});"
    "const t=await r.text();if(!r.ok){msg('OTA failed: '+t,true);return;}"
    "msg('OTA installed. Device restarting...');}"
    "catch(e){msg('OTA failed: '+(e&&e.message?e.message:'device unreachable'),true);}});"
    "load();setInterval(load,5000);"
    "</script></body></html>";
  return html;
}

/*
 * Extracts a string value for `key`. Deliberately minimal: the payloads this
 * device accepts are three fixed shapes generated by our own client. It rejects
 * anything it does not understand rather than trying to be a real JSON parser.
 */
String getJsonValue(const String &body, const String &key) {
  int keyIndex = body.indexOf("\"" + key + "\"");
  if (keyIndex < 0) return "";
  int colon = body.indexOf(':', keyIndex);
  if (colon < 0) return "";
  int firstQuote = body.indexOf('"', colon + 1);
  if (firstQuote < 0) return "";

  String out;
  for (int i = firstQuote + 1; i < (int)body.length(); i++) {
    char c = body.charAt(i);
    if (c == '\\' && i + 1 < (int)body.length()) {
      i++;
      out += body.charAt(i);
      continue;
    }
    if (c == '"') break;
    out += c;
  }
  return out;
}

/** Accepts only the character set our TV client can generate for a tvId. */
bool isSafeIdentifier(const String &value) {
  if (value.length() == 0 || value.length() > 64) return false;
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '-' || c == '_';
    if (!ok) return false;
  }
  return true;
}

/* ----------------------------------------------------------------- handlers */

void handleRoot() {
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("Location", "/ui");
  server.send(302, "text/plain", "Redirecting to /ui");
}

void handleRootJsonLegacy() {
  sendCors();
  server.send(200, "application/json", buildStatusJson());
}

void handleStatus() {
  sendCors();
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", buildStatusJson());
}

void handleAdminUi() {
  server.send(200, "text/html; charset=utf-8", buildAdminPageHtml());
}

void handleRename() {
  if (!requireAdminAuth()) return;
  sendCors();

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing body\"}");
    return;
  }

  String requestedName = getJsonValue(server.arg("plain"), "name");
  if (requestedName.length() == 0) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing name field\"}");
    return;
  }

  roomName = buildBroadcastName(requestedName);
  preferences.putString("room", roomName);

  server.send(200, "application/json",
              "{\"ok\":true,\"name\":\"" + jsonEscape(roomName) + "\"}");

  Serial.print("[RENAME] Updated sensor name: ");
  Serial.println(roomName);
}

void handlePair() {
  if (!requireAdminAuth()) return;
  if (!requirePasswordRotationForSensitiveWrite()) return;
  sendCors();

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing body\"}");
    return;
  }

  String tvId = getJsonValue(server.arg("plain"), "tvId");
  if (!isSafeIdentifier(tvId)) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing or invalid tvId\"}");
    return;
  }

  if (pairedTvId.length() > 0 && pairedTvId != tvId) {
    server.send(409, "application/json", "{\"ok\":false,\"error\":\"already paired\"}");
    return;
  }

  pairedTvId = tvId;
  preferences.putString("pairedTvId", pairedTvId);

  server.send(200, "application/json", "{\"ok\":true,\"paired\":true}");
}

void handleUnpair() {
  if (!requireAdminAuth()) return;
  if (!requirePasswordRotationForSensitiveWrite()) return;
  sendCors();

  pairedTvId = "";
  preferences.putString("pairedTvId", pairedTvId);
  server.send(200, "application/json", "{\"ok\":true,\"paired\":false}");
}

void handleFactoryReset() {
  if (!requireAdminAuth()) return;
  if (!requirePasswordRotationForSensitiveWrite()) return;
  sendCors();

  server.send(200, "application/json", "{\"ok\":true,\"reset\":true,\"restarting\":true}");
  delay(250);  // let the response leave before the radio goes down
  eraseEverythingAndRestart();
}

/*
 * FW-13: factory reset used to clear only this app's own settings. The Wi-Fi
 * network name and password live in a separate store owned by the Wi-Fi
 * driver, so a "reset" sensor still knew the home Wi-Fi password, which matters
 * the moment it is given away or sold. Both the admin endpoint and the
 * physical button now erase both, and the sensor restarts into setup mode.
 */
void eraseEverythingAndRestart() {
  preferences.clear();
  WiFi.disconnect(true, true);  // second argument erases the saved network
  delay(100);
  ESP.restart();
}

void handleAdminPasswordChange() {
  if (!requireAdminAuth()) return;
  sendCors();

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing body\"}");
    return;
  }

  String password = getJsonValue(server.arg("plain"), "password");
  password.trim();

  if (password.length() < MIN_ADMIN_PASSWORD_LENGTH) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"password too short\"}");
    return;
  }
  if (password == DEFAULT_ADMIN_PASSWORD) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"choose a different password\"}");
    return;
  }

  storeAdminPassword(password);
  server.send(200, "application/json", "{\"ok\":true}");
}

/* ---------------------------------------------------------------------- OTA */

/*
 * FW-02: the original registered OTA as
 *     server.on("/api/ota", HTTP_POST, [](){}, handleOtaUpdate);
 * with an EMPTY main handler, and then tried to send every response — including
 * success — from inside the upload callback. That is not how this API works:
 * the upload callback runs per chunk and cannot terminate the request, so the
 * client received no response and hung until timeout even when the flash
 * succeeded. requireAdminAuth() also re-ran on every 2KB chunk, and each
 * failing branch called server.send() repeatedly on one request.
 *
 * Correct structure: validate and respond in the main handler, stream and hash
 * in the upload handler, and carry failure state between them.
 */
void handleOtaUpload() {
  HTTPUpload &upload = server.upload();

  if (upload.status == UPLOAD_FILE_START) {
    otaValidationFailed = false;
    otaFailureReason = "";
    otaChecksumActive = false;

    /*
     * FW-10: the password used to be checked only in handleOtaFinish(), which
     * runs after the whole upload. By then this callback had already written
     * the image and Update.end(true) had made it the boot image, so a request
     * with no password was refused but its firmware still took over at the next
     * power cut. Nothing is written now unless the request is authorised and
     * the factory password has been changed. handleOtaFinish() still sends the
     * matching 401 / 428 / 429 and counts the failure.
     */
    if (checkAdminCredentials() != AUTH_OK || isDefaultPasswordActive()) {
      otaValidationFailed = true;
      otaFailureReason = "not authorised";
      return;
    }

    // FW-01: these headers are only readable because setup() now collects them.
    String requestedVersion = server.header("X-Firmware-Version");
    String requestedSha256 = server.header("X-Firmware-SHA256");
    requestedVersion.trim();
    requestedSha256.trim();
    requestedSha256.toLowerCase();

    if (requestedVersion.length() == 0 || requestedVersion == FIRMWARE_VERSION) {
      otaValidationFailed = true;
      otaFailureReason = "invalid or unchanged firmware version";
      return;
    }
    if (requestedSha256.length() != 64) {
      otaValidationFailed = true;
      otaFailureReason = "missing or invalid firmware sha256";
      return;
    }
    if (!upload.filename.endsWith(".bin")) {
      otaValidationFailed = true;
      otaFailureReason = "expected a .bin file";
      return;
    }

    requestedSha256.toCharArray(otaSha256Expected, sizeof(otaSha256Expected));

    mbedtls_sha256_init(&otaSha256Ctx);
    AMBIENT_SHA256_STARTS(&otaSha256Ctx, 0);
    otaChecksumActive = true;

    if (!Update.begin(UPDATE_SIZE_UNKNOWN, U_FLASH)) {
      Update.printError(Serial);
      otaValidationFailed = true;
      otaFailureReason = "could not begin update";
      mbedtls_sha256_free(&otaSha256Ctx);
      otaChecksumActive = false;
      return;
    }

    Serial.println("[OTA] Upload started.");
    return;
  }

  if (otaValidationFailed) return;  // drain remaining chunks silently

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (otaChecksumActive) {
      AMBIENT_SHA256_UPDATE(&otaSha256Ctx, upload.buf, upload.currentSize);
    }
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      Update.printError(Serial);
      Update.abort();
      otaValidationFailed = true;
      otaFailureReason = "flash write failed";
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_END) {
    if (otaChecksumActive) {
      AMBIENT_SHA256_FINISH(&otaSha256Ctx, otaSha256Digest);
      mbedtls_sha256_free(&otaSha256Ctx);
      otaChecksumActive = false;

      String actual = toHex(otaSha256Digest, sizeof(otaSha256Digest));
      if (!secureEquals(actual, String(otaSha256Expected))) {
        Update.abort();
        otaValidationFailed = true;
        otaFailureReason = "firmware sha256 mismatch";
        return;
      }
    }

    if (!Update.end(true)) {
      Update.printError(Serial);
      otaValidationFailed = true;
      otaFailureReason = "could not finalise update";
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_ABORTED) {
    if (otaChecksumActive) {
      mbedtls_sha256_free(&otaSha256Ctx);
      otaChecksumActive = false;
    }
    Update.abort();
    otaValidationFailed = true;
    otaFailureReason = "upload aborted";
  }
}

/** Runs once, after the whole body has been received. Owns the response. */
void handleOtaFinish() {
  if (!requireAdminAuth()) return;
  if (!requirePasswordRotationForSensitiveWrite()) return;
  sendCors();

  if (otaValidationFailed || Update.hasError()) {
    String reason = otaFailureReason.length() > 0 ? otaFailureReason : "update failed";
    otaValidationFailed = false;
    otaFailureReason = "";
    server.send(400, "text/plain", reason);
    return;
  }

  server.send(200, "text/plain", "ok");
  Serial.println("[OTA] Update applied. Restarting.");
  delay(500);
  ESP.restart();
}

/* ------------------------------------------------------------------ network */

void setupNetwork() {
  WiFi.mode(WIFI_STA);

  WiFiManager wm;
  wm.setConfigPortalTimeout(180);

  // FW-11: offer the bare room name, so the 24-character field is not filled
  // with the suffix and the name cannot be damaged on its way back.
  String bareRoomName = stripBroadcastSuffix(roomName);
  WiFiManagerParameter custom_room_name("room", "Sensor Location (e.g., Living Room)",
                                        bareRoomName.c_str(), SENSOR_NAME_MAX);
  wm.addParameter(&custom_room_name);

  String customCSS =
    "<style>"
    "body{background:#000;color:#EAE6DA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:.05em}"
    ".wrap{max-width:450px;margin:40px auto;padding:30px;background:rgba(26,29,20,.9);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.1);text-align:center}"
    "h1{font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#D4CDA4;font-size:20px;margin-bottom:25px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:15px}"
    "button{background:rgba(212,205,164,.1);border:1px solid #D4CDA4;color:#D4CDA4;padding:14px 24px;border-radius:8px;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.2em;cursor:pointer;width:100%;margin-top:15px}"
    "button:hover{background:rgba(212,205,164,.2);color:#fff}"
    "input[type=text],input[type=password]{background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);color:#EAE6DA;padding:14px;width:100%;box-sizing:border-box;margin-bottom:15px;border-radius:8px;font-size:14px;font-family:monospace}"
    "input::placeholder{color:rgba(255,255,255,.3)}"
    "input:focus{outline:none;border-color:rgba(212,205,164,.5)}"
    "div.c{background:rgba(255,255,255,.03);padding:15px;border-radius:8px;margin-bottom:15px;text-align:left;border:1px solid rgba(255,255,255,.05)}"
    "div.q{float:right;color:#A3B18A;font-family:monospace}"
    "a{color:#A3B18A;text-decoration:none;font-size:12px;text-transform:uppercase;letter-spacing:.1em;font-weight:bold}"
    "a:hover{color:#D4CDA4}"
    "div.msg{margin-bottom:20px;color:#A3B18A;font-size:12px;letter-spacing:.1em;text-transform:uppercase}"
    "</style>";
  wm.setCustomHeadElement(customCSS.c_str());

  if (!wm.autoConnect(SETUP_PORTAL_SSID)) {
    Serial.println("Failed to connect... restarting.");
    ESP.restart();
  }

  roomName = buildBroadcastName(String(custom_room_name.getValue()));
  preferences.putString("room", roomName);

  /*
   * FW-14: this used to open a second hotspot, named after the room, until the
   * sensor was paired. FW-05 gave it a password derived from the MAC address,
   * but that MAC is printed in /api/status, in the hostname and in the
   * hotspot's own broadcast, so anyone in radio range could work the password
   * out. Nothing ever used the hotspot: the TV reaches the sensor over the home
   * network, and first-time setup has its own portal (SETUP_PORTAL_SSID, above)
   * that appears only when the sensor cannot join Wi-Fi. It is gone.
   */
  WiFi.mode(WIFI_STA);

  Serial.println("\n--- CONNECTED! ---");
  Serial.print("Room Name Saved As: ");
  Serial.println(roomName);
  Serial.print("WiFi STA IP: ");
  Serial.println(WiFi.localIP());
}

void setupMdns() {
  if (MDNS.begin(hostName.c_str())) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addServiceTxt("http", "tcp", "id", macAddress.c_str());
    MDNS.addServiceTxt("http", "tcp", "name", roomName.c_str());
    MDNS.addServiceTxt("http", "tcp", "paired", pairedTvId.length() > 0 ? "true" : "false");
    MDNS.addServiceTxt("http", "tcp", "tvId", pairedTvId.c_str());
    MDNS.addServiceTxt("http", "tcp", "path", "/api/status");
    MDNS.addServiceTxt("http", "tcp", "fw", FIRMWARE_VERSION);
    Serial.print("mDNS: http://");
    Serial.print(hostName);
    Serial.println(".local");
  } else {
    Serial.println("mDNS failed to start");
  }
}

/* -------------------------------------------------------------------- setup */

void setup() {
  Serial.begin(115200);
  bootMillis = millis();

  pinMode(MOTION_PIN, INPUT_PULLDOWN);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  pinMode(SENSOR_LED_PIN, OUTPUT);
  analogWrite(SENSOR_LED_PIN, 2);  // extremely dim

  if (tcs.begin()) {
    Serial.println("Found TCS34725 Color Sensor");
  } else {
    Serial.println("TCS34725 not detected");
  }

  preferences.begin("ambient-app", false);
  roomName = buildBroadcastName(preferences.getString("room", "New Sensor"));
  pairedTvId = preferences.getString("pairedTvId", "");

  // FW-07: migrate any plaintext password written by earlier firmware.
  String legacyPlaintext = preferences.getString("adminPassword", "");
  adminPasswordSalt = preferences.getString("pwSalt", "");
  adminPasswordHash = preferences.getString("pwHash", "");
  usingDefaultPassword = preferences.getBool("pwDefault", true);

  if (adminPasswordHash.length() == 0) {
    storeAdminPassword(legacyPlaintext.length() > 0 ? legacyPlaintext : DEFAULT_ADMIN_PASSWORD);
  }
  if (legacyPlaintext.length() > 0) {
    preferences.remove("adminPassword");
    Serial.println("[SECURITY] Migrated plaintext admin password to salted hash.");
  }

  macAddress = WiFi.macAddress();
  hostName = "ambient-" + macAddress;
  hostName.replace(":", "");
  hostName.toLowerCase();

  setupNetwork();
  setupMdns();

  /*
   * FW-01: without this, every server.header(...) call in this file returns an
   * empty string. This single omission broke CORS and OTA simultaneously.
   */
  const char *collectedHeaders[] = {
    "Origin",
    "Authorization",
    "X-Firmware-Version",
    "X-Firmware-SHA256",
    "Content-Type",
  };
  server.collectHeaders(collectedHeaders,
                        sizeof(collectedHeaders) / sizeof(collectedHeaders[0]));

  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/root-status", HTTP_GET, handleRootJsonLegacy);
  server.on("/ui", HTTP_GET, handleAdminUi);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/name", HTTP_POST, handleRename);
  server.on("/api/pair", HTTP_POST, handlePair);
  server.on("/api/admin-password", HTTP_POST, handleAdminPasswordChange);
  server.on("/api/unpair", HTTP_POST, handleUnpair);
  server.on("/api/factory-reset", HTTP_POST, handleFactoryReset);
  server.on("/api/ota", HTTP_POST, handleOtaFinish, handleOtaUpload);

  server.on("/", HTTP_OPTIONS, handleOptions);
  server.on("/ui", HTTP_OPTIONS, handleOptions);
  server.on("/api/status", HTTP_OPTIONS, handleOptions);
  server.on("/api/root-status", HTTP_OPTIONS, handleOptions);
  server.on("/api/name", HTTP_OPTIONS, handleOptions);
  server.on("/api/pair", HTTP_OPTIONS, handleOptions);
  server.on("/api/admin-password", HTTP_OPTIONS, handleOptions);
  server.on("/api/unpair", HTTP_OPTIONS, handleOptions);
  server.on("/api/factory-reset", HTTP_OPTIONS, handleOptions);
  server.on("/api/ota", HTTP_OPTIONS, handleOptions);

  server.onNotFound([]() {
    sendCors();
    server.send(404, "application/json", "{\"ok\":false,\"error\":\"not found\"}");
  });

  server.begin();
  Serial.println("[HTTP] Server started.");
}

/* --------------------------------------------------------------------- loop */

void loop() {
  server.handleClient();

  /*
   * FW-09: esp_ota_mark_app_valid_cancel_rollback() was called unconditionally
   * during setup(), before Wi-Fi or the HTTP server were confirmed working.
   * That marks ANY freshly flashed image as good the instant it boots, which
   * defeats the entire purpose of rollback protection — a bad OTA that bricks
   * networking would be marked valid and never rolled back.
   *
   * We now wait until the device has been up for a while AND is actually
   * connected and serving before committing.
   */
  if (!otaValidityMarked && millis() - bootMillis > OTA_HEALTH_DELAY_MS) {
    if (WiFi.status() == WL_CONNECTED) {
      if (esp_ota_mark_app_valid_cancel_rollback() == ESP_OK) {
        Serial.println("[OTA] Health check passed; firmware marked valid.");
      }
      otaValidityMarked = true;
    }
  }

  // Physical factory-reset button.
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    if (resetPressStartMs == 0) {
      resetPressStartMs = millis();
    } else if (millis() - resetPressStartMs >= RESET_HOLD_MS) {
      Serial.println("[RESET] Hold detected. Erasing settings and Wi-Fi, then restarting.");
      eraseEverythingAndRestart();
    }
  } else {
    resetPressStartMs = 0;
  }

  /*
   * FW-04: this loop previously read the sensor every 50ms. tcs.getRawData() is
   * a BLOCKING call that sleeps for the full 50ms integration time, so the loop
   * spent essentially all of its time inside the driver and
   * server.handleClient() was starved. HTTP requests queued, timed out, and the
   * TV app saw the sensor as intermittently offline. Serial was also printing
   * four times a second, which is its own drag.
   *
   * 250ms is far faster than a room's lighting can meaningfully change, and it
   * leaves the loop free to serve HTTP. The EMA additionally damps the sensor's
   * natural jitter at the source, which is what the TV app was previously
   * having to compensate for.
   */
  if (millis() - lastReadTime > SENSOR_INTERVAL_MS) {
    lastReadTime = millis();

    uint16_t r, g, b, c;
    tcs.getRawData(&r, &g, &b, &c);

    float lux = tcs.calculateLux(r, g, b);
    if (!isfinite(lux) || lux < 0) lux = 0;

    float kelvin = (lux > 1.0f) ? tcs.calculateColorTemperature(r, g, b) : 0.0f;
    if (!isfinite(kelvin) || kelvin < 0) kelvin = 0;

    if (!haveFirstSample) {
      luxAverage = lux;
      tempAverage = kelvin;
      haveFirstSample = true;
    } else {
      const float alpha = 0.25f;
      luxAverage = alpha * lux + (1.0f - alpha) * luxAverage;
      tempAverage = alpha * kelvin + (1.0f - alpha) * tempAverage;
    }

    currentLux = (uint16_t)(luxAverage + 0.5f);
    currentTemp = (uint16_t)(tempAverage + 0.5f);
    isMotion = (digitalRead(MOTION_PIN) == HIGH);
  }

  if (millis() - lastSerialPrint > SERIAL_INTERVAL_MS) {
    lastSerialPrint = millis();
    Serial.print("[TELEMETRY] lux=");
    Serial.print(currentLux);
    Serial.print(" tempK=");
    Serial.print(currentTemp);
    Serial.print(" motion=");
    Serial.println(isMotion ? "1" : "0");
  }
}

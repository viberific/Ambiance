# Changelog

## 1.0.0 — Production readiness pass (2026-08-05)

Every finding from the audit, in order, with where it was fixed.

Verification performed: `tsc` clean under `strict` + `noUncheckedIndexedAccess`
+ `noUnusedLocals` across all 24 source files; 40 unit tests passing across 13
suites; firmware brace/paren/symbol resolution verified. `npm install`,
`vite build` and `gradlew` could not be executed here because the package
registry was unreachable — see **Not verified** at the end.

---

## P0 — Blocked build or core functionality

| ID | Fix | Where |
| --- | --- | --- |
| **AND-01** | Added the missing `colors.xml`. `styles.xml` referenced `colorPrimary`, `colorPrimaryDark` and `colorAccent`, none of which existed; `aapt2` failed. | `android/.../values/colors.xml` |
| **AND-02** | Raised `minSdkVersion` 24 → 26. Launcher icons existed only in `mipmap-anydpi-v26` with no PNG fallback, so `@mipmap/ic_launcher` was unresolvable on API 24–25. Moved the foreground vector out of `drawable-v24`. | `android/variables.gradle` |
| **AND-03** | Added `postSplashScreenTheme`, `windowSplashScreenBackground` and `windowSplashScreenAnimatedIcon`. The activity previously never left the splash theme. Also rebased `AppTheme` on a DayNight NoActionBar parent so cold start no longer flashes white. | `android/.../values/styles.xml` |
| **WEB-01** | All telemetry now reads `/api/status`. The client polled `/`, which the firmware 302-redirects to the HTML admin page — `res.json()` threw on every poll and connection state was pinned to `lost`. | `src/lib/sensor-utils.ts`, `src/lib/sensor.ts` |
| **WEB-02** | Added credential storage, an `Authorization: Basic` header on every write, and explicit 401 handling that prompts for the password. The client previously sent no credentials at all, so renames queued forever and pairing reported "unreachable". | `src/lib/http.ts`, `src/lib/sensor.ts`, `src/components/SensorPanel.tsx` |
| **WEB-03** | Added handling for HTTP 428. The firmware refuses pair/unpair/reset while the factory password is set; the app now detects this and walks the user through setting a new one. | `src/lib/sensor.ts`, `src/components/SensorPanel.tsx` |
| **FW-01** | Added `server.collectHeaders()`. Without it the ESP32 `WebServer` returns an empty string for `Origin`, `Authorization`, `X-Firmware-Version` and `X-Firmware-SHA256`. This one omission broke CORS **and** made every OTA fail with "invalid or unchanged firmware version". | `firmware/ambient_sensor.ino` |
| **FW-02** | Restructured OTA. Validation and the response now live in the main handler; the upload callback only streams and hashes. Previously the main handler was an empty lambda and responses were sent from inside the per-chunk callback, so the client hung even on success, and auth re-ran on every chunk. | `firmware/ambient_sensor.ino` |
| **FW-03** | Replaced `mbedtls_sha256_*_ret()` with the unsuffixed API behind a version macro. The `_ret` variants do not exist in the mbedTLS bundled with current Arduino-ESP32 — **the firmware did not compile.** | `firmware/ambient_sensor.ino` |
| **BUILD-01** | Documented and scripted `npm run android:prepare`, and added a CI step that runs `cap sync` before Gradle. `settings.gradle` includes `:capacitor-cordova-android-plugins`, which does not exist in a fresh clone. | `package.json`, `.github/workflows/ci.yml`, `android/BINARY_FREE_SETUP.md` |

## P1 — Wrong behaviour

| ID | Fix | Where |
| --- | --- | --- |
| **WEB-04** | Rewrote discovery: mDNS/known-host first, then a bounded sweep of **our own subnet only**, abortable throughout. `sensors` moved to a ref so the effect no longer retriggers itself. The old version swept 8 subnets (2,032 requests) from an effect that its own success path re-fired, producing continuously overlapping full-LAN scans. | `src/lib/discovery.ts`, `src/hooks/useSensorNetwork.ts` |
| **WEB-05** | Replaced the ad-hoc history array with a fixed-size `MotionWindow`. `slice(-(sensitivity - 1))` is `slice(-0)` at sensitivity 1, which returns the **whole array** — the buffer grew unbounded and the most responsive sensitivity setting never woke the screen. Sampling also moved off change-detection onto every reading. | `src/lib/motion.ts` |
| **WEB-06** | The sleep timer ref is now nulled after `clearTimeout`. It was cleared but left truthy, and the scheduling branch was guarded by `!ref.current` — **sleep worked exactly once per app launch.** | `src/hooks/useDisplayState.ts` |
| **WEB-07** | Rotation and arrow-key navigation derive length from the active source. Hardcoding `ARTWORK.length` meant a local folder of any size only ever showed its first five images. | `src/lib/artwork.ts`, `src/hooks/useArtRotation.ts` |
| **WEB-08** | `AnimatePresence` keys on `artwork.url`. Local media hardcoded `id: 999` for every image, so React saw an unchanged key and the crossfade never ran for local albums. | `src/components/ArtworkCanvas.tsx` |
| **WEB-09** | `LocalMediaLibrary` revokes object URLs on replace and unmount. Previously every URL leaked, and blob URLs died on reload while `imageSource: 'local'` persisted — the app rebooted into local mode pointing at dead URLs. | `src/lib/artwork.ts` |
| **WEB-10** | Rewrote weather-code mapping against the WMO 4677 table. The old chain made the thunderstorm branch unreachable — **storms rendered as a snow cloud.** | `src/lib/weather.ts` |
| **WEB-11** | Payload shape is validated before use. `data.current_weather.temperature` was dereferenced unguarded inside an async geolocation callback the enclosing `try` could not reach. | `src/lib/weather.ts`, `src/hooks/useWeather.ts` |
| **WEB-12** | Three guards: EMA smoothing on the raw signal, bucket hysteresis, and auto-apply suspended while the settings menu is open. Lux jitter crossing a bucket edge used to hard-reset the sliders mid-drag. | `src/lib/profile.ts`, `src/hooks/useDisplayState.ts` |
| **WEB-13** | The settings panel unmounts when closed. `opacity-0 pointer-events-none` left it keyboard-focusable, so the D-pad could walk into an invisible menu and the TV appeared frozen. | `src/components/SettingsPanel.tsx` |
| **WEB-14** | Telemetry polls at 1s on a stable interval, `upsertSensor` returns the same object when nothing changed, and persistence is debounced. Previously 4 polls/sec each rewrote state, tearing down and rebuilding the interval and writing to disk 4×/sec. | `src/hooks/useSensorNetwork.ts`, `src/lib/storage.ts` |
| **WEB-15** | One versioned settings document covering all 15 preferences, with coercion and range-clamping on load, plus migration from the old key names. Seven settings were previously never persisted — every reboot reset the appliance. | `src/lib/settings.ts`, `src/lib/storage.ts`, `src/hooks/useSettings.ts` |
| **FW-04** | Sensor reads moved to 250ms with EMA smoothing. `tcs.getRawData()` blocks for the full 50ms integration time and was called every 50ms, starving `server.handleClient()` and making the sensor appear intermittently offline. | `firmware/ambient_sensor.ino` |
| **FW-05** | The pairing SoftAP now uses WPA2 with a MAC-derived key and shuts down on successful pairing. It was previously **open**, exposing every admin endpoint to anyone in radio range. | `firmware/ambient_sensor.ino` |
| **FW-06** | Added `jsonEscape()` on every interpolated value and a strict charset check on `tvId`. A backslash in a device name produced malformed JSON and the sensor appeared permanently offline. | `firmware/ambient_sensor.ino` |
| **AND-04** | Added `WAKE_LOCK` and a user-toggleable `FLAG_KEEP_SCREEN_ON`. An always-on art display was letting the TV sleep. | `AndroidManifest.xml`, `MainActivity.java` |
| **AND-05** | Corrected the package assertion and moved the tests out of the stale `com.getcapacitor.myapp` package. The test asserted `com.getcapacitor.app` and always failed. | `android/app/src/*/java/...` |
| **AND-06** | The dream service now injects a state snapshot via a native bridge, and the web app renders a networking-free `DreamView`. Timers are paused on `onDreamingStopped`. The screensaver previously had no bridge, could not reach the sensor, and rendered hardcoded defaults forever while retrying doomed requests. | `AmbientDreamService.java`, `MainActivity.java`, `src/lib/native.ts`, `src/DreamView.tsx` |

## P2 — Production hardening

| ID | Fix |
| --- | --- |
| **BUILD-02** | R8 + `shrinkResources` on release, env-driven signing config, CI-supplied `versionCode`/`versionName`, debug suffix, and Capacitor/`@JavascriptInterface` keep rules. |
| **BUILD-03** | Removed `@google/genai` and `googleapis` (imported nowhere), removed `dotenv`, de-duplicated `vite`, moved build-only tooling to `devDependencies`, renamed from `react-example`, added `engines`. |
| **BUILD-04** | **Deleted the `define` block that inlined `GEMINI_API_KEY` into the client bundle shipped inside the APK.** It was never read by any source file. |
| **BUILD-05** | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and an `include` list. `TvSlider`'s `any` props are now typed; `NodeJS.Timeout` replaced with `ReturnType<typeof setTimeout>`. |
| **BUILD-06** | Pinned `build.target` to `chrome87`/`es2020` for older TV WebViews, added `manualChunks` and sourcemaps, and set `base: './'` so the screensaver can load assets over `file://`. |
| **BUILD-07** | Added ESLint (with `react-hooks/exhaustive-deps` as an **error**), Prettier, a three-job CI pipeline, `LICENSE`, `PRIVACY.md`, a rewritten README, and removed `metadata.json`. |
| **WEB-16** | Bundled artwork (3 SVG pieces) and locally generated `feTurbulence` grain/paper textures; fonts moved to system stacks. Every visual asset was previously remote, so a TV with no WAN rendered a black screen. Dead-image detection added. |
| **WEB-17** | Replaced `alert`/`confirm` with an in-app `Dialog` with focus trapping, focus restore and D-pad key handling. `no-alert` is now a lint error. |
| **WEB-18** | Telemetry seeds to zero and connection state is explicit. The UI showed a plausible fake reading whether or not a sensor existed. |
| **WEB-19** | Settings panel is a bounded, scrollable container (`.tv-scroll`). |
| **WEB-20** | Added an `ErrorBoundary` with a visible message and a 15-second auto-reload. |
| **AND-07** | `androidScheme: 'https'`, `cleartext: false`, `allowNavigation: []`, `allowMixedContent: false`. Sensor traffic moved to native HTTP so the WebView no longer needs to be permissive. |
| **AND-08** | Cleartext restricted to RFC1918 ranges plus `.local`; removed the redundant app-wide `usesCleartextTraffic` that was overriding the per-domain rules. |
| **FW-07** | Admin password stored as salted SHA-256 with constant-time comparison and automatic migration off the old plaintext value. Basic auth is now verified manually. |
| **FW-08** | Explicit forward declarations for all 20 handlers, replacing reliance on Arduino's auto-prototype generation. |
| **FW-09** | `esp_ota_mark_app_valid_cancel_rollback()` now runs only after 15s uptime **and** confirmed Wi-Fi. Calling it unconditionally at boot made rollback protection meaningless. |

## P3 — Polish

| ID | Fix |
| --- | --- |
| **WEB-21** | Removed dead `powerSafeAction`; gave `isStatic` a real control; dropped 8 unused icon imports. |
| **WEB-22** | TV type scale via `clamp()` design tokens. The old UI had 10.5px uppercase text on a 1080p panel. |
| **WEB-23** | Focus rings on every control, ARIA slider semantics, `aria-pressed` on toggles, labels on inputs, initial focus on open. |
| **WEB-24** | `clamp()` sizing so the layout survives non-16:9 viewports. |
| **WEB-25** | Added a °C/°F toggle. |
| **WEB-26** | `parseInt` radix fixed; all settings coerced through `normaliseSettings`. |
| **AND-09** | Removed the unused `activity_main.xml` and the unused launcher-background vector. |
| **INFRA-01** | Added `PRIVACY.md` covering the location permission, and documented the Play Store banner requirement. |

---

## Decisions taken

These were the six open questions in the audit; I proceeded on the recommended
option in each case.

1. **Native HTTP + mDNS-first discovery** — adopted. `CapacitorHttp`'s global
   fetch patch is left **disabled**; `src/lib/http.ts` calls the explicit API for
   sensor traffic only, so weather and artwork stay on standard `fetch` and other
   plugins' file handling is unaffected.
2. **`minSdkVersion` 26** — adopted, keeping the repo binary-free.
3. **Firmware in scope** — yes. Four findings there were P0/P1 and two prevented
   compilation.
4. **Bundled artwork** — I generated three original SVG pieces rather than wait
   on assets. Replace them with your own by editing `BUNDLED_ARTWORK`.
5. **Local album persistence** — deferred. Blob URLs are now correctly revoked
   and no longer resurrect dead references on reload, but copying files into app
   storage via Capacitor Filesystem is a feature, not a bug fix. See below.
6. **Scope** — all four phases completed.

## Not verified here

- `npm ci`, `vite build` and `gradlew` never ran: the package registry was
  unreachable in this environment. Typechecking was performed against local
  stub declarations, which validates our source but not the real dependency
  surface. **Run `npm run verify` before trusting the build.**
- The firmware was checked structurally, not compiled. The CI `firmware` job now
  compiles it on every push, which is how FW-03 should have been caught.
- No ESP32 was in the loop. FW-01, FW-02 and FW-05 need a real device to confirm.

## Known follow-ups

- **Local albums do not survive a reboot.** Correctly handled now rather than
  silently broken, but persisting them needs Capacitor Filesystem or a USB/SMB
  source.
- **mDNS is hostname-probing, not true service browsing.** `discovery.ts`
  isolates this behind one function so a native NSD plugin can be dropped in
  without touching callers.
- **Google TV store submission** still needs a 320×180 banner PNG in the listing.

---

## 1.1.0 — AI-readability and structural pass

No behaviour changes. Typecheck clean, 40/40 tests passing before and after.

### Design system centralised

- **109 hardcoded brand hex values** (`#D4CDA4` and friends) replaced with the
  semantic Tailwind utilities generated from the `@theme` tokens that already
  existed but were not being used. Changing the accent colour is now a one-line
  edit in `index.css` instead of 55 scattered replacements.
- `src/lib/theme.ts` added for the handful of places that need a raw colour in
  JavaScript (slider thumbs).
- `src/components/ui/styles.ts` added. `SettingsPanel` and `SensorPanel` each
  carried their own near-identical `buttonClass` / `fieldClass` / `chipBase` /
  `toggleBase`, so the two halves of the same menu could drift apart. One
  definition each now, used everywhere.
- Verbose `text-[length:var(--text-tv-xs)]` (used 40 times) replaced with a
  `text-tv-xs` utility.

### File splits

| Before | After |
| --- | --- |
| `SettingsPanel.tsx` (528) | shell (115) + `settings/DisplaySection` (180) + `MediaSection` (140) + `PowerSection` (158) |
| `SensorPanel.tsx` (439) | panel (331) + `sensor/SensorListItem` (126) + `sensor/TelemetryReadout` (57) |
| `useSensorNetwork.ts` (465) | composition (323) + `useSensorDiscovery` (85) + `useSensorTelemetry` (99) + `lib/sensor-store` (89) |
| `App.tsx` (380) | root (260) + `useTvInput` (167) + `useDreamPublisher` (33) |

Largest file is now 331 lines, down from 528. Every split follows a boundary
that already existed in the code.

### Dead code removed

- `describeWeather()`, `storage.remove()`, `native.isNativeHost()` — exported,
  never called. Verified by usage count, not by eye: a first-pass scan flagged
  29 "unused" exports, 26 of which were type definitions in active use.

### AI navigation

- `CLAUDE.md` routing map expanded from 18 to 27 rows to cover the new files.
- Added a "three files that control almost everything" design table.
- All 40 file paths referenced in `CLAUDE.md` verified to resolve.
- `@file` orientation headers on all 39 source files.

---

## 1.2.0 — Review pass, and updates over the air (2026-08-21)

Verification performed in a real environment this time: `npm ci`, `npm run
verify` (typecheck, lint, 62 tests across 6 suites, Vite build) all green. The
Android and firmware builds still run only in CI — see **Not verified** below.

### P0 — The verify pipeline could not run at all

Everything below was red before this pass, which means every gate downstream of
it had never executed on anything.

| ID | Fix | Where |
| --- | --- | --- |
| **BUILD-08** | Regenerated `package-lock.json`. It was out of sync with `package.json`, so `npm ci` aborted with "Missing: balanced-match@1.0.2 from lock file" — and `npm ci` is the first step of all three CI jobs, so **nothing in CI had run since the lockfile drifted**. | `package-lock.json` |
| **BUILD-09** | Moved the `"//"` comment out of `compilerOptions`. TypeScript rejects unknown compiler options outright (TS5023), so `npm run typecheck` failed on the config before reading a line of source. | `tsconfig.json` |
| **BUILD-10** | Turned `no-undef` off for TypeScript files. `globals` was a hand-written list of ~20 browser names, and every DOM type the code actually uses — `File`, `KeyboardEvent`, `HTMLElement`, `AbortSignal`, `URLSearchParams`, `React` — was absent from it, so lint failed with 33 errors. Maintaining a shadow copy of `lib.dom.d.ts` by hand is not the fix; `tsc` already performs this check against the real thing, which is what typescript-eslint's own documentation recommends. | `eslint.config.js` |

### P1 — Wrong behaviour

| ID | Fix | Where |
| --- | --- | --- |
| **AND-10** | Rewrote the cleartext policy. AND-08 expressed the private ranges as CIDR blocks (`192.168.0.0/16` and two others), but Android's `<domain>` element has no concept of a range — it matches a hostname or a single literal IP, so those entries matched nothing that has ever existed. Cleartext was denied to every sensor on a private address, and since CapacitorHttp goes through `HttpURLConnection` it is bound by exactly this policy: **every sensor read would have failed on-device while working perfectly in dev.** The ranges cannot be enumerated, so the policy is inverted — cleartext by default, with each remote host the app contacts pinned to HTTPS individually. | `network_security_config.xml` |
| **WEB-27** | `useSettings`' flush effect depended on `[settings]` and called `saveSettings()` from its own cleanup. React runs a cleanup before every re-run, so each tick of a slider drag forced a synchronous whole-document `localStorage` write — of the *previous* value, since the cleanup closes over its own render. That is exactly what the 400ms debounce immediately above it exists to prevent, and it undid it completely. | `src/hooks/useSettings.ts` |
| **WEB-28** | `debouncedSave()` added a `pagehide` and a `visibilitychange` listener on every call and had no way to remove either — the second via an inline arrow, so no caller could have removed it even by trying. One module-level pair now, plus a writer that can be disposed. This is the leak class CLAUDE.md §5 exists to prevent: invisible on a laptop, a crash on an appliance left up for weeks. | `src/lib/storage.ts`, `src/hooks/useSensorNetwork.ts` |
| **WEB-29** | The native HTTP path ignored `AbortSignal` entirely. On the TV — the only platform that takes it — cancelling a discovery scan therefore did nothing at all, meaning **the AbortController that WEB-04's fix is built on only ever worked in the browser**. A rescan left up to 254 probes in flight to land on state that had already moved on. | `src/lib/http.ts` |
| **WEB-30** | Nothing but sensor motion could reset the OLED saver timer. With no sensor paired, or one that had dropped off the network, there was no signal that could: the clock and weather faded to 20% a few minutes after launch and stayed there for good, and pressing keys on the remote did not bring them back. Remote input now counts as presence, throttled to once per 10s. | `src/hooks/useDisplayState.ts` |

### P2 — Polish

- `useConstant` added. `useRef(new Thing())` evaluates its argument on every
  render and discards all but the first result; it was holding both EMA filters,
  the motion ring buffer and the media library, in components that re-render
  once a second for the life of the app.
- The two genuine `react-hooks/exhaustive-deps` errors fixed at the source
  rather than silenced, per CLAUDE.md §6. Both were member expressions
  (`artwork?.url`, `art.current?.url`) that the rule cannot verify, hoisted to
  locals. In `App.tsx` obeying the rule literally would have republished the
  screensaver snapshot on every render.
- `detectLocalAddress()` no longer raises an unhandled rejection when
  `createOffer()` fails, and returns immediately instead of making the caller
  wait out the full timeout for a `null` it could have had at once.
- Removed `metadata.json`, an AI Studio leftover referenced by nothing.
  BUILD-07 recorded it as deleted; it was not.

### Over the air updates

| ID | What |
| --- | --- |
| **AND-11** | The app updates itself from GitHub Releases. `release.yml` builds a signed APK and publishes it alongside an `update.json` manifest; the TV checks daily, compares `versionCode`, verifies the SHA-256 and hands the file to Android's own installer. |

Split so the risky parts are the testable parts:

- `src/lib/updates.ts` — pure, no React, no native, no fetch. Version
  comparison and release parsing, including the two refusals that matter: an
  APK served from a host we did not publish to, and a manifest describing a
  different build than the release actually carries. 22 tests.
- `src/hooks/useAppUpdate.ts` — the check (45s after boot, then daily) and a
  status poll that only runs while a download does.
- `UpdateInstaller.java` — the work Android will not let a WebView do. Re-checks
  host and scheme at **every redirect hop**, because GitHub redirects release
  assets to object storage and an open redirect would otherwise walk straight
  past the allowlist. Caps the write so a server lying about `Content-Length`
  cannot fill the TV's disk. Deletes rather than installs an APK whose digest
  does not match.
- `release.yml` — refuses to build without signing secrets and verifies the
  finished APK with `apksigner`. An unsigned release installs exactly once and
  can then never be updated, which is worse than a failed build.

`versionCode` comes from `github.run_number`, which only ever increases. It is
the value Android's package manager itself compares, so a name-derived scheme
would let a release install on some televisions and silently fail on others.

Nothing installs unattended. The app offers, Android's installer asks, a person
confirms.

**Signing key discipline is now load-bearing.** Every release must be signed
with the same key or televisions will refuse the update and the only way
forward is an uninstall, losing every setting and paired sensor. `docs/RELEASING.md`
covers the setup.

### Housekeeping

- **BUILD-11** — `format:check` existed as a script but nothing ever ran it, so
  14 files had drifted out of Prettier style. Formatted, and the check joined
  `npm run verify` and CI so it cannot drift again.

- The **Sideload APK** workflow was a step-for-step duplicate of `ci.yml`'s
  android job running on every push, so each push paid for two identical Gradle
  builds. It is manual-only now. It also still passed `GEMINI_API_KEY` into the
  build — nothing has read that key since BUILD-04 removed the `define` that
  inlined it — and carried two `sed` commands that rewrote `AndroidManifest.xml`
  in place. The manifest has had all three of those tags since AND-02, so the
  greps guarding them never fired.

### CI could not run either (found once CI finally executed)

Fixing the lockfile let CI reach the two jobs that had never actually run. Both
were broken, and neither had anything to do with the code they were meant to
gate.

| ID | Fix | Where |
| --- | --- | --- |
| **BUILD-12** | The firmware job installed arduino-cli with `sh -s -- -b /usr/local/bin`, borrowing a flag convention from other Go installers that `install.sh` does not have. Its first positional argument is the **version tag**, so `-b` became the version and the script requested `arduino-cli_-b_Linux_64bit.tar.gz`, which 404s — "Failed to install arduino-cli". The install directory comes from the `BINDIR` environment variable, and `/usr/local/bin` was ignored throughout: the script reported "Installing in $PWD/bin" every time. Fixed, and the step now runs `arduino-cli version` so a broken install fails immediately rather than three steps later. | `.github/workflows/ci.yml` |
| **BUILD-13** | Every workflow pinned Node 20. The Capacitor 8 CLI requires `>=22.0.0` and refuses to start below it, so the Android job died at `cap sync` with "The Capacitor CLI requires NodeJS >=22.0.0" — before Gradle was ever invoked. All four pins raised to 22. `engines.node` said `>=20.19.0`, understating the real floor, which is what let the wrong pin look correct. | `.github/workflows/*.yml`, `package.json`, `README.md` |

### Not verified here

- The Android build and the firmware compile still run only in CI. `UpdateInstaller.java`
  is new and has not executed on a device; the download, checksum and install
  path needs one real release to confirm end to end.
- `npm audit` reports 11 advisories, all in dev-only transitive dependencies
  (babel, esbuild, postcss, tar). None reach the APK. Left alone rather than
  forcing majors in the same pass as a behaviour audit.

---

## 1.3.0 — Screensaver blockers and a real app icon (2026-08-21)

Two questions: would the screensaver actually work if a TV selected it, and why
does the launcher icon look unfinished. Both had substantive answers.

### The screensaver

`AmbientDreamService` was registered correctly and would have been offered by
the system picker, but three things meant it could not do its job once chosen.

| ID | Fix | Where |
| --- | --- | --- |
| **AND-15** | The screensaver framed an empty rectangle. It renders in a second WebView on a `file://` origin, while the app publishes `artworkUrl` from its own `https://localhost` origin — a host served by Capacitor's local server *inside the app's WebView only*, and therefore unreachable from the dream. A local album is worse: `blob:` URLs are scoped to the document that created them and are dead everywhere else, and a `data:` URL would exceed the 64 KB cap in `saveDreamState`, which silently drops the **whole** snapshot, losing the clock and weather settings with it. Snapshots now carry a document-relative path the dream resolves against its own base, and unshareable URLs are dropped so the dream falls back to bundled art. | `src/lib/artwork.ts`, `src/lib/native.ts`, `tests/artwork.test.ts` |
| **AND-16** | `onDreamingStopped` called `WebView.pauseTimers()`, which is documented as **global** — it pauses layout, parsing and JavaScript timers for every WebView in the process. The dream and the main activity share a process, so ending the screensaver froze the app itself: the clock stopped and sensor polling stopped. Replaced with the per-WebView `onPause()`; the WebView is destroyed immediately afterwards anyway, which is what actually stops its timers. | `AmbientDreamService.java` |
| **AND-16** | `destroy()` was being called on a still-attached WebView. `removeAllViews()` removes a WebView's *children*, not the WebView from its parent. Detached from the real parent first, and `addContentView` replaced with `setContentView`. | `AmbientDreamService.java` |
| **AND-16** | Nothing in the app told the user a screensaver must be selected in the TV's own settings, and that screen is buried and differently named on every brand. Power & Sleep now offers **Open TV Settings**, which launches the system screensaver picker directly, falling back to display settings and then the settings root. | `MainActivity.java`, `src/lib/native.ts`, `src/components/settings/PowerSection.tsx` |
| **AND-16** | Added `CATEGORY_DEFAULT` to the dream's intent filter. The platform picker queries with a bare action, but several TV launchers and OEM settings apps add the category — and without it the service is simply absent from their list. | `AndroidManifest.xml` |
| **AND-16** | `previewImage` was the 1:1 adaptive launcher icon, shown letterboxed or stretched in the picker's 16:9 slot. It is the TV banner now. | `res/xml/ambient_dream.xml` |
| **AND-15** | If the snapshot's picture is remote and the WAN link is down, `ArtworkCanvas` renders its "could not be loaded" message — which would then sit on the screen all night. `DreamView` probes the image first and quietly falls back to bundled art. A screensaver must never display an error. | `src/DreamView.tsx` |

### The app icon

| ID | Fix | Where |
| --- | --- | --- |
| **AND-14** | Redrew the launcher mark. The old one spanned x=14..94 and y=34..86 of the 108dp canvas, but only the inner 72dp survives a launcher mask and a circular mask trims that to a 66dp circle — so its corners were sliced off and the composition sat visibly off-centre on every round or squircle launcher. It also placed a `#1A1D14` bar on a `#11140F` background, which is invisible. The new framed-canvas mark is centred on (54,54) with its furthest painted point 31dp from that centre, so it is never clipped on any mask. | `res/drawable/ic_launcher_foreground.xml` |
| **AND-14** | `drawable/ic_launcher_background.xml` was still the stock Android Studio teal grid from project generation, referenced by nothing. It is now the real adaptive background: brand ink lifted by a diagonal wash so the gilt frame reads against depth rather than a flat block. The flat `@color/ic_launcher_background` it replaced is deleted. | `res/drawable/ic_launcher_background.xml`, `res/mipmap-anydpi-v26/*` |
| **AND-14** | The TV banner was a `<layer-list>` insetting the 108dp square icon by 90dp on each side. Insets apply to the *container* bounds, so on a 320x180 banner the square mark was squeezed into a 140x120 box and stretched non-uniformly — visibly distorted on the home row, with the app name nowhere on it. It is now a true 320x180 banner: the mark at its real aspect ratio, a hairline rule, and the wordmark set in a serif matching the app's overlay typography. Letterforms are committed as outlines, so the banner needs no font at runtime and the repo stays free of binaries. | `res/drawable/tv_banner.xml` |
| **AND-14** | The application element now carries `android:banner` as well as the activity, and the duplicate `drawable-v24` copy of the foreground vector is gone — it shadowed the base copy on every device (minSdk is 26) so the two could silently drift. | `AndroidManifest.xml`, `res/drawable-v24/` |

### Not fixed, because it cannot be

Some Google TV devices — Chromecast with Google TV and several Sony/TCL sets —
restrict the ambient screen to Google's own Backdrop and never surface
third-party dreams in the picker at all. On those the app is a normal app that
happens to also register a screensaver nobody can select. Nothing in the APK
changes that; it is a platform decision. Plain Android TV sets, and Google TV
sets that still expose Settings → System → Screensaver, list it normally.

### Not verified here

- The Android build still runs only in CI. No Android SDK is present in this
  environment, so `aapt2` has not compiled these resources — the vector
  drawables were checked for well-formedness and against the documented schema,
  and rendered to confirm they look right, but the packaging step is CI's.
- `AND-15` and `AND-16` are dream-lifecycle fixes. The pure URL logic is unit
  tested; whether a given TV lets you select the screensaver at all can only be
  answered on that TV.

---

## 1.3.1 — A way past a TV that hides third-party screensavers (2026-08-21)

1.3.0 closed by saying the Google TV restriction could not be worked around.
That was too quick. The restriction is real, but it is narrower than it looks.

**What is actually blocked.** `DreamManagerService` — the part of Android that
runs screensavers — reads four `Settings.Secure` keys and does not care who
wrote them. It has no opinion about third-party dreams. The block lives in the
Settings *UI*: on Chromecast with Google TV and several Sony/TCL sets, the
picker only ever lists Google's Backdrop. So the screensaver works on those
devices; the user just has no way to select it.

| ID | Fix | Where |
| --- | --- | --- |
| **AND-17** | The app can now select itself, writing the `screensaver_components`, `screensaver_enabled`, `screensaver_activate_on_sleep` and `screensaver_activate_on_dock` Secure keys directly and bypassing the picker entirely. This needs `WRITE_SECURE_SETTINGS`, which no app can be granted by being installed — it carries the framework's `development` protection flag, so only the owner of the device can turn it on, deliberately, from a computer. Declaring it in the manifest is what makes that possible at all; an undeclared permission cannot be granted. Until it is, `holdsWriteSecureSettings()` is false, nothing is written, and the UI keeps pointing at the system picker. | `AndroidManifest.xml`, `MainActivity.java` |
| **AND-17** | The app had no idea whether the screensaver was actually on. It offered to open the picker and then said nothing — and on a TV that hides the entry, the user would have followed the instructions, found nothing, and had no way to tell whether it had worked. The system setting is now read back, so Power & Sleep states plainly where things stand: on, off, or not determinable. | `MainActivity.java`, `src/hooks/useScreensaverStatus.ts` |
| **AND-17** | Power & Sleep's screensaver card became its own component with three states: confirmed on (sage, the colour the rest of that section already uses for a settled state); off but assignable, which is one button press; and off and not assignable, which offers the picker plus a collapsible explanation of how to unlock the direct route. That explanation ends with the option that needs nothing at all — leave the app open, since it already holds the screen awake and shows the art itself. | `src/components/settings/ScreensaverCard.tsx`, `PowerSection.tsx` |
| **AND-17** | The unlock instructions print the package name read at runtime rather than a hardcoded one. Debug builds carry a `.debug` `applicationIdSuffix`, and an adb command naming the wrong package silently grants nothing and reports success. | `MainActivity.java`, `ScreensaverCard.tsx` |

The status is polled while the settings menu is open, since it changes outside
this app entirely, and re-read whenever the TV hands focus back. The polled
value is only committed when a field actually differs — otherwise the whole
settings panel would rebuild every three seconds for a reading that changes
perhaps once in the appliance's life.

### Not verified here

- Whether `DreamManagerService` on a specific locked-down Google TV honours a
  third-party component written into `screensaver_components` can only be
  answered on such a device. The reasoning is sound and the mechanism is the
  documented one, but it has not run on hardware. If a TV turns out to refuse
  it, `assignScreensaver()` re-reads the setting rather than trusting its own
  write, so the app will say the change did not take instead of claiming
  success.
- `readScreensaverStatus()`'s parsing is unit tested, including malformed and
  wrongly-typed replies. The Java side is not; it runs only on a device.

---

## 1.4.0 — The settings menu fits any screen (2026-09-04)

The settings menu did not fit on screen. It scrolled vertically, the Close
button sat below the fold, the overlay-font row was cut off, and a tooltip ran
off the left edge. It read as jumbled because three sizing rules disagreed with
each other.

### Why it did not fit

| ID | Cause | Where |
| --- | --- | --- |
| **WEB-25** | The type scale was `clamp(rem, Xvw, rem)` — driven by viewport **width** only. Below roughly 1500px wide every token sat on its rem floor and stopped shrinking, and nothing in the app responded to viewport **height** at all. Height is the dimension that actually runs out on a short or sideways screen. | `src/index.css` |
| **WEB-25** | All box geometry was fixed rem — `p-6`, `gap-8`, `h-6 w-6`, the `w-64` tooltip. When text shrank the boxes did not, so the layout tore apart. | everywhere |
| **WEB-25** | Section grids used `lg:grid-cols-2 xl:grid-cols-4`, which are **whole-window** breakpoints, while each section lived inside a half-width column. At 1920px the Display and Power sections tried to be four columns inside 636px. This was the main source of the jumbled appearance. | `settings/*.tsx` |
| **WEB-25** | Five hand-written media-query blocks fought each other with four `!important`s. Three targeted `[role='dialog'] > div`, which is not the grid — the dialog element *is* the grid — so they did nothing at all. | `src/index.css` |
| **WEB-25** | `[role='dialog'] .tv-scroll { max-height: 18vh }` matched the panel itself, because the panel carried `tv-scroll`. **On a 720p TV this clamped the whole settings menu to about 130px — one row.** A live bug, found while removing the block. | `src/index.css` |
| **WEB-25** | `[role='dialog']` also matched `Dialog.tsx`, leaking padding and `max-height` into the app's confirmation modal on any screen under 800px tall. | `src/index.css` |

### The fix

One scale lever replaces all of it. `--tv-scale: min(100vw / 1920, 100vh / 1080)`
drives the root font size, and because every size in this app is rem-based, the
type scale, padding, gaps, icons, tiles and tooltips now shrink and grow
together against a 1920x1080 design canvas. `min()` takes whichever axis is
tighter, so the layout fits the constraining dimension instead of overflowing
it. The type tokens became plain rem at exactly their old 1080p values, so a
1080p TV renders as it did before. There is deliberately no `clamp()` floor on
the root size: a floor stops the layout shrinking while the screen keeps
shrinking, which is precisely how content ends up off-screen.

Structurally, the menu now shows **one section at a time**, chosen from a nav
rail — the standard TV settings pattern. Five sections in one scrolling grid
could never fit; one section in a fixed pane fits with room to spare, and the
panel is `overflow-hidden` so scrolling is structurally impossible rather than
merely unnecessary. Close moved into the rail, so it is permanently on screen.

The panel is `29rem x 78rem`, measured against the tallest section (Power needs
27.8rem including padding; the rail needs 25.1rem). Combined with the scale
above, that resolves to at most 43% of viewport height and 65% of width at any
screen size or aspect ratio — it cannot overflow.

| ID | Fix | Where |
| --- | --- | --- |
| **WEB-25** | Nav rail plus one pane. Roving tabindex, so the rail is one D-pad stop; Up/Down switches section immediately; Right enters the pane at the first real control; Left from that control returns to the rail. Entry skips the `(i)` info badges, which are focusable and come first in DOM order — without that, Right landed on an info badge instead of the first setting. Left is guarded to the first control only, so chip rows keep their left/right movement. | `src/components/SettingsPanel.tsx` |
| **WEB-25** | Every `md:`/`lg:`/`xl:` breakpoint inside a section replaced with a fixed column count. The pane is now always the same width in rem, so there is nothing left for a breakpoint to respond to. | `settings/*.tsx`, `SensorPanel.tsx` |
| **WEB-25** | Overlay Font and Units shared one `flex-wrap` row with four children, so labels and chip groups wrapped independently into a lopsided arrangement. Split into two labelled groups with the label above its chips — which also fixed a real 37px horizontal overflow of the four font chips. | `settings/DisplaySection.tsx` |
| **WEB-25** | The Black Mode and Keep Awake tiles carried a full sentence each and wrapped to four lines in the old narrow column. At full pane width they are one line; `line-clamp-2` makes that a hard ceiling so the tile height stays predictable if the wording changes. | `settings/PowerSection.tsx` |
| **WEB-25** | The sensor list's `max-h-[30vh]` and the release notes' `max-h-32` became a `min-h-0 flex-1` chain, so each takes exactly the room its pane has left rather than an arbitrary fraction of the screen. Both kept their scroll box — see below. Both also gained `tabIndex`/`role`/`aria-label`: **a scroll box with no focusable children cannot be scrolled by a remote at all.** | `SensorPanel.tsx`, `settings/UpdatesSection.tsx` |
| **WEB-25** | The screensaver help block had `overflow-x-auto` with `whitespace-pre` — a sideways scrollbar, which nothing in this app may have and a D-pad cannot drive anyway. The adb commands now wrap. The expandable block also got a bounded box, since it is ~22rem tall and expands inside a pane that no longer scrolls. | `settings/ScreensaverCard.tsx` |
| **WEB-25** | The tooltip was `left-1/2 -translate-x-1/2 w-64`, which is what ran off the left edge in the reported screenshot. Anchored to the badge's start edge and sized to its content, so it opens into the panel rather than out of it. | `src/components/TvSlider.tsx` |
| **WEB-25** | `p-[3vw]`, `max-w-[22vw]` and `bottom-[4vw]` on the artwork overlays converted to rem. The clock had the same width-only bug and was oversized on short screens; it now holds the same proportion of the screen at every size. No raw `vw`/`vh` remains outside the single `--tv-scale` definition and the panel's two belt-and-braces caps. | `Overlays.tsx`, `App.tsx` |
| **WEB-25** | Deleted the seven hand-written `.text-tv-*` classes. Tailwind v4 already generates identical utilities from the `--text-*` names in `@theme`, and these sat outside any `@layer`, so they beat every utility and made a text size impossible to override on one element. Confirmed by building and grepping `dist`. | `src/index.css` |
| **WEB-25** | Added `text-size-adjust: 100%`. Some Android TV WebViews inflate text on their own, which would resize the type while the rem boxes around it stayed put — desyncing the scale and overflowing the panel this work exists to keep on screen. | `src/index.css` |

`index.css` went from 221 lines to 152.

### Two things still scroll, deliberately

The sensor list and the release notes are the only genuinely unbounded content
in the app — an arbitrary number of discovered devices, and a release body
written on GitHub. Both keep a scroll box **inside** the pane; the menu itself
never scrolls. Bounding them to the room their pane has left, rather than to an
arbitrary `30vh` or `8rem`, is the actual improvement. With the realistic zero
to two sensors, nothing scrolls at all.

### Verified

`npm run verify` green: typecheck, lint, Prettier, 80 tests, build. Driven in a
real browser at 1920x1080, 1280x720, 1366x768, 915x412, 800x600, 1920x540,
3840x2160 and 1080x1920: all five sections fit at every size with no scrolling,
nothing clipped and Close always visible. A simulated twelve-sensor list
absorbed 1055px of scrolling inside its own box while the panel stayed at zero
overflow. The D-pad path was walked with the keyboard only.

### Not verified here

- Real sensor discovery cannot run in a browser preview — it uses native HTTP
  and the browser blocks it by CORS (invariant 3 in CLAUDE.md), so the Sensors pane
  was measured with an injected list rather than live devices.
- Directional focus movement *within* a pane relies on the TV WebView's own
  spatial navigation, as it did before this change. Desktop Chrome does not
  move focus with arrow keys, so only the rail behaviour and the rail/pane
  crossings could be exercised here.
- The Updates pane's download and install path is native and still needs a
  published release on a real TV. Only its layout was checked.

---

## 1.5.0 — Audit pass: sleep, albums, and a sensor firmware hardening (2026-10-23)

### App

| ID | Fix | Where |
| --- | --- | --- |
| **WEB-31** | Motion is sampled on every reading, keyed on the telemetry object. Keying on `telemetry.motion`/`telemetry.lux` skipped identical readings, so a dark, still room (lux 0, no motion) sent one sample, the window never filled, and **the screen never slept.** | `src/hooks/useDisplayState.ts` |
| **WEB-32** | Black Mode lifts when the lights come back on, with a hysteresis band so a reading at the threshold cannot flicker the screen. Previously it stayed black until someone walked past the sensor. | `src/hooks/useDisplayState.ts` |
| **WEB-33** | Picking a folder with no images keeps the current album. `LocalMediaLibrary.replace` revoked the on-screen URLs first, blanking the album. The file input is also reset on a miss, so the same folder can be re-picked. | `src/lib/artwork.ts`, `src/hooks/useArtRotation.ts`, `src/App.tsx` |
| **WEB-34** | Dialog actions close before running, so an action that opens a follow-up dialog no longer has it wiped instantly. | `src/components/Dialog.tsx` |
| **WEB-35** | The error screen starts one reload countdown, not one per caught error. | `src/components/ErrorBoundary.tsx` |
| **WEB-36** | Artwork is decoded off-screen and handed to the crossfade only once loaded, so a slow image no longer fades in as black and pops in mid-fade. | `src/components/ArtworkCanvas.tsx` |
| **WEB-37** | Dialogs ease in; every button, chip and toggle sinks slightly on press. | `src/index.css`, `src/components/ui/styles.ts` |
| **WEB-38** | `displayName` repairs sensor names damaged by FW-11, so they show correctly even before the sensor is reflashed. | `src/lib/sensor-utils.ts` |
| **WEB-39** | The firmware's 429 lockout is recognised as `locked_out` ("wait a minute, then try again"). It fell through to `bad_request`, which told the user to update the sensor's firmware. The mock sensor now reproduces the lockout and stores names exactly as the firmware does. | `src/lib/sensor.ts`, `src/lib/types.ts`, `mock/sensor-server.ts` |

### Sensor firmware (`phase6-hardened-v1`, needs a reflash)

| ID | Fix |
| --- | --- |
| **FW-10** | OTA checks the password **before writing anything**. It was checked only after the upload, by which point `Update.end(true)` had already made the image bootable — an unauthenticated upload was refused but still took over at the next restart. |
| **FW-11** | The stored name is reduced to the bare room name before formatting. Re-formatting at every boot cut it to 24 characters *including* the suffix, so "Living Room" came back as "Living Room - ambient tv". Damaged names are repaired on boot. |
| **FW-12** | The auth lockout measures elapsed time. It stored `millis() + 60000`, which after the 49.7-day `millis()` wrap brought an old lockout back for weeks. |
| **FW-13** | Factory reset (endpoint and physical button) also erases the saved Wi-Fi network. |
| **FW-14** | Removed the room-named pairing hotspot. Its FW-05 password was derived from the MAC, which the device publishes, and nothing used it. **Supersedes FW-05.** First-time setup still uses the `Ambient Setup` portal. |
| **FW-15** | CORS compares the `Origin` exactly. A substring match let `http://<sensor-ip>.example.com` pass as the sensor. |

### Verified

- `npm run verify` green: 85 tests.
- Firmware compiled locally with arduino-cli and the current ESP32 core:
  85% of flash, 15% of RAM, no new warnings.
- The firmware's own name functions were compiled on the host against a
  `String` shim and fed the same 14 names as the app, including damaged and
  over-long ones: every result matched `normaliseSensorName`, and formatting
  twice changed nothing.
- The mock sensor answered five wrong passwords with 401 and then 429, and kept
  refusing the correct password until the minute was up.

### Not verified here

- Nothing ran on a physical ESP32. The OTA password check, the Wi-Fi erase on
  factory reset and the lockout across a real 49.7-day `millis()` wrap are
  reasoned from the code, not observed on hardware.

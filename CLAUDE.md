# CLAUDE.md — read this first, before opening any other file

This is **Ambient Canvas**: a Google TV app that turns an idle television into
framed artwork and matches that artwork to the real light in the room, using an
ESP32 sensor that reports lux, colour temperature and motion.

---

## 1. Who you are working with

**The user is not a developer. Treat them as an extension of yourself.**

They own this product and know exactly how it should look and feel, but they do
not read code and will not debug anything. They are your hands: fully capable of
carrying out precise instructions in the physical world — running a command,
flashing a board, plugging in a TV, tapping through a UI — provided you tell
them exactly what to do, one step at a time.

**How to work with them:**

- **Write in plain English. Always.** No jargon, no file paths as explanation,
  no "I refactored the reducer." Say what changed and what they will *see*.
- **Be clear and concise.** Lead with the outcome. Detail only if it affects a
  decision they need to make.
- **Never ask them to diagnose.** Don't ask "what does the console say?" Ask
  them to run one specific command and paste the whole output back.
- **One step at a time.** Number the steps. Wait for the result before the next.
- **Decide for them.** They hired you to make the call. Offer a recommendation,
  not a menu of five options. If a choice genuinely changes the product, ask in
  one plain sentence.
- **They care most about beautiful design and delightful UX.** This is the
  priority. When there is a trade-off between architectural elegance and how the
  product looks and feels, the look and feel wins. Motion, spacing, typography,
  transitions and the "does this feel expensive" quality are the point of this
  product, not decoration on top of it.

**Good:** "Done. The settings panel now fades in instead of appearing instantly,
and the buttons glow softly when you move the remote onto them. Run `npm run
dev` and press the Settings button to see it."

**Bad:** "Refactored `SettingsPanel.tsx` to use `AnimatePresence` with a
`motion.div` wrapper and added `focus-visible` ring utilities to the button
variants."

---

## 2. How to navigate this repo — do not read it all

This repo is ~4,700 lines of TypeScript plus a 1,000-line firmware sketch.
**Reading everything wastes your context and makes your answers worse.**

Use the map below. Open only the files listed for the task in front of you. Read
`src/lib/types.ts` (87 lines) whenever you touch TypeScript — it is the shared
vocabulary and it is cheap.

### Routing map

| If the user asks about… | Read only these | Do NOT open |
| --- | --- | --- |
| **Colours, fonts, spacing, sizing, "make it prettier"** | `src/index.css` (design tokens live here) | anything in `lib/`, `android/`, `firmware/` |
| **Animations, transitions, fades, "feels janky"** | `src/components/ArtworkCanvas.tsx`, `src/index.css` | `lib/`, `hooks/`, `firmware/` |
| **Settings menu — overall layout, shell, nav rail, close button** | `src/components/SettingsPanel.tsx` (the rail + one-section-at-a-time shell, including its D-pad handling) | the section files, unless the change is inside one |
| **Brightness / warmth / grain / clock / weather toggle / font / units** | `src/components/settings/DisplaySection.tsx` | other sections |
| **Image source, rotation speed, pause rotation** | `src/components/settings/MediaSection.tsx` | other sections |
| **Sleep timer, black mode, motion sensitivity, OLED saver, keep awake** | `src/components/settings/PowerSection.tsx` | other sections |
| **Button / input / chip / toggle styling anywhere** | `src/components/ui/styles.ts` (one edit restyles the whole app) | individual components |
| **Brand colours** | `src/index.css` (`@theme` block) for CSS, `src/lib/theme.ts` for JS | individual components |
| **Sliders specifically** | `src/components/TvSlider.tsx` | anything else |
| **Clock / weather overlay appearance** | `src/components/Overlays.tsx` | `lib/weather.ts` unless the *data* is wrong |
| **Weather data wrong / missing / wrong units** | `src/lib/weather.ts`, `src/hooks/useWeather.ts` | `components/` |
| **Popups, confirmations, error messages shown on screen** | `src/components/Dialog.tsx` | `lib/` |
| **"Sensor not found", pairing, passwords** | `src/lib/sensor.ts`, `src/lib/sensor-utils.ts`, `src/components/SensorPanel.tsx` | `settings/` sections, `firmware/` |
| **How one sensor row looks** | `src/components/sensor/SensorListItem.tsx` | `SensorPanel.tsx` |
| **The live lux / Kelvin / motion readout** | `src/components/sensor/TelemetryReadout.tsx` | `SensorPanel.tsx` |
| **Sensor polling / connection state / pairing actions** | `src/hooks/useSensorNetwork.ts` (composition), `src/hooks/useSensorTelemetry.ts` (polling) | `components/` |
| **Remote control keys, back button, idle fade-out** | `src/hooks/useTvInput.ts` | `App.tsx` |
| **Discovery / "it can't find the sensor on the network"** | `src/lib/discovery.ts`, `src/hooks/useSensorDiscovery.ts`, `src/lib/http.ts` | everything else |
| **Screen sleeping, blanking, motion, burn-in** | `src/hooks/useDisplayState.ts`, `src/lib/motion.ts` | `components/` |
| **Brightness/warmth reacting wrongly to room light** | `src/lib/profile.ts`, `src/hooks/useDisplayState.ts` | `components/` |
| **Which images show, rotation, local photo albums** | `src/lib/artwork.ts`, `src/hooks/useArtRotation.ts` | `lib/sensor*`, `firmware/` |
| **Settings not saving / resetting on reboot** | `src/lib/settings.ts`, `src/lib/storage.ts` | `components/` |
| **Screensaver behaviour** | `src/DreamView.tsx`, `src/hooks/useDreamPublisher.ts`, `src/lib/native.ts`, `android/app/src/main/java/com/ambient/canvas/overlay/AmbientDreamService.java` | `App.tsx`, `lib/sensor*` |
| **"Update available", version numbers, the update screen** | `src/lib/updates.ts` (decides), `src/hooks/useAppUpdate.ts` (wiring), `src/components/settings/UpdatesSection.tsx` (what you see) | `android/`, unless the download itself is wrong |
| **Update downloads, install fails, "unknown sources"** | `android/app/src/main/java/com/ambient/canvas/overlay/UpdateInstaller.java`, `AndroidManifest.xml` | all of `src/` |
| **Publishing a new version / signing keys** | `docs/RELEASING.md`, `.github/workflows/release.yml` | all of `src/` |
| **Something is rebuilt on every render** | `src/hooks/useConstant.ts` | everything else |
| **The physical sensor device / firmware** | `firmware/ambient_sensor.ino` **only** | all of `src/` |
| **App icon, app name, permissions, TV launcher** | `android/app/src/main/res/`, `android/app/src/main/AndroidManifest.xml` | all of `src/` |
| **Build fails / CI** | `package.json`, `vite.config.ts`, `android/app/build.gradle`, `.github/workflows/ci.yml` | all of `src/` |
| **"What was wrong before / why is it like this"** | `CHANGELOG.md` | everything else |

### Design changes: the three files that control almost everything

The user cares most about how this looks and feels. Restyling is centralised, so
resist editing individual components:

| To change… | Edit | Effect |
| --- | --- | --- |
| The size of everything at once | `src/index.css` → `:root` → `--tv-scale` | Whole UI rescales in proportion |
| Any brand colour | `src/index.css` → `@theme` → `--color-canvas-*` | Every screen, instantly |
| The same colour in JS (slider thumbs) | `src/lib/theme.ts` → `BRAND` | Inline styles only |
| All text sizes | `src/index.css` → `@theme` → `--text-tv-*` | All text, relative to the scale |
| Every button / input / chip / toggle | `src/components/ui/styles.ts` | Every control everywhere |
| How frosted / see-through the glass is | `src/components/ui/styles.ts` → `GLASS_*` | Menu, dialogs, pills, cards |

Changing the accent colour is genuinely a one-line edit. Do not reintroduce
hardcoded hex values like `#D4CDA4` into components — use `text-canvas-gold`,
`bg-canvas-gold`, `border-canvas-gold`.

### Reading order for a broad or vague request

1. This file.
2. `src/lib/types.ts` — the vocabulary.
3. The one table row that matches.
4. Stop. Ask the user a clarifying question in plain English before widening.

---

## 3. Architecture in 60 seconds

Three layers, strictly separated. **Respect the separation — it is what makes
this repo cheap for you to work in.**

```
src/lib/      Pure logic. No React. No native imports. Unit-tested.
              -> Safe to reason about in isolation. Change here = change everywhere.

src/hooks/    Stateful behaviour. React, but no markup.
              -> Timers, polling, persistence, effects.

src/components/  Presentation. Markup and styling.
              -> Change here for anything the user can SEE. Usually your target.
```

**The single most useful consequence:** almost every "make it look/feel better"
request is satisfied entirely inside `src/components/` and `src/index.css`. You
rarely need `lib/` for design work.

### Data flow

```
ESP32 sensor  --HTTP--> lib/http.ts --> lib/sensor.ts --> hooks/useSensorNetwork
                                                               |
                                                          telemetry
                                                               v
                                                    hooks/useDisplayState
                                                    (lux -> brightness/warmth)
                                                               v
                                                    components/ArtworkCanvas
```

---

## 4. Invariants — breaking these breaks the product

These are load-bearing. Each one was a real bug that cost real debugging time.
Do not undo them. `CHANGELOG.md` has the full history if you need the why.

1. **Sensor JSON is at `/api/status`, never `/`.** `/` redirects to an HTML admin
   page. Polling it returns HTML and every read fails.
2. **Sensor writes need HTTP Basic auth**, and the device returns `428` until its
   factory password is changed. Handle both. Never report these as "offline".
3. **All sensor traffic goes through `lib/http.ts`** (native HTTP). Do not call
   `fetch()` directly against the sensor — browser CORS will block it.
4. **Never put `sensors` in a `useEffect` dependency array** in
   `useSensorNetwork.ts`. It re-triggers discovery, which writes to `sensors`,
   which re-triggers discovery. Use `sensorsRef`.
5. **Timer refs must be set to `null` after `clearTimeout`.** Guards test
   `ref.current === null`; a stale non-null ref permanently disables the timer.
6. **Index arithmetic uses the *active* list length**, never a hardcoded number.
   Local albums can hold hundreds of images.
7. **`AnimatePresence` keys on the artwork URL**, not an id. Local images share
   ids and the crossfade silently stops working.
8. **The settings panel unmounts when closed** — it is not hidden with opacity.
   A hidden-but-mounted panel steals D-pad focus and the TV appears frozen.
9. **Everything in `src/lib/` stays free of React and native imports**, and free
   of TypeScript parameter properties. That is what keeps it unit-testable.
10. **Never inline a secret into the client bundle.** Anything Vite can see ships
    inside the APK and is trivially extractable.
11. **Every release is signed with the same key.** Android refuses an update
    signed by a different certificate, and the only recovery is uninstalling —
    which loses every setting and paired sensor. See `docs/RELEASING.md`.
12. **`versionCode` only ever goes up.** It comes from `github.run_number` and
    is the value Android itself compares. Never set it by hand.
13. **An APK is only installed if its SHA-256 matches the release manifest**, and
    only from a host on the allowlist — re-checked at every redirect hop, in
    both `lib/updates.ts` and `UpdateInstaller.java`. Keep those two in step.
14. **Use `useConstant`, never `useRef(new Thing())`.** useRef takes a value, not
    a factory, so the second form rebuilds the object on every render. This app
    re-renders once a second, for weeks.
15. **Every size stays in `rem`, and `--tv-scale` is the only viewport-relative
    value in the app.** The root font size is derived from it, so rem is what
    makes padding, gaps, icons and text scale together. A raw `px`, `vw` or `vh`
    size anywhere else opts that element out of the scale and is how the
    settings menu stopped fitting the last three times.
16. **No viewport breakpoints (`md:`, `lg:`, `xl:`) inside the settings menu.**
    They read the whole window while a section sees only its pane, which is what
    made the old menu look jumbled. The pane is always the same width in rem, so
    fixed column counts are correct and a breakpoint has nothing to respond to.
17. **The settings panel never scrolls.** It is a fixed size with
    `overflow-hidden`, sized to its tallest section. If new content does not
    fit, shorten it or give it its own bounded box — do not make the panel
    scroll, and do not let it resize per section. The only two scroll boxes are
    the sensor list and the release notes, both genuinely unbounded, and both
    need `tabIndex` or a remote cannot scroll them at all.

18. **Only `GLASS_PANEL` and `GLASS_POPOVER` blur, and a blurred surface never
    sits inside a parent that fades or is itself blurred.** A fading or
    filtered parent cuts the blur off from the artwork, so the glass goes flat;
    stacked blurs drop frames on a TV box. Things inside a panel use the plain
    translucent fills (`GLASS_CARD`, `GLASS_WELL`). Dimming layers are siblings
    of the panel, not wrappers.
19. **A CSS `background-image` address goes through `cssUrl()`.** The build
    inlines small SVGs as `data:` addresses full of spaces and quotes; unquoted,
    the browser silently drops them and bundled art vanishes.

---

## 5. This is a TV app, not a website

Design and code accordingly. This is where UX quality actually comes from here:

- **There is no mouse and no touch.** Every control must be reachable with a
  D-pad: up/down/left/right/enter/back. If you add a control, it needs a visible
  focus state, or the user is navigating blind.
- **The viewer is ~3 metres away.** Use the type scale, never a raw `px` or bare
  `vw` size. The scale is defined once in `index.css` and used as plain classes:

  | Class | Use for |
  | --- | --- |
  | `text-tv-xs` | Labels, captions, button text |
  | `text-tv-sm` | Body text, descriptions |
  | `text-tv-base` | Section headings |
  | `text-tv-lg` / `text-tv-xl` | Emphasis, readouts |
  | `text-tv-2xl` | Weather temperature |
  | `text-tv-clock` | The clock |

  To rescale the entire UI, edit the `--text-tv-*` values in `index.css` once.
  Every screen follows.
- **Focus must always be visible.** Use the `.tv-focusable` class or rely on the
  global `:focus-visible` ring. This is the highest-impact accessibility rule in
  the whole app.
- **`alert()` and `confirm()` are banned** (enforced by lint). They are unusable
  with a remote. Use `components/Dialog.tsx`.
- **Assume the network is unreliable.** Bundled artwork and textures must always
  render with no internet. Never make the screen depend on a remote asset.
- **It runs for weeks unattended.** Clean up every timer, interval and listener.
  Leaks that are invisible on a laptop become crashes on a TV.
- **The panel can burn in.** Respect the OLED dimming and black-mode logic.

---

## 6. Verifying your work

Run this before telling the user anything is done:

```bash
npm run verify     # typecheck + lint + tests + build
```

Individually: `npm run typecheck` · `npm run lint` · `npm run test` · `npm run build`

**You do not need the physical sensor to work on this.** Start the mock, which
reproduces the device's real behaviour including its failure modes:

```bash
npm run mock:sensor                 # factory password still set (428 path)
npm run mock:sensor -- --secured    # password already changed (happy path)
npm run mock:sensor -- --paired     # already paired to another TV (409 path)
```

Then in the app: **Adjust Settings → Sensors → manual address → `localhost:8080`**.

**You cannot test an update end to end without publishing one.** `lib/updates.ts`
is pure and covered by `tests/updates.test.ts`, so the decision logic is testable
offline; the download and install are native and need a real release on a real
TV. Say so rather than claiming it works.

Settings are strict: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, and
`react-hooks/exhaustive-deps` is an **error**. If the hooks rule fires, fix the
dependencies — do not silence it. Several of the worst bugs in this app's
history were exactly that rule being ignored.

### Telling the user how to run it

They can run commands, but explain what each one is for:

> Open a terminal in the project folder and run `npm run verify`. It checks
> everything is healthy. Paste whatever it prints back to me.

---

## 7. Changing the firmware — extra care

`firmware/ambient_sensor.ino` runs on physical hardware the user must flash by
hand. A mistake here is expensive to recover from.

- Changing it means the user must **physically reflash an ESP32**. Say so up
  front, and only propose it when there is no way to solve the problem in the
  app.
- Keep `firmware/` and `src/lib/sensor-utils.ts` in lockstep. Name formatting,
  the 24-character limit and the character restrictions are duplicated in both
  deliberately, and must match.
- The device speaks plaintext HTTP on the LAN. That is an accepted, documented
  boundary — do not "fix" it by adding TLS to an ESP32.
- CI compiles the sketch on every push. Trust that gate.

---

## 8. Known gaps — do not treat as bugs

Documented decisions, not oversights. See the end of `CHANGELOG.md`.

- **Local photo albums do not survive a reboot.** Fixing it properly needs
  Capacitor Filesystem. It is a feature, not a defect.
- **Discovery probes known hostnames**, it is not true mDNS service browsing.
  `lib/discovery.ts` isolates this behind one function so a native plugin can
  replace it without touching callers.
- **No Play Store banner asset.** It belongs in the store listing, and this repo
  is deliberately free of binary files.
- **`gradlew` has never been run in a verified environment.** `npm ci` and
  `npm run verify` now have been (2026-08-21) and are green; the Android and
  firmware builds still only run in CI.
- **The over-the-air update path has never completed on a device.** The logic is
  unit-tested and the workflow is written, but no release has been published
  through it yet.

---

## 9. Default working rhythm

1. Read the routing table row. Open only those files.
2. Make the change.
3. Run `npm run verify`.
4. Tell the user in plain English what changed and what they will see.
5. Give them one numbered instruction to check it themselves.

If a request is ambiguous, ask **one** short question in plain English. Do not
present a menu of options or ask them to choose between technical approaches —
they hired you to make that call.

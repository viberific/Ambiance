/**
 * @file Composition root: wires hooks to components. Start here for "how it fits together".
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

import { ArtworkCanvas } from './components/ArtworkCanvas';
import { Dialog, useDialog } from './components/Dialog';
import { Overlays } from './components/Overlays';
import { SettingsPanel } from './components/SettingsPanel';
import { useAppUpdate } from './hooks/useAppUpdate';
import { useArtRotation } from './hooks/useArtRotation';
import { useDisplayState } from './hooks/useDisplayState';
import { useDreamPublisher } from './hooks/useDreamPublisher';
import { useSensorNetwork } from './hooks/useSensorNetwork';
import { useSettings } from './hooks/useSettings';
import { useTvInput, closeMenuWithHistory } from './hooks/useTvInput';
import { useWeather } from './hooks/useWeather';
import { DEFAULT_ADMIN_USER } from './lib/sensor-utils';

export default function App() {
  const { settings, set: setSetting } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  const dialog = useDialog();
  const network = useSensorNetwork();
  const weather = useWeather(settings.showWeather);
  const update = useAppUpdate();

  const connected = network.connection === 'connected';

  const display = useDisplayState({
    telemetry: network.telemetry,
    settings,
    settingsOpen: showSettings,
    connected,
  });

  const art = useArtRotation({
    source: settings.imageSource,
    rotationMinutes: settings.rotationMinutes,
    isStatic: settings.isStatic,
    paused: showSettings,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeSettings = useCallback(() => closeMenuWithHistory(setShowSettings), []);
  const openSettings = useCallback(() => setShowSettings(true), []);

  const { uiVisible, keepMenuAlive } = useTvInput({
    menuOpen: showSettings,
    dialogOpen: dialog.request !== null,
    onCloseMenu: closeSettings,
    onOpenMenu: openSettings,
    onPrevious: art.previous,
    onNext: art.next,
  });

  /* --------------------------------------------------------- local media I/O */

  const handleLocalFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      const count = art.loadLocalFiles(files);
      // Allow re-selecting the same folder later, including after a miss.
      event.target.value = '';

      if (count === 0) {
        dialog.notify(
          'No images found',
          'That folder did not contain any image files the TV can display.',
        );
        return;
      }

      setSetting('imageSource', 'local');
    },
    [art, dialog, setSetting],
  );

  /* ------------------------------------------------------------------ weather */

  const handleToggleWeather = useCallback(async () => {
    if (settings.showWeather) {
      setSetting('showWeather', false);
      return;
    }

    const allowed = await weather.requestPermission();
    if (!allowed) {
      setSetting('showWeather', false);
      dialog.notify(
        'Location needed',
        'Weather needs location permission. Enable location for Ambient Canvas in Android settings, then try again.',
      );
      return;
    }

    setSetting('showWeather', true);
  }, [settings.showWeather, setSetting, weather, dialog]);

  /* ------------------------------------------------------------- screensaver */

  /*
   * Hoisted out of the dependency array below. `art.current?.url` is a member
   * expression, which react-hooks/exhaustive-deps cannot verify, so it insisted
   * on the whole `art` object — and `art` is a fresh object every render, which
   * would republish the screensaver snapshot on every single render instead of
   * only when the picture actually changes.
   */
  const artworkUrl = art.current?.url ?? null;
  const artworkTitle = art.current?.title ?? null;

  useDreamPublisher(
    useMemo(
      () => ({
        telemetry: network.telemetry,
        luminance: display.luminance,
        warmth: display.warmth,
        grainIntensity: settings.grainIntensity,
        showClock: settings.showClock,
        showWeather: settings.showWeather,
        overlayFont: settings.overlayFont,
        temperatureUnit: settings.temperatureUnit,
        weatherTemp: weather.temperatureC,
        weatherCode: weather.code,
        weatherLocation: weather.label,
        artworkUrl,
        artworkTitle,
      }),
      [
        network.telemetry,
        display.luminance,
        display.warmth,
        settings.grainIntensity,
        settings.showClock,
        settings.showWeather,
        settings.overlayFont,
        settings.temperatureUnit,
        weather.temperatureC,
        weather.code,
        weather.label,
        artworkUrl,
        artworkTitle,
      ],
    ),
  );

  /* ------------------------------------------------------------------- render */

  const sensorPanel = useMemo(
    () => ({
      sensors: network.sensors,
      selectedSensorId: network.selectedSensorId,
      telemetry: network.telemetry,
      connection: network.connection,
      isScanning: network.isScanning,
      pendingRenames: network.pendingRenames,
      hasCredentials: network.credentials !== null,
      onRescan: network.rescan,
      onSelect: network.selectSensor,
      onForget: network.forgetSensor,
      onRename: network.rename,
      onPair: network.pair,
      onAddManual: network.addManualSensor,
      onSetCredentials: (user: string, password: string) =>
        network.setCredentials({ user: user || DEFAULT_ADMIN_USER, password }),
      onChangePassword: network.changePassword,
      showDialog: dialog.show,
    }),
    [network, dialog.show],
  );

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black font-sans text-canvas-parchment select-none">
      <ArtworkCanvas
        artwork={art.current}
        luminance={display.luminance}
        warmth={display.warmth}
        grainIntensity={settings.grainIntensity}
      />

      {/* Power-save blackout */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-40 bg-black transition-opacity duration-[3000ms] ${
          display.isScreenBlack ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_300px_rgba(0,0,0,0.8)]"
      />

      <Overlays
        showClock={settings.showClock}
        showWeather={settings.showWeather}
        font={settings.overlayFont}
        unit={settings.temperatureUnit}
        weatherTemp={weather.temperatureC}
        weatherCode={weather.code}
        weatherLabel={weather.label}
        connection={network.connection}
        isScreenBlack={display.isScreenBlack}
        isOledDimmed={display.isOledDimmed}
        overlayOpacity={display.luminance / 100}
      />

      <SettingsPanel
        open={showSettings}
        settings={settings}
        setSetting={setSetting}
        luminance={display.luminance}
        warmth={display.warmth}
        onLuminanceChange={display.setLuminance}
        onWarmthChange={display.setWarmth}
        onCommitProfile={display.commitProfile}
        onInteract={keepMenuAlive}
        onClose={closeSettings}
        onPickLocalFolder={() => fileInputRef.current?.click()}
        localCount={art.localCount}
        onToggleWeather={() => void handleToggleWeather()}
        sensorPanel={sensorPanel}
        update={update}
      />

      {/*
        Kept outside SettingsPanel so the input survives the panel unmounting
        (WEB-13) while the native folder picker is open.
        `webkitdirectory` is absent from React's typings; the cast is deliberate.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleLocalFileSelect}
        className="hidden"
        {...({ webkitdirectory: '' } as Record<string, string>)}
      />

      <div
        className={`absolute bottom-[4.75rem] left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-5 transition-all duration-700 ${
          showSettings || !uiVisible ? 'pointer-events-none scale-95 opacity-0' : 'opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={openSettings}
          className="tv-focusable pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-canvas-surface/50 px-12 py-4 text-tv-xs tracking-[0.4em] text-canvas-gold/80 uppercase shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all hover:scale-105 hover:bg-canvas-surface/70 hover:text-canvas-gold"
        >
          <SettingsIcon className="h-5 w-5 opacity-60" aria-hidden="true" />
          Adjust Settings
        </button>

        {display.isScreenBlack ? (
          <div
            role="status"
            className="animate-pulse rounded-full border border-red-500/20 bg-red-900/60 px-10 py-3 text-tv-xs font-bold tracking-[0.3em] text-red-200 uppercase shadow-2xl backdrop-blur-xl"
          >
            Screen in power save mode
          </div>
        ) : null}
      </div>

      <Dialog request={dialog.request} onClose={dialog.close} />
    </div>
  );
}

/**
 * @file Owns brightness/warmth, sleep blanking and OLED dimming.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConstant } from './useConstant';
import { MotionWindow } from '../lib/motion';
import {
  Ema,
  LUX_BUCKET_SIZE,
  TEMP_BUCKET_SIZE,
  bucketKey,
  bucketWithHysteresis,
  clampLuminance,
  clampWarmth,
  innateProfile,
} from '../lib/profile';
import { load, save } from '../lib/storage';
import type { RoomProfile, Telemetry } from '../lib/types';
import type { Settings } from '../lib/settings';

/** Ignore repeat remote input inside this window; the dim timer runs in minutes. */
const ACTIVITY_THROTTLE_MS = 10_000;

export interface UseDisplayStateOptions {
  telemetry: Telemetry;
  settings: Settings;
  /** Auto-profile application is suspended while the settings menu is open. */
  settingsOpen: boolean;
  connected: boolean;
}

export interface UseDisplayStateResult {
  luminance: number;
  warmth: number;
  setLuminance: (value: number) => void;
  setWarmth: (value: number) => void;
  commitProfile: () => void;
  isScreenBlack: boolean;
  isOledDimmed: boolean;
  profileKey: string;
  hasLearnedProfile: boolean;
}

export function useDisplayState(options: UseDisplayStateOptions): UseDisplayStateResult {
  const { telemetry, settings, settingsOpen, connected } = options;

  const [profiles, setProfiles] = useState<Record<string, RoomProfile>>(() =>
    load<Record<string, RoomProfile>>('profiles', {}),
  );
  const [luminance, setLuminanceState] = useState(60);
  const [warmth, setWarmthState] = useState(200);
  const [isScreenBlack, setIsScreenBlack] = useState(false);
  const [isOledDimmed, setIsOledDimmed] = useState(false);

  /* ------------------------------------------------------ smoothed telemetry */

  /**
   * WEB-12: raw lux from a TCS34725 jitters by a few units even in a perfectly
   * still room. Bucketing the raw value meant crossing a bucket boundary every
   * few seconds, and each crossing hard-reset the brightness and warmth
   * sliders from the stored profile — including mid-drag, so the control
   * visibly jumped out from under the user.
   */
  // See useConstant: `useRef(new Ema(...))` rebuilt these on every render, and
  // this hook re-renders once a second for the life of the app.
  const luxEma = useConstant(() => new Ema(0.12));
  const tempEma = useConstant(() => new Ema(0.12));
  const [smoothed, setSmoothed] = useState({ lux: 0, temp: 0 });

  useEffect(() => {
    if (!connected) return;
    const lux = luxEma.push(telemetry.lux);
    const temp = tempEma.push(telemetry.temp);
    setSmoothed({ lux, temp });
  }, [telemetry.lux, telemetry.temp, connected, luxEma, tempEma]);

  const luxBucketRef = useRef<number | null>(null);
  const tempBucketRef = useRef<number | null>(null);

  const profileKey = useMemo(() => {
    const luxBucket = bucketWithHysteresis(smoothed.lux, LUX_BUCKET_SIZE, luxBucketRef.current);
    const tempBucket = bucketWithHysteresis(smoothed.temp, TEMP_BUCKET_SIZE, tempBucketRef.current);
    luxBucketRef.current = luxBucket;
    tempBucketRef.current = tempBucket;
    return bucketKey(luxBucket, tempBucket);
  }, [smoothed.lux, smoothed.temp]);

  /* ------------------------------------------------------------ auto profile */

  useEffect(() => {
    // WEB-12 (3rd guard): never move the sliders while the user is looking at
    // them. Without a sensor there is nothing to react to either.
    if (settingsOpen || !connected) return;

    const learned = profiles[profileKey];
    if (learned) {
      setLuminanceState(clampLuminance(learned.luminance));
      setWarmthState(clampWarmth(learned.warmth));
      return;
    }
    const innate = innateProfile(smoothed.lux, smoothed.temp);
    setLuminanceState(innate.luminance);
    setWarmthState(innate.warmth);
  }, [profileKey, profiles, settingsOpen, connected, smoothed.lux, smoothed.temp]);

  const setLuminance = useCallback((value: number) => setLuminanceState(clampLuminance(value)), []);
  const setWarmth = useCallback((value: number) => setWarmthState(clampWarmth(value)), []);

  /** Persists the current slider values as the profile for this light bucket. */
  const commitProfile = useCallback(() => {
    setProfiles((previous) => {
      const next = { ...previous, [profileKey]: { luminance, warmth } };
      save('profiles', next);
      return next;
    });
  }, [profileKey, luminance, warmth]);

  /* ------------------------------------------------------------ motion/sleep */

  const motionWindow = useConstant(() => new MotionWindow(settings.motionSensitivity));
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    motionWindow.resize(settings.motionSensitivity);
  }, [settings.motionSensitivity, motionWindow]);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimer.current !== null) {
      clearTimeout(sleepTimer.current);
      /*
       * WEB-06: the original cleared this timeout but never reset the ref to
       * null. The scheduling branch was guarded by `!motionTimerRef.current`,
       * which stayed truthy forever after the first sleep cycle, so the screen
       * could never go to sleep a second time in one session. Nulling here is
       * the entire fix.
       */
      sleepTimer.current = null;
    }
  }, []);

  /*
   * Sampling is keyed on the telemetry *object*, which the poller replaces on
   * every read. Keying on `telemetry.motion` / `telemetry.lux` meant a reading
   * identical to the last one was never sampled: in a dark, still room (lux 0,
   * no motion, every second) the window received one sample and then nothing,
   * never filled, and the screen never went to sleep. The ref stops re-runs
   * caused by anything else (isScreenBlack flipping) counting as a new sample.
   */
  const lastSample = useRef<Telemetry | null>(null);
  /** True while the screen is black because the room is dark, not because it is empty. */
  const blackForDarkness = useRef(false);

  useEffect(() => {
    if (!connected) {
      // No sensor: don't blank the screen on the strength of fabricated motion.
      motionWindow.clear();
      clearSleepTimer();
      lastSample.current = null;
      blackForDarkness.current = false;
      setIsScreenBlack(false);
      return;
    }

    if (lastSample.current !== telemetry) {
      lastSample.current = telemetry;
      motionWindow.push(telemetry.motion);
    }

    // Black Mode: below the lux threshold the panel stays black regardless of
    // motion, so a dark room never gets a glowing rectangle in it. Once black,
    // the light must clear the threshold by a margin to wake it, so a reading
    // hovering at the threshold cannot flicker the screen every second.
    const wakeAbove = settings.blackModeThreshold + Math.max(2, settings.blackModeThreshold * 0.2);
    const isDark =
      telemetry.lux <= (blackForDarkness.current ? wakeAbove : settings.blackModeThreshold);
    if (settings.blackModeEnabled && isDark) {
      clearSleepTimer();
      blackForDarkness.current = true;
      setIsScreenBlack(true);
      return;
    }

    // The lights came back on (or Black Mode was switched off): darkness was
    // the only reason the screen was black, so lift it rather than waiting for
    // someone to walk past the sensor.
    if (blackForDarkness.current) {
      blackForDarkness.current = false;
      setIsScreenBlack(false);
      return;
    }

    if (motionWindow.isSustainedMotion) {
      clearSleepTimer();
      setIsScreenBlack(false);
      return;
    }

    if (motionWindow.isSustainedStill && !isScreenBlack && sleepTimer.current === null) {
      sleepTimer.current = setTimeout(
        () => {
          setIsScreenBlack(true);
          sleepTimer.current = null;
        },
        Math.max(1, settings.powerSafeMinutes) * 60_000,
      );
    }
  }, [
    telemetry,
    connected,
    isScreenBlack,
    settings.blackModeEnabled,
    settings.blackModeThreshold,
    settings.powerSafeMinutes,
    clearSleepTimer,
    motionWindow,
  ]);

  useEffect(() => clearSleepTimer, [clearSleepTimer]);

  /* ---------------------------------------------------------------- OLED dim */

  /**
   * WEB-30: the OLED timer could only ever be reset by sensor motion or by the
   * settings panel being open. Someone with no sensor paired — or whose sensor
   * had dropped off the network — had nothing that could reset it: the clock
   * and weather faded to 20% a few minutes after launch and stayed there for
   * good, and pressing keys on the remote did not bring them back. Someone
   * standing in front of the TV working the remote is present by definition.
   */
  const [activityTick, setActivityTick] = useState(0);

  useEffect(() => {
    let last = 0;
    const bump = () => {
      // Throttled hard: the dim timer is measured in minutes, and a held-down
      // D-pad key fires continuously.
      const now = Date.now();
      if (now - last < ACTIVITY_THROTTLE_MS) return;
      last = now;
      setActivityTick((tick) => tick + 1);
    };

    window.addEventListener('keydown', bump);
    window.addEventListener('mousemove', bump);
    window.addEventListener('mousedown', bump);
    window.addEventListener('touchstart', bump, { passive: true });
    return () => {
      window.removeEventListener('keydown', bump);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('mousedown', bump);
      window.removeEventListener('touchstart', bump);
    };
  }, []);

  useEffect(() => {
    // Any re-run of this effect is a presence signal or a settings change, so
    // undim first and then re-arm from zero.
    setIsOledDimmed(false);
    if (settingsOpen || (connected && telemetry.motion)) return;

    const timer = setTimeout(
      () => setIsOledDimmed(true),
      Math.max(1, settings.oledSaverMinutes) * 60_000,
    );
    return () => clearTimeout(timer);
  }, [telemetry.motion, settings.oledSaverMinutes, settingsOpen, connected, activityTick]);

  return {
    luminance,
    warmth,
    setLuminance,
    setWarmth,
    commitProfile,
    isScreenBlack,
    isOledDimmed,
    profileKey,
    hasLearnedProfile: profileKey in profiles,
  };
}

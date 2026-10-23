/**
 * @file Remote-control input: idle UI hiding, back button, arrow navigation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const UI_IDLE_MS = 5000;

/**
 * The settings menu used to auto-close after 10 seconds. That is far too
 * aggressive for a remote-driven UI: entering an IP address or a 10-character
 * password one D-pad character at a time easily exceeds it, and the panel would
 * vanish mid-entry. 60s, reset on every interaction.
 */
const MENU_IDLE_MS = 60_000;

export interface UseTvInputOptions {
  menuOpen: boolean;
  /** Suppresses navigation while a modal owns the screen. */
  dialogOpen: boolean;
  onCloseMenu: () => void;
  onOpenMenu: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export interface UseTvInputResult {
  /** False once the user has been idle, fading out the on-screen controls. */
  uiVisible: boolean;
  /** Call on any interaction inside the menu to postpone auto-close. */
  keepMenuAlive: () => void;
}

export function useTvInput(options: UseTvInputOptions): UseTvInputResult {
  const { menuOpen, dialogOpen, onCloseMenu, onOpenMenu, onPrevious, onNext } = options;

  const [uiVisible, setUiVisible] = useState(true);
  const uiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlers = useRef({ onCloseMenu, onOpenMenu, onPrevious, onNext });
  handlers.current = { onCloseMenu, onOpenMenu, onPrevious, onNext };

  const showUi = useCallback(() => {
    setUiVisible(true);
    if (uiTimer.current !== null) clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
      setUiVisible(false);
      uiTimer.current = null;
    }, UI_IDLE_MS);
  }, []);

  const keepMenuAlive = useCallback(() => {
    if (menuTimer.current !== null) clearTimeout(menuTimer.current);
    menuTimer.current = setTimeout(() => {
      handlers.current.onCloseMenu();
      menuTimer.current = null;
    }, MENU_IDLE_MS);
  }, []);

  /* ------------------------------------------------------- history / back key */

  useEffect(() => {
    if (!menuOpen) {
      if (menuTimer.current !== null) {
        clearTimeout(menuTimer.current);
        menuTimer.current = null;
      }
      return;
    }
    if (!window.history.state?.ambientSettings) {
      window.history.pushState({ ambientSettings: true }, '');
    }
    keepMenuAlive();
  }, [menuOpen, keepMenuAlive]);

  // The TV hardware back button closes the menu rather than exiting the app.
  useEffect(() => {
    const onPopState = () => {
      if (menuOpen) handlers.current.onCloseMenu();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [menuOpen]);

  /* ------------------------------------------------------------- key handling */

  useEffect(() => {
    const onPointer = () => {
      showUi();
      if (menuOpen) keepMenuAlive();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      showUi();
      if (menuOpen) keepMenuAlive();

      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable === true);

      if (isTyping || dialogOpen) return;

      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'BrowserBack') {
        if (menuOpen) {
          event.preventDefault();
          handlers.current.onCloseMenu();
        }
        return;
      }

      if (menuOpen) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlers.current.onPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.current.onNext();
      } else if (event.key === 'Enter' || event.key === ' ') {
        // Enter on the idle artwork screen opens settings, matching TV convention.
        event.preventDefault();
        handlers.current.onOpenMenu();
      }
    };

    window.addEventListener('mousemove', onPointer);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('touchstart', onPointer, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    showUi();

    return () => {
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, dialogOpen, showUi, keepMenuAlive]);

  // Release both timers on unmount.
  useEffect(
    () => () => {
      if (uiTimer.current !== null) clearTimeout(uiTimer.current);
      if (menuTimer.current !== null) clearTimeout(menuTimer.current);
    },
    [],
  );

  return { uiVisible, keepMenuAlive };
}

/** Closes the menu and unwinds the history entry pushed when it opened. */
export function closeMenuWithHistory(setOpen: (open: boolean) => void): void {
  setOpen(false);
  if (window.history.state?.ambientSettings) {
    window.history.back();
  }
}

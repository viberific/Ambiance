/**
 * @file Owns which image is showing and when it changes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useConstant } from './useConstant';
import {
  LocalMediaLibrary,
  activeArtwork,
  artworkAt,
  nextIndex,
  previousIndex,
} from '../lib/artwork';
import type { Artwork, ImageSource } from '../lib/types';

export interface UseArtRotationOptions {
  source: ImageSource;
  rotationMinutes: number;
  isStatic: boolean;
  /** Rotation pauses while the settings menu is open. */
  paused: boolean;
}

export interface UseArtRotationResult {
  current: Artwork | null;
  list: Artwork[];
  index: number;
  next: () => void;
  previous: () => void;
  localCount: number;
  loadLocalFiles: (files: File[]) => number;
  clearLocalFiles: () => void;
}

export function useArtRotation(options: UseArtRotationOptions): UseArtRotationResult {
  const { source, rotationMinutes, isStatic, paused } = options;

  const [localFiles, setLocalFiles] = useState<Artwork[]>([]);
  const [index, setIndex] = useState(0);
  const library = useConstant(() => new LocalMediaLibrary());

  const list = useMemo(() => activeArtwork(source, localFiles), [source, localFiles]);

  // WEB-07: keep the index inside the ACTIVE list. Switching between a 5-item
  // curated set and a 200-item folder previously left the index dangling.
  useEffect(() => {
    setIndex((current) => (list.length === 0 ? 0 : current % list.length));
  }, [list.length]);

  const next = useCallback(
    () => setIndex((current) => nextIndex(current, list.length)),
    [list.length],
  );
  const previous = useCallback(
    () => setIndex((current) => previousIndex(current, list.length)),
    [list.length],
  );

  /*
   * WEB-07: the rotation timer used `(prev + 1) % ARTWORK.length`, hardcoded to
   * the 5-item curated array, while rendering indexed into localFiles. A local
   * album of any size therefore only ever showed its first five images.
   */
  useEffect(() => {
    if (isStatic || paused || list.length <= 1) return;
    const minutes = Math.max(1, rotationMinutes);
    const timer = setInterval(
      () => setIndex((current) => nextIndex(current, list.length)),
      minutes * 60_000,
    );
    return () => clearInterval(timer);
  }, [isStatic, paused, rotationMinutes, list.length]);

  const loadLocalFiles = useCallback(
    (files: File[]) => {
      // WEB-09: LocalMediaLibrary revokes the previous object URLs before minting
      // new ones. The old handler leaked every URL it ever created.
      const artwork = library.replace(files);
      // Nothing usable: keep showing the album that is already loaded.
      if (artwork.length === 0) return 0;
      setLocalFiles(artwork);
      setIndex(0);
      return artwork.length;
    },
    [library],
  );

  const clearLocalFiles = useCallback(() => {
    library.revokeAll();
    setLocalFiles([]);
    setIndex(0);
  }, [library]);

  // WEB-09: release every blob URL on unmount.
  useEffect(() => () => library.revokeAll(), [library]);

  return {
    current: artworkAt(list, index),
    list,
    index,
    next,
    previous,
    localCount: localFiles.length,
    loadLocalFiles,
    clearLocalFiles,
  };
}

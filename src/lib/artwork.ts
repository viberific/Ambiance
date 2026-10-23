/**
 * @file Artwork sources (bundled, curated, local) and rotation index maths.
 */
/**
 * Artwork sources and rotation.
 */

import type { Artwork, ImageSource } from './types';

/**
 * WEB-16: every visual asset in this app was remote — artwork from Unsplash,
 * grain and paper textures from transparenttextures.com, fonts from Google
 * Fonts. On a TV whose WAN link is down (or behind a captive portal, or simply
 * slow to come up at boot) the app rendered a black screen with a clock. For an
 * appliance whose entire job is to display a picture, that is a total failure
 * mode triggered by an entirely ordinary condition.
 *
 * Textures and fonts are now bundled (see src/assets and index.css). Remote
 * artwork is kept, but `local: false` marks it as network-dependent, and
 * BUNDLED_ARTWORK below always renders regardless of connectivity.
 */
export const BUNDLED_ARTWORK: Artwork[] = [
  {
    id: 'gradient-dawn',
    title: 'Dawn Field',
    artist: 'Ambient Canvas',
    url: new URL('../assets/art/dawn-field.svg', import.meta.url).href,
    local: true,
  },
  {
    id: 'gradient-dusk',
    title: 'Dusk Ridge',
    artist: 'Ambient Canvas',
    url: new URL('../assets/art/dusk-ridge.svg', import.meta.url).href,
    local: true,
  },
  {
    id: 'gradient-still',
    title: 'Still Water',
    artist: 'Ambient Canvas',
    url: new URL('../assets/art/still-water.svg', import.meta.url).href,
    local: true,
  },
];

export const CURATED_ARTWORK: Artwork[] = [
  {
    id: 'starry-night',
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    url: 'https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&q=80&w=1920',
  },
  {
    id: 'impression-sunrise',
    title: 'Impression, Sunrise',
    artist: 'Claude Monet',
    url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=1920',
  },
  {
    id: 'great-wave',
    title: 'The Great Wave',
    artist: 'Hokusai',
    url: 'https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&q=80&w=1920',
  },
  {
    id: 'wanderer',
    title: 'Wanderer above the Sea of Fog',
    artist: 'Caspar David Friedrich',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1920',
  },
  {
    id: 'view-of-delft',
    title: 'View of Delft',
    artist: 'Johannes Vermeer',
    url: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?auto=format&fit=crop&q=80&w=1920',
  },
  ...BUNDLED_ARTWORK,
];

/**
 * WEB-07: index arithmetic was hardcoded to ARTWORK.length (5) in three
 * separate places — the rotation interval, the ArrowLeft handler and the
 * ArrowRight handler — while the *rendered* image was chosen with
 * `localFiles[artIndex % localFiles.length]`. Selecting a local folder of 200
 * photos therefore cycled the index 0..4 forever and only ever showed the first
 * five images. Rotation length must come from the active source.
 */
export function activeArtwork(source: ImageSource, localFiles: Artwork[]): Artwork[] {
  if (source === 'local' && localFiles.length > 0) return localFiles;
  return CURATED_ARTWORK;
}

export function artworkAt(list: Artwork[], index: number): Artwork | null {
  if (list.length === 0) return null;
  const safe = ((index % list.length) + list.length) % list.length;
  return list[safe] ?? null;
}

export function nextIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current + 1) % length;
}

export function previousIndex(current: number, length: number): number {
  if (length <= 0) return 0;
  return (current - 1 + length) % length;
}

/**
 * WEB-09: handleLocalFileSelect created an object URL per file and never
 * revoked any of them, so re-picking a folder leaked the entire previous set
 * for the lifetime of the app. Blob URLs are also scoped to the document, so
 * they died on reload while `imageSource: 'local'` persisted — the app came
 * back up in local mode pointing at URLs that no longer resolved, showing
 * nothing at all.
 */
export class LocalMediaLibrary {
  private urls: string[] = [];

  /**
   * Replaces the current set, revoking the previous one. A selection with no
   * images returns [] and leaves the current set untouched: revoking first
   * would kill the URL of the picture on screen, and the album would go blank
   * because someone opened the wrong folder.
   */
  replace(files: File[]): Artwork[] {
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return [];

    this.revokeAll();
    // Stable, human-meaningful ordering rather than filesystem order.
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const artwork = images.map((file, index) => {
      const url = URL.createObjectURL(file);
      this.urls.push(url);
      return {
        id: `local-${index}-${file.name}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: `Local media ${index + 1} of ${images.length}`,
        url,
        local: true,
      } satisfies Artwork;
    });

    return artwork;
  }

  revokeAll(): void {
    for (const url of this.urls) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* already revoked */
      }
    }
    this.urls = [];
  }
}

/* ------------------------------------------------- AND-15: screensaver URLs */

/**
 * AND-15: the screensaver runs in a *second* WebView, on a `file://` origin,
 * with no Capacitor bridge. It cannot load any of the URLs the app itself uses:
 *
 *   - bundled art resolves to `https://localhost/assets/…` inside the app, and
 *     that host is served by Capacitor's local server *inside the app's own
 *     WebView only*. To the dream it is simply an unreachable address.
 *   - a local album is a `blob:` URL, which is scoped to the document that
 *     created it and is dead in any other document.
 *   - a `data:` URL would blow the 64 KB limit in saveDreamState, which
 *     silently discards the *entire* snapshot — so the clock, weather and
 *     brightness settings would be lost too, not just the picture.
 *
 * The result was a screensaver that framed an empty rectangle. Snapshots now
 * carry a path the dream can resolve against its own document, and anything
 * inherently unshareable is dropped so the dream falls back to bundled art.
 */
export function portableArtworkUrl(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return null;
  // Same-origin app assets become document-relative, so the dream resolves
  // them against file:///android_asset/public/ instead of a dead https host.
  if (origin && url.startsWith(`${origin}/`)) return url.slice(origin.length + 1);
  return url;
}

/** Inverse of {@link portableArtworkUrl}, applied inside the screensaver. */
export function resolveArtworkUrl(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  // Already absolute (a remote https image); nothing to resolve.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

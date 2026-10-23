import { describe, expect, it } from 'vitest';

import { LocalMediaLibrary, portableArtworkUrl, resolveArtworkUrl } from '../src/lib/artwork';

/*
 * AND-15: the screensaver renders in a second WebView on a file:// origin. It
 * cannot load the app's own https://localhost asset URLs, and it cannot load a
 * blob: URL from the app's document at all. These two functions are the whole
 * fix, so they are pinned here.
 */
describe('portableArtworkUrl', () => {
  const ORIGIN = 'https://localhost';

  it('makes a bundled app asset document-relative', () => {
    expect(portableArtworkUrl(`${ORIGIN}/assets/dawn-field-a1b2c3.svg`, ORIGIN)).toBe(
      'assets/dawn-field-a1b2c3.svg',
    );
  });

  it('leaves a remote image untouched', () => {
    const remote = 'https://images.unsplash.com/photo-1541963463532?w=1920';
    expect(portableArtworkUrl(remote, ORIGIN)).toBe(remote);
  });

  it('drops a local-album blob URL, which is dead outside its own document', () => {
    expect(portableArtworkUrl('blob:https://localhost/9f3a-4c11', ORIGIN)).toBeNull();
  });

  it('drops a data URL, which would blow the 64KB snapshot limit', () => {
    expect(portableArtworkUrl('data:image/png;base64,AAAA', ORIGIN)).toBeNull();
  });

  it('passes null through', () => {
    expect(portableArtworkUrl(null, ORIGIN)).toBeNull();
    expect(portableArtworkUrl(undefined, ORIGIN)).toBeNull();
    expect(portableArtworkUrl('', ORIGIN)).toBeNull();
  });

  it('does not mangle a URL that merely starts with the same characters', () => {
    const other = 'https://localhost.example.com/art.jpg';
    expect(portableArtworkUrl(other, ORIGIN)).toBe(other);
  });
});

describe('resolveArtworkUrl', () => {
  const BASE = 'file:///android_asset/public/index.html';

  it('resolves a relative asset against the dream document', () => {
    expect(resolveArtworkUrl('assets/dawn-field-a1b2c3.svg', BASE)).toBe(
      'file:///android_asset/public/assets/dawn-field-a1b2c3.svg',
    );
  });

  it('leaves an absolute URL alone', () => {
    const remote = 'https://images.unsplash.com/photo-1541963463532?w=1920';
    expect(resolveArtworkUrl(remote, BASE)).toBe(remote);
  });

  it('round-trips a bundled asset', () => {
    const original = 'https://localhost/assets/still-water-77aa.svg';
    const portable = portableArtworkUrl(original, 'https://localhost');
    expect(resolveArtworkUrl(portable, BASE)).toBe(
      'file:///android_asset/public/assets/still-water-77aa.svg',
    );
  });

  it('returns null rather than throwing on an unusable base', () => {
    expect(resolveArtworkUrl('assets/x.svg', '')).toBeNull();
    expect(resolveArtworkUrl(null, BASE)).toBeNull();
  });
});

describe('LocalMediaLibrary', () => {
  it('keeps the current album when a folder with no images is picked', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    try {
      const library = new LocalMediaLibrary();
      const first = library.replace([new File([''], 'a.jpg', { type: 'image/jpeg' })]);
      expect(first).toHaveLength(1);

      // A folder of documents: nothing changes, nothing is revoked.
      expect(library.replace([new File([''], 'notes.txt', { type: 'text/plain' })])).toEqual([]);
      expect(revoked).toEqual([]);

      // A real replacement still revokes the old set.
      library.replace([new File([''], 'b.jpg', { type: 'image/jpeg' })]);
      expect(revoked).toEqual(['blob:test/0']);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

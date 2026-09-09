/**
 * Bold display fonts available for thumbnail text layers, loaded via a
 * <link> in src/app/layout.tsx. These are the literal font-family names the
 * Canvas 2D API (which Konva draws text through) needs - not next/font's
 * build-hashed names, which don't work as a canvas `font` value.
 */
export interface FontOption {
  id: string;
  label: string;
  family: string;
  /** Sample weight/style used when preloading via document.fonts.load(). */
  cssShorthand: string;
}

export const TEXT_FONTS: FontOption[] = [
  { id: 'system', label: 'System', family: 'ui-sans-serif, system-ui, sans-serif', cssShorthand: '700 48px system-ui' },
  { id: 'anton', label: 'Anton', family: 'Anton, sans-serif', cssShorthand: '400 48px Anton' },
  { id: 'bebas', label: 'Bebas Neue', family: '"Bebas Neue", sans-serif', cssShorthand: '400 48px "Bebas Neue"' },
  { id: 'oswald', label: 'Oswald', family: 'Oswald, sans-serif', cssShorthand: '700 48px Oswald' },
  { id: 'archivo', label: 'Archivo Black', family: '"Archivo Black", sans-serif', cssShorthand: '400 48px "Archivo Black"' },
  { id: 'bangers', label: 'Bangers', family: 'Bangers, cursive', cssShorthand: '400 48px Bangers' },
];

export const DEFAULT_FONT_ID = 'anton';

export function fontFamilyFor(id: string): string {
  return TEXT_FONTS.find((f) => f.id === id)?.family ?? TEXT_FONTS[0].family;
}

/** Preloads every custom font so Konva's first canvas draw doesn't silently fall back to a default. */
export function preloadStudioFonts(): Promise<FontFace[][]> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve([]);
  return Promise.all(TEXT_FONTS.filter((f) => f.id !== 'system').map((f) => document.fonts.load(f.cssShorthand)));
}

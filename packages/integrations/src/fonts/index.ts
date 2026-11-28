/**
 * Font picker catalog and the canvas font proxy (INTEGRATIONS: Google Fonts, P5-5).
 *
 * Generated sites self-host these families with `next/font/google` or Astro's Fonts API, which
 * refuse weights a family doesn't have, so the picker only offers the weights listed here. The
 * catalog is bundled; the daily sync from the Google Fonts Developer API needs an API key and
 * is not built yet. The editor canvas loads the same families through the app's proxy, so the
 * browser never calls Google.
 */

export type FontCategory = "sans-serif" | "serif" | "display" | "monospace";
export type CatalogFont = { family: string; category: FontCategory; weights: number[] };

const range = (from: number, to: number) =>
  Array.from({ length: (to - from) / 100 + 1 }, (_, i) => from + i * 100);

/** System families the compiler maps to local stacks (`SYSTEM_FONTS` in the compiler). */
export const SYSTEM_FONTS = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
] as const;

export const GOOGLE_FONTS: CatalogFont[] = [
  { family: "Archivo", category: "sans-serif", weights: range(100, 900) },
  { family: "Bebas Neue", category: "display", weights: [400] },
  { family: "DM Sans", category: "sans-serif", weights: [400, 500, 700] },
  { family: "DM Serif Display", category: "serif", weights: [400] },
  { family: "EB Garamond", category: "serif", weights: range(400, 800) },
  { family: "Fira Code", category: "monospace", weights: range(300, 700) },
  { family: "IBM Plex Mono", category: "monospace", weights: range(100, 700) },
  { family: "IBM Plex Sans", category: "sans-serif", weights: range(100, 700) },
  { family: "Inter", category: "sans-serif", weights: range(100, 900) },
  { family: "JetBrains Mono", category: "monospace", weights: range(100, 800) },
  { family: "Lato", category: "sans-serif", weights: [100, 300, 400, 700, 900] },
  { family: "Libre Baskerville", category: "serif", weights: [400, 700] },
  { family: "Lora", category: "serif", weights: range(400, 700) },
  { family: "Manrope", category: "sans-serif", weights: range(200, 800) },
  { family: "Merriweather", category: "serif", weights: [300, 400, 700, 900] },
  { family: "Montserrat", category: "sans-serif", weights: range(100, 900) },
  { family: "Noto Sans", category: "sans-serif", weights: range(100, 900) },
  { family: "Nunito", category: "sans-serif", weights: range(200, 900) },
  { family: "Open Sans", category: "sans-serif", weights: range(300, 800) },
  { family: "Oswald", category: "display", weights: range(200, 700) },
  { family: "Outfit", category: "sans-serif", weights: range(100, 900) },
  { family: "Playfair Display", category: "serif", weights: range(400, 900) },
  { family: "Plus Jakarta Sans", category: "sans-serif", weights: range(200, 800) },
  { family: "Poppins", category: "sans-serif", weights: range(100, 900) },
  { family: "Raleway", category: "sans-serif", weights: range(100, 900) },
  { family: "Roboto", category: "sans-serif", weights: [100, 300, 400, 500, 700, 900] },
  { family: "Rubik", category: "sans-serif", weights: range(300, 900) },
  { family: "Source Sans 3", category: "sans-serif", weights: range(200, 900) },
  { family: "Space Grotesk", category: "sans-serif", weights: range(300, 700) },
  { family: "Space Mono", category: "monospace", weights: [400, 700] },
  { family: "Work Sans", category: "sans-serif", weights: range(100, 900) },
];

const BY_FAMILY = new Map(GOOGLE_FONTS.map((f) => [f.family, f]));
export const catalogFont = (family: string) => BY_FAMILY.get(family);

/** Google's css2 URL for catalog families, every listed weight (unknown families dropped). */
export function googleCssUrl(families: string[]): string | null {
  const parts = [...new Set(families)].sort().flatMap((f) => {
    const font = BY_FAMILY.get(f);
    return font ? [`family=${f.replaceAll(" ", "+")}:wght@${font.weights.join(";")}`] : [];
  });
  return parts.length ? `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap` : null;
}

const GSTATIC = "https://fonts.gstatic.com/";
/** Font file paths the proxy forwards (`s/<family>/v<n>/<file>.woff2`). */
export const FONT_FILE_PATH = /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_-]+\.woff2$/;

export type FontProxy = {
  /** The @font-face CSS for catalog families, with file URLs under `filesBase`. */
  css: (families: string[], filesBase: string) => Promise<string>;
  /** A font file by its `FONT_FILE_PATH`, or null when it doesn't exist. */
  file: (path: string) => Promise<ArrayBuffer | null>;
};

/** Google Fonts (no key). A browser user agent makes Google serve woff2. */
export function googleFonts(fetcher: typeof fetch = fetch): FontProxy {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  };
  return {
    async css(families, filesBase) {
      const url = googleCssUrl(families);
      if (!url) return "";
      const r = await fetcher(url, { headers });
      if (!r.ok) throw new Error(`Google Fonts CSS failed (${r.status})`);
      return (await r.text()).replaceAll(GSTATIC, filesBase);
    },
    async file(path) {
      if (!FONT_FILE_PATH.test(path)) return null;
      const r = await fetcher(GSTATIC + path, { headers });
      return r.ok ? r.arrayBuffer() : null;
    },
  };
}

/** Local development and tests: no network; the canvas falls back to system fonts. */
export const localFonts: FontProxy = {
  async css(families) {
    return `/* Web fonts are off locally (TRUFRAME_INTEGRATIONS_MOCK): ${families.join(", ")} */\n`;
  },
  async file() {
    return null;
  },
};

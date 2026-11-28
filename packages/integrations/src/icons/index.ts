/**
 * Icon picker source (INTEGRATIONS: Iconify, P5-5). Icons are fetched through the app's Worker
 * proxy, never by the browser, and stored in the document as checked SVG data
 * (`iconSvgSchema`), so the generated site inlines them and needs no icon service.
 */
import { type IconSvg, iconSvgSchema, SVG_ATTRS, SVG_TAGS, type SvgElement } from "@truframe/model";

export type IconResult = { set: string; icon: string; svg: IconSvg };

export type IconSource = {
  /** Up to `limit` icons matching `query`, with their drawings. */
  search: (query: string, limit: number) => Promise<IconResult[]>;
};

/** Sets offered in the picker: permissive licenses (MIT, ISC, Apache-2.0) only. */
export const ICON_SETS = ["lucide", "tabler", "ph", "mdi", "heroicons"] as const;

const TAGS: ReadonlySet<string> = new Set(SVG_TAGS);
const ATTRS: ReadonlySet<string> = new Set(SVG_ATTRS);
const TOKEN = /\s*<(\/?)([a-z]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*(\/?)>\s*/y;
const ATTR = /([a-z-]+)="([^"]*)"/g;

/**
 * Parses an Iconify icon body (`<path d="…"/>`…) into SVG data. Anything outside the allowlist
 * (text, comments, `<defs>`, `<use>`, animation, unknown attributes) refuses the icon instead
 * of dropping parts of it.
 */
export function parseIconBody(body: string, width = 16, height = 16): IconSvg | null {
  const root: SvgElement[] = [];
  const stack: SvgElement[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < body.length) {
    const m = TOKEN.exec(body);
    if (!m) return null;
    const [, closing, tag = "", rawAttrs = "", selfClosing] = m;
    if (closing) {
      if (stack.pop()?.tag !== tag || rawAttrs) return null;
      continue;
    }
    if (!TAGS.has(tag)) return null;
    const attrs: Record<string, string> = {};
    for (const [, name = "", value = ""] of rawAttrs.matchAll(ATTR)) {
      if (!ATTRS.has(name)) return null;
      attrs[name] = value;
    }
    const el = { tag, attrs } as SvgElement;
    const parent = stack.at(-1);
    if (parent) parent.children = [...(parent.children ?? []), el];
    else root.push(el);
    if (!selfClosing) stack.push(el);
  }
  if (stack.length) return null;
  const parsed = iconSvgSchema.safeParse({ viewBox: `0 0 ${width} ${height}`, body: root });
  return parsed.success ? parsed.data : null;
}

type IconifyJson = {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
};

/** The public Iconify API (no key). `fetcher` is the Worker's `fetch`. */
export function iconifyApi(
  fetcher: typeof fetch = fetch,
  base = "https://api.iconify.design",
): IconSource {
  return {
    async search(query, limit) {
      const q = new URLSearchParams({
        query,
        limit: String(Math.max(32, limit)),
        prefixes: ICON_SETS.join(","),
      });
      const found = await fetcher(`${base}/search?${q}`);
      if (!found.ok) throw new Error(`Iconify search failed (${found.status})`);
      const names = ((await found.json()) as { icons?: string[] }).icons ?? [];
      const bySet = new Map<string, string[]>();
      for (const full of names.slice(0, limit)) {
        const [set, icon] = full.split(":");
        if (set && icon) bySet.set(set, [...(bySet.get(set) ?? []), icon]);
      }
      const out: IconResult[] = [];
      for (const [set, icons] of bySet) {
        // Sorted names give the same URL for the same icons (Iconify's caching advice).
        const r = await fetcher(`${base}/${set}.json?icons=${[...icons].sort().join(",")}`);
        if (!r.ok) continue;
        const data = (await r.json()) as IconifyJson;
        for (const icon of icons) {
          const d = data.icons[icon];
          const svg =
            d && parseIconBody(d.body, d.width ?? data.width ?? 16, d.height ?? data.height ?? 16);
          if (svg) out.push({ set, icon, svg });
        }
      }
      return out;
    },
  };
}

const stroke = (d: string): IconSvg => ({
  viewBox: "0 0 24 24",
  body: [
    {
      tag: "path",
      attrs: {
        d,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      },
    },
  ],
});

/** A few simple drawings for local development and tests (no network). */
export const LOCAL_ICONS: IconResult[] = [
  {
    set: "local",
    icon: "star",
    svg: stroke("M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"),
  },
  { set: "local", icon: "check", svg: stroke("M5 12l5 5L20 7") },
  { set: "local", icon: "plus", svg: stroke("M12 5v14M5 12h14") },
  { set: "local", icon: "close", svg: stroke("M6 6l12 12M18 6L6 18") },
  { set: "local", icon: "arrow-right", svg: stroke("M5 12h14m-6-6l6 6-6 6") },
  { set: "local", icon: "menu", svg: stroke("M4 6h16M4 12h16M4 18h16") },
  {
    set: "local",
    icon: "heart",
    svg: stroke("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"),
  },
  { set: "local", icon: "mail", svg: stroke("M3 6h18v12H3zM3 7l9 6 9-6") },
];

export const localIcons: IconSource = {
  async search(query, limit) {
    const q = query.trim().toLowerCase();
    return LOCAL_ICONS.filter((i) => i.icon.includes(q)).slice(0, limit);
  },
};

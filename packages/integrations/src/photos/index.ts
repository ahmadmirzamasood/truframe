/**
 * Stock photos for the Assets panel (INTEGRATIONS: Unsplash, P5-5). The API key stays in the
 * Worker; the browser only sees results and hotlinked thumbnails. Inserting a photo triggers
 * Unsplash's download endpoint and copies the file into the project's assets with its credit.
 * Without `UNSPLASH_ACCESS_KEY` the app uses `samplePhotos` (generated, no network).
 */

export type Photo = {
  id: string;
  description: string;
  width: number;
  height: number;
  /** Small preview for the picker (hotlinked, as Unsplash requires). */
  thumbUrl: string;
  author: string;
  /** The photographer's Unsplash profile, with the referral parameters. */
  authorUrl: string;
  sourceUrl: string;
};

export type PhotoFile = { bytes: Uint8Array; photo: Photo };

export type PhotoSource = {
  /** True for the sample source, so the picker can say Unsplash isn't connected. */
  sample: boolean;
  search: (query: string, page: number) => Promise<Photo[]>;
  /** Records the download with the provider and returns the file to store. */
  download: (id: string) => Promise<PhotoFile | null>;
};

/** Unsplash's `utm_source` (API guidelines: links back to Unsplash carry referral params). */
export const UNSPLASH_APP = "truframe";
const referral = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}utm_source=${UNSPLASH_APP}&utm_medium=referral`;
export const UNSPLASH_HOME = referral("https://unsplash.com/");

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  alt_description?: string | null;
  description?: string | null;
  urls: { raw: string; regular: string; small: string; thumb: string };
  user: { name: string; links: { html: string } };
  links: { download_location: string };
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function toPhoto(p: UnsplashPhoto): Photo {
  return {
    id: p.id,
    description: (p.alt_description ?? p.description ?? "").slice(0, 1000),
    width: p.width,
    height: p.height,
    thumbUrl: p.urls.small,
    author: p.user.name.slice(0, 200),
    authorUrl: referral(p.user.links.html),
    sourceUrl: UNSPLASH_HOME,
  };
}

/** The Unsplash API with a server-side Access Key (`Authorization: Client-ID`). */
export function unsplash(accessKey: string, fetcher: typeof fetch = fetch): PhotoSource {
  const api = (path: string) =>
    fetcher(`https://api.unsplash.com${path}`, {
      headers: { authorization: `Client-ID ${accessKey}`, "accept-version": "v1" },
    });
  return {
    sample: false,
    async search(query, page) {
      const q = new URLSearchParams({ query, page: String(page), per_page: "24" });
      const r = await api(`/search/photos?${q}`);
      if (!r.ok) throw new Error(`Unsplash search failed (${r.status})`);
      const body = (await r.json()) as { results: UnsplashPhoto[] };
      return body.results.map(toPhoto);
    },
    async download(id) {
      if (!ID.test(id)) return null;
      const r = await api(`/photos/${id}`);
      if (!r.ok) return null;
      const p = (await r.json()) as UnsplashPhoto;
      // Required by the API guidelines whenever a photo is used like a download.
      const track = new URL(p.links.download_location);
      if (track.origin === "https://api.unsplash.com") await api(track.pathname + track.search);
      // A 2400px JPEG is plenty for a website and keeps uploads within plan file limits.
      const file = await fetcher(`${p.urls.raw}&w=2400&fm=jpg&q=80`);
      if (!file.ok) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), photo: toPhoto(p) };
    },
  };
}

const SAMPLES = [
  ["mountain", "Sample Mountains", "#2f4858", "#86bbd8"],
  ["ocean", "Sample Ocean", "#0b3954", "#bfd7ea"],
  ["forest", "Sample Forest", "#1b4332", "#95d5b2"],
  ["desert", "Sample Desert", "#7f4f24", "#f4d58d"],
  ["city", "Sample City", "#22223b", "#c9ada7"],
  ["flowers", "Sample Flowers", "#6d597a", "#ffb4a2"],
] as const;

function sampleSvg(from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/></svg>`;
}

/** Generated gradients standing in for Unsplash when no key is configured. */
export const samplePhotos: PhotoSource = {
  sample: true,
  async search(query) {
    const q = query.trim().toLowerCase();
    const hits = SAMPLES.filter(([id]) => id.includes(q));
    return (hits.length ? hits : SAMPLES).map(([id, description, from, to]) => ({
      id,
      description,
      width: 1200,
      height: 800,
      thumbUrl: `data:image/svg+xml,${encodeURIComponent(sampleSvg(from, to))}`,
      author: "Truframe samples",
      authorUrl: referral("https://unsplash.com/"),
      sourceUrl: UNSPLASH_HOME,
    }));
  },
  async download(id) {
    const s = SAMPLES.find(([sid]) => sid === id);
    if (!s) return null;
    const [, description, from, to] = s;
    const photo = (await samplePhotos.search(id, 1))[0];
    if (!photo) return null;
    return {
      bytes: new TextEncoder().encode(sampleSvg(from, to)),
      photo: { ...photo, description },
    };
  },
};

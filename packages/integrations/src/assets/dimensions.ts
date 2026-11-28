/**
 * Intrinsic size of an uploaded image from its header bytes (no decoding), so the compiler can
 * give `next/image` its width and height. SVGs use width/height, else the viewBox, else the
 * browser default 300×150.
 */
import type { UploadMime } from "./sniff.ts";

export type Size = { width: number; height: number };

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => (u16be(b, i) << 16) + u16be(b, i + 2);

function png(b: Uint8Array): Size | null {
  return b.length >= 24 ? { width: u32be(b, 16), height: u32be(b, 20) } : null;
}

function gif(b: Uint8Array): Size | null {
  return b.length >= 10 ? { width: u16le(b, 6), height: u16le(b, 8) } : null;
}

function jpeg(b: Uint8Array): Size | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1] as number;
    // Start of frame markers (not DHT C4, JPG C8, DAC CC) hold the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): Size | null {
  const chunk = String.fromCharCode(...b.subarray(12, 16));
  if (chunk === "VP8 " && b.length >= 30)
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && b.length >= 30)
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

function svg(text: string): Size {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  const px = (v: string | undefined) => {
    const m = v && /^\s*([0-9.]+)\s*(px)?\s*$/.exec(v);
    return m ? Number(m[1]) : undefined;
  };
  let w = px(attr("width"));
  let h = px(attr("height"));
  const vb = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) {
    const [, , vw, vh] = vb as [number, number, number, number];
    if (w === undefined && h === undefined) [w, h] = [vw, vh];
    else if (w === undefined && h !== undefined && vh) w = (h * vw) / vh;
    else if (h === undefined && w !== undefined && vw) h = (w * vh) / vw;
  }
  return { width: Math.round(w ?? 300), height: Math.round(h ?? 150) };
}

/** The image's size; null when a raster header is truncated or malformed. */
export function imageSize(mime: UploadMime, bytes: Uint8Array): Size | null {
  const size =
    mime === "image/png"
      ? png(bytes)
      : mime === "image/gif"
        ? gif(bytes)
        : mime === "image/jpeg"
          ? jpeg(bytes)
          : mime === "image/webp"
            ? webp(bytes)
            : svg(new TextDecoder().decode(bytes));
  if (!size) return null;
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100_000;
  return ok(size.width) && ok(size.height) ? size : null;
}

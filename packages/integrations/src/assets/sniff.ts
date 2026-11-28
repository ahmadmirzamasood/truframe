/**
 * Upload checks (SECURITY "Uploads"): the file's bytes decide its type (magic bytes), the type
 * must be one we accept and agree with the file name, and raster files that also parse as
 * markup (polyglots, e.g. a PNG that a browser could sniff as HTML) are refused. Pure and
 * synchronous so Workers, Node and tests run the same code.
 */

export const UPLOAD_TYPES = {
  "image/png": { ext: "png", names: ["png"] },
  "image/jpeg": { ext: "jpg", names: ["jpg", "jpeg"] },
  "image/webp": { ext: "webp", names: ["webp"] },
  "image/gif": { ext: "gif", names: ["gif"] },
  "image/svg+xml": { ext: "svg", names: ["svg"] },
} as const;
export type UploadMime = keyof typeof UPLOAD_TYPES;

export type SniffResult =
  | { ok: true; mime: UploadMime; ext: string }
  | {
      ok: false;
      code: "UNSUPPORTED_TYPE" | "TYPE_MISMATCH" | "POLYGLOT" | "EMPTY";
      message: string;
    };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

/** The image type the bytes are, or null. */
export function detectMime(b: Uint8Array): UploadMime | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61)
    return "image/gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  if (looksLikeSvg(b)) return "image/svg+xml";
  return null;
}

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Text that starts (after a BOM, whitespace, an XML declaration and comments) with `<svg`. */
function looksLikeSvg(b: Uint8Array): boolean {
  let s = decoder.decode(b.subarray(0, 4096)).replace(/^﻿/, "");
  for (;;) {
    s = s.trimStart();
    if (s.startsWith("<?xml")) s = s.slice(Math.max(s.indexOf("?>") + 2, 2));
    else if (s.startsWith("<!--")) s = s.slice(Math.max(s.indexOf("-->") + 3, 3));
    else break;
  }
  return /^<svg[\s/>]/i.test(s);
}

/**
 * Markup a browser could act on if it ever sniffed the file as HTML (or that marks a
 * deliberately crafted polyglot). Raster images have no reason to contain these.
 */
const MARKUP = /<\s*(?:script|html|body|iframe|object|embed|svg|\?php)\b|javascript:/i;

export function sniffUpload(bytes: Uint8Array, fileName: string): SniffResult {
  if (bytes.length === 0) return { ok: false, code: "EMPTY", message: "The file is empty." };
  const mime = detectMime(bytes);
  if (!mime)
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "Upload a PNG, JPEG, WebP, GIF or SVG image.",
    };
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext || !(UPLOAD_TYPES[mime].names as readonly string[]).includes(ext))
    return {
      ok: false,
      code: "TYPE_MISMATCH",
      message: `This file is a ${UPLOAD_TYPES[mime].ext.toUpperCase()} image but its name ends in ${ext ? `.${ext}` : "no extension"}. Rename it and try again.`,
    };
  if (mime !== "image/svg+xml" && MARKUP.test(latin1(bytes)))
    return {
      ok: false,
      code: "POLYGLOT",
      message: "This image also contains web page code, so it can't be uploaded.",
    };
  return { ok: true, mime, ext: UPLOAD_TYPES[mime].ext };
}

/** Bytes as Latin-1 text: every byte maps to one character, so markup can't hide in UTF-8. */
function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, Math.min(i + 8192, b.length)));
  return s;
}

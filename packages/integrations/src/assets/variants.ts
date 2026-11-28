/**
 * Responsive image variants (ARCHITECTURE §2: Cloudflare Images binding). Behind a small
 * interface so local development (no Images binding) serves the original file, and the real
 * transform needs only the binding configured on the deployed worker.
 */

/** The subset of the Workers Images binding this adapter calls. */
export type ImagesBinding = {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width?: number }): {
      output(options: { format: string }): Promise<{ response(): Response }>;
    };
  };
};

export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;

/** The smallest standard width at least as wide as asked (bounded set, so caches stay small). */
export function variantWidth(requested: number | null): number | null {
  if (requested === null || !Number.isFinite(requested) || requested <= 0) return null;
  return VARIANT_WIDTHS.find((w) => w >= requested) ?? null;
}

export type ImageVariants = {
  /** Whether resized variants are actually produced (false: originals are served). */
  readonly resizes: boolean;
  variant(
    original: ReadableStream<Uint8Array>,
    mime: string,
    width: number,
  ): Promise<{ body: ReadableStream<Uint8Array> | null; contentType: string }>;
};

/** Local and fallback: the original bytes. */
export const originalImages: ImageVariants = {
  resizes: false,
  async variant(original, mime) {
    return { body: original, contentType: mime };
  },
};

/** Cloudflare Images: rasters resized to `width` and re-encoded as WebP; SVGs untouched. */
export function cloudflareImages(binding: ImagesBinding): ImageVariants {
  return {
    resizes: true,
    async variant(original, mime, width) {
      if (mime === "image/svg+xml" || mime === "image/gif")
        return { body: original, contentType: mime };
      const out = await binding
        .input(original)
        .transform({ width })
        .output({ format: "image/webp" });
      const res = out.response();
      return { body: res.body, contentType: res.headers.get("content-type") ?? "image/webp" };
    },
  };
}

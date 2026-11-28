import "server-only";
/**
 * Picker proxies (P5-5, INTEGRATIONS): Google Fonts for the canvas, Iconify icons and Unsplash
 * photos. Keys stay here; the browser sees only results. Locally,
 * `TRUFRAME_INTEGRATIONS_MOCK=1` swaps fonts and icons for offline versions, and photos use
 * the samples whenever `UNSPLASH_ACCESS_KEY` is empty.
 */
import type { WorkspaceContext } from "@truframe/auth";
import { limitFor, planForWorkspace } from "@truframe/billing";
import {
  type FontProxy,
  googleFonts,
  type IconSource,
  iconifyApi,
  localFonts,
  localIcons,
  type PhotoSource,
  samplePhotos,
  unsplash,
} from "@truframe/integrations";
import type { Asset } from "@truframe/model";
import { ApiFailure, notFound } from "./api";
import { storeFile } from "./assets";
import type { ServerContext } from "./context";
import { parseProjectId } from "./projects";

function vars(server: ServerContext) {
  const env = server.env as unknown as Record<string, string | undefined>;
  return {
    mock: server.authEnv.TRUFRAME_ENV === "local" && env.TRUFRAME_INTEGRATIONS_MOCK === "1",
    unsplashKey: env.UNSPLASH_ACCESS_KEY?.trim() || null,
  };
}

export const fontProxy = (server: ServerContext): FontProxy =>
  vars(server).mock ? localFonts : googleFonts();

export const iconSource = (server: ServerContext): IconSource =>
  vars(server).mock ? localIcons : iconifyApi();

export function photoSource(server: ServerContext): PhotoSource {
  const key = vars(server).unsplashKey;
  return key ? unsplash(key) : samplePhotos;
}

const unavailable = (what: string) =>
  new ApiFailure(
    "INTEGRATION_UNAVAILABLE",
    `${what} couldn't be reached. Try again in a minute.`,
    502,
  );

export async function searchIcons(server: ServerContext, query: string) {
  try {
    return { icons: await iconSource(server).search(query, 48) };
  } catch {
    throw unavailable("The icon library");
  }
}

export async function searchPhotos(server: ServerContext, query: string, page: number) {
  const source = photoSource(server);
  try {
    return { sample: source.sample, photos: await source.search(query, page) };
  } catch {
    throw unavailable("Unsplash");
  }
}

/** Copies a photo into the project's assets, with its credit, within the plan's storage. */
export async function importPhoto(
  server: ServerContext,
  ctx: WorkspaceContext,
  projectId: string,
  photoId: string,
  newId: () => string,
): Promise<Asset> {
  const project = await ctx.repos.projects.get(parseProjectId(projectId));
  if (!project) throw notFound();
  const source = photoSource(server);
  let file: Awaited<ReturnType<PhotoSource["download"]>>;
  try {
    file = await source.download(photoId);
  } catch {
    throw unavailable("Unsplash");
  }
  if (!file) throw notFound();
  const max = limitFor(planForWorkspace(ctx.workspace), "assetFileBytes");
  if (file.bytes.byteLength > max)
    throw new ApiFailure("LIMIT_REACHED", "This photo is larger than your plan's file limit.", 403);
  const ext = source.sample ? "svg" : "jpg";
  const slug = file.photo.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);
  const asset = await storeFile(
    server,
    ctx.repos,
    project.id,
    { ws: ctx.workspace.id, sub: ctx.user.id },
    `${slug.replace(/^-|-$/g, "") || "photo"}.${ext}`,
    file.bytes,
    newId,
  );
  const { photo } = file;
  return {
    ...asset,
    ...(photo.description ? { alt: photo.description } : {}),
    // Sample photos aren't from Unsplash, so they carry no credit.
    ...(source.sample
      ? {}
      : {
          credit: {
            source: "unsplash" as const,
            author: photo.author,
            authorUrl: photo.authorUrl,
            sourceUrl: photo.sourceUrl,
          },
        }),
  };
}

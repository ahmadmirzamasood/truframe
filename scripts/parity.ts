// Screenshot parity between the canvas renderer and the built site (P4-3, PLAN P4 exit).
//
//   node scripts/parity.ts [--only a,b] [--dir <work dir>] [--sites <dir>] [--skip-build]
//                          [--report <dir>] [--max-diff 0.01]
//
// For each fixture it builds the golden Next.js project (scripts/build-fixtures.ts, kept in
// `--sites`), then for every page and breakpoint takes two full-height screenshots at the
// breakpoint width: the built site, and `@truframe/renderer`'s frame for the same document
// and compiler CSS (the canvas without the camera). Both come from one local static server, so
// assets resolve the same way. A pair fails when more than `--max-diff` of its pixels differ
// (pixelmatch, anti-aliasing tolerant). Diff images go to `--report`.
//
// Also usable for any document: `--doc <doc.json> [--canvas <dir of editor screenshots>]`
// compiles and builds it, then compares (the P4 exit e2e uses this; see documentCase).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  activeBreakpoints,
  type ProjectDocument,
  parseDocument,
} from "../packages/model/src/index.ts";
import { renderFrame } from "../packages/renderer/src/react.ts";

/**
 * Fixtures compared in CI. Left out, with the reason: web fonts (the canvas loads them from
 * Google Fonts, the site self-hosts them: fonts, typography, variables, model-*), components
 * (instance layer CSS isn't per instance yet, P5: component-*), and remote content that
 * renders differently between two loads (embed-and-icons).
 */
export const PARITY_FIXTURES = [
  "absolute-position",
  "backgrounds",
  "borders-and-effects",
  "code-class-collisions",
  "desktop-only-wide",
  "grid-gallery",
  "hero-responsive",
  "hidden-per-breakpoint",
  "images",
  "links",
  "nested-routes",
  "no-tablet",
  "seo",
  "sizing-in-stacks",
  "special-characters",
  "template-blank",
  "template-landing",
  "template-portfolio",
  "template-saas",
];

const repo = join(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    only: { type: "string" },
    dir: { type: "string" },
    sites: { type: "string" },
    "skip-build": { type: "boolean" },
    report: { type: "string" },
    "max-diff": { type: "string" },
    doc: { type: "string" },
    canvas: { type: "string" },
  },
});
const maxDiff = Number(values["max-diff"] ?? "0.01");
const report = values.report ?? join(tmpdir(), "truframe-parity-report");
mkdirSync(report, { recursive: true });

type Output = {
  css: Record<string, { desktop: string; tablet?: string; mobile?: string }>;
  assets: { assetId: string; path: string }[];
};
type Case = {
  name: string;
  doc: ProjectDocument;
  output: Output;
  tokens?: string;
  site: string;
  /** Screenshots of the editor's canvas frames, instead of rendering the markup here. */
  canvas?: string;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

/** Serves `root` like a static host: `/a` → `a.html` or `a/index.html`. */
function serve(root: string): Promise<Server> {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const base = normalize(join(root, url));
    if (!base.startsWith(normalize(root))) {
      res.writeHead(403).end();
      return;
    }
    const candidates = [base, `${base}.html`, join(base, "index.html")];
    const file = candidates.find((f) => existsSync(f) && statSync(f).isFile());
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (img) =>
        img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })),
      ),
    );
  });
}

/** Pads both images to the same size with white, then counts differing pixels. */
function compare(a: PNG, b: PNG, diffPath: string) {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pad = (img: PNG) => {
    if (img.width === width && img.height === height) return img;
    const out = new PNG({ width, height });
    out.data.fill(255);
    PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
    return out;
  };
  const pa = pad(a);
  const pb = pad(b);
  const diff = new PNG({ width, height });
  const count = pixelmatch(pa.data, pb.data, diff.data, width, height, { threshold: 0.1 });
  const ratio = count / (width * height);
  if (ratio > 0) writeFileSync(diffPath, PNG.sync.write(diff));
  return { ratio, size: `${a.width}×${a.height} vs ${b.width}×${b.height}` };
}

function canvasHtml(c: Case, pageId: string, breakpoint: string) {
  const markup = renderToStaticMarkup(
    renderFrame({
      doc: c.doc,
      output: { css: c.output.css, tokens: c.tokens },
      pageId,
      breakpoint: breakpoint as "desktop",
      options: {
        assetUrl: (id) =>
          c.output.assets.find((a) => a.assetId === id)?.path.replace(/^public/, "") ?? null,
      },
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
  return `<!doctype html><html lang="${c.doc.settings.lang}"><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${markup}</body></html>`;
}

async function run(cases: Case[]) {
  const browser = await chromium.launch();
  const failures: string[] = [];
  let worst = 0;
  for (const c of cases) {
    mkdirSync(join(c.site, "__canvas"), { recursive: true });
    const server = await serve(c.site);
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const page of c.doc.pages) {
      for (const bp of activeBreakpoints(c.doc.breakpoints)) {
        const width = c.doc.breakpoints[bp]?.width ?? 0;
        const label = `${c.name} ${page.path} ${bp}`;
        if (!c.canvas)
          writeFileSync(
            join(c.site, "__canvas", `${page.id}-${bp}.html`),
            canvasHtml(c, page.id, bp),
          );
        const ctx = await browser.newContext({ viewport: { width, height: 200 } });
        const tab = await ctx.newPage();
        await tab.goto(origin + page.path, { waitUntil: "load" });
        await settle(tab);
        const site = PNG.sync.read(
          await tab.screenshot({ fullPage: true, animations: "disabled" }),
        );
        let frame: PNG;
        if (c.canvas) {
          frame = PNG.sync.read(readFileSync(join(c.canvas, `${page.id}-${bp}.png`)));
        } else {
          await tab.goto(`${origin}/__canvas/${page.id}-${bp}`, { waitUntil: "load" });
          await settle(tab);
          // Same viewport and method as the site: the frame sits at the page's top left.
          frame = PNG.sync.read(await tab.screenshot({ fullPage: true, animations: "disabled" }));
        }
        await ctx.close();
        const safe = label.replace(/[^a-z0-9]+/gi, "_");
        const { ratio, size } = compare(site, frame, join(report, `${safe}.diff.png`));
        worst = Math.max(worst, ratio);
        const pct = (ratio * 100).toFixed(3);
        if (ratio > maxDiff) {
          writeFileSync(join(report, `${safe}.site.png`), PNG.sync.write(site));
          writeFileSync(join(report, `${safe}.canvas.png`), PNG.sync.write(frame));
          failures.push(`${label}: ${pct}% (${size})`);
          console.log(`✗ ${label}: ${pct}% differ (${size})`);
        } else console.log(`✓ ${label}: ${pct}% differ (${size})`);
      }
    }
    server.close();
  }
  await browser.close();
  console.log(`\nworst pair: ${(worst * 100).toFixed(3)}% (limit ${(maxDiff * 100).toFixed(1)}%)`);
  if (failures.length) {
    console.error(`${failures.length} pair(s) over the limit:\n  ${failures.join("\n  ")}`);
    console.error(`site, canvas and diff images: ${report}`);
    process.exit(1);
  }
}

function fixtureCases(): Case[] {
  const names = values.only?.split(",").filter(Boolean) ?? PARITY_FIXTURES;
  const sites = values.sites ?? join(tmpdir(), "truframe-parity-sites");
  if (!values["skip-build"]) {
    const args = [
      "scripts/build-fixtures.ts",
      "nextjs",
      "--only",
      names.join(","),
      "--keep-out",
      sites,
      "--no-typecheck",
    ];
    if (values.dir) args.push("--dir", values.dir);
    execFileSync(process.execPath, args, { cwd: repo, stdio: "inherit" });
  }
  return names.map((name) => {
    const dir = join(repo, "fixtures", "compiler", name);
    const exp = join(dir, "expected", "nextjs");
    return {
      name,
      doc: parseDocument(JSON.parse(readFileSync(join(dir, "input.json"), "utf8"))),
      output: JSON.parse(readFileSync(join(exp, "output.json"), "utf8")) as Output,
      tokens: readFileSync(join(exp, "files", "app", "tokens.css"), "utf8"),
      site: join(sites, name),
    };
  });
}

/**
 * Any document (the P4 exit e2e saves one): compile it with the WASM compiler, build the Next.js
 * project, and compare against canvas screenshots from the editor when `--canvas` is given
 * (`<pageId>-<breakpoint>.png`), else against the renderer's markup.
 */
async function documentCase(): Promise<Case> {
  const docPath = values.doc as string;
  const doc = parseDocument(JSON.parse(readFileSync(docPath, "utf8")));
  // Loaded here, not at the top: the fixture mode runs where the WASM isn't built.
  const { compile, initCompilerFromDisk } = await import("../packages/compiler-wasm/src/node.ts");
  initCompilerFromDisk();
  const out = compile(doc, "nextjs");
  const work = values.dir ?? join(tmpdir(), "truframe-parity-document");
  mkdirSync(work, { recursive: true });
  for (const entry of readdirSync(work))
    if (entry !== "node_modules") rmSync(join(work, entry), { recursive: true, force: true });
  for (const [path, text] of Object.entries(out.files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
  }
  const shell = process.platform === "win32";
  if (!existsSync(join(work, "node_modules")))
    execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: work, stdio: "inherit", shell });
  execFileSync("npm", ["run", "build"], { cwd: work, stdio: "inherit", shell });
  return {
    name: "document",
    doc,
    output: out,
    tokens: out.files["app/tokens.css"],
    site: join(work, "out"),
    canvas: values.canvas,
  };
}

await run(values.doc ? [await documentCase()] : fixtureCases());

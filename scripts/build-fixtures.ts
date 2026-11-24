// Builds and type-checks the generated golden projects (fixtures/compiler/*/expected/<fw>).
//
//   node scripts/build-fixtures.ts nextjs|astro [--only a,b] [--dir <work dir>]
//     [--keep-out <dir>] [--no-typecheck]
//
// `--keep-out` copies each built site (Next.js `out/`, Astro `dist/`) to `<dir>/<fixture>`
// with its placeholder assets, for the canvas parity test (scripts/parity.ts).
// Dependencies are the same for every project of a framework (one lockfile, embedded in the
// compiler), so they are installed once with `npm ci` into a work directory; each fixture's
// files are then swapped in and built with `npm run build` and `npm run typecheck`. Uploaded
// assets are replaced by tiny valid placeholder images.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const repo = join(import.meta.dirname, "..");
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: "string" },
    dir: { type: "string" },
    "keep-out": { type: "string" },
    "no-typecheck": { type: "boolean" },
  },
});
const framework = positionals[0];
if (framework !== "nextjs" && framework !== "astro") {
  console.error("usage: node scripts/build-fixtures.ts nextjs|astro [--only a,b] [--dir path]");
  process.exit(2);
}
const template = join(
  repo,
  "crates",
  "compiler",
  "templates",
  framework === "nextjs" ? "next" : "astro",
);
const work = values.dir ?? join(tmpdir(), `truframe-fixtures-${framework}`);
const only = values.only?.split(",").filter(Boolean);

// 1×1 images, valid enough for image tooling to read dimensions.
const PLACEHOLDERS: Record<string, Buffer> = {
  png: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
  gif: Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"),
  jpg: Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  ),
  webp: Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64"),
  avif: Buffer.from(
    "AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAPBtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAARQAAAAVAAAAKGlpbmYAAAAAAAEAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAAGppcHJwAAAAS2lwY28AAAAUaXNwZQAAAAAAAAABAAAAAQAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EgAgAAAAATY29scm5jbHgAAQANAAaAAAAAF2lwbWEAAAAAAAAAAQABBAECgwQAAAAdbWRhdBIACgUYDWL+EDIIAkaAAYCAAQAAAA==",
    "base64",
  ),
  svg: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
  ),
};

function run(cmd: string, args: string[], cwd: string) {
  const started = Date.now();
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return Date.now() - started;
}

/** Everything except node_modules and the lockfile/package.json we installed from. */
function clean(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "package.json" || entry === "package-lock.json")
      continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

mkdirSync(work, { recursive: true });
cpSync(join(template, "package.json"), join(work, "package.json"));
cpSync(join(template, "package-lock.json"), join(work, "package-lock.json"));
if (!existsSync(join(work, "node_modules"))) {
  console.log(`npm ci in ${work}`);
  run("npm", ["ci", "--no-audit", "--no-fund"], work);
}

const fixturesDir = join(repo, "fixtures", "compiler");
const names = readdirSync(fixturesDir)
  .filter((n) => existsSync(join(fixturesDir, n, "expected", framework, "files")))
  .filter((n) => !only || only.includes(n))
  .sort();
const results: Array<{ name: string; build: number; typecheck: number }> = [];
const failures: string[] = [];
for (const name of names) {
  const expected = join(fixturesDir, name, "expected", framework);
  console.log(`\n=== ${framework}/${name}`);
  clean(work);
  cpSync(join(expected, "files"), work, { recursive: true });
  // The fixture's package.json must be the one installed from.
  const pkg = readFileSync(join(expected, "files", "package.json"), "utf8");
  if (pkg !== readFileSync(join(template, "package.json"), "utf8")) {
    failures.push(`${name}: package.json differs from the template`);
    continue;
  }
  const output = JSON.parse(readFileSync(join(expected, "output.json"), "utf8")) as {
    assets: Array<{ path: string }>;
  };
  for (const asset of output.assets) {
    const ext = asset.path.split(".").pop() ?? "png";
    const file = join(work, asset.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, PLACEHOLDERS[ext] ?? PLACEHOLDERS.png ?? "");
  }
  try {
    const build = run("npm", ["run", "build"], work);
    const typecheck = values["no-typecheck"] ? 0 : run("npm", ["run", "typecheck"], work);
    results.push({ name, build, typecheck });
    if (values["keep-out"]) {
      const dest = join(values["keep-out"], name);
      rmSync(dest, { recursive: true, force: true });
      cpSync(join(work, framework === "nextjs" ? "out" : "dist"), dest, { recursive: true });
    }
  } catch {
    failures.push(name);
  }
}

console.log(`\n${framework}: ${results.length} built and type-checked, ${failures.length} failed`);
for (const r of results)
  console.log(`  ${r.name}: build ${r.build} ms, typecheck ${r.typecheck} ms`);
if (failures.length) {
  console.error(`failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

// Builds crates/compiler for WASM and generates the JS glue into packages/compiler-wasm/pkg.
// Needs the wasm32-unknown-unknown target (rust-toolchain.toml) and wasm-bindgen-cli at the
// exact version of the `wasm-bindgen` crate:
//   cargo install wasm-bindgen-cli --version 0.2.130 --locked
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

const lock = readFileSync(join(root, "Cargo.lock"), "utf8");
const wanted = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];
let installed = "";
try {
  installed = execFileSync("wasm-bindgen", ["--version"], { encoding: "utf8" }).trim();
} catch {
  // reported below
}
if (!wanted || !installed.endsWith(wanted)) {
  console.error(
    `wasm-bindgen CLI ${wanted ?? "?"} is required (found: ${installed || "none"}).\n` +
      `Install it with: cargo install wasm-bindgen-cli --version ${wanted} --locked`,
  );
  process.exit(1);
}

run("cargo", [
  "build",
  "--release",
  "--locked",
  "--target",
  "wasm32-unknown-unknown",
  "-p",
  "truframe-compiler",
]);
const wasm = join(root, "target", "wasm32-unknown-unknown", "release", "truframe_compiler.wasm");
const outDir = join(root, "packages", "compiler-wasm", "pkg");
run("wasm-bindgen", ["--target", "web", "--out-dir", outDir, "--out-name", "compiler", wasm]);
const size = statSync(join(outDir, "compiler_bg.wasm")).size;
console.log(`compiler_bg.wasm: ${(size / 1024).toFixed(0)} KiB`);

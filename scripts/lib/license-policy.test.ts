import { describe, expect, it } from "vitest";
import { findLicenseViolations, isAllowed } from "./license-policy.ts";

describe("isAllowed", () => {
  it.each([
    "MIT",
    "ISC",
    "Apache-2.0",
    "BSD-3-Clause",
    "0BSD",
    "MIT OR Apache-2.0",
    "(MIT OR GPL-3.0)",
    "MIT AND Zlib",
    "Apache 2.0",
  ])("allows %s", (license) => {
    expect(isAllowed(license)).toBe(true);
  });

  it.each([
    "GPL-3.0",
    "AGPL-3.0-only",
    "SSPL-1.0",
    "BUSL-1.1",
    "LGPL-3.0-or-later",
    "MIT AND GPL-2.0",
    "UNKNOWN",
    "",
  ])("rejects %s", (license) => {
    expect(isAllowed(license)).toBe(false);
  });
});

describe("findLicenseViolations", () => {
  it("honors recorded exceptions, including prefix patterns", () => {
    const v = findLicenseViolations(
      [
        { name: "ok", version: "1.0.0", license: "MIT" },
        { name: "@img/sharp-libvips-linux-x64", version: "1.0.0", license: "LGPL-3.0-or-later" },
        { name: "bad", version: "1.0.0", license: "AGPL-3.0" },
      ],
      [{ name: "@img/sharp-libvips-*", license: "LGPL-3.0-or-later", reason: "test" }],
    );
    expect(v.map((p) => p.name)).toEqual(["bad"]);
  });

  it("does not let an exception for one license cover another", () => {
    const v = findLicenseViolations(
      [{ name: "x", version: "1.0.0", license: "GPL-3.0" }],
      [{ name: "x", license: "LGPL-3.0-or-later", reason: "test" }],
    );
    expect(v).toHaveLength(1);
  });
});

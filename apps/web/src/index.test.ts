import { expect, it } from "vitest";
import { appName } from "./index.ts";

it("names the app", () => {
  expect(appName).toBe("truframe");
});

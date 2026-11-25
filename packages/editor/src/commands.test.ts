import { describe, expect, it } from "vitest";
import { type Command, findCommand, formatShortcut, matches, searchCommands } from "./commands.ts";

const key = (k: Partial<Parameters<typeof matches>[0]> & { key: string; code?: string }) => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  code: k.code ?? "",
  ...k,
});

describe("shortcuts", () => {
  it("matches modifiers exactly, Mod as Ctrl or Cmd", () => {
    expect(matches(key({ key: "z", code: "KeyZ", ctrlKey: true }), "Mod+Z")).toBe(true);
    expect(matches(key({ key: "z", code: "KeyZ", metaKey: true }), "Mod+Z")).toBe(true);
    expect(matches(key({ key: "Z", code: "KeyZ", metaKey: true, shiftKey: true }), "Mod+Z")).toBe(
      false,
    );
    expect(
      matches(key({ key: "Z", code: "KeyZ", metaKey: true, shiftKey: true }), "Mod+Shift+Z"),
    ).toBe(true);
    expect(matches(key({ key: "f", code: "KeyF" }), "F")).toBe(true);
    expect(matches(key({ key: "f", code: "KeyF", ctrlKey: true }), "F")).toBe(false);
  });

  it("uses physical keys for digits and letters, characters for symbols", () => {
    expect(matches(key({ key: "!", code: "Digit1", shiftKey: true }), "Shift+1")).toBe(true);
    expect(matches(key({ key: "?", code: "Slash", shiftKey: true }), "?")).toBe(true);
    expect(matches(key({ key: "=", code: "Equal", ctrlKey: true }), "Mod+Plus")).toBe(true);
    expect(matches(key({ key: "ArrowUp", code: "ArrowUp", altKey: true }), "Alt+ArrowUp")).toBe(
      true,
    );
  });

  it("formats for macOS and other systems", () => {
    expect(formatShortcut("Mod+Shift+Z", true)).toBe("⌘⇧Z");
    expect(formatShortcut("Mod+Shift+Z", false)).toBe("Ctrl+Shift+Z");
    expect(formatShortcut("Alt+ArrowUp", false)).toBe("Alt+↑");
    expect(formatShortcut("Mod+Minus", true)).toBe("⌘−");
  });

  it("finds the enabled command for a key and searches by word starts", () => {
    let ran = "";
    const commands: Command[] = [
      {
        id: "a",
        title: "Undo",
        group: "Edit",
        shortcuts: ["Mod+Z"],
        enabled: () => false,
        run: () => {},
      },
      {
        id: "b",
        title: "Zoom to fit",
        group: "View",
        shortcuts: ["Shift+1"],
        run: () => (ran = "b"),
      },
      { id: "c", title: "Insert Text", group: "Insert", shortcuts: ["T"], run: () => {} },
    ];
    expect(findCommand(commands, key({ key: "z", code: "KeyZ", ctrlKey: true }))).toBeUndefined();
    findCommand(commands, key({ key: "!", code: "Digit1", shiftKey: true }))?.run();
    expect(ran).toBe("b");
    expect(searchCommands(commands, "zo fi").map((c) => c.id)).toEqual(["b"]);
    expect(searchCommands(commands, "insert").map((c) => c.id)).toEqual(["c"]);
    expect(searchCommands(commands, "")).toHaveLength(3);
  });
});

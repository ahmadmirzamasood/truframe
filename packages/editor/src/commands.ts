/**
 * Command registry (PRD F4, ARCHITECTURE §8): every editor action is a command with a title,
 * a group and optional shortcuts. One keyboard listener, the Cmd+K palette, the shortcut sheet
 * and buttons all run commands from here.
 */

export type CommandGroup = "Edit" | "Insert" | "Select" | "Arrange" | "View" | "Pages" | "Help";

export type Command = {
  id: string;
  title: string;
  group: CommandGroup;
  /** e.g. "Mod+Z", "Shift+1", "Delete", "F", "?". `Mod` is Cmd on macOS and Ctrl elsewhere. */
  shortcuts?: string[];
  /** Also runs while typing in a field (e.g. the palette itself). */
  inInputs?: boolean;
  enabled?: () => boolean;
  run: () => void;
};

type KeyLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

type Parsed = { mod: boolean; shift: boolean; alt: boolean; key: string };

export function parseShortcut(s: string): Parsed {
  const parts = s.split("+");
  // "Mod++" is not used; a lone "+" would be "Plus".
  const key = parts.pop() ?? "";
  return {
    mod: parts.includes("Mod"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
    key,
  };
}

/** Physical-key match for letters and digits (layout and Shift don't change them). */
function keyMatches(e: KeyLike, key: string): boolean {
  if (/^[A-Z]$/i.test(key)) return e.code === `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return e.code === `Digit${key}`;
  if (key === "Plus") return e.key === "+" || e.key === "=";
  if (key === "Minus") return e.key === "-" || e.key === "_";
  return e.key === key;
}

export function matches(e: KeyLike, shortcut: string): boolean {
  const p = parseShortcut(shortcut);
  const mod = e.ctrlKey || e.metaKey;
  if (mod !== p.mod || e.altKey !== p.alt) return false;
  // Characters typed with Shift ("?") carry it in the key itself.
  const shiftInKey = p.key.length === 1 && !/[a-z0-9]/i.test(p.key);
  if (!shiftInKey && e.shiftKey !== p.shift) return false;
  return keyMatches(e, p.key);
}

export function findCommand(commands: readonly Command[], e: KeyLike): Command | undefined {
  return commands.find((c) => c.shortcuts?.some((s) => matches(e, s)) && (c.enabled?.() ?? true));
}

const SYMBOL: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Delete: "Del",
  Backspace: "⌫",
  Plus: "+",
  Minus: "−",
};

/** "Mod+Shift+Z" → "⌘⇧Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(s: string, mac: boolean): string {
  const p = parseShortcut(s);
  const key = SYMBOL[p.key] ?? (p.key.length === 1 ? p.key.toUpperCase() : p.key);
  if (mac) return `${p.mod ? "⌘" : ""}${p.alt ? "⌥" : ""}${p.shift ? "⇧" : ""}${key}`;
  return [p.mod && "Ctrl", p.alt && "Alt", p.shift && "Shift", key].filter(Boolean).join("+");
}

/** Palette search: every word must start a word in the title or group (case-insensitive). */
export function searchCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  return commands.filter((c) => {
    const hay = `${c.title} ${c.group}`.toLowerCase().split(/[\s/–-]+/);
    return words.every((w) => hay.some((h) => h.startsWith(w)));
  });
}

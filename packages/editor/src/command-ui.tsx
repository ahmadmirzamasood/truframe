"use client";

/** Cmd+K palette and the keyboard shortcut sheet, both fed by the command registry. */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@truframe/ui/components/dialog";
import { cn } from "@truframe/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import {
  type Command,
  type CommandGroup,
  findCommand,
  formatShortcut,
  searchCommands,
} from "./commands.ts";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function Keys({ shortcut }: { shortcut: string }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {formatShortcut(shortcut, isMac())}
    </kbd>
  );
}

/** One keyboard listener for every command. Typing in fields is left alone. */
export function useCommandKeys(commands: readonly Command[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const typing = Boolean(t?.closest("input, textarea, select, [contenteditable]"));
      // Menus and dialogs handle their own keys (Escape closes them).
      const inOverlay = Boolean(t?.closest("[role=dialog], [role=menu], [role=listbox]"));
      const command = findCommand(commands, e);
      if (!command) return;
      if ((typing || inOverlay) && !command.inInputs) return;
      e.preventDefault();
      command.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands]);
}

export function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(
    () => searchCommands(props.commands, query).filter((c) => c.enabled?.() ?? true),
    [props.commands, query],
  );
  useEffect(() => {
    if (props.open) {
      setQuery("");
      setActive(0);
    }
  }, [props.open]);
  const run = (c: Command | undefined) => {
    if (!c) return;
    props.onOpenChange(false);
    // After the dialog closes, so focus and selection are back on the editor.
    setTimeout(() => c.run(), 0);
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Commands</DialogTitle>
        <input
          role="combobox"
          aria-expanded
          aria-controls="command-results"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          aria-label="Search commands"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[active]);
            }
          }}
          className="h-12 border-b bg-transparent px-4 text-sm outline-none"
        />
        <div
          id="command-results"
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-1"
        >
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No command matches “{query}”.
            </p>
          ) : (
            results.map((c, i) => (
              <div
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(c)}
                onKeyDown={() => {}}
                className={cn(
                  "flex h-9 cursor-default items-center gap-3 rounded-md px-3 text-sm",
                  i === active && "bg-accent",
                )}
              >
                <span className="w-14 shrink-0 text-xs text-muted-foreground">{c.group}</span>
                <span className="flex-1 truncate">{c.title}</span>
                {c.shortcuts?.[0] ? <Keys shortcut={c.shortcuts[0]} /> : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const GROUPS: CommandGroup[] = ["Edit", "Select", "Insert", "Arrange", "View", "Pages", "Help"];

export function ShortcutSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly Command[];
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every command is also in the command palette.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-x-8 gap-y-4 overflow-y-auto sm:grid-cols-2">
          {GROUPS.map((g) => {
            const list = props.commands.filter((c) => c.group === g && c.shortcuts?.length);
            if (!list.length) return null;
            return (
              <section key={g} aria-label={g} className="grid content-start gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground">{g}</h3>
                {list.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{c.title}</span>
                    <span className="flex gap-1">
                      {c.shortcuts?.map((s) => (
                        <Keys key={s} shortcut={s} />
                      ))}
                    </span>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

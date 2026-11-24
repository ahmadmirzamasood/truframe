"use client";

import { Button } from "@truframe/ui/components/button";
import {
  ImageIcon,
  LayoutGridIcon,
  type LucideIcon,
  RectangleHorizontalIcon,
  RowsIcon,
  StarIcon,
  TypeIcon,
} from "lucide-react";
import { useEffect } from "react";
import { INSERT_LABEL, INSERT_SHORTCUT, INSERT_TOOLS, type InsertTool } from "./insert.ts";

const ICON: Record<InsertTool, LucideIcon> = {
  stack: RowsIcon,
  grid: LayoutGridIcon,
  text: TypeIcon,
  image: ImageIcon,
  button: RectangleHorizontalIcon,
  icon: StarIcon,
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]"),
    )
  );
}

export function InsertToolbar(props: { onInsert: (tool: InsertTool) => void; disabled: boolean }) {
  const { onInsert, disabled } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const tool = INSERT_TOOLS.find((t) => INSERT_SHORTCUT[t] === e.key.toUpperCase());
      if (!tool) return;
      e.preventDefault();
      onInsert(tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onInsert, disabled]);

  return (
    <div
      role="toolbar"
      aria-label="Insert"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-background p-1 shadow-md"
    >
      {INSERT_TOOLS.map((tool) => {
        const Icon = ICON[tool];
        const key = INSERT_SHORTCUT[tool];
        return (
          <Button
            key={tool}
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Insert ${INSERT_LABEL[tool]}`}
            aria-keyshortcuts={key}
            title={key ? `${INSERT_LABEL[tool]} (${key})` : INSERT_LABEL[tool]}
            onClick={() => onInsert(tool)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}

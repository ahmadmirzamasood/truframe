"use client";

/**
 * One generated file in a read-only CodeMirror 6 view. The document is replaced in place
 * when the compiler output changes (only the changed middle), so scroll position and the
 * cursor survive live updates while the user designs.
 */
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { languageFor } from "./files.ts";
import { languageExtension } from "./languages.ts";

/**
 * A range to highlight; `seq` makes repeated reveals of the same range work. With `move`
 * (the default) the cursor goes there and it scrolls into view; without, it is only marked
 * (the user just clicked inside it).
 */
export type Reveal = { from: number; to: number; seq: number; move?: boolean };

export type CodeEditorProps = {
  path: string;
  text: string;
  reveal?: Reveal | null;
  /** Called when the user clicks in the code (reveal in design). */
  onPick?: (offset: number) => void;
};

const setRevealed = StateEffect.define<{ from: number; to: number } | null>();
const revealed = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setRevealed)) continue;
      next =
        e.value && e.value.to > e.value.from
          ? Decoration.set([revealMark.range(e.value.from, e.value.to)])
          : Decoration.none;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const revealMark = Decoration.mark({ class: "cm-tf-revealed" });

// A few extra colors over the default style, so TSX attributes and tags read clearly.
const extraHighlight = HighlightStyle.define([
  { tag: tags.tagName, color: "#116329" },
  { tag: tags.attributeName, color: "#0550ae" },
  { tag: tags.attributeValue, color: "#0a3069" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", backgroundColor: "var(--background)" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.55",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
  },
  ".cm-tf-revealed": {
    backgroundColor: "color-mix(in oklab, #3b82f6 16%, transparent)",
    outline: "1px solid color-mix(in oklab, #3b82f6 45%, transparent)",
    borderRadius: "2px",
  },
  "&.cm-focused": { outline: "none" },
});

function baseExtensions(path: string, onPick: { current: CodeEditorProps["onPick"] }): Extension[] {
  return [
    EditorState.readOnly.of(true),
    EditorView.contentAttributes.of({
      "aria-readonly": "true",
      "aria-label": `${path} (read-only)`,
    }),
    lineNumbers(),
    // Tailwind class lists make long lines; wrapping keeps a revealed element in view
    // without horizontal scrolling.
    EditorView.lineWrapping,
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    search({ top: true }),
    highlightSelectionMatches(),
    keymap.of(searchKeymap),
    syntaxHighlighting(extraHighlight),
    syntaxHighlighting(defaultHighlightStyle),
    revealed,
    theme,
    EditorView.updateListener.of((u) => {
      if (!u.selectionSet || !u.transactions.some((t) => t.isUserEvent("select.pointer"))) return;
      onPick.current?.(u.state.selection.main.head);
    }),
  ];
}

export function CodeEditor({ path, text, reveal, onPick }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const pick = useRef(onPick);
  pick.current = onPick;
  const shownPath = useRef<string | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const v = new EditorView({ parent });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
      shownPath.current = null;
    };
  }, []);

  // A new file gets a fresh state; the same file gets a minimal in-place change.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (shownPath.current !== path) {
      shownPath.current = path;
      v.setState(
        EditorState.create({
          doc: text,
          extensions: [
            ...baseExtensions(path, pick),
            language.current.of(languageExtension(languageFor(path))),
          ],
        }),
      );
      return;
    }
    const old = v.state.doc.toString();
    if (old === text) return;
    let start = 0;
    const max = Math.min(old.length, text.length);
    while (start < max && old.charCodeAt(start) === text.charCodeAt(start)) start += 1;
    let endOld = old.length;
    let endNew = text.length;
    while (
      endOld > start &&
      endNew > start &&
      old.charCodeAt(endOld - 1) === text.charCodeAt(endNew - 1)
    ) {
      endOld -= 1;
      endNew -= 1;
    }
    v.dispatch({ changes: { from: start, to: endOld, insert: text.slice(start, endNew) } });
  }, [path, text]);

  useEffect(() => {
    const v = view.current;
    if (!v || !reveal) return;
    const len = v.state.doc.length;
    const from = Math.min(reveal.from, len);
    const to = Math.min(reveal.to, len);
    if (reveal.move === false) {
      v.dispatch({ effects: setRevealed.of({ from, to }) });
      return;
    }
    v.dispatch({
      selection: EditorSelection.cursor(from),
      effects: [setRevealed.of({ from, to }), EditorView.scrollIntoView(from, { y: "center" })],
    });
  }, [reveal]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
}

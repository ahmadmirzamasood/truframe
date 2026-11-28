"use client";

/**
 * Custom code (P6-5, PRD §5): an Embed layer's HTML or URL, and a page's head/body code.
 * Both are the only ways to add markup that Truframe doesn't generate. Embed code runs only
 * in sandboxed frames; page code never runs in the editor, only on the built site.
 */
import {
  type EmbedNode,
  type Page,
  type PageCode,
  parseSnippet,
  printSnippet,
  sanitizeEmbedHtml,
} from "@truframe/model";
import type { Op } from "@truframe/ops";
import { cn } from "@truframe/ui/lib/utils";
import { useEffect, useId, useState } from "react";
import { Row, Section, Segmented } from "./fields.tsx";

/** A monospace text area that commits on blur and keeps the draft when it is refused. */
function CodeField(props: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  /** Returns an error message to refuse the text, or null when it was applied. */
  onCommit: (text: string) => string | null;
}) {
  const [text, setText] = useState(props.value);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  useEffect(() => {
    setText(props.value);
    setError(null);
  }, [props.value]);
  return (
    <div className="grid gap-1">
      <textarea
        aria-label={props.label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={text}
        rows={props.rows ?? 4}
        spellCheck={false}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === props.value) return;
          setError(props.onCommit(text));
        }}
        className={cn(
          "min-h-16 w-full resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive",
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EmbedSection(props: {
  node: EmbedNode;
  apply: (ops: Op[]) => { message: string } | null | void;
}) {
  const { node } = props;
  const set = (source: EmbedNode["source"]): string | null => {
    const failure = props.apply([{ op: "setNodeFields", nodeId: node.id, fields: { source } }]);
    return failure ? failure.message : null;
  };
  return (
    <Section title="Embed">
      <Row label="Source">
        <Segmented
          label="Embed source"
          value={node.source.type}
          options={[
            { value: "html", label: "Code" },
            { value: "url", label: "URL" },
          ]}
          onChange={(type) => {
            if (type === node.source.type) return;
            set(type === "html" ? { type, html: "" } : { type, url: "https://example.com" });
          }}
        />
      </Row>
      {node.source.type === "html" ? (
        <CodeField
          label="Embed code"
          value={node.source.html}
          rows={6}
          placeholder={'<iframe src="https://…"></iframe>'}
          onCommit={(text) => set({ type: "html", html: sanitizeEmbedHtml(text) })}
        />
      ) : (
        <CodeField
          label="Embed URL"
          value={node.source.url}
          rows={2}
          onCommit={(text) => {
            const url = text.trim();
            if (!/^https:\/\/\S+$/.test(url)) return "Use a full https:// address.";
            return set({ type: "url", url });
          }}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Runs in a sandboxed frame here and on your site, so it can't read the page around it.
      </p>
    </Section>
  );
}

const EMPTY: PageCode = { head: [], body: [] };

export function PageCodeSection(props: {
  page: Page;
  apply: (ops: Op[]) => { message: string } | null | void;
}) {
  const code = props.page.code ?? EMPTY;
  const commit = (slot: "head" | "body", text: string): string | null => {
    const parsed = parseSnippet(text);
    if (!parsed.ok) return parsed.message;
    const next = { ...code, [slot]: parsed.elements };
    const empty = next.head.length === 0 && next.body.length === 0;
    const failure = props.apply([
      { op: "updatePage", pageId: props.page.id, fields: { code: empty ? null : next } },
    ]);
    return failure ? failure.message : null;
  };
  return (
    <Section title="Page code">
      <p className="text-[11px] text-muted-foreground">
        Analytics tags, verification metas and other snippets. They run only on the published site,
        never in the editor. Allowed: script, style, noscript, meta and link.
      </p>
      <Row label="Head">
        <CodeField
          label="Head code"
          value={printSnippet(code.head)}
          placeholder={'<script defer src="https://…"></script>'}
          onCommit={(text) => commit("head", text)}
        />
      </Row>
      <Row label="Body end">
        <CodeField
          label="Body code"
          value={printSnippet(code.body)}
          onCommit={(text) => commit("body", text)}
        />
      </Row>
    </Section>
  );
}

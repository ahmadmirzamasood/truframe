/**
 * Preview (PRD F4, P5-7): the page full screen at Desktop, Tablet, Mobile or all three side by
 * side, with working links between pages. Each breakpoint renders in an iframe on the
 * usercontent origin with `sandbox="allow-scripts"` (an opaque origin: no cookies, storage or
 * access to this page), so user content never runs on the app origin (SECURITY T3).
 *
 * The editor renders the page here with the renderer and the compiler's CSS (the same markup
 * as the canvas) and posts it in; images and web fonts go in as blobs, because the frame can't
 * reach the app's authorized URLs. The frame only reports clicked links back.
 */
import { activeBreakpoints, type BreakpointId, type ProjectDocument } from "@truframe/model";
import {
  PREVIEW_PATH,
  type PreviewRender,
  previewFrameMessage,
  previewPagePath,
} from "@truframe/protocol";
import { fontFamilies, renderFrame, type TreeOptions } from "@truframe/renderer";
import { Button } from "@truframe/ui/components/button";
import { cn } from "@truframe/ui/lib/utils";
import { XIcon } from "lucide-react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { EditorHost } from "./host.ts";
import { BREAKPOINT_LABEL } from "./labels.ts";
import { type Compiled, useCompiled } from "./use-compiled.ts";

export type PreviewMode = BreakpointId | "all";

const MODE_LABEL: Record<PreviewMode, string> = { ...BREAKPOINT_LABEL, all: "Side by side" };
/** Space between frames and around them, in screen pixels. */
const GAP = 24;
const CAPTION = 24;

/** Static markup of one page at one breakpoint, through React (no extra dependency). */
export function previewMarkup(
  doc: ProjectDocument,
  output: Compiled,
  pageId: string,
  breakpoint: BreakpointId,
  options: TreeOptions,
): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() =>
    root.render(renderFrame({ doc, output, pageId, breakpoint, options }) as ReactElement),
  );
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/** Same-origin `url(/…)` references in a stylesheet (the font proxy's files). */
function cssFileUrls(css: string): string[] {
  return [...css.matchAll(/url\(\s*["']?(\/[^"')\s]+)["']?\s*\)/g)].map((m) => m[1] as string);
}

/** Fetches app files once per preview session; a file that fails is left out. */
function useFileCache() {
  const cache = useRef(new Map<string, Promise<Blob | null>>());
  return useCallback((url: string) => {
    let p = cache.current.get(url);
    if (!p) {
      p = fetch(url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.blob() : null))
        .catch(() => null);
      cache.current.set(url, p);
    }
    return p;
  }, []);
}

export function PreviewOverlay(props: {
  doc: ProjectDocument;
  host: EditorHost;
  origin: string;
  initialPageId: string;
  treeOptions: TreeOptions;
  onClose: () => void;
}) {
  const { doc, host, origin, treeOptions } = props;
  const compiled = useCompiled(doc);
  const output = compiled.status === "loading" ? null : compiled.output;
  const breakpoints = activeBreakpoints(doc.breakpoints);
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const [pageId, setPageId] = useState(props.initialPageId);
  const [notice, setNotice] = useState<string | null>(null);
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0];
  const shown: BreakpointId[] = mode === "all" ? breakpoints : [mode];
  const frames = useRef(new Map<BreakpointId, HTMLIFrameElement>());
  // Windows that said they're ready. Keyed by window, not breakpoint: ref callbacks rerun on
  // every render, and a remounted iframe is a new window that must say so again.
  const ready = useRef(new WeakSet<Window>());
  const file = useFileCache();

  // Fonts: the canvas's stylesheet from the app's proxy, its files as blobs.
  const fontsUrl = host.pickers?.fontCssUrl(fontFamilies(doc)) ?? null;
  const [fontCss, setFontCss] = useState("");
  useEffect(() => {
    if (!fontsUrl) return setFontCss("");
    let live = true;
    fetch(fontsUrl, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((css) => live && setFontCss(css))
      .catch(() => live && setFontCss(""));
    return () => {
      live = false;
    };
  }, [fontsUrl]);

  const payload = useMemo(() => {
    if (!output || !page) return null;
    return async (bp: BreakpointId): Promise<PreviewRender> => {
      // Out of the current render or effect: flushSync can't render while React is busy.
      await Promise.resolve();
      const html = previewMarkup(doc, output, page.id, bp, treeOptions);
      const urls = new Set<string>(cssFileUrls(fontCss));
      for (const a of Object.values(doc.assets)) {
        const u = treeOptions.assetUrl?.(a.id);
        if (u && html.includes(u)) urls.add(u);
      }
      const files: Record<string, Blob> = {};
      await Promise.all(
        [...urls].map(async (u) => {
          const blob = await file(u);
          if (blob) files[u] = blob;
        }),
      );
      return {
        type: "tf-preview:render",
        html,
        css: fontCss,
        lang: doc.settings.lang,
        title: page.seo.title || page.name,
        files,
      };
    };
  }, [doc, output, page, treeOptions, fontCss, file]);

  const send = useRef<(bp: BreakpointId) => void>(() => {});
  send.current = (bp) => {
    const w = frames.current.get(bp)?.contentWindow;
    if (!w || !payload || !ready.current.has(w)) return;
    // The frame's origin is opaque ("null"), so it can't be named as the target; the window
    // is our own iframe, and the frame checks this page's origin.
    void payload(bp).then((m) => w.postMessage(m, "*"));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sends whenever the page, its CSS or its files change.
  useEffect(() => {
    for (const bp of frames.current.keys()) send.current(bp);
  }, [payload]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const bp = [...frames.current].find(([, f]) => f.contentWindow === e.source)?.[0];
      if (!bp || e.origin !== "null") return;
      const m = previewFrameMessage.safeParse(e.data);
      if (!m.success) return;
      if (m.data.type === "tf-preview:ready") {
        ready.current.add(e.source as Window);
        send.current(bp);
      } else if (m.data.type === "tf-preview:escape") {
        close.current();
      } else if (m.data.type === "tf-preview:navigate") {
        const path = previewPagePath(m.data.path);
        const target = doc.pages.find((p) => previewPagePath(p.path) === path);
        if (target) {
          setNotice(null);
          setPageId(target.id);
        } else setNotice(`No page at ${path}`);
      } else window.open(m.data.url, "_blank", "noopener,noreferrer");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [doc]);

  // Escape closes Preview before the editor's shortcuts see it (or from inside a frame).
  const { onClose } = props;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  // Frames scale down to fit the available width; their height fills the area.
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const widths = shown.map((bp) => doc.breakpoints[bp]?.width ?? 0);
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = size.w ? Math.min(1, (size.w - GAP * (shown.length + 1)) / Math.max(1, total)) : 1;
  const height = Math.max(200, (size.h - GAP * 2 - CAPTION) / scale);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview"
      className="fixed inset-0 z-50 flex flex-col bg-muted"
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-background px-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <label className="sr-only" htmlFor="preview-page">
          Page
        </label>
        <select
          id="preview-page"
          value={page?.id}
          onChange={(e) => {
            setNotice(null);
            setPageId(e.target.value);
          }}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        >
          {doc.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.path})
            </option>
          ))}
        </select>
        <div role="radiogroup" aria-label="Preview size" className="flex rounded-md bg-muted p-0.5">
          {[...breakpoints, "all" as const].map((m) => (
            // biome-ignore lint/a11y/useSemanticElements: a segmented control, as in the inspector.
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-6 rounded-[5px] px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                mode === m && "bg-background text-foreground shadow-xs",
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {notice ? (
          <p role="status" className="text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <Button ref={closeRef} size="sm" variant="ghost" className="ml-auto h-7" onClick={onClose}>
          <XIcon aria-hidden />
          Close
        </Button>
      </header>
      <div
        ref={area}
        className="flex min-h-0 flex-1 items-start justify-center overflow-hidden"
        style={{ gap: GAP, padding: GAP }}
      >
        {shown.map((bp, i) => {
          const w = widths[i] ?? 0;
          return (
            <figure key={bp} className="m-0 grid shrink-0" style={{ width: w * scale }}>
              <figcaption className="text-xs text-muted-foreground" style={{ height: CAPTION }}>
                {BREAKPOINT_LABEL[bp]} {w}
              </figcaption>
              <div
                className="overflow-hidden rounded-sm bg-background shadow-sm"
                style={{ width: w * scale, height: height * scale }}
              >
                <iframe
                  ref={(el) => {
                    if (el) frames.current.set(bp, el);
                  }}
                  title={`Preview at ${BREAKPOINT_LABEL[bp]}`}
                  src={`${origin}${PREVIEW_PATH}`}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  className="origin-top-left border-0"
                  style={{ width: w, height, transform: `scale(${scale})` }}
                />
              </div>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

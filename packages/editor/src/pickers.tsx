/**
 * Icon and photo pickers (P5-5). Results come from the app's proxies (`PickerHost`); icon
 * drawings are data, drawn here as React elements, so nothing from a search runs as markup.
 */
import type { Asset, IconSvg, SvgElement } from "@truframe/model";
import { Input } from "@truframe/ui/components/input";
import { cn } from "@truframe/ui/lib/utils";
import { createElement, type FormEvent, type ReactNode, useState } from "react";
import type { IconOption, PhotoOption, PickerHost } from "./host.ts";

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function shape(e: SvgElement, key: number): ReactNode {
  const props: Record<string, string | number> = { key };
  for (const [k, v] of Object.entries(e.attrs)) if (v !== undefined) props[camel(k)] = v;
  return createElement(e.tag, props, ...(e.children ?? []).map(shape));
}

export function SvgPreview(props: { svg: IconSvg; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={props.svg.viewBox}
      className={cn("size-5", props.className)}
      aria-hidden
    >
      {props.svg.body.map(shape)}
    </svg>
  );
}

function useSearch<T>(
  run: (q: string) => Promise<{ ok: true; items: T } | { ok: false; message: string }>,
) {
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "done"; items: T }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const search = async (q: string) => {
    setState({ status: "loading" });
    const r = await run(q);
    setState(r.ok ? { status: "done", items: r.items } : { status: "error", message: r.message });
  };
  return [state, search] as const;
}

function SearchForm(props: {
  label: string;
  placeholder: string;
  onSearch: (q: string) => void;
  allowEmpty?: boolean;
}) {
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim() || props.allowEmpty) props.onSearch(q.trim());
  };
  return (
    <search>
      <form onSubmit={submit}>
        <Input
          aria-label={props.label}
          placeholder={props.placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-7 text-xs"
        />
      </form>
    </search>
  );
}

/** Search Iconify and pick an icon; the drawing goes into the layer. */
export function IconPicker(props: { host: PickerHost; onPick: (icon: IconOption) => void }) {
  const [state, search] = useSearch(async (q) => {
    const r = await props.host.icons(q);
    return r.ok ? { ok: true as const, items: r.icons } : r;
  });
  return (
    <div className="grid gap-2">
      <SearchForm label="Search icons" placeholder="Search icons (Enter)" onSearch={search} />
      {state.status === "loading" ? (
        <p className="text-[11px] text-muted-foreground">Searching…</p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-[11px] text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        state.items.length ? (
          <ul aria-label="Icons" className="grid grid-cols-6 gap-1">
            {state.items.map((i) => (
              <li key={`${i.set}:${i.icon}`}>
                <button
                  type="button"
                  aria-label={`${i.set}:${i.icon}`}
                  title={`${i.icon} (${i.set})`}
                  onClick={() => props.onPick(i)}
                  className="grid size-8 place-items-center rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <SvgPreview svg={i.svg} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">No icons match. Try another word.</p>
        )
      ) : null}
    </div>
  );
}

/** Unsplash search in the Assets panel; adding a photo copies it into the project's assets. */
export function PhotoPicker(props: { host: PickerHost; onAdded: (asset: Asset) => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, search] = useSearch(async (q) => {
    const r = await props.host.photos(q);
    return r.ok ? { ok: true as const, items: r } : r;
  });
  const add = async (p: PhotoOption) => {
    setAdding(p.id);
    setError(null);
    const r = await props.host.importPhoto(p.id);
    setAdding(null);
    if (r.ok) props.onAdded(r.asset);
    else setError(r.message);
  };
  return (
    <section aria-label="Photos" className="grid gap-2 border-t px-3 py-3">
      <h3 className="text-[11px] font-semibold">Photos</h3>
      <SearchForm
        label="Search photos"
        placeholder="Search Unsplash (Enter)"
        onSearch={search}
        allowEmpty
      />
      {state.status === "loading" ? (
        <p className="text-[11px] text-muted-foreground">Searching…</p>
      ) : null}
      {state.status === "error" || error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error ?? (state.status === "error" ? state.message : "")}
        </p>
      ) : null}
      {state.status === "done" ? (
        <>
          {state.items.sample ? (
            <p className="text-[11px] text-muted-foreground">
              Sample photos: Unsplash isn't connected in this environment.
            </p>
          ) : null}
          <ul aria-label="Photo results" className="grid grid-cols-2 gap-2">
            {state.items.photos.map((p) => (
              <li key={p.id} className="grid gap-1">
                <button
                  type="button"
                  aria-label={`Add photo: ${p.description || p.id}`}
                  disabled={adding !== null}
                  onClick={() => add(p)}
                  className="overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                >
                  <img src={p.thumbUrl} alt="" className="aspect-[3/2] w-full object-cover" />
                </button>
                {state.items.sample ? null : (
                  <p className="truncate text-[10px] text-muted-foreground">
                    Photo by{" "}
                    <a href={p.authorUrl} target="_blank" rel="noreferrer" className="underline">
                      {p.author}
                    </a>{" "}
                    on{" "}
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                      Unsplash
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

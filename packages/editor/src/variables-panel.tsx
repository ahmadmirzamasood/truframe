"use client";

/**
 * Variables panel (PRD F12, F29): search and `+`, tabs Colors · Spacing · Font, groups, rows
 * with a swatch or preview, name and value, and per-row Edit, Duplicate and Delete. The New /
 * Edit dialog sets a value per breakpoint (Tablet and Mobile follow Desktop until set) and shows
 * the code it writes to `tokens.css`. Each save is one transaction.
 */
import { type BreakpointId, newId, type ProjectDocument, type Variable } from "@truframe/model";
import type { Op } from "@truframe/ops";
import { Button } from "@truframe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@truframe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@truframe/ui/components/dropdown-menu";
import { Input } from "@truframe/ui/components/input";
import { Label } from "@truframe/ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@truframe/ui/components/tabs";
import { MoreHorizontalIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";
import { ColorField, NumberField, SelectField } from "./inspector/fields.tsx";
import { BREAKPOINT_LABEL } from "./labels.ts";
import {
  checkDraft,
  createVariableOps,
  defaultValue,
  deleteVariableOps,
  draftOf,
  duplicateVariableOps,
  type FontValue,
  formatValue,
  groupNames,
  groupsOf,
  TYPE_LABELS,
  tokensPreview,
  uniqueCssName,
  updateVariableOps,
  usageCounts,
  usageLabel,
  VARIABLE_TABS,
  type VariableDraft,
  type VariableType,
  type VariableValue,
  valueAt,
} from "./variables.ts";

type Apply = (ops: Op[]) => { message: string } | null;

type Editing =
  | { mode: "new"; draft: VariableDraft }
  | { mode: "edit"; id: string; draft: VariableDraft };

export function VariablesPanel(props: { doc: ProjectDocument; apply: Apply }) {
  const { doc } = props;
  const [tab, setTab] = useState<VariableType>("color");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Variable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counts = useMemo(() => usageCounts(doc), [doc]);
  const groups = groupsOf(doc, tab, query);

  const run = (ops: Op[]) => {
    const failure = props.apply(ops);
    setError(failure ? failure.message : null);
    return !failure;
  };
  const startNew = () =>
    setEditing({
      mode: "new",
      draft: {
        type: tab,
        name: "",
        group: groups.at(-1)?.group ?? "",
        value: { desktop: defaultValue(tab) },
      } as VariableDraft,
    });

  return (
    <div className="grid gap-2 py-2 text-xs" data-testid="variables-panel">
      <div className="flex items-center gap-1 px-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            aria-label="Search variables"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 w-full rounded-md bg-muted/70 pr-2 pl-7 text-xs outline-none focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="New variable" onClick={startNew}>
          <PlusIcon />
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as VariableType)} className="px-2">
        <TabsList aria-label="Variable types" className="w-full">
          {VARIABLE_TABS.map((t) => (
            <TabsTrigger key={t.type} value={t.type} className="flex-1">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {error ? (
        <p role="alert" className="mx-2 rounded bg-destructive/10 px-2 py-1 text-destructive">
          {error}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <div className="grid gap-2 px-3 py-4 text-center text-muted-foreground">
          <p>
            {query
              ? "No variables match your search."
              : `No ${VARIABLE_TABS.find((t) => t.type === tab)?.label.toLowerCase()} variables yet.`}
          </p>
          {query ? null : (
            <Button size="xs" variant="outline" className="justify-self-center" onClick={startNew}>
              <PlusIcon />
              New {TYPE_LABELS[tab].toLowerCase()} variable
            </Button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.group} aria-label={g.group || "Ungrouped"} className="grid">
            <h3 className="px-3 pt-1 pb-0.5 text-[11px] font-semibold text-muted-foreground">
              {g.group || "Ungrouped"}
            </h3>
            <ul className="grid">
              {g.variables.map((v) => (
                <VariableRow
                  key={v.id}
                  doc={doc}
                  variable={v}
                  uses={counts.get(v.id) ?? 0}
                  onEdit={() => setEditing({ mode: "edit", id: v.id, draft: draftOf(v) })}
                  onDuplicate={() => run(duplicateVariableOps(doc, v.id, newId()).ops)}
                  onDelete={() => setDeleting(v)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      {editing ? (
        <VariableDialog
          doc={doc}
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            const ops =
              editing.mode === "new"
                ? createVariableOps(doc, draft, newId()).ops
                : updateVariableOps(doc, editing.id, draft);
            if (run(ops)) {
              setEditing(null);
              setTab(draft.type);
            }
          }}
        />
      ) : null}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              {deleting && (counts.get(deleting.id) ?? 0) > 0
                ? `${usageLabel(counts.get(deleting.id) ?? 0)}. Those layers keep their current values, no longer linked to a variable.`
                : "It isn't used anywhere."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting && run(deleteVariableOps(doc, deleting.id))) setDeleting(null);
              }}
            >
              Delete variable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Swatch({ doc, variable }: { doc: ProjectDocument; variable: Variable }) {
  if (variable.type === "color")
    return (
      <span
        className="size-4 shrink-0 rounded-sm border"
        style={{ background: valueAt(doc, variable, "desktop") }}
        aria-hidden
      />
    );
  if (variable.type === "spacing")
    return (
      <span
        className="grid size-4 shrink-0 place-items-center text-[9px] text-muted-foreground"
        aria-hidden
      >
        ↔
      </span>
    );
  return (
    <span className="grid size-4 shrink-0 place-items-center text-[11px] font-semibold" aria-hidden>
      Aa
    </span>
  );
}

function VariableRow(props: {
  doc: ProjectDocument;
  variable: Variable;
  uses: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const v = props.variable;
  return (
    <li
      aria-label={v.name}
      className="group flex h-8 items-center gap-2 pr-1 pl-3 hover:bg-accent/70"
      title={`${v.cssName} · ${usageLabel(props.uses)}`}
    >
      <Swatch doc={props.doc} variable={v} />
      <button
        type="button"
        onClick={props.onEdit}
        aria-label={`Edit ${v.name}`}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      >
        <span className="truncate">{v.name}</span>
        <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground">
          {formatValue(v.type, v.value.desktop)}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${v.name}`}
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={props.onEdit}>Edit…</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onDuplicate}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={props.onDelete}
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function VariableDialog(props: {
  doc: ProjectDocument;
  editing: Editing;
  onClose: () => void;
  onSave: (draft: VariableDraft) => void;
}) {
  const { doc, editing } = props;
  const [draft, setDraftState] = useState<VariableDraft>(editing.draft);
  // A field commits on Enter in the same event that submits the form, before React re-renders,
  // so submit reads the latest draft from here rather than from the render closure.
  const latest = useRef(editing.draft);
  const setDraft = (next: VariableDraft | ((d: VariableDraft) => VariableDraft)) => {
    latest.current = typeof next === "function" ? next(latest.current) : next;
    setDraftState(latest.current);
  };
  const [problem, setProblem] = useState<string | null>(null);
  const groupsId = useId();
  const cssName =
    editing.mode === "edit" &&
    doc.variables[editing.id]?.name === draft.name.trim() &&
    doc.variables[editing.id]?.group === draft.group.trim()
      ? (doc.variables[editing.id]?.cssName ?? "")
      : uniqueCssName(
          doc,
          draft.group,
          draft.name,
          editing.mode === "edit" ? editing.id : undefined,
        );
  const bps = (["desktop", "tablet", "mobile"] as const).filter((b) => doc.breakpoints[b]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = checkDraft(latest.current);
    setProblem(p);
    if (!p) props.onSave(latest.current);
  };
  const setValue = (bp: BreakpointId, value: VariableValue | undefined) =>
    setDraft((d) => {
      const next = { ...d, value: { ...d.value } } as VariableDraft;
      if (value === undefined) delete (next.value as Record<string, unknown>)[bp];
      else (next.value as Record<string, unknown>)[bp] = value;
      return next;
    });
  const following = (bp: BreakpointId): VariableValue =>
    bp === "mobile" ? (draft.value.tablet ?? draft.value.desktop) : draft.value.desktop;

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing.mode === "new"
                ? "New variable"
                : `Edit ${doc.variables[editing.id]?.name ?? "variable"}`}
            </DialogTitle>
            <DialogDescription>
              Variables become CSS custom properties in <code>tokens.css</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="variable-name">Name</Label>
            <Input
              id="variable-name"
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...latest.current, name: e.target.value })}
            />
          </div>
          {editing.mode === "new" ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Type</legend>
              <div role="radiogroup" aria-label="Type" className="flex gap-1">
                {VARIABLE_TABS.map((t) => (
                  <Button
                    key={t.type}
                    type="button"
                    role="radio"
                    aria-checked={draft.type === t.type}
                    size="sm"
                    variant={draft.type === t.type ? "default" : "outline"}
                    onClick={() =>
                      setDraft({
                        ...latest.current,
                        type: t.type,
                        value: { desktop: defaultValue(t.type) },
                      } as VariableDraft)
                    }
                  >
                    {TYPE_LABELS[t.type]}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="variable-group">Group</Label>
            <Input
              id="variable-group"
              list={groupsId}
              placeholder="e.g. Brand"
              value={draft.group}
              onChange={(e) => setDraft({ ...latest.current, group: e.target.value })}
            />
            <datalist id={groupsId}>
              {groupNames(doc).map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Value</legend>
            {bps.map((bp) => {
              const own = draft.value[bp];
              return (
                <div key={bp} className="grid gap-1" data-testid={`variable-value-${bp}`}>
                  <div className="flex h-5 items-center justify-between text-xs text-muted-foreground">
                    <span>{BREAKPOINT_LABEL[bp]}</span>
                    {bp === "desktop" ? null : own === undefined ? (
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={() => setValue(bp, structuredClone(following(bp)))}
                      >
                        Follows{" "}
                        {bp === "mobile" && draft.value.tablet !== undefined ? "Tablet" : "Desktop"}{" "}
                        · Set
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        aria-label={`Reset ${BREAKPOINT_LABEL[bp]} value`}
                        onClick={() => setValue(bp, undefined)}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  {own === undefined && bp !== "desktop" ? null : (
                    <ValueEditor
                      type={draft.type}
                      label={`${BREAKPOINT_LABEL[bp]} value`}
                      value={(own ?? draft.value.desktop) as VariableValue}
                      onChange={(v) => setValue(bp, v)}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Generated code</span>
            <pre
              data-testid="generated-code"
              className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed"
            >
              {tokensPreview(doc, draft, cssName)}
            </pre>
          </div>
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit">{editing.mode === "new" ? "Create variable" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: String(w),
  label: String(w),
}));

function ValueEditor(props: {
  type: VariableType;
  label: string;
  value: VariableValue;
  onChange: (v: VariableValue) => void;
}) {
  if (props.type === "color")
    return (
      <ColorField label={props.label} value={props.value as string} onCommit={props.onChange} />
    );
  if (props.type === "spacing")
    return (
      <NumberField
        label={props.label}
        value={props.value as number}
        min={0}
        unit="px"
        onCommit={props.onChange}
      />
    );
  const f = props.value as FontValue;
  const set = (patch: Partial<FontValue>) => props.onChange({ ...f, ...patch });
  return (
    <div className="grid grid-cols-2 gap-1">
      <input
        aria-label={`${props.label} family`}
        defaultValue={f.family}
        key={f.family}
        onBlur={(e) => e.target.value.trim() && set({ family: e.target.value.trim() })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = (e.target as HTMLInputElement).value.trim();
            if (v) set({ family: v });
          }
        }}
        className="col-span-2 h-7 rounded-md bg-muted/70 px-2 text-xs outline-none focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <SelectField
        label={`${props.label} weight`}
        value={String(f.weight)}
        options={WEIGHTS}
        onChange={(w) => set({ weight: Number(w) })}
      />
      <NumberField
        label={`${props.label} size`}
        value={f.size}
        min={1}
        max={1000}
        unit="px"
        prefix="S"
        onCommit={(size) => set({ size })}
      />
      <NumberField
        label={`${props.label} line height`}
        value={f.lineHeight}
        min={0.5}
        max={10}
        step={0.05}
        prefix="LH"
        onCommit={(lineHeight) => set({ lineHeight })}
      />
      <NumberField
        label={`${props.label} letter spacing`}
        value={f.letterSpacing}
        min={-1}
        max={1}
        step={0.01}
        unit="em"
        prefix="LS"
        onCommit={(letterSpacing) => set({ letterSpacing })}
      />
    </div>
  );
}

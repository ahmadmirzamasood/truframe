"use client";

/**
 * Code View's read-only state (P6-4, PRD §5, BILLING §2): a lock that says why the code
 * can't be edited, and where to edit it instead. Copy is a Pro feature; on Free it is only
 * a soft deterrent (the code is still visible), never a security boundary.
 */
import { Button } from "@truframe/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@truframe/ui/components/popover";
import { GitBranchIcon, LockIcon } from "lucide-react";

/** What the workspace's plan allows with generated code (from `@truframe/billing`). */
export type CodeAccess = { copy: boolean; export: boolean; githubPush: boolean };

export function ReadOnlyBadge() {
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-full border bg-muted px-2 text-[11px] font-medium text-muted-foreground"
      title="Generated from your design. Change the design to change the code."
      data-testid="code-read-only"
    >
      <LockIcon className="size-3" aria-hidden />
      Read-only
    </span>
  );
}

export function EditCodeCallToAction({ access }: { access: CodeAccess }) {
  const pro = access.export || access.githubPush;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <GitBranchIcon className="size-3.5" aria-hidden />
          Export or push to GitHub to edit code
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-2 text-xs" aria-label="Editing code">
        <p className="font-medium text-sm">Edit the code outside Truframe</p>
        <p className="text-muted-foreground">
          Truframe writes this code from your design, so it can't be edited here: change the design
          and the code follows. To work on the code itself, export the project as a ZIP or push it
          to a GitHub repository and edit it with your own tools. Changes made there don't come back
          into Truframe.
        </p>
        <p className="text-muted-foreground">
          {pro
            ? "Export and GitHub push will be in the Publish menu once publishing is available."
            : "Code export and GitHub push are part of Pro. On Free you can view the code and publish one project to Vercel."}
        </p>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@truframe/ui/components/tabs";
import {
  ComponentIcon,
  FileTextIcon,
  ImageIcon,
  LayersIcon,
  type LucideIcon,
  VariableIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const LEFT_TABS = ["pages", "layers", "components", "variables", "assets"] as const;
export type LeftTab = (typeof LEFT_TABS)[number];
export const RIGHT_TABS = ["inspect", "agent", "history", "comments"] as const;
export type RightTab = (typeof RIGHT_TABS)[number];

const LEFT: Record<LeftTab, { label: string; icon: LucideIcon }> = {
  pages: { label: "Pages", icon: FileTextIcon },
  layers: { label: "Layers", icon: LayersIcon },
  components: { label: "Components", icon: ComponentIcon },
  variables: { label: "Variables", icon: VariableIcon },
  assets: { label: "Assets", icon: ImageIcon },
};

const RIGHT: Record<RightTab, string> = {
  inspect: "Inspect",
  agent: "Agent",
  history: "History",
  comments: "Comments",
};

/** Placeholder for panels that later phases fill in. */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 p-4 text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

export function LeftPanel(props: {
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  content: Record<LeftTab, ReactNode>;
}) {
  return (
    <Tabs
      value={props.tab}
      onValueChange={(v) => props.onTabChange(v as LeftTab)}
      aria-label="Left panel"
      className="h-full min-h-0"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
        <h2 className="px-1 text-xs font-semibold">{LEFT[props.tab].label}</h2>
        <TabsList aria-label="Left panel tabs">
          {LEFT_TABS.map((id) => {
            const { label, icon: Icon } = LEFT[id];
            return (
              <TabsTrigger
                key={id}
                value={id}
                aria-label={label}
                title={label}
                className="w-7 px-0"
              >
                <Icon className="size-3.5" aria-hidden />
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {LEFT_TABS.map((id) => (
        <TabsContent key={id} value={id} className="overflow-y-auto">
          {props.content[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function RightPanel(props: {
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
  content: Record<RightTab, ReactNode>;
}) {
  return (
    <Tabs
      value={props.tab}
      onValueChange={(v) => props.onTabChange(v as RightTab)}
      aria-label="Right panel"
      className="h-full min-h-0"
    >
      <div className="flex h-10 shrink-0 items-center border-b px-2">
        <TabsList aria-label="Right panel tabs">
          {RIGHT_TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {RIGHT[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {RIGHT_TABS.map((id) => (
        <TabsContent key={id} value={id} className="overflow-y-auto">
          {props.content[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

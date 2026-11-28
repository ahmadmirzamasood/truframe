/** Design View: editor shell, canvas, tools, selection, panels, inspector (ARCHITECTURE §8). */
export { DesignEditor, type DesignEditorProps } from "./editor.tsx";
export type {
  AssetHost,
  AssetUsage,
  EditorHost,
  ExportHost,
  FontOption,
  IconOption,
  ImageExportRequest,
  PhotoOption,
  PickerHost,
  PreviewHost,
  SyncSummary,
} from "./host.ts";
export { LEFT_TABS, type LeftTab, RIGHT_TABS, type RightTab } from "./panels.tsx";

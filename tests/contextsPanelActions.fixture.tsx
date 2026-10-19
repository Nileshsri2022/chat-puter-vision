import React from "react";
import { createRoot } from "react-dom/client";
import { ContextsPanel } from "@/components/ContextsPanel";
import { addItemToContextGroup, createContextGroup } from "@/lib/contextGroups";
import "@/index.css";

const source = { conversationId: "e2e", messageIndex: 0 };
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/t3sAAAAASUVORK5CYII=";
let group = createContextGroup({
  kind: "image",
  ref: image,
  refKind: "data",
  origin: "generated",
  label: "Reference image",
  source,
}, new Date("2026-10-19T12:00:00Z").getTime());
for (const item of [
  { kind: "text", text: "Selected paragraph text", label: "Selected paragraph text", source },
  { kind: "code", text: "const answer = 42;", label: "TypeScript · example.ts", source: { ...source, at: 12 } },
  { kind: "table", text: "| Scene | Lens |\n| --- | --- |\n| Garden | 50 mm |", label: "Table · Camera specs", source: { ...source, at: 28 } },
] as const) {
  group = addItemToContextGroup(group, item).group;
}

export function ContextActionsFixture() {
  return (
    <ContextsPanel
      contextGroups={[group]}
      expandedGroupId={group.id}
      isOpen
      onToggle={() => {}}
      onExpandGroup={() => {}}
      onCreateGroup={() => {}}
      onAddItem={() => {}}
      onRemoveItem={() => {}}
      onDeleteGroup={() => {}}
      onRenameGroup={() => {}}
      onInjectGroup={() => {}}
      onInjectItem={() => {}}
      onLocateItem={() => {}}
    />
  );
}

createRoot(document.getElementById("root")!).render(<ContextActionsFixture />);

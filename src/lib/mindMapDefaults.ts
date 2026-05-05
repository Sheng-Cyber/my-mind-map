import type { MindMapRecord, MindNode } from "../types/mindMap";
import { nowIso } from "./date";
import { createId } from "./id";

export function createRootNode(): MindNode {
  return {
    id: createId("node"),
    type: "mindNode",
    position: { x: 120, y: 120 },
    data: {
      text: "",
      note: "",
      color: "#ffffff",
    },
  };
}

export function createEmptyMap(title = "Untitled map"): MindMapRecord {
  const timestamp = nowIso();

  return {
    id: createId("map"),
    title,
    nodes: [createRootNode()],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

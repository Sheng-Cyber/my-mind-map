import type { Edge, Node, Viewport } from "@xyflow/react";

export type MindNodeData = {
  text: string;
  note?: string;
  color?: string;
  width?: number;
  height?: number;
};

export type MindNode = Node<MindNodeData, "mindNode">;
export type MindEdge = Edge;

export type HistorySnapshot = {
  title: string;
  nodes: MindNode[];
  edges: MindEdge[];
  viewport: Viewport;
};

export type MindMapRecord = {
  id: string;
  title: string;
  nodes: MindNode[];
  edges: MindEdge[];
  viewport: Viewport;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  history?: HistorySnapshot[];
};

export type MindMapSummary = Pick<
  MindMapRecord,
  "id" | "title" | "createdAt" | "updatedAt" | "deletedAt"
>;

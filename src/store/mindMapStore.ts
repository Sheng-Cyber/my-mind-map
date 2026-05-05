import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import {
  deleteExpiredMaps,
  getMap,
  listDeletedMapSummaries,
  listMapSummaries,
  putMap,
} from "../db/mindMapDb";
import { nowIso } from "../lib/date";
import { createId } from "../lib/id";
import { layoutMindMap } from "../lib/layoutMindMap";
import { createEmptyMap } from "../lib/mindMapDefaults";
import type {
  HistorySnapshot,
  MindEdge,
  MindMapRecord,
  MindMapSummary,
  MindNode,
} from "../types/mindMap";

type SaveState = "idle" | "saving" | "saved" | "error";

const DEFAULT_NODE_WIDTH = 112;
const DEFAULT_NODE_HEIGHT = 42;
const MAX_HISTORY_LENGTH = 30;
const TRASH_RETENTION_DAYS = 30;

type MindMapState = {
  maps: MindMapSummary[];
  trashMaps: MindMapSummary[];
  activeMapId: string | null;
  title: string;
  nodes: MindNode[];
  edges: MindEdge[];
  viewport: Viewport;
  selectedNodeId: string | null;
  branchRootId: string | null;
  focusNodeId: string | null;
  revealNodeId: string | null;
  pendingNodePosition: XYPosition | null;
  selectedEdgeIds: string[];
  isLoading: boolean;
  isHydrated: boolean;
  saveState: SaveState;
  dirtyRevision: number;
  savedRevision: number;
  history: HistorySnapshot[];
  loadMaps: () => Promise<void>;
  createMap: () => Promise<void>;
  selectMap: (mapId: string) => Promise<void>;
  removeActiveMap: () => Promise<void>;
  restoreMap: (mapId: string) => Promise<void>;
  markSaved: (revision: number) => void;
  markSaving: (revision: number) => void;
  markSaveError: () => void;
  setTitle: (title: string) => void;
  setViewport: (viewport: Viewport) => void;
  onNodesChange: (changes: NodeChange<MindNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<MindEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: () => void;
  addChildNode: () => void;
  addSiblingNode: () => void;
  updateNode: (
    nodeId: string,
    updates: Partial<MindNode["data"]>,
  ) => void;
  reflowLayout: () => void;
  deleteSelection: () => void;
  deleteNode: (nodeId: string) => void;
  selectNodeByDirection: (direction: "up" | "down" | "left" | "right") => void;
  undo: () => void;
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;
  setCanvasInsertionPoint: (position: XYPosition) => void;
  clearFocusNode: () => void;
  clearRevealNode: () => void;
  focusInitialNode: () => void;
  refocusSelectedNode: () => void;
  toRecord: () => MindMapRecord | null;
};

function getParentNodeId(nodeId: string, edges: MindEdge[]) {
  return edges.find((edge) => edge.target === nodeId)?.source ?? null;
}

function getSiblingFallback(
  nodeId: string,
  nodes: MindNode[],
  edges: MindEdge[],
  deletedNodeIds: Set<string>,
) {
  const parentId = getParentNodeId(nodeId, edges);
  if (!parentId) return null;

  const siblings = edges
    .filter((edge) => edge.source === parentId && !deletedNodeIds.has(edge.target))
    .map((edge) => nodes.find((node) => node.id === edge.target))
    .filter((node): node is MindNode => Boolean(node))
    .sort((a, b) => a.position.y - b.position.y);

  const deletedNode = nodes.find((node) => node.id === nodeId);
  const aboveSiblings = deletedNode
    ? siblings.filter((sibling) => sibling.position.y < deletedNode.position.y)
    : [];
  const aboveSibling = aboveSiblings[aboveSiblings.length - 1] ?? null;

  return aboveSibling?.id ?? parentId;
}

function getDeleteFallbackNodeId(
  state: Pick<MindMapState, "nodes" | "edges" | "selectedNodeId" | "branchRootId">,
  deletedNodeIds: Set<string>,
) {
  const primaryId = state.selectedNodeId ?? state.branchRootId;
  if (primaryId && deletedNodeIds.has(primaryId)) {
    return getSiblingFallback(primaryId, state.nodes, state.edges, deletedNodeIds);
  }

  if (primaryId && state.nodes.some((node) => node.id === primaryId)) {
    return primaryId;
  }

  return state.nodes.find((node) => !deletedNodeIds.has(node.id))?.id ?? null;
}

function getDescendantNodeIds(nodeIds: Set<string>, edges: MindEdge[]) {
  const result = new Set(nodeIds);
  let didAddNode = true;

  while (didAddNode) {
    didAddNode = false;
    for (const edge of edges) {
      if (result.has(edge.source) && !result.has(edge.target)) {
        result.add(edge.target);
        didAddNode = true;
      }
    }
  }

  return result;
}

function getChildNodeIds(nodeId: string, edges: MindEdge[]) {
  return edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
}

function getNodeCenter(node: MindNode) {
  const width = node.data.width ?? node.width ?? DEFAULT_NODE_WIDTH;
  const height = node.data.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2,
  };
}

function getClosestNodeInDirection(
  nodes: MindNode[],
  selectedNodeId: string | null,
  direction: "up" | "down" | "left" | "right",
) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) return null;

  const selectedCenter = getNodeCenter(selectedNode);
  let closestNodeId: string | null = null;
  let closestScore = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.id === selectedNode.id) continue;

    const center = getNodeCenter(node);
    const dx = center.x - selectedCenter.x;
    const dy = center.y - selectedCenter.y;
    const isCandidate =
      (direction === "up" && dy < -1) ||
      (direction === "down" && dy > 1) ||
      (direction === "left" && dx < -1) ||
      (direction === "right" && dx > 1);

    if (!isCandidate) continue;

    const isHorizontal = direction === "left" || direction === "right";
    const primary = Math.abs(isHorizontal ? dx : dy);
    const secondary = Math.abs(isHorizontal ? dy : dx);
    const score = primary * 1.4 + secondary;

    if (score < closestScore) {
      closestNodeId = node.id;
      closestScore = score;
    }
  }

  return closestNodeId;
}

function hasDirtyNodeChanges(changes: NodeChange<MindNode>[]) {
  return changes.some(
    (change) => change.type !== "select" && change.type !== "dimensions",
  );
}

function hasDirtyEdgeChanges(changes: EdgeChange<MindEdge>[]) {
  return changes.some((change) => change.type !== "select");
}

function createHistorySnapshot(state: MindMapState): HistorySnapshot {
  return {
    title: state.title,
    nodes: state.nodes,
    edges: state.edges,
    viewport: state.viewport,
  };
}

function pushHistory(state: MindMapState) {
  return [...state.history, createHistorySnapshot(state)].slice(
    -MAX_HISTORY_LENGTH,
  );
}

function createMindNode(position: XYPosition): MindNode {
  return {
    id: createId("node"),
    type: "mindNode",
    position,
    data: {
      text: "",
      note: "",
      color: "#ffffff",
    },
  };
}

function markSelected(nodes: MindNode[], selectedNodeId: string | null) {
  return nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
  }));
}

function commitCreatedNode(
  state: MindMapState,
  newNode: MindNode,
  parentNodeId: string | null,
  options: { afterNodeId?: string; reveal?: boolean } = {},
) {
  const newEdge =
    parentNodeId == null
      ? null
      : {
          id: createId("edge"),
          source: parentNodeId,
          target: newNode.id,
          type: "smoothstep",
        };
  const siblingEdgeIndex =
    newEdge && options.afterNodeId
      ? state.edges.findIndex(
          (edge) => edge.source === parentNodeId && edge.target === options.afterNodeId,
        )
      : -1;
  const edges =
    newEdge && siblingEdgeIndex >= 0
      ? [
          ...state.edges.slice(0, siblingEdgeIndex + 1),
          newEdge,
          ...state.edges.slice(siblingEdgeIndex + 1),
        ]
      : newEdge
        ? [...state.edges, newEdge]
        : state.edges;
  const rootNodeIndex =
    parentNodeId == null && options.afterNodeId
      ? state.nodes.findIndex((node) => node.id === options.afterNodeId)
      : -1;
  const nextNodes =
    rootNodeIndex >= 0
      ? [
          ...state.nodes.slice(0, rootNodeIndex + 1),
          newNode,
          ...state.nodes.slice(rootNodeIndex + 1),
        ]
      : [...state.nodes, newNode];
  const selectedNodes = markSelected(nextNodes, newNode.id);

  return {
    nodes: parentNodeId
      ? layoutMindMap(selectedNodes, edges, { packRoots: false })
      : selectedNodes,
    edges,
    selectedNodeId: newNode.id,
    branchRootId: newNode.id,
    focusNodeId: newNode.id,
    revealNodeId: (options.reveal ?? parentNodeId != null) ? newNode.id : null,
    pendingNodePosition: null,
    selectedEdgeIds: [],
    dirtyRevision: state.dirtyRevision + 1,
    saveState: "idle" as SaveState,
  };
}

function deleteNodesFromState(
  state: MindMapState,
  selectedNodeIds: Set<string>,
  selectedEdgeIds = new Set<string>(),
) {
  const nodeIdsToDelete = getDescendantNodeIds(selectedNodeIds, state.edges);
  const fallbackNodeId = getDeleteFallbackNodeId(state, nodeIdsToDelete);
  const edges = state.edges.filter(
    (edge) =>
      !selectedEdgeIds.has(edge.id) &&
      !nodeIdsToDelete.has(edge.source) &&
      !nodeIdsToDelete.has(edge.target),
  );
  const nodes = markSelected(
    state.nodes.filter((node) => !nodeIdsToDelete.has(node.id)),
    fallbackNodeId,
  );

  return {
    nodes: layoutMindMap(nodes, edges),
    edges,
    selectedNodeId: fallbackNodeId,
    branchRootId: fallbackNodeId,
    focusNodeId: fallbackNodeId,
    selectedEdgeIds: [],
    revealNodeId: fallbackNodeId,
    history: pushHistory(state),
    dirtyRevision: state.dirtyRevision + 1,
    saveState: "idle" as SaveState,
  };
}

function summarize(map: MindMapRecord): MindMapSummary {
  return {
    id: map.id,
    title: map.title,
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
    deletedAt: map.deletedAt,
  };
}

function readRecordState(map: MindMapRecord) {
  const normalizedNodes = map.nodes.map((node) =>
    node.data.text === "Central idea"
      ? { ...node, data: { ...node.data, text: "" } }
      : node,
  );
  const rootNodeId = normalizedNodes[0]?.id ?? null;
  const nodes = markSelected(normalizedNodes, rootNodeId);

  return {
    activeMapId: map.id,
    title: map.title,
    nodes,
    edges: map.edges,
    viewport: map.viewport,
    selectedNodeId: rootNodeId,
    branchRootId: rootNodeId,
    focusNodeId:
      rootNodeId && nodes.length === 1 && nodes[0].data.text.trim() === ""
        ? rootNodeId
        : null,
    revealNodeId: null,
    pendingNodePosition: null,
    selectedEdgeIds: [],
    dirtyRevision: 0,
    savedRevision: 0,
    history: map.history ?? [],
  };
}

export const useMindMapStore = create<MindMapState>()((set, get) => ({
  maps: [],
  trashMaps: [],
  activeMapId: null,
  title: "",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  branchRootId: null,
  focusNodeId: null,
  revealNodeId: null,
  pendingNodePosition: null,
  selectedEdgeIds: [],
  isLoading: true,
  isHydrated: false,
  saveState: "idle",
  dirtyRevision: 0,
  savedRevision: 0,
  history: [],

  loadMaps: async () => {
    set({ isLoading: true });
    const cutoff = new Date(
      Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    await deleteExpiredMaps(cutoff);
    const summaries = await listMapSummaries();
    const trashMaps = await listDeletedMapSummaries();

    if (summaries.length === 0) {
      const map = createEmptyMap("First mind map");
      await putMap(map);
      set({
        maps: [summarize(map)],
        trashMaps,
        ...readRecordState(map),
        isLoading: false,
        isHydrated: true,
        saveState: "saved",
        dirtyRevision: 0,
        savedRevision: 0,
        history: [],
      });
      return;
    }

    const firstMap = await getMap(summaries[0].id);
    if (!firstMap) {
      set({ maps: summaries, trashMaps, isLoading: false, isHydrated: true });
      return;
    }

    set({
      maps: summaries,
      trashMaps,
      ...readRecordState(firstMap),
      isLoading: false,
      isHydrated: true,
      saveState: "saved",
      dirtyRevision: 0,
      savedRevision: 0,
      history: [],
    });
  },

  createMap: async () => {
    const map = createEmptyMap(`Mind map ${get().maps.length + 1}`);
    await putMap(map);
    set((state) => ({
      maps: [summarize(map), ...state.maps],
      trashMaps: state.trashMaps,
      ...readRecordState(map),
      saveState: "saved",
      dirtyRevision: 0,
      savedRevision: 0,
      history: [],
    }));
  },

  selectMap: async (mapId) => {
    const map = await getMap(mapId);
    if (!map) return;

    set({
      ...readRecordState(map),
      saveState: "saved",
      dirtyRevision: 0,
      savedRevision: 0,
      history: [],
    });
  },

  removeActiveMap: async () => {
    const state = get();
    const { activeMapId, maps } = state;
    if (!activeMapId) return;

    const record = state.toRecord();
    if (!record) return;

    const deletedRecord = {
      ...record,
      deletedAt: nowIso(),
      history: state.history,
    };
    await putMap(deletedRecord);
    const remaining = maps.filter((map) => map.id !== activeMapId);
    const trashMaps = await listDeletedMapSummaries();

    if (remaining.length === 0) {
      const replacement = createEmptyMap("First mind map");
      await putMap(replacement);
      set({
        maps: [summarize(replacement)],
        trashMaps,
        ...readRecordState(replacement),
        saveState: "saved",
        dirtyRevision: 0,
        savedRevision: 0,
        history: [],
      });
      return;
    }

    const nextMap = await getMap(remaining[0].id);
    set({
      maps: remaining,
      trashMaps,
      ...(nextMap ? readRecordState(nextMap) : {}),
      saveState: "saved",
      dirtyRevision: 0,
      savedRevision: 0,
      history: [],
    });
  },

  restoreMap: async (mapId) => {
    const map = await getMap(mapId);
    if (!map) return;

    const restoredMap = {
      ...map,
      deletedAt: null,
      updatedAt: nowIso(),
    };
    await putMap(restoredMap);

    const maps = await listMapSummaries();
    const trashMaps = await listDeletedMapSummaries();

    set({
      maps,
      trashMaps,
      ...readRecordState(restoredMap),
      saveState: "saved",
      dirtyRevision: 0,
      savedRevision: 0,
      history: restoredMap.history ?? [],
    });
  },

  markSaved: (revision) =>
    set((state) =>
      state.dirtyRevision === revision
        ? { saveState: "saved", savedRevision: revision }
        : {},
    ),
  markSaving: (revision) =>
    set((state) =>
      state.dirtyRevision === revision ? { saveState: "saving" } : {},
    ),
  markSaveError: () => set({ saveState: "error" }),

  setTitle: (title) =>
    set((state) => ({
      title,
      maps: state.maps.map((map) =>
        map.id === state.activeMapId ? { ...map, title } : map,
      ),
      history: pushHistory(state),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: "idle",
    })),

  setViewport: (viewport) =>
    set((state) => {
      const isSameViewport =
        state.viewport.x === viewport.x &&
        state.viewport.y === viewport.y &&
        state.viewport.zoom === viewport.zoom;

      return {
        viewport,
        ...(isSameViewport
          ? {}
          : {
              history: pushHistory(state),
              dirtyRevision: state.dirtyRevision + 1,
              saveState: "idle" as SaveState,
            }),
      };
    }),

  onNodesChange: (changes) =>
    set((state) => {
      const removedNodeIds = new Set(
        changes
          .filter((change) => change.type === "remove")
          .map((change) => change.id),
      );

      if (removedNodeIds.size === 0) {
        const changedNodes = applyNodeChanges(changes, state.nodes);
        const previousNodeById = new Map(
          state.nodes.map((node) => [node.id, node]),
        );
        const changedNodeById = new Map(
          changedNodes.map((node) => [node.id, node]),
        );
        const draggedRootChanges = changes.filter((change) => {
          if (change.type !== "position" || change.position == null) return false;

          const previousNode = previousNodeById.get(change.id);
          if (!previousNode) return false;

          return (
            getParentNodeId(change.id, state.edges) == null &&
            getChildNodeIds(change.id, state.edges).length > 0 &&
            (previousNode.position.x !== change.position.x ||
              previousNode.position.y !== change.position.y)
          );
        });

        const translatedDescendants = new Map<string, XYPosition>();
        for (const change of draggedRootChanges) {
          if (change.type !== "position" || change.position == null) continue;

          const previousNode = previousNodeById.get(change.id);
          if (!previousNode) continue;

          const dx = change.position.x - previousNode.position.x;
          const dy = change.position.y - previousNode.position.y;
          const descendants = getDescendantNodeIds(
            new Set(getChildNodeIds(change.id, state.edges)),
            state.edges,
          );

          for (const descendantId of descendants) {
            const currentNode =
              changedNodeById.get(descendantId) ?? previousNodeById.get(descendantId);
            if (!currentNode) continue;

            translatedDescendants.set(descendantId, {
              x: currentNode.position.x + dx,
              y: currentNode.position.y + dy,
            });
          }
        }

        const nodes =
          translatedDescendants.size === 0
            ? changedNodes
            : changedNodes.map((node) =>
                translatedDescendants.has(node.id)
                  ? { ...node, position: translatedDescendants.get(node.id)! }
                  : node,
              );

        return {
          nodes,
          ...(hasDirtyNodeChanges(changes)
            ? {
                history: pushHistory(state),
                dirtyRevision: state.dirtyRevision + 1,
                saveState: "idle" as SaveState,
              }
            : { saveState: state.saveState }),
        };
      }

      const fallbackNodeId = getDeleteFallbackNodeId(state, removedNodeIds);
      const edges = state.edges.filter(
        (edge) =>
          !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
      );
      const nodes = markSelected(
        applyNodeChanges(changes, state.nodes),
        fallbackNodeId,
      );

      return {
        nodes: layoutMindMap(nodes, edges),
        edges,
        selectedNodeId: fallbackNodeId,
        branchRootId: fallbackNodeId,
        focusNodeId: fallbackNodeId,
        history: pushHistory(state),
        dirtyRevision: state.dirtyRevision + 1,
        saveState: "idle",
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      ...(hasDirtyEdgeChanges(changes)
        ? {
            history: pushHistory(state),
            dirtyRevision: state.dirtyRevision + 1,
            saveState: "idle" as SaveState,
          }
        : { saveState: state.saveState }),
    })),

  onConnect: (connection) =>
    set((state) => {
      const edges = addEdge(
        {
          ...connection,
          id: createId("edge"),
          animated: false,
          type: "smoothstep",
        },
        state.edges,
      );

      return {
        edges,
        nodes: layoutMindMap(state.nodes, edges),
        history: pushHistory(state),
        dirtyRevision: state.dirtyRevision + 1,
        saveState: "idle",
      };
    }),

  addNode: () => get().addChildNode(),

  addChildNode: () =>
    set((state) => {
      const parentNode =
        state.pendingNodePosition == null
          ? (state.nodes.find((node) => node.id === state.branchRootId) ??
            state.nodes.find((node) => node.id === state.selectedNodeId))
          : null;
      const basePosition =
        state.pendingNodePosition ?? parentNode?.position ?? { x: 160, y: 160 };
      const newNode = createMindNode({
        x: parentNode ? basePosition.x + 210 : basePosition.x - DEFAULT_NODE_WIDTH / 2,
        y: parentNode ? basePosition.y : basePosition.y - DEFAULT_NODE_HEIGHT / 2,
      });

      return {
        ...commitCreatedNode(state, newNode, parentNode?.id ?? null),
        history: pushHistory(state),
      };
    }),

  addSiblingNode: () =>
    set((state) => {
      const selectedNode =
        state.nodes.find((node) => node.id === state.selectedNodeId) ??
        state.nodes.find((node) => node.id === state.branchRootId);
      if (!selectedNode) return state;

      const parentNodeId = getParentNodeId(selectedNode.id, state.edges);
      const newNode = createMindNode({
        x: selectedNode.position.x,
        y: selectedNode.position.y + DEFAULT_NODE_HEIGHT + 46,
      });

      return {
        ...commitCreatedNode(state, newNode, parentNodeId, {
          afterNodeId: selectedNode.id,
        }),
        history: pushHistory(state),
      };
    }),

  updateNode: (nodeId, updates) =>
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...updates } }
          : node,
      );
      const isTextOnlyUpdate =
        Object.keys(updates).length === 1 &&
        Object.prototype.hasOwnProperty.call(updates, "text");

      return {
        nodes: isTextOnlyUpdate
          ? nodes
          : layoutMindMap(nodes, state.edges, { packRoots: false }),
        history: pushHistory(state),
        dirtyRevision: state.dirtyRevision + 1,
        saveState: "idle",
      };
    }),

  reflowLayout: () =>
    set((state) => ({
      nodes: layoutMindMap(state.nodes, state.edges, { packRoots: false }),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: "idle",
    })),

  deleteSelection: () =>
    set((state) => {
      const selectedNodeIds = new Set(
        state.nodes.filter((node) => node.selected).map((node) => node.id),
      );
      if (state.selectedNodeId) selectedNodeIds.add(state.selectedNodeId);
      const selectedEdgeIds = new Set([
        ...state.selectedEdgeIds,
        ...state.edges.filter((edge) => edge.selected).map((edge) => edge.id),
      ]);
      if (
        selectedNodeIds.size === 0 &&
        selectedEdgeIds.size === 0 &&
        state.branchRootId
      ) {
        selectedNodeIds.add(state.branchRootId);
      }
      return deleteNodesFromState(state, selectedNodeIds, selectedEdgeIds);
    }),

  deleteNode: (nodeId) =>
    set((state) => deleteNodesFromState(state, new Set([nodeId]))),

  selectNodeByDirection: (direction) =>
    set((state) => {
      const selectedNodeId = getClosestNodeInDirection(
        state.nodes,
        state.selectedNodeId ?? state.branchRootId,
        direction,
      );
      if (!selectedNodeId) return {};

      return {
        nodes: markSelected(state.nodes, selectedNodeId),
        selectedNodeId,
        branchRootId: selectedNodeId,
        focusNodeId: selectedNodeId,
      };
    }),

  undo: () =>
    set((state) => {
      const snapshot = state.history[state.history.length - 1];
      if (!snapshot) return state;

      const selectedNodeId = snapshot.nodes[0]?.id ?? null;
      return {
        title: snapshot.title,
        nodes: markSelected(snapshot.nodes, selectedNodeId),
        edges: snapshot.edges,
        viewport: snapshot.viewport,
        selectedNodeId,
        branchRootId: selectedNodeId,
        focusNodeId: selectedNodeId,
        revealNodeId: selectedNodeId,
        selectedEdgeIds: [],
        history: state.history.slice(0, -1),
        dirtyRevision: state.dirtyRevision + 1,
        saveState: "idle",
      };
    }),

  setSelection: (nodeIds, edgeIds) =>
    set((state) => {
      const selectedNodeId = nodeIds[0] ?? null;
      return {
        selectedNodeId,
        branchRootId:
          selectedNodeId && selectedNodeId !== state.focusNodeId
            ? selectedNodeId
            : state.branchRootId,
        selectedEdgeIds: edgeIds,
      };
    }),

  setCanvasInsertionPoint: (position) =>
    set((state) => ({
      nodes: markSelected(state.nodes, null),
      selectedNodeId: null,
      branchRootId: null,
      focusNodeId: null,
      pendingNodePosition: position,
      selectedEdgeIds: [],
    })),

  clearFocusNode: () => set({ focusNodeId: null }),
  clearRevealNode: () => set({ revealNodeId: null }),
  refocusSelectedNode: () =>
    set((state) => ({
      focusNodeId: state.selectedNodeId ?? state.branchRootId,
    })),
  focusInitialNode: () =>
    set((state) => {
      const initialNode =
        state.nodes.find((node) => node.id === state.selectedNodeId) ??
        state.nodes[0];

      if (!initialNode || initialNode.data.text.trim() !== "") return {};

      return {
        nodes: markSelected(state.nodes, initialNode.id),
        selectedNodeId: initialNode.id,
        branchRootId: initialNode.id,
        focusNodeId: initialNode.id,
      };
    }),

  toRecord: () => {
    const state = get();
    if (!state.activeMapId) return null;

    const existing = state.maps.find((map) => map.id === state.activeMapId);
    const timestamp = nowIso();

    return {
      id: state.activeMapId,
      title: state.title.trim() || "Untitled map",
      nodes: state.nodes,
      edges: state.edges,
      viewport: state.viewport,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      history: state.history,
    };
  },
}));

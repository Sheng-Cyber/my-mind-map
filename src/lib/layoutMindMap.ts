import type { MindEdge, MindNode } from "../types/mindMap";
import { getAutoNodeWidth } from "./textLayout";

const HORIZONTAL_GAP = 92;
const VERTICAL_GAP = 38;
const TREE_GAP = 150;
const DEFAULT_NODE_HEIGHT = 42;

type Bounds = {
  height: number;
  width: number;
};

type Position = { x: number; y: number };

function getNodeWidth(node: MindNode) {
  return node.data.width ?? getAutoNodeWidth(node.data.text);
}

function getNodeHeight(node: MindNode) {
  return node.data.height ?? node.height ?? DEFAULT_NODE_HEIGHT;
}

export function layoutMindMap(nodes: MindNode[], edges: MindEdge[]) {
  if (nodes.length <= 1) return nodes;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set(edges.map((edge) => edge.target));
  const childrenById = new Map<string, string[]>();

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;

    childrenById.set(edge.source, [
      ...(childrenById.get(edge.source) ?? []),
      edge.target,
    ]);
  }

  function getChildren(nodeId: string) {
    return (childrenById.get(nodeId) ?? []).filter((childId) =>
      nodeById.has(childId),
    );
  }

  const boundsById = new Map<string, Bounds>();

  function measureSubtree(nodeId: string, seen = new Set<string>()): Bounds {
    const cachedBounds = boundsById.get(nodeId);
    if (cachedBounds) return cachedBounds;

    const node = nodeById.get(nodeId);
    if (!node || seen.has(nodeId)) return { height: DEFAULT_NODE_HEIGHT, width: 0 };

    seen.add(nodeId);
    const children = getChildren(nodeId);
    const nodeWidth = getNodeWidth(node);
    const nodeHeight = getNodeHeight(node);

    if (children.length === 0) {
      const bounds = { height: nodeHeight, width: nodeWidth };
      boundsById.set(nodeId, bounds);
      return bounds;
    }

    const childBounds = children.map((childId) =>
      measureSubtree(childId, new Set(seen)),
    );
    const childrenHeight =
      childBounds.reduce((height, bounds) => height + bounds.height, 0) +
      VERTICAL_GAP * (childBounds.length - 1);
    const childrenWidth = Math.max(...childBounds.map((bounds) => bounds.width));

    const bounds = {
      height: Math.max(nodeHeight, childrenHeight),
      width: nodeWidth + HORIZONTAL_GAP + childrenWidth,
    };
    boundsById.set(nodeId, bounds);
    return bounds;
  }

  const roots = nodes
    .filter((node) => !incoming.has(node.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const treeRoots = roots.length > 0 ? roots : nodes.slice(0, 1);
  const positioned = new Map<string, Position>();
  const placed = new Set<string>();

  for (const node of nodes) {
    measureSubtree(node.id);
  }

  function getTreeTopForRoot(root: MindNode, bounds: Bounds) {
    return root.position.y + getNodeHeight(root) / 2 - bounds.height / 2;
  }

  let nextTreeTop = Math.min(
    ...treeRoots.map((root) =>
      getTreeTopForRoot(
        root,
        boundsById.get(root.id) ?? {
          height: getNodeHeight(root),
          width: getNodeWidth(root),
        },
      ),
    ),
  );

  function placeTree(
    nodeId: string,
    x: number,
    top: number,
    seen = new Set<string>(),
  ) {
    const node = nodeById.get(nodeId);
    if (!node || seen.has(nodeId) || placed.has(nodeId)) return;

    seen.add(nodeId);
    placed.add(nodeId);

    const children = getChildren(nodeId);
    const subtreeHeight = boundsById.get(nodeId)?.height ?? getNodeHeight(node);
    const nodeHeight = getNodeHeight(node);
    const nodeWidth = getNodeWidth(node);

    positioned.set(nodeId, {
      x,
      y: top + subtreeHeight / 2 - nodeHeight / 2,
    });

    if (children.length === 0) return;

    const childTotalHeight =
      children.reduce(
        (height, childId) => height + (boundsById.get(childId)?.height ?? 0),
        0,
      ) + VERTICAL_GAP * (children.length - 1);
    let childTop = top + subtreeHeight / 2 - childTotalHeight / 2;

    for (const childId of children) {
      const childHeight = boundsById.get(childId)?.height ?? DEFAULT_NODE_HEIGHT;
      placeTree(childId, x + nodeWidth + HORIZONTAL_GAP, childTop, new Set(seen));
      childTop += childHeight + VERTICAL_GAP;
    }
  }

  for (const root of treeRoots) {
    if (placed.has(root.id)) continue;

    const rootBounds = boundsById.get(root.id) ?? {
      height: getNodeHeight(root),
      width: getNodeWidth(root),
    };
    const treeTop = Math.max(getTreeTopForRoot(root, rootBounds), nextTreeTop);

    placeTree(root.id, root.position.x, treeTop);
    nextTreeTop = treeTop + rootBounds.height + TREE_GAP;
  }

  for (const node of nodes) {
    if (positioned.has(node.id)) continue;

    const nodeBounds = boundsById.get(node.id) ?? {
      height: getNodeHeight(node),
      width: getNodeWidth(node),
    };
    const treeTop = Math.max(getTreeTopForRoot(node, nodeBounds), nextTreeTop);

    placeTree(node.id, node.position.x, treeTop);
    nextTreeTop = treeTop + nodeBounds.height + TREE_GAP;
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) ?? node.position,
  }));
}

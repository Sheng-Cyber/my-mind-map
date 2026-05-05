import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";
import { useMindMapStore } from "../../store/mindMapStore";
import { MindNode } from "./MindNode";
import type { MindNode as MindNodeType } from "../../types/mindMap";

const nodeTypes: NodeTypes = {
  mindNode: MindNode,
};

const DEFAULT_NODE_WIDTH = 112;
const DEFAULT_NODE_HEIGHT = 42;
const REVEAL_MARGIN = {
  bottom: 56,
  left: 48,
  right: 56,
  top: 88,
};

function hasMapContent(nodes: MindNodeType[]) {
  return nodes.length > 1 || nodes.some((node) => node.data.text.trim() !== "");
}

function getRevealOffset(
  node: MindNodeType,
  viewport: Viewport,
  canvas: DOMRect,
) {
  const width =
    node.measured?.width ?? node.width ?? node.data.width ?? DEFAULT_NODE_WIDTH;
  const height =
    node.measured?.height ??
    node.height ??
    node.data.height ??
    DEFAULT_NODE_HEIGHT;
  const nodeBounds = {
    bottom: (node.position.y + height) * viewport.zoom + viewport.y,
    left: node.position.x * viewport.zoom + viewport.x,
    right: (node.position.x + width) * viewport.zoom + viewport.x,
    top: node.position.y * viewport.zoom + viewport.y,
  };
  const visible = {
    bottom: canvas.height - REVEAL_MARGIN.bottom,
    left: REVEAL_MARGIN.left,
    right: canvas.width - REVEAL_MARGIN.right,
    top: REVEAL_MARGIN.top,
  };

  return {
    x:
      nodeBounds.left < visible.left
        ? visible.left - nodeBounds.left
        : Math.min(0, visible.right - nodeBounds.right),
    y:
      nodeBounds.top < visible.top
        ? visible.top - nodeBounds.top
        : Math.min(0, visible.bottom - nodeBounds.bottom),
  };
}

export function MindMapCanvas() {
  const canvasRef = useRef<HTMLElement | null>(null);
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const onNodesChange = useMindMapStore((state) => state.onNodesChange);
  const onEdgesChange = useMindMapStore((state) => state.onEdgesChange);
  const onConnect = useMindMapStore((state) => state.onConnect);
  const saveViewport = useMindMapStore((state) => state.setViewport);
  const setSelection = useMindMapStore((state) => state.setSelection);
  const setCanvasInsertionPoint = useMindMapStore(
    (state) => state.setCanvasInsertionPoint,
  );
  const revealNodeId = useMindMapStore((state) => state.revealNodeId);
  const clearRevealNode = useMindMapStore((state) => state.clearRevealNode);
  const activeMapId = useMindMapStore((state) => state.activeMapId);
  const {
    fitView,
    getViewport,
    screenToFlowPosition,
    setViewport: setFlowViewport,
  } = useReactFlow();
  const fitViewRef = useRef(fitView);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    fitViewRef.current = fitView;
  }, [fitView]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const selectionHandler = useMemo(
    () =>
      ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
        setSelection(
          selectedNodes.map((node) => node.id),
          selectedEdges.map((edge) => edge.id),
        );
      },
    [setSelection],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const hasContent = hasMapContent(nodesRef.current);

      void fitViewRef.current({
        duration: 260,
        maxZoom: hasContent ? 1.18 : 0.9,
        minZoom: 0.2,
        padding: hasContent ? 0.03 : 0.22,
      });
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [activeMapId]);

  useEffect(() => {
    if (!revealNodeId) return;

    const timeoutId = window.setTimeout(() => {
      const node = nodes.find((item) => item.id === revealNodeId);
      const canvas = canvasRef.current;
      if (!node || !canvas) {
        clearRevealNode();
        return;
      }

      const viewport = getViewport();
      const bounds = canvas.getBoundingClientRect();
      const offset = getRevealOffset(node, viewport, bounds);

      if (offset.x !== 0 || offset.y !== 0) {
        void setFlowViewport(
          {
            x: viewport.x + offset.x,
            y: viewport.y + offset.y,
            zoom: viewport.zoom,
          },
          { duration: 180 },
        );
      }

      clearRevealNode();
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [
    clearRevealNode,
    getViewport,
    nodes,
    revealNodeId,
    setFlowViewport,
  ]);

  return (
    <section className="h-full min-h-0 min-w-0 bg-slate-50" ref={canvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onMoveEnd={(_, nextViewport) => saveViewport(nextViewport)}
        onPaneClick={(event) =>
          setCanvasInsertionPoint(
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          )
        }
        onSelectionChange={selectionHandler}
        autoPanOnNodeFocus={false}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{ type: "smoothstep", interactionWidth: 18 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="#d9e1ef"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <Controls className="!border !border-slate-200 !shadow-panel" />
      </ReactFlow>
    </section>
  );
}

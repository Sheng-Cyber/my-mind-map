import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampNodeHeight,
  clampNodeWidth,
  getAutoNodeWidth,
} from "../../lib/textLayout";
import { useMindMapStore } from "../../store/mindMapStore";
import type { MindNode as MindNodeType } from "../../types/mindMap";

export function MindNode({ data, id, selected }: NodeProps<MindNodeType>) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const addChildNode = useMindMapStore((state) => state.addChildNode);
  const addSiblingNode = useMindMapStore((state) => state.addSiblingNode);
  const deleteNode = useMindMapStore((state) => state.deleteNode);
  const selectNodeByDirection = useMindMapStore(
    (state) => state.selectNodeByDirection,
  );
  const updateNode = useMindMapStore((state) => state.updateNode);
  const reflowLayout = useMindMapStore((state) => state.reflowLayout);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const branchRootId = useMindMapStore((state) => state.branchRootId);
  const focusNodeId = useMindMapStore((state) => state.focusNodeId);
  const clearFocusNode = useMindMapStore((state) => state.clearFocusNode);
  const reflowTimeoutRef = useRef<number | null>(null);
  const skipNextBlurReflowRef = useRef(false);
  const width = data.width ?? getAutoNodeWidth(data.text);
  const height = data.height;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [data.text]);

  useLayoutEffect(() => {
    if (focusNodeId !== id) return;

    function focusTextarea() {
      const textarea = textareaRef.current;
      if (!textarea) return false;

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
        const cursorPosition = textarea.value.length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
      }

      return document.activeElement === textarea;
    }

    const animationFrameId = window.requestAnimationFrame(focusTextarea);
    const focusDelays = [40, 120, 240, 420, 700];
    const timeoutIds = focusDelays.map((delay, index) =>
      window.setTimeout(() => {
        focusTextarea();
        if (index === focusDelays.length - 1) {
          clearFocusNode();
        }
      }, delay),
    );

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [clearFocusNode, focusNodeId, id]);

  const isSelected = selected || selectedNodeId === id;
  const isBranchRoot = branchRootId === id && selectedNodeId !== id;
  const clearScheduledReflow = useCallback(() => {
    if (reflowTimeoutRef.current != null) {
      window.clearTimeout(reflowTimeoutRef.current);
      reflowTimeoutRef.current = null;
    }
  }, []);

  const scheduleReflow = useCallback(() => {
    clearScheduledReflow();
    reflowTimeoutRef.current = window.setTimeout(() => {
      reflowLayout();
      reflowTimeoutRef.current = null;
    }, 650);
  }, [clearScheduledReflow, reflowLayout]);

  const flushReflow = useCallback(() => {
    if (skipNextBlurReflowRef.current) {
      skipNextBlurReflowRef.current = false;
      return;
    }

    clearScheduledReflow();
    reflowLayout();
  }, [clearScheduledReflow, reflowLayout]);

  useLayoutEffect(() => {
    return clearScheduledReflow;
  }, [clearScheduledReflow]);

  const resizeNode = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = width;
      const startHeight =
        height ?? event.currentTarget.parentElement?.offsetHeight ?? 42;

      function handlePointerMove(moveEvent: PointerEvent) {
        updateNode(id, {
          width: clampNodeWidth(startWidth + moveEvent.clientX - startX),
          height: clampNodeHeight(startHeight + moveEvent.clientY - startY),
        });
      }

      function handlePointerUp() {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [height, id, updateNode, width],
  );

  return (
    <div
      className={`relative min-w-28 max-w-[340px] rounded-md border px-3 py-2 shadow-panel transition ${
        isSelected
          ? "border-blue-500 ring-4 ring-blue-100"
          : isBranchRoot
            ? "border-emerald-500 ring-4 ring-emerald-100"
          : "border-slate-200 hover:border-slate-300"
      }`}
      style={{ backgroundColor: data.color ?? "#ffffff", height, width }}
    >
      <Handle position={Position.Left} type="target" />
      <textarea
        aria-label="Node text"
        className="nodrag nowheel block min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-center text-sm font-semibold leading-6 text-slate-900 outline-none placeholder:text-slate-400"
        onBlur={flushReflow}
        onChange={(event) => {
          updateNode(id, { text: event.target.value });
          scheduleReflow();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            clearScheduledReflow();
            skipNextBlurReflowRef.current = true;
            addSiblingNode();
          }
          if (event.key === "Tab") {
            event.preventDefault();
            clearScheduledReflow();
            skipNextBlurReflowRef.current = true;
            addChildNode();
          }
          if (
            (event.key === "Backspace" || event.key === "Delete") &&
            data.text.trim() === ""
          ) {
            event.preventDefault();
            clearScheduledReflow();
            skipNextBlurReflowRef.current = true;
            deleteNode(id);
          }
          if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight"
          ) {
            event.preventDefault();
            const direction = event.key.replace("Arrow", "").toLowerCase() as
              | "up"
              | "down"
              | "left"
              | "right";
            selectNodeByDirection(direction);
          }
        }}
        placeholder="Title"
        ref={textareaRef}
        rows={1}
        style={{ overflowWrap: "break-word" }}
        value={data.text}
      />
      {data.note ? (
        <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">
          {data.note}
        </div>
      ) : null}
      <Handle position={Position.Right} type="source" />
      {isSelected ? (
        <button
          aria-label="Resize node"
          className="nodrag nowheel absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-br-md rounded-tl-md border-l border-t border-slate-200 bg-white/80"
          onDoubleClick={(event) => {
            event.stopPropagation();
            updateNode(id, { height: undefined, width: undefined });
          }}
          onPointerDown={resizeNode}
          type="button"
        />
      ) : null}
    </div>
  );
}

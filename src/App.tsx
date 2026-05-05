import { useEffect, useState } from "react";
import { MindMapCanvas } from "./components/canvas/MindMapCanvas";
import { LeftSidebar } from "./components/layout/LeftSidebar";
import { TopToolbar } from "./components/layout/TopToolbar";
import { useAutoSave } from "./hooks/useAutoSave";
import { useMindMapStore } from "./store/mindMapStore";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const loadMaps = useMindMapStore((state) => state.loadMaps);
  const isLoading = useMindMapStore((state) => state.isLoading);
  const focusInitialNode = useMindMapStore((state) => state.focusInitialNode);
  const refocusSelectedNode = useMindMapStore((state) => state.refocusSelectedNode);
  const pendingNodePosition = useMindMapStore((state) => state.pendingNodePosition);
  const addNode = useMindMapStore((state) => state.addNode);
  const selectNodeByDirection = useMindMapStore(
    (state) => state.selectNodeByDirection,
  );
  const undo = useMindMapStore((state) => state.undo);

  useAutoSave();

  useEffect(() => {
    void loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    if (isLoading) return;

    const timeoutId = window.setTimeout(focusInitialNode, 120);
    return () => window.clearTimeout(timeoutId);
  }, [focusInitialNode, isLoading]);

  function closeSidebar() {
    setIsSidebarOpen(false);
    window.setTimeout(refocusSelectedNode, 80);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        pendingNodePosition &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        addNode();
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
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addNode, pendingNodePosition, selectNodeByDirection, undo]);

  if (isLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        Loading mind maps...
      </main>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden bg-slate-50 text-slate-900">
      <MindMapCanvas />
      <TopToolbar onToggleSidebar={() => setIsSidebarOpen(true)} />
      <LeftSidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
      />
    </main>
  );
}

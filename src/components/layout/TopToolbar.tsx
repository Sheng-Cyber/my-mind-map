import { Button } from "../ui/Button";
import { useMindMapStore } from "../../store/mindMapStore";

type TopToolbarProps = {
  onToggleSidebar: () => void;
};

export function TopToolbar({ onToggleSidebar }: TopToolbarProps) {
  const title = useMindMapStore((state) => state.title);
  const setTitle = useMindMapStore((state) => state.setTitle);
  const createMap = useMindMapStore((state) => state.createMap);
  const removeActiveMap = useMindMapStore((state) => state.removeActiveMap);
  const activeMapId = useMindMapStore((state) => state.activeMapId);

  return (
    <header className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3">
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white/95 p-2 shadow-panel backdrop-blur">
        <Button
          aria-label="Open maps"
          className="h-9 w-9 shrink-0 px-0"
          onClick={onToggleSidebar}
          variant="ghost"
        >
          ☰
        </Button>
        <input
          aria-label="Map title"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
          thinking...
        </span>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white/95 p-2 shadow-panel backdrop-blur">
        <Button onClick={() => void createMap()} variant="primary">
          New
        </Button>
        <Button
          disabled={!activeMapId}
          onClick={() => void removeActiveMap()}
          variant="secondary"
        >
          Delete
        </Button>
      </div>
    </header>
  );
}

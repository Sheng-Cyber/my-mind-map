import { Button } from "../ui/Button";
import { useMindMapStore } from "../../store/mindMapStore";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

type LeftSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LeftSidebar({ isOpen, onClose }: LeftSidebarProps) {
  const maps = useMindMapStore((state) => state.maps);
  const trashMaps = useMindMapStore((state) => state.trashMaps);
  const activeMapId = useMindMapStore((state) => state.activeMapId);
  const createMap = useMindMapStore((state) => state.createMap);
  const selectMap = useMindMapStore((state) => state.selectMap);
  const removeActiveMap = useMindMapStore((state) => state.removeActiveMap);
  const restoreMap = useMindMapStore((state) => state.restoreMap);

  return (
    <>
      <button
        aria-label="Close maps"
        className={`absolute inset-0 z-30 bg-slate-950/10 transition ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        type="button"
      />
      <aside
        className={`absolute bottom-0 left-0 top-0 z-40 flex w-[280px] min-h-0 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-950">
              Mind Maps
            </h1>
            <p className="text-xs text-slate-500">Local workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              aria-label="Create map"
              className="h-8 w-8 px-0 text-lg"
              onClick={() => void createMap()}
              variant="primary"
            >
              +
            </Button>
            <Button
              aria-label="Close sidebar"
              className="h-8 w-8 px-0"
              onClick={onClose}
              variant="ghost"
            >
              ×
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Maps
          </div>
          {maps.map((map) => {
            const isActive = map.id === activeMapId;
            return (
              <button
                className={`mb-2 w-full rounded-md border p-3 text-left transition ${
                  isActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
                key={map.id}
                onClick={() => {
                  void selectMap(map.id);
                  onClose();
                }}
                type="button"
              >
                <span className="block truncate text-sm font-medium text-slate-900">
                  {map.title || "Untitled map"}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Updated {formatDate(map.updatedAt)}
                </span>
              </button>
            );
          })}

          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Trash
              </span>
              <span className="text-xs text-slate-400">30 days</span>
            </div>

            {trashMaps.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                Empty
              </div>
            ) : (
              trashMaps.map((map) => (
                <div
                  className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                  key={map.id}
                >
                  <div className="truncate text-sm font-medium text-slate-700">
                    {map.title || "Untitled map"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Deleted {formatDate(map.deletedAt ?? map.updatedAt)}
                  </div>
                  <Button
                    className="mt-3 h-8 w-full"
                    onClick={() => {
                      void restoreMap(map.id);
                      onClose();
                    }}
                    variant="secondary"
                  >
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 p-3">
          <Button
            className="w-full"
            disabled={!activeMapId}
            onClick={() => void removeActiveMap()}
            variant="danger"
          >
            Delete map
          </Button>
        </div>
      </aside>
    </>
  );
}

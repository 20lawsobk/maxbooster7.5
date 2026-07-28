import { useEffect, useRef, useState, useCallback } from "react";
import { useStudioStore } from "@/lib/studioStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Play, Square, SkipForward, SkipBack, X, Maximize, Minimize, Plus, Trash2, GripVertical, Music, Activity, FileText } from "lucide-react";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ShowPage() {
  const {
    showShowPage,
    toggleShowPage,
    setlists,
    activeSetlistId,
    setActiveSetlist,
    performanceState,
    startPerformance,
    stopPerformance,
    nextItem,
    previousItem,
    goToItem,
    updatePerformanceElapsedTime,
    getActiveSetlist,
    getCurrentSetlistItem,
    getNextSetlistItem,
    addItemToSetlist,
    removeItemFromSetlist,
    reorderSetlistItems,
    createSetlist,
  } = useStudioStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAddSongDialog, setShowAddSongDialog] = useState(false);
  const [showNewSetlistDialog, setShowNewSetlistDialog] = useState(false);
  const [newSongName, setNewSongName] = useState("");
  const [newSongBpm, setNewSongBpm] = useState("120");
  const [newSongKey, setNewSongKey] = useState("C");
  const [newSongDuration, setNewSongDuration] = useState("180");
  const [newSongNotes, setNewSongNotes] = useState("");
  const [newSetlistName, setNewSetlistName] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [itemElapsedTime, setItemElapsedTime] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useRef<NodeJS.Timeout | null>(null);

  const activeSetlist = getActiveSetlist();
  const currentItem = getCurrentSetlistItem();
  const nextItemData = getNextSetlistItem();

  useEffect(() => {
    if (performanceState.isPerforming) {
      elapsedIntervalRef.current = setInterval(() => {
        updatePerformanceElapsedTime(performanceState.elapsedTime + 1);
        setItemElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    }
    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    };
  }, [
    performanceState.isPerforming,
    performanceState.elapsedTime,
    updatePerformanceElapsedTime,
  ]);

  useEffect(() => {
    setItemElapsedTime(0);
  }, [performanceState.currentItemIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showShowPage) return;

      if (e.key === "Escape") {
        if (isFullscreen) {
          document.exitFullscreen();
          setIsFullscreen(false);
        } else {
          toggleShowPage();
        }
      } else if (e.key === "ArrowRight" || e.key === " ") {
        if (performanceState.isPerforming) {
          nextItem();
        }
      } else if (e.key === "ArrowLeft") {
        if (performanceState.isPerforming) {
          previousItem();
        }
      } else if (
        e.key === "Enter" &&
        !showAddSongDialog &&
        !showNewSetlistDialog
      ) {
        if (performanceState.isPerforming) {
          stopPerformance();
        } else {
          startPerformance();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showShowPage,
    isFullscreen,
    performanceState.isPerforming,
    toggleShowPage,
    nextItem,
    previousItem,
    startPerformance,
    stopPerformance,
    showAddSongDialog,
    showNewSetlistDialog,
  ]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  const handleAddSong = () => {
    if (activeSetlistId && newSongName.trim()) {
      addItemToSetlist(activeSetlistId, {
        name: newSongName.trim(),
        bpm: parseInt(newSongBpm) || 120,
        key: newSongKey || "C",
        duration: parseInt(newSongDuration) || 180,
        notes: newSongNotes.trim() || undefined,
      });
      setNewSongName("");
      setNewSongBpm("120");
      setNewSongKey("C");
      setNewSongDuration("180");
      setNewSongNotes("");
      setShowAddSongDialog(false);
    }
  };

  const handleCreateSetlist = () => {
    if (newSetlistName.trim()) {
      createSetlist(newSetlistName.trim());
      setNewSetlistName("");
      setShowNewSetlistDialog(false);
    }
  };

  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!activeSetlist || !draggedItemId) return;

    const draggedItem = activeSetlist.items.find((i) => i.id === draggedItemId);
    if (!draggedItem) return;

    const newOrder = activeSetlist.items
      .filter((i) => i.id !== draggedItemId)
      .map((i) => i.id);
    newOrder.splice(targetIndex, 0, draggedItemId);
    reorderSetlistItems(activeSetlistId!, newOrder);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
  };

  if (!showShowPage) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex"
      style={{
        background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)",
      }}
    >
      {/* Setlist Sidebar */}
      <div
        className="w-80 border-r flex flex-col"
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          borderColor: "rgba(255, 255, 255, 0.1)",
        }}
      >
        <div
          className="p-4 border-b"
          style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Music className="w-5 h-5 text-green-400" />
              Setlist
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setShowNewSetlistDialog(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {setlists.length > 1 && (
            <select
              className="w-full px-3 py-2 rounded-md text-sm bg-white/10 text-white border border-white/20 focus:outline-none focus:border-green-400"
              value={activeSetlistId || ""}
              onChange={(e) => setActiveSetlist(e.target.value || null)}
            >
              {setlists.map((s) => (
                <option key={s.id} value={s.id} className="bg-gray-900">
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {activeSetlist?.items.map((item, index) => {
              const isCurrent =
                performanceState.isPerforming &&
                performanceState.currentItemIndex === index;
              const isNext =
                performanceState.isPerforming &&
                performanceState.currentItemIndex + 1 === index;

              return (
                <div
                  key={item.id}
                  draggable={!performanceState.isPerforming}
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (performanceState.isPerforming) {
                      goToItem(index);
                    }
                  }}
                  className={`
                    group flex items-center gap-2 p-3 rounded-lg mb-1 cursor-pointer transition-all
                    ${isCurrent ? "bg-green-500/30 border-2 border-green-400" : ""}
                    ${isNext ? "bg-blue-500/20 border border-blue-400/50" : ""}
                    ${!isCurrent && !isNext ? "hover:bg-white/10 border border-transparent" : ""}
                  `}
                  style={{
                    opacity: draggedItemId === item.id ? 0.5 : 1,
                  }}
                >
                  {!performanceState.isPerforming && (
                    <GripVertical className="w-4 h-4 text-white/30 cursor-grab" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`
                        text-xs font-mono px-1.5 py-0.5 rounded
                        ${isCurrent ? "bg-green-400 text-black" : "bg-white/20 text-white/70"}
                      `}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`font-medium truncate ${isCurrent ? "text-green-300" : "text-white"}`}
                      >
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-white/50">
                      <span>{formatDuration(item.duration)}</span>
                      <span>{item.bpm} BPM</span>
                      <span>{item.key}</span>
                    </div>
                  </div>
                  {!performanceState.isPerforming && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/20 h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeSetlistId) {
                          removeItemFromSetlist(activeSetlistId, item.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}

            {!performanceState.isPerforming && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-white/50 hover:text-white hover:bg-white/10 border border-dashed border-white/20"
                onClick={() => setShowAddSongDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Song
              </Button>
            )}
          </div>
        </ScrollArea>

        {/* Performance Timer */}
        <div
          className="p-4 border-t text-center"
          style={{ borderColor: "rgba(255, 255, 255, 0.1)" }}
        >
          <div className="text-xs text-white/50 uppercase tracking-wider mb-1">
            Total Elapsed
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {formatTime(performanceState.elapsedTime)}
          </div>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div
          className="h-14 px-6 flex items-center justify-between border-b"
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            borderColor: "rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full animate-pulse ${performanceState.isPerforming ? "bg-red-500" : "bg-gray-500"}`}
            />
            <span className="text-white/70 text-sm font-medium">
              {performanceState.isPerforming ? "LIVE" : "STANDBY"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={toggleShowPage}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Current Song Display */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {currentItem ? (
            <>
              {/* Current Song Panel */}
              <div
                className="w-full max-w-4xl rounded-2xl p-8 mb-8"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.1) 100%)",
                  border: "2px solid rgba(34, 197, 94, 0.4)",
                  boxShadow: "0 0 60px rgba(34, 197, 94, 0.15)",
                }}
              >
                <div className="text-center">
                  <div className="text-green-400 text-sm font-medium uppercase tracking-widest mb-2">
                    NOW PLAYING
                  </div>
                  <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 tracking-tight">
                    {currentItem.name}
                  </h1>

                  {/* Time Display */}
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="text-5xl md:text-6xl font-mono font-bold text-green-300">
                      {formatTime(itemElapsedTime)}
                    </div>
                    <div className="text-3xl text-white/30">/</div>
                    <div className="text-3xl font-mono text-white/50">
                      {formatDuration(currentItem.duration)}
                    </div>
                  </div>

                  {/* BPM and Key */}
                  <div className="flex items-center justify-center gap-8 mb-6">
                    <div className="flex items-center gap-3">
                      <Activity className="w-8 h-8 text-green-400" />
                      <div>
                        <div className="text-4xl font-bold text-white">
                          {currentItem.bpm}
                        </div>
                        <div className="text-sm text-white/50 uppercase">
                          BPM
                        </div>
                      </div>
                    </div>
                    <div className="w-px h-16 bg-white/20" />
                    <div className="flex items-center gap-3">
                      <Music className="w-8 h-8 text-green-400" />
                      <div>
                        <div className="text-4xl font-bold text-white">
                          {currentItem.key}
                        </div>
                        <div className="text-sm text-white/50 uppercase">
                          KEY
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {currentItem.notes && (
                    <div
                      className="mt-6 p-4 rounded-lg text-left"
                      style={{ background: "rgba(0, 0, 0, 0.3)" }}
                    >
                      <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-2">
                        <FileText className="w-4 h-4" />
                        NOTES
                      </div>
                      <p className="text-xl text-white/80">
                        {currentItem.notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Next Song Preview */}
              {nextItemData && (
                <div
                  className="w-full max-w-2xl rounded-xl p-6"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-blue-400 text-xs font-medium uppercase tracking-wider mb-1">
                        UP NEXT
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {nextItemData.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-white/60">
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">
                          {nextItemData.bpm}
                        </div>
                        <div className="text-xs uppercase">BPM</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">
                          {nextItemData.key}
                        </div>
                        <div className="text-xs uppercase">KEY</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">
                          {formatDuration(nextItemData.duration)}
                        </div>
                        <div className="text-xs uppercase">DUR</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <Music className="w-24 h-24 text-white/20 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-white/50 mb-2">
                No Song Selected
              </h2>
              <p className="text-white/30">Start a performance to begin</p>
            </div>
          )}
        </div>

        {/* Transport Controls */}
        <div
          className="h-24 px-8 flex items-center justify-center gap-6 border-t"
          style={{
            background: "rgba(0, 0, 0, 0.5)",
            borderColor: "rgba(255, 255, 255, 0.1)",
          }}
        >
          <Button
            size="lg"
            variant="ghost"
            className="h-16 w-16 rounded-full text-white hover:bg-white/10"
            onClick={previousItem}
            disabled={
              !performanceState.isPerforming ||
              performanceState.currentItemIndex === 0
            }
          >
            <SkipBack className="w-8 h-8" />
          </Button>

          {performanceState.isPerforming ? (
            <Button
              size="lg"
              className="h-20 w-20 rounded-full"
              style={{
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                boxShadow: "0 0 30px rgba(239, 68, 68, 0.4)",
              }}
              onClick={stopPerformance}
            >
              <Square className="w-10 h-10" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-20 w-20 rounded-full"
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                boxShadow: "0 0 30px rgba(34, 197, 94, 0.4)",
              }}
              onClick={startPerformance}
              disabled={!activeSetlist || activeSetlist.items.length === 0}
            >
              <Play className="w-10 h-10 ml-1" />
            </Button>
          )}

          <Button
            size="lg"
            variant="ghost"
            className="h-16 w-16 rounded-full text-white hover:bg-white/10"
            onClick={nextItem}
            disabled={
              !performanceState.isPerforming ||
              !activeSetlist ||
              performanceState.currentItemIndex >=
                activeSetlist.items.length - 1
            }
          >
            <SkipForward className="w-8 h-8" />
          </Button>
        </div>
      </div>

      {/* Add Song Dialog */}
      <Dialog open={showAddSongDialog} onOpenChange={setShowAddSongDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Add Song to Setlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-white/70 mb-1 block">
                Song Name
              </label>
              <Input
                value={newSongName}
                onChange={(e) => setNewSongName(e.target.value)}
                placeholder="Enter song name"
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-white/70 mb-1 block">BPM</label>
                <Input
                  type="number"
                  value={newSongBpm}
                  onChange={(e) => setNewSongBpm(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white/70 mb-1 block">Key</label>
                <Input
                  value={newSongKey}
                  onChange={(e) => setNewSongKey(e.target.value)}
                  placeholder="C"
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white/70 mb-1 block">
                  Duration (s)
                </label>
                <Input
                  type="number"
                  value={newSongDuration}
                  onChange={(e) => setNewSongDuration(e.target.value)}
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-white/70 mb-1 block">
                Notes (optional)
              </label>
              <Input
                value={newSongNotes}
                onChange={(e) => setNewSongNotes(e.target.value)}
                placeholder="Performance notes..."
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddSongDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSong}
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              }}
            >
              Add Song
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Setlist Dialog */}
      <Dialog
        open={showNewSetlistDialog}
        onOpenChange={setShowNewSetlistDialog}
      >
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Create New Setlist</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-white/70 mb-1 block">
              Setlist Name
            </label>
            <Input
              value={newSetlistName}
              onChange={(e) => setNewSetlistName(e.target.value)}
              placeholder="Enter setlist name"
              className="bg-gray-800 border-gray-600 text-white"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewSetlistDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSetlist}
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              }}
            >
              Create Setlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

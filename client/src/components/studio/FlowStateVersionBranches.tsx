import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, GitMerge, GitCommit, Plus, Trash2, Check, ChevronRight, ChevronDown, Clock, Star, StarOff, RotateCcw, ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Commit {
  id: string;
  message: string;
  timestamp: Date;
  changes: string[];
  author: string;
}

interface Branch {
  id: string;
  name: string;
  description: string;
  isMain: boolean;
  isActive: boolean;
  isFavorite: boolean;
  createdAt: Date;
  lastModified: Date;
  commits: Commit[];
  parentBranchId?: string;
  color: string;
  tags: string[];
}

interface FlowStateVersionBranchesProps {
  projectName?: string;
  onSwitchBranch?: (branchId: string) => void;
  onMergeBranch?: (sourceBranchId: string, targetBranchId: string) => void;
  className?: string;
}

const BRANCH_COLORS = [
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-indigo-500",
];

export function FlowStateVersionBranches({
  projectName = "My Project",
  onSwitchBranch,
  onMergeBranch,
  className,
}: FlowStateVersionBranchesProps) {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([
    {
      id: "main",
      name: "main",
      description: "Main production mix",
      isMain: true,
      isActive: true,
      isFavorite: true,
      createdAt: new Date(Date.now() - 86400000 * 7),
      lastModified: new Date(),
      color: BRANCH_COLORS[0],
      tags: ["release", "v1.0"],
      commits: [
        {
          id: "c1",
          message: "Final master adjustments",
          timestamp: new Date(Date.now() - 3600000),
          changes: ["Master EQ", "Limiter"],
          author: "You",
        },
        {
          id: "c2",
          message: "Vocal automation tweaks",
          timestamp: new Date(Date.now() - 7200000),
          changes: ["Lead Vocals", "Backing Vocals"],
          author: "You",
        },
        {
          id: "c3",
          message: "Initial mix complete",
          timestamp: new Date(Date.now() - 86400000),
          changes: ["All tracks"],
          author: "You",
        },
      ],
    },
    {
      id: "experimental",
      name: "experimental-synths",
      description: "Trying new synth patches and arrangements",
      isMain: false,
      isActive: false,
      isFavorite: false,
      createdAt: new Date(Date.now() - 86400000 * 2),
      lastModified: new Date(Date.now() - 3600000),
      parentBranchId: "main",
      color: BRANCH_COLORS[1],
      tags: [],
      commits: [
        {
          id: "c4",
          message: "Added new synth lead",
          timestamp: new Date(Date.now() - 3600000),
          changes: ["Synth Lead", "FX Bus"],
          author: "You",
        },
        {
          id: "c5",
          message: "Branched from main",
          timestamp: new Date(Date.now() - 86400000 * 2),
          changes: [],
          author: "System",
        },
      ],
    },
    {
      id: "acoustic",
      name: "acoustic-version",
      description: "Stripped down acoustic arrangement",
      isMain: false,
      isActive: false,
      isFavorite: true,
      createdAt: new Date(Date.now() - 86400000 * 5),
      lastModified: new Date(Date.now() - 86400000),
      parentBranchId: "main",
      color: BRANCH_COLORS[3],
      tags: ["alternate"],
      commits: [
        {
          id: "c6",
          message: "Removed electronic elements",
          timestamp: new Date(Date.now() - 86400000),
          changes: ["Drums", "Bass", "Synths"],
          author: "You",
        },
        {
          id: "c7",
          message: "Added acoustic guitar",
          timestamp: new Date(Date.now() - 86400000 * 2),
          changes: ["Acoustic Guitar"],
          author: "You",
        },
        {
          id: "c8",
          message: "Branched from main",
          timestamp: new Date(Date.now() - 86400000 * 5),
          changes: [],
          author: "System",
        },
      ],
    },
  ]);

  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [expandedBranches, setExpandedBranches] = useState<string[]>(["main"]);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchDescription, setNewBranchDescription] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  const activeBranch = branches.find((b) => b.isActive);
  const selectedBranchData = branches.find((b) => b.id === selectedBranch);

  const toggleExpand = (branchId: string) => {
    setExpandedBranches((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId],
    );
  };

  const switchBranch = (branchId: string) => {
    setBranches((prev) =>
      prev.map((b) => ({
        ...b,
        isActive: b.id === branchId,
      })),
    );
    onSwitchBranch?.(branchId);
    const branch = branches.find((b) => b.id === branchId);
    toast({ title: `Switched to branch: ${branch?.name}` });
  };

  const createBranch = () => {
    if (!newBranchName.trim()) return;

    const newBranch: Branch = {
      id: `branch-${Date.now()}`,
      name: newBranchName.toLowerCase().replace(/\s+/g, "-"),
      description: newBranchDescription,
      isMain: false,
      isActive: false,
      isFavorite: false,
      createdAt: new Date(),
      lastModified: new Date(),
      parentBranchId: activeBranch.id,
      color: BRANCH_COLORS[branches.length % BRANCH_COLORS.length],
      tags: [],
      commits: [
        {
          id: `c${Date.now()}`,
          message: `Branched from ${activeBranch?.name}`,
          timestamp: new Date(),
          changes: [],
          author: "System",
        },
      ],
    };

    setBranches((prev) => [...prev, newBranch]);
    setNewBranchName("");
    setNewBranchDescription("");
    setIsCreatingBranch(false);
    toast({ title: "Branch created", description: newBranch.name });
  };

  const deleteBranch = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (branch?.isMain) {
      toast({ title: "Cannot delete main branch", variant: "destructive" });
      return;
    }
    if (branch?.isActive) {
      switchBranch("main");
    }
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
    toast({ title: `Branch "${branch.name}" deleted` });
  };

  const toggleFavorite = (branchId: string) => {
    setBranches((prev) =>
      prev.map((b) =>
        b.id === branchId ? { ...b, isFavorite: !b.isFavorite } : b,
      ),
    );
  };

  const mergeBranch = (sourceId: string, targetId: string) => {
    const source = branches.find((b) => b.id === sourceId);
    const target = branches.find((b) => b.id === targetId);

    if (!source || !target) return;

    const mergeCommit: Commit = {
      id: `c${Date.now()}`,
      message: `Merged ${source.name} into ${target.name}`,
      timestamp: new Date(),
      changes: source.commits.flatMap((c) => c.changes),
      author: "You",
    };

    setBranches((prev) =>
      prev.map((b) =>
        b.id === targetId
          ? {
              ...b,
              commits: [mergeCommit, ...b.commits],
              lastModified: new Date(),
            }
          : b,
      ),
    );

    onMergeBranch?.(sourceId, targetId);
    setShowMergeDialog(false);
    setMergeSource(null);
    toast({
      title: "Branch merged successfully",
      description: `${source.name} → ${target.name}`,
    });
  };

  ((branchId: string, tag: string) => {
    setBranches((prev) =>
      prev.map((b) =>
        b.id === branchId ? { ...b, tags: [...b.tags, tag] } : b,
      ),
    );
  });

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-lg">
            <GitBranch className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-semibold">Version Branches</h2>
            <p className="text-xs text-zinc-500">
              {branches.length} branches • Current: {activeBranch?.name}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsCreatingBranch(true)}
          className="bg-emerald-500 hover:bg-emerald-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Branch
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Branch List */}
        <div className="w-80 border-r border-zinc-800 overflow-auto p-4">
          <div className="space-y-2">
            {branches.map((branch) => (
              <motion.div
                key={branch.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className={cn(
                    "bg-zinc-900 border-zinc-800 transition-all cursor-pointer",
                    selectedBranch === branch.id && "border-emerald-500/50",
                    branch.isActive && "bg-emerald-500/5",
                  )}
                  onClick={() => setSelectedBranch(branch.id)}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn("w-3 h-3 rounded-full", branch.color)}
                        />
                        <span className="font-medium">{branch.name}</span>
                        {branch.isMain && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                            main
                          </Badge>
                        )}
                        {branch.isActive && (
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                            active
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {branch.isFavorite && (
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(branch.id);
                          }}
                        >
                          {expandedBranches.includes(branch.id) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                      {branch.description}
                    </p>

                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span className="text-xs text-zinc-500">
                        {formatTimeAgo(branch.lastModified)}
                      </span>
                      <span className="text-xs text-zinc-600">•</span>
                      <span className="text-xs text-zinc-500">
                        {branch.commits.length} commits
                      </span>
                    </div>

                    {branch.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {branch.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                          >
                            <Tag className="w-2 h-2 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Expanded Commit History */}
                    <AnimatePresence>
                      {expandedBranches.includes(branch.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-3 pt-3 border-t border-zinc-800"
                        >
                          <div className="space-y-2">
                            {branch.commits.slice(0, 3).map((commit, idx) => (
                              <div
                                key={commit.id}
                                className="flex items-start gap-2"
                              >
                                <div className="flex flex-col items-center">
                                  <GitCommit className="w-3 h-3 text-zinc-500" />
                                  {idx <
                                    branch.commits.slice(0, 3).length - 1 && (
                                    <div className="w-px h-4 bg-zinc-700" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate">
                                    {commit.message}
                                  </p>
                                  <p className="text-[10px] text-zinc-500">
                                    {formatTimeAgo(commit.timestamp)}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {branch.commits.length > 3 && (
                              <p className="text-xs text-zinc-500 pl-5">
                                +{branch.commits.length - 3} more commits
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Branch Details */}
        <div className="flex-1 overflow-auto p-4">
          {selectedBranchData ? (
            <div className="space-y-4">
              {/* Branch Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full",
                        selectedBranchData.color,
                      )}
                    />
                    <h3 className="text-xl font-semibold">
                      {selectedBranchData.name}
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-400 mt-1">
                    {selectedBranchData.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedBranchData.isActive && (
                    <Button
                      onClick={() => switchBranch(selectedBranchData.id)}
                      className="bg-emerald-500 hover:bg-emerald-600"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Switch to Branch
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => toggleFavorite(selectedBranchData.id)}
                  >
                    {selectedBranchData.isFavorite ? (
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <StarOff className="w-4 h-4" />
                    )}
                  </Button>
                  {!selectedBranchData.isMain && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMergeSource(selectedBranchData.id);
                          setShowMergeDialog(true);
                        }}
                      >
                        <GitMerge className="w-4 h-4 mr-1" />
                        Merge
                      </Button>
                      <Button
                        variant="outline"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => deleteBranch(selectedBranchData.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Branch Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <span className="text-xs text-zinc-500">Created</span>
                  <p className="font-mono">
                    {selectedBranchData.createdAt.toLocaleDateString()}
                  </p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <span className="text-xs text-zinc-500">Last Modified</span>
                  <p className="font-mono">
                    {formatTimeAgo(selectedBranchData.lastModified)}
                  </p>
                </Card>
                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <span className="text-xs text-zinc-500">Commits</span>
                  <p className="font-mono">
                    {selectedBranchData.commits.length}
                  </p>
                </Card>
              </div>

              {/* Commit History */}
              <div>
                <h4 className="font-medium mb-3">Commit History</h4>
                <div className="space-y-3">
                  {selectedBranchData.commits.map((commit, idx) => (
                    <Card
                      key={commit.id}
                      className="bg-zinc-900 border-zinc-800 p-4"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center",
                              selectedBranchData.color + "/20",
                            )}
                          >
                            <GitCommit
                              className="w-4 h-4"
                              style={{
                                color: selectedBranchData.color.replace(
                                  "bg-",
                                  "",
                                ),
                              }}
                            />
                          </div>
                          {idx < selectedBranchData.commits.length - 1 && (
                            <div className="w-px flex-1 bg-zinc-700 mt-2" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{commit.message}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                            <span>{commit.author}</span>
                            <span>•</span>
                            <span>{commit.timestamp.toLocaleString()}</span>
                          </div>
                          {commit.changes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {commit.changes.map((change, i) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {change}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="ghost">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Restore
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500">
              <GitBranch className="w-16 h-16 opacity-20" />
            </div>
          )}
        </div>
      </div>

      {/* Create Branch Dialog */}
      <Dialog open={isCreatingBranch} onOpenChange={setIsCreatingBranch}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new version branch from {activeBranch?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input
                placeholder="e.g., experimental-mix"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="What's this branch for?"
                value={newBranchDescription}
                onChange={(e) => setNewBranchDescription(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreatingBranch(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={createBranch}
              disabled={!newBranchName.trim()}
            >
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Merge Branch</DialogTitle>
            <DialogDescription>
              Merge changes from{" "}
              {branches.find((b) => b.id === mergeSource)?.name} into another
              branch
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-4 justify-center">
              <Badge className="text-lg px-4 py-2">
                {branches.find((b) => b.id === mergeSource)?.name}
              </Badge>
              <ArrowRight className="w-6 h-6 text-zinc-500" />
              <Badge variant="outline" className="text-lg px-4 py-2">
                main
              </Badge>
            </div>
            <p className="text-sm text-zinc-400 text-center">
              This will apply{" "}
              {branches.find((b) => b.id === mergeSource)?.commits.length}{" "}
              commits to main
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={() => mergeSource && mergeBranch(mergeSource, "main")}
            >
              <GitMerge className="w-4 h-4 mr-1" />
              Merge to Main
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlowStateVersionBranches;

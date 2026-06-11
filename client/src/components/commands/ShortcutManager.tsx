import { useState, useCallback, useRef } from "react";
import {
  Settings,
  Download,
  Upload,
  RotateCcw,
  Search,
  Keyboard,
  FileJson,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useShortcuts } from "@/contexts/ShortcutContext";
import { ShortcutHint } from "@/components/shortcuts/ShortcutHint";
import { ShortcutCustomizer } from "@/components/shortcuts/ShortcutCustomizer";
import {
  ShortcutDefinition,
  ShortcutModifier,
  ShortcutContext,
} from "@/lib/shortcuts/types";

interface ShortcutManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONTEXT_LABELS: Record<ShortcutContext, string> = {
  global: "Global",
  studio: "Studio",
  dashboard: "Dashboard",
  social: "Social Media",
  marketplace: "Marketplace",
  distribution: "Distribution",
  analytics: "Analytics",
};

export function ShortcutManager({ open, onOpenChange }: ShortcutManagerProps) {
  const { shortcutManager } = useShortcuts();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"view" | "customize" | "export">(
    "view",
  );
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [selectedContext, setSelectedContext] = useState<
    ShortcutContext | "all"
  >("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shortcuts = shortcutManager?.getAllShortcuts() || [];

  const filteredShortcuts = shortcuts.filter((s) => {
    const matchesSearch =
      s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesContext =
      selectedContext === "all" ||
      s.context === selectedContext ||
      s.context === "global";

    return matchesSearch && matchesContext;
  });

  const groupedShortcuts = filteredShortcuts.reduce(
    (acc, shortcut) => {
      const category = shortcut.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(shortcut);
      return acc;
    },
    {} as Record<string, ShortcutDefinition[]>,
  );

  const handleExport = useCallback(() => {
    if (!shortcutManager) return;

    const shortcuts = shortcutManager.getAllShortcuts();
    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      shortcuts: shortcuts.map((s) => ({
        id: s.id,
        key: s.key,
        modifiers: s.modifiers,
        enabled: s.enabled ?? true,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `max-booster-shortcuts-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Shortcuts exported",
      description: "Your shortcuts have been exported successfully.",
    });
  }, [shortcutManager, toast]);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !shortcutManager) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);

          if (
            !data.version ||
            !data.shortcuts ||
            !Array.isArray(data.shortcuts)
          ) {
            throw new Error("Invalid shortcut file format");
          }

          let imported = 0;
          data.shortcuts.forEach(
            (config: {
              id: string;
              key: string;
              modifiers?: ShortcutModifier[];
              enabled?: boolean;
            }) => {
              const existing = shortcutManager.getShortcut(config.id);
              if (existing) {
                shortcutManager.customize(config.id, {
                  key: config.key,
                  modifiers: config.modifiers,
                  enabled: config.enabled,
                });
                imported++;
              }
            },
          );

          toast({
            title: "Shortcuts imported",
            description: `Successfully imported ${imported} shortcuts.`,
          });
        } catch (error) {
          toast({
            title: "Import failed",
            description:
              "The file could not be parsed. Please check the format.",
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [shortcutManager, toast],
  );

  const handleResetAll = useCallback(() => {
    if (!shortcutManager) return;
    shortcutManager.resetAllShortcuts();
    toast({
      title: "Shortcuts reset",
      description: "All shortcuts have been reset to defaults.",
    });
  }, [shortcutManager, toast]);

  const formatCategory = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Shortcut Manager
            </DialogTitle>
            <DialogDescription>
              View, customize, and manage keyboard shortcuts
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            className="flex-1 flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="view">View All</TabsTrigger>
              <TabsTrigger value="customize">Customize</TabsTrigger>
              <TabsTrigger value="export">Export/Import</TabsTrigger>
            </TabsList>

            <TabsContent value="view" className="flex-1 flex flex-col mt-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search shortcuts..."
                    className="pl-10"
                  />
                </div>
                <select
                  value={selectedContext}
                  onChange={(e) =>
                    setSelectedContext(
                      e.target.value as ShortcutContext | "all",
                    )
                  }
                  className="h-10 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm"
                >
                  <option value="all">All Contexts</option>
                  {Object.entries(CONTEXT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-6">
                  {Object.entries(groupedShortcuts).map(
                    ([category, categoryShortcuts]) => (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-zinc-300">
                            {formatCategory(category)}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {categoryShortcuts.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {categoryShortcuts.map((shortcut) => (
                            <div
                              key={shortcut.id}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-zinc-300">
                                  {shortcut.description}
                                </span>
                                {shortcut.context !== "global" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {CONTEXT_LABELS[shortcut.context]}
                                  </Badge>
                                )}
                              </div>
                              <ShortcutHint
                                shortcut={{
                                  key: shortcut.key,
                                  modifiers: shortcut.modifiers,
                                }}
                                size="sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ),
                  )}
                  {Object.keys(groupedShortcuts).length === 0 && (
                    <div className="py-12 text-center text-zinc-500">
                      <Keyboard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No shortcuts found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="customize"
              className="flex-1 flex flex-col mt-4"
            >
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Settings className="w-12 h-12 mx-auto mb-4 text-zinc-500" />
                  <h3 className="text-lg font-medium mb-2">
                    Customize Shortcuts
                  </h3>
                  <p className="text-sm text-zinc-500 mb-4">
                    Click below to open the shortcut customization panel
                  </p>
                  <Button onClick={() => setShowCustomizer(true)}>
                    Open Customizer
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="export" className="flex-1 mt-4">
              <div className="space-y-6">
                <div className="p-4 border border-zinc-800 rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-500/10 rounded-lg">
                      <Download className="w-6 h-6 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">Export Shortcuts</h3>
                      <p className="text-sm text-zinc-500 mb-3">
                        Download your current shortcut configuration as a JSON
                        file
                      </p>
                      <Button variant="outline" onClick={handleExport}>
                        <FileJson className="w-4 h-4 mr-2" />
                        Export as JSON
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-zinc-800 rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-lg">
                      <Upload className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">Import Shortcuts</h3>
                      <p className="text-sm text-zinc-500 mb-3">
                        Import a previously exported shortcut configuration
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        className="hidden"
                        id="shortcut-import"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import JSON
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-4 border border-zinc-800 rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-500/10 rounded-lg">
                      <RotateCcw className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">Reset to Defaults</h3>
                      <p className="text-sm text-zinc-500 mb-3">
                        Reset all shortcuts to their default values
                      </p>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline">
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reset All Shortcuts
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Reset all shortcuts?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will reset all keyboard shortcuts to their
                              default values. You may want to export your
                              current configuration first.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleResetAll}>
                              Reset All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800 text-xs text-zinc-500">
            <p>
              Press <ShortcutHint shortcut="cmd+/" size="xs" /> to show
              shortcuts anytime
            </p>
            <Badge variant="outline">{shortcuts.length} shortcuts</Badge>
          </div>
        </DialogContent>
      </Dialog>

      <ShortcutCustomizer
        open={showCustomizer}
        onOpenChange={setShowCustomizer}
      />
    </>
  );
}

export default ShortcutManager;

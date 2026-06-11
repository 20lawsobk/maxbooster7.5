import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";
import { AlertTriangle, Download, Upload, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { offlineQueue } from "@/lib/offline";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Conflict {
  actionId: string;
  localData: unknown;
  serverData: unknown;
  detectedAt: number;
}

interface ConflictResolverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve?: (
    actionId: string,
    resolution: "local" | "server" | "merged",
    mergedData?: unknown,
  ) => void;
  onResolveAll?: (resolution: "local" | "server") => void;
}

export function ConflictResolver({
  open,
  onOpenChange,
  onResolve,
  onResolveAll,
}: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (open) {
      loadConflicts();
    }
  }, [open]);

  const loadConflicts = async () => {
    setLoading(true);
    try {
      const rawConflicts = await offlineQueue.getConflicts();
      setConflicts(rawConflicts);
      if (rawConflicts.length > 0 && !selectedConflict) {
        setSelectedConflict(rawConflicts[0]);
      }
    } catch (error) {
      logger.error("Failed to load conflicts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (
    resolution: "local" | "server" | "merged",
    mergedData?: unknown,
  ) => {
    if (!selectedConflict) return;

    setResolving(true);
    try {
      await offlineQueue.resolveConflict(
        selectedConflict.actionId,
        resolution,
        mergedData,
      );
      onResolve?.(selectedConflict.actionId, resolution, mergedData);

      const updatedConflicts = conflicts.filter(
        (c) => c.actionId !== selectedConflict.actionId,
      );
      setConflicts(updatedConflicts);

      if (updatedConflicts.length > 0) {
        setSelectedConflict(updatedConflicts[0]);
      } else {
        setSelectedConflict(null);
        onOpenChange(false);
      }
    } catch (error) {
      logger.error("Failed to resolve conflict:", error);
    } finally {
      setResolving(false);
    }
  };

  const handleResolveAll = async (resolution: "local" | "server") => {
    setResolving(true);
    try {
      for (const conflict of conflicts) {
        await offlineQueue.resolveConflict(conflict.actionId, resolution);
      }
      onResolveAll?.(resolution);
      setConflicts([]);
      setSelectedConflict(null);
      onOpenChange(false);
    } catch (error) {
      logger.error("Failed to resolve all conflicts:", error);
    } finally {
      setResolving(false);
    }
  };

  const formatData = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  (
    localData: unknown,
    serverData: unknown,
  ): { localDiffs: string[]; serverDiffs: string[] } => {
    const localDiffs: string[] = [];
    const serverDiffs: string[] = [];

    if (
      typeof localData === "object" &&
      typeof serverData === "object" &&
      localData &&
      serverData
    ) {
      const localObj = localData as Record<string, unknown>;
      const serverObj = serverData as Record<string, unknown>;
      const allKeys = new Set([
        ...Object.keys(localObj),
        ...Object.keys(serverObj),
      ]);

      allKeys.forEach((key) => {
        if (JSON.stringify(localObj[key]) !== JSON.stringify(serverObj[key])) {
          if (key in localObj) localDiffs.push(key);
          if (key in serverObj) serverDiffs.push(key);
        }
      });
    }

    return { localDiffs, serverDiffs };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Resolve Conflicts
          </DialogTitle>
          <DialogDescription>
            {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}{" "}
            detected between your local changes and the server.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : conflicts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p>All conflicts have been resolved!</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1 border-r pr-4">
              <h4 className="font-medium text-sm mb-2">
                Conflicts ({conflicts.length})
              </h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {conflicts.map((conflict) => (
                    <Card
                      key={conflict.actionId}
                      className={cn(
                        "cursor-pointer transition-colors",
                        selectedConflict?.actionId === conflict.actionId
                          ? "border-primary"
                          : "hover:border-primary/50",
                      )}
                      onClick={() => setSelectedConflict(conflict)}
                    >
                      <CardContent className="p-3">
                        <p className="text-sm font-medium truncate">
                          {conflict.actionId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(conflict.detectedAt, {
                            addSuffix: true,
                          })}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="col-span-3">
              {selectedConflict && (
                <Tabs defaultValue="compare" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="compare">Compare</TabsTrigger>
                    <TabsTrigger value="local">Your Changes</TabsTrigger>
                    <TabsTrigger value="server">Server Version</TabsTrigger>
                  </TabsList>

                  <TabsContent value="compare" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Your Changes
                            <Badge variant="outline">Local</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[200px]">
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                              {formatData(selectedConflict.localData)}
                            </pre>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Server Version
                            <Badge variant="outline">Remote</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[200px]">
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                              {formatData(selectedConflict.serverData)}
                            </pre>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="flex justify-center gap-4 mt-4">
                      <Button
                        variant="outline"
                        onClick={() => handleResolve("local")}
                        disabled={resolving}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Keep Your Changes
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleResolve("server")}
                        disabled={resolving}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Use Server Version
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="local">
                    <ScrollArea className="h-[300px]">
                      <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                        {formatData(selectedConflict.localData)}
                      </pre>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="server">
                    <ScrollArea className="h-[300px]">
                      <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                        {formatData(selectedConflict.serverData)}
                      </pre>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
          {conflicts.length > 1 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleResolveAll("local")}
                disabled={resolving}
              >
                <Upload className="h-4 w-4 mr-2" />
                Keep All Local
              </Button>
              <Button
                variant="outline"
                onClick={() => handleResolveAll("server")}
                disabled={resolving}
              >
                <Download className="h-4 w-4 mr-2" />
                Use All Server
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConflictResolver;

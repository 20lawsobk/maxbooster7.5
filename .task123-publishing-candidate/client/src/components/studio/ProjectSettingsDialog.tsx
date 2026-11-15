import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, Save } from "lucide-react";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  project: {
    name: string;
    description?: string;
    tempo?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
    sampleRate?: number;
    bitDepth?: number;
  };
  onUpdate: (updates: {
    name?: string;
    description?: string;
    tempo?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
    sampleRate?: number;
    bitDepth?: number;
  }) => void;
}


const TIME_SIGNATURES = [
  { value: "4/4", label: "4/4" },
  { value: "3/4", label: "3/4" },
  { value: "6/8", label: "6/8" },
  { value: "2/4", label: "2/4" },
  { value: "5/4", label: "5/4" },
  { value: "7/8", label: "7/8" },
  { value: "12/8", label: "12/8" },
];

const SAMPLE_RATES = [
  { value: 44100, label: "44.1 kHz" },
  { value: 48000, label: "48 kHz" },
  { value: 88200, label: "88.2 kHz" },
  { value: 96000, label: "96 kHz" },
];

const BIT_DEPTHS = [
  { value: 16, label: "16-bit" },
  { value: 24, label: "24-bit" },
  { value: 32, label: "32-bit float" },
];

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
  project,
  onUpdate,
}: ProjectSettingsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: project.name || "Untitled Project",
    description: project.description || "",
    tempo: project.tempo || 120,
    timeSignature: `${project.timeSignatureNumerator || 4}/${project.timeSignatureDenominator || 4}`,
    sampleRate: project.sampleRate || 48000,
    bitDepth: project.bitDepth || 24,
  });
  const [snapshot, setSnapshot] = useState<{
    projectId: string | null;
    expectedUpdatedAt: string | null | undefined;
    loading: boolean;
    error: string;
  }>({ projectId: null, expectedUpdatedAt: undefined, loading: false, error: "" });

  useEffect(() => {
    let cancelled = false;
    if (open) {
      setForm({
        name: project.name || "Untitled Project",
        description: project.description || "",
        tempo: project.tempo || 120,
        timeSignature: `${project.timeSignatureNumerator || 4}/${project.timeSignatureDenominator || 4}`,
        sampleRate: project.sampleRate || 48000,
        bitDepth: project.bitDepth || 24,
      });
      setSnapshot({ projectId, expectedUpdatedAt: undefined, loading: !!projectId, error: "" });
      if (projectId) {
        // The DAW currently passes only reduced local metadata, without a
        // server version. Load the canonical edit-start snapshot ONCE on open.
        // Never refresh/rebase it on submit, rerenders, or after a conflict.
        void (async () => {
          try {
            const response = await fetch(`/api/studio/projects/${projectId}`, { credentials: "include" });
            if (!response.ok) throw new Error(`Unable to load project settings (${response.status})`);
            const loaded = await response.json();
            if (loaded.id !== projectId || loaded.updatedAt === undefined ||
                (loaded.updatedAt !== null && !Number.isFinite(new Date(loaded.updatedAt).getTime()))) {
              throw new Error("The server did not provide this project's version.");
            }
            if (cancelled) return;
            setForm({
              name: loaded.title || "Untitled Project",
              description: loaded.description || "",
              tempo: loaded.bpm ?? 120,
              timeSignature: loaded.timeSignature || "4/4",
              sampleRate: loaded.sampleRate ?? 48000,
              bitDepth: loaded.bitDepth ?? 24,
            });
            setSnapshot({
              projectId,
              expectedUpdatedAt: loaded.updatedAt === null ? null : new Date(loaded.updatedAt).toISOString(),
              loading: false, error: "",
            });
          } catch (error) {
            if (!cancelled) setSnapshot({
              projectId, expectedUpdatedAt: undefined, loading: false,
              error: error instanceof Error ? error.message : "Unable to load project settings.",
            });
          }
        })();
      }
    }
    return () => { cancelled = true; };
    // Parent metadata is an inline object and changes on every DAW render.
    // An open edit must retain its original form and version across those renders.
  }, [open, projectId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        throw new Error("Cannot save project settings without a project");
      }
      if (snapshot.projectId !== projectId || snapshot.expectedUpdatedAt === undefined || snapshot.loading) {
        throw new Error("Project settings have not loaded. Close and reopen the dialog to try again.");
      }
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/studio/projects/${projectId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          expectedUpdatedAt: snapshot.expectedUpdatedAt,
          title: form.name,
          description: form.description,
          tempo: form.tempo,
          timeSignature: form.timeSignature,
          sampleRate: form.sampleRate,
          bitDepth: form.bitDepth,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("This project changed on the server. Your settings remain in this form. Review the current project before starting a new edit.");
        }
        throw new Error(`Failed to save project settings (${response.status})`);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
      onUpdate({
        name: form.name,
        description: form.description,
        tempo: form.tempo,
        timeSignatureNumerator: Number(form.timeSignature.split("/")[0]) || 4,
        timeSignatureDenominator: Number(form.timeSignature.split("/")[1]) || 4,
        sampleRate: form.sampleRate,
        bitDepth: form.bitDepth,
      });
      toast({
        title: "Settings Saved",
        description: "Project settings have been updated.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Unable to save project settings.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const [numerator, denominator] = form.timeSignature.split("/").map(Number);
    if (projectId) {
      saveMutation.mutate();
      return;
    }
    onUpdate({
      name: form.name,
      description: form.description,
      tempo: form.tempo,
      timeSignatureNumerator: numerator || 4,
      timeSignatureDenominator: denominator || 4,
      sampleRate: form.sampleRate,
      bitDepth: form.bitDepth,
    });
    toast({
      title: "Settings Saved",
      description: "Project settings have been updated.",
    });
    onOpenChange(false);
  };

  const isSubmitting = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSubmitting) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-lg bg-[#1e1e22] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings className="h-5 w-5 text-blue-500" />
            Project Settings
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure project properties and audio settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {snapshot.loading && <p role="status">Loading the project's saved settings and version…</p>}
          {snapshot.error && <p role="alert">{snapshot.error} Close and reopen to retry.</p>}
          <fieldset disabled={isSubmitting || (!!projectId && (snapshot.projectId !== projectId || snapshot.expectedUpdatedAt === undefined))} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-300">
              Project Name
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Enter project name"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">
              Description
            </Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Brief description of your project"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500 resize-none h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tempo" className="text-gray-300">
                Tempo (BPM)
              </Label>
              <Input
                id="tempo"
                type="number"
                min={20}
                max={300}
                value={form.tempo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    tempo: parseInt(e.target.value) || 120,
                  }))
                }
                className="bg-[#2a2a2e] border-[#444] text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Time Signature</Label>
              <Select
                value={form.timeSignature}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, timeSignature: value }))
                }
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {TIME_SIGNATURES.map((ts) => (
                    <SelectItem
                      key={ts.value}
                      value={ts.value}
                      className="text-white hover:bg-[#333]"
                    >
                      {ts.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Sample Rate</Label>
              <Select
                value={form.sampleRate.toString()}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, sampleRate: parseInt(value) }))
                }
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {SAMPLE_RATES.map((sr) => (
                    <SelectItem
                      key={sr.value}
                      value={sr.value.toString()}
                      className="text-white hover:bg-[#333]"
                    >
                      {sr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Bit Depth</Label>
              <Select
                value={form.bitDepth.toString()}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, bitDepth: parseInt(value) }))
                }
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {BIT_DEPTHS.map((bd) => (
                    <SelectItem
                      key={bd.value}
                      value={bd.value.toString()}
                      className="text-white hover:bg-[#333]"
                    >
                      {bd.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          </fieldset>
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.name.trim() || (!!projectId && (snapshot.projectId !== projectId || snapshot.expectedUpdatedAt === undefined))}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

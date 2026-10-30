import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { studioApi, type CompingGroup, type CompingGroupWithDetails } from "@/lib/studioApi";

type ClipSource = { id: string; sourceUrl?: string; audioUrl?: string; waveformData?: unknown };

function TakeWaveform({ source, selected }: { source?: ClipSource; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const draw = (peaks?: any) => {
      const w = canvas.clientWidth || 600, h = canvas.clientHeight || 44;
      canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
      const c = canvas.getContext("2d")!; c.scale(devicePixelRatio, devicePixelRatio);
      c.clearRect(0, 0, w, h); c.fillStyle = selected ? "#6ee7b7" : "#60a5fa";
      const values = peaks?.levels?.[0]?.peaks ?? peaks;
      if (values?.length) for (let x = 0; x < w; x++) {
        const v = Math.abs(values[Math.floor(x / w * values.length)] || 0);
        c.fillRect(x, h / 2 - v * h / 2, 1, Math.max(1, v * h));
      } else { c.globalAlpha = .45; c.fillRect(0, h / 2, w, 1); }
    };
    draw(source?.waveformData);
  }, [source, selected]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full opacity-80" />;
}

export function CompingEditor({ projectId, trackId, clips, open, onOpenChange }: {
  projectId: string; trackId: string; clips: ClipSource[]; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<CompingGroup[]>([]);
  const [group, setGroup] = useState<CompingGroupWithDetails | null>(null);
  const [versionName, setVersionName] = useState("Comp version");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const load = useCallback(async () => {
    const all = await studioApi.comping.getGroups(projectId);
    const own = all.filter((item) => item.trackId === trackId); setGroups(own);
    if (own[0]) setGroup(await studioApi.comping.getGroup(projectId, own[0].id)); else setGroup(null);
  }, [projectId, trackId]);
  useEffect(() => { if (open) load().catch((e) => toast({ title: "Could not load takes", description: e.message, variant: "destructive" })); }, [open, load, toast]);
  const choose = async (laneId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (!group) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const span = Math.max(.01, (group.endTime ?? group.startTime + 1) - group.startTime);
    const at = group.startTime + ((event.clientX - rect.left) / rect.width) * span;
    const snap = Math.max(.05, span / 16);
    const startTime = Math.max(group.startTime, Math.floor(at / snap) * snap);
    const endTime = Math.min(group.endTime ?? startTime + snap, startTime + snap);
    if (endTime <= startTime) return;
    try { await studioApi.comping.selectSegment(projectId, group.id, { laneId, startTime, endTime }); await load(); }
    catch (e: any) { toast({ title: "Selection failed", description: e.message, variant: "destructive" }); }
  };
  const createVersion = async () => {
    if (!group || !versionName.trim()) return;
    try { const v = await studioApi.comping.createVersion(projectId, group.id, { name: versionName.trim() }); await studioApi.comping.activateVersion(projectId, group.id, v.id); await load(); }
    catch (e: any) { toast({ title: "Could not create version", description: e.message, variant: "destructive" }); }
  };
  const render = async () => {
    if (!group) return;
    try { const result = await studioApi.comping.renderComp(projectId, group.id); setRenderUrl(result.audioUrl); toast({ title: "Comp rendered", description: "Use the audio controls to audition the rendered WAV." }); }
    catch (e: any) { toast({ title: "Render failed", description: e.message, variant: "destructive" }); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl bg-[#18181d] text-gray-100">
    <DialogHeader><DialogTitle>Take Comping</DialogTitle></DialogHeader>
    {!groups.length ? <p className="text-sm text-gray-400">No take groups on this track. Enable Take mode before recording.</p> : <>
      <select className="h-8 rounded bg-[#25252c] px-2 text-sm" value={group?.id} onChange={async e => setGroup(await studioApi.comping.getGroup(projectId, e.target.value))}>{groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.takeCount} takes)</option>)}</select>
      <p className="text-xs text-gray-400">Click a lane waveform to select that take for a snapped section. Green overlays are the current comp selections.</p>
      <div className="space-y-2">{group?.lanes.map((lane, i) => { const source = clips.find(c => c.id === lane.audioClipId); const selected = group.lanes.flatMap(l => l.segments).filter(s => s.isSelected && s.takeLaneId === lane.id); return <button key={lane.id} onClick={e => choose(lane.id, e)} className="relative h-14 w-full overflow-hidden rounded border border-[#3b3b45] bg-[#202028] text-left hover:border-emerald-400">
        <TakeWaveform source={source} selected={!!selected.length}/><span className="relative z-10 px-2 text-xs font-semibold">{lane.name || `Take ${i + 1}`}</span>{selected.map(s => <span key={s.id} className="absolute bottom-0 top-0 bg-emerald-400/25 border-x border-emerald-300" style={{ left: `${(s.startTime - group.startTime) / ((group.endTime ?? group.startTime + 1) - group.startTime) * 100}%`, width: `${(s.endTime - s.startTime) / ((group.endTime ?? group.startTime + 1) - group.startTime) * 100}%` }}/>)}
      </button>; })}</div>
      <div className="flex gap-2"><Input value={versionName} onChange={e => setVersionName(e.target.value)} aria-label="Comp version name"/><Button onClick={createVersion}>Save &amp; activate version</Button><Button variant="secondary" onClick={render}>Render comp</Button></div>
      {renderUrl && <audio className="w-full" controls src={renderUrl}>Rendered comp audio</audio>}
    </>}
  </DialogContent></Dialog>;
}
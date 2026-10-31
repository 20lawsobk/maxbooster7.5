import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { readLocalMediaResult, type LocalMediaResult } from "@/components/content/LocalMediaRenderer";
import {
  ArrowDown, ArrowUp, Download, FileJson, FileText, ImagePlus, Plus, Redo2, Trash2, Undo2, Upload, X,
} from "lucide-react";
import {
  addScene, ARRANGEMENTS, ASPECTS, buildProductionRequest, buildSceneSrt, buildScriptText, checkImageDimensions,
  checkImageFile, COLOR_GRADES, createEmptyProject, estimateNarrationSec, FPS, hasAuthoredWork, historyInit,
  historyPush, historyRedo, historyReplace, historyUndo, INSTRUMENTS, MAX_BRIEF_CHARS, MAX_IMAGE_BYTES,
  MAX_NARRATION_CHARS, MAX_PROJECT_FILE_BYTES, MAX_SCENE_TEXT, MAX_SCENES, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_SEC,
  moveScene, MUSIC_KEYS, parseProject, projectFingerprint, readProductionTimeline, removeScene, sceneFrames,
  serializeProject, totalDuration, totalMediaBytes, TRANSITIONS, updateScene, validateProject, VOICES,
  type AspectId, type History, type MediaAsset, type ProductionProject, type TimelineScene,
} from "@/components/content/productionWorkbenchModel";

const RENDER_TIMEOUT_MS = 180_000;
const GRADE_LABEL: Record<string, string> = { none: "None", warm: "Warm", cool: "Cool", cinematic: "Cinematic", neon: "Neon" };
const TRANSITION_LABEL: Record<string, string> = { fade: "Fade", dissolve: "Dissolve", wipeleft: "Wipe left", fadeblack: "Fade through black" };

interface RenderOutput {
  media: LocalMediaResult;
  fingerprint: string;
  timeline: TimelineScene[] | null;
  scenes: Array<{ text: string; durationSec: number }>;
}

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readAsset(file: File): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const img = new Image();
      img.onerror = () => reject(new Error("That image could not be decoded."));
      img.onload = () => {
        const dimErr = checkImageDimensions(img.naturalWidth, img.naturalHeight);
        if (dimErr) return reject(new Error(dimErr));
        resolve({ b64, mime: file.type as MediaAsset["mime"], name: file.name.slice(0, 255), bytes: file.size,
          width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

const mib = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MiB`;
const field = "w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60";
const label = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

export interface ProductionWorkbenchProps {
  platform?: string;
  onGenerated?: (result: LocalMediaResult) => void;
}

export function ProductionWorkbench({ platform = "instagram", onGenerated }: ProductionWorkbenchProps) {
  const id = useId();
  const [history, setHistory] = useState<History<ProductionProject>>(() => historyInit(createEmptyProject(platform)));
  const project = history.present;
  const lastEditKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [output, setOutput] = useState<RenderOutput | null>(null);
  const active = useRef<AbortController | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const editEpoch = useRef(0);

  useEffect(() => () => { editEpoch.current++; active.current?.abort(); active.current = null; }, []);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /** Coalesce consecutive edits of the same field into one undo snapshot. */
  function edit(next: ProductionProject, key: string | null = null) {
    if (busy) return;
    editEpoch.current++;
    setHistory(h => (key && key === lastEditKey.current ? historyReplace(h, next) : historyPush(h, next)));
    lastEditKey.current = key;
  }
  const undo = () => { if (!busy) { editEpoch.current++; lastEditKey.current = null; setHistory(historyUndo); } };
  const redo = () => { if (!busy) { editEpoch.current++; lastEditKey.current = null; setHistory(historyRedo); } };

  const errors = useMemo(() => validateProject(project), [project]);
  const fingerprint = useMemo(() => projectFingerprint(project), [project]);
  const stale = Boolean(output && output.fingerprint !== fingerprint);
  const total = totalDuration(project.scenes);
  const mediaBytes = totalMediaBytes(project);

  async function attachImage(file: File | undefined, target: string | "logo") {
    if (!file) return;
    const epoch = editEpoch.current;
    const pre = checkImageFile(file);
    if (pre) { setError(pre); return; }
    const existing = target === "logo" ? project.logo?.bytes ?? 0 : project.scenes.find(s => s.id === target)?.image?.bytes ?? 0;
    if (mediaBytes - existing + file.size > MAX_TOTAL_IMAGE_BYTES) { setError("Scene images and logo together must be 8 MiB or smaller."); return; }
    try {
      const asset = await readAsset(file);
      if (epoch !== editEpoch.current || active.current) {
        setError("The project changed while the image loaded. Select the image again.");
        return;
      }
      editEpoch.current++;
      setError(null);
      setHistory(h => {
        const p = h.present;
        return historyPush(h, target === "logo" ? { ...p, logo: asset } : updateScene(p, target, { image: asset }));
      });
      lastEditKey.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not use that image."); }
  }

  async function render() {
    if (active.current || busy) return;
    editEpoch.current++;
    let request;
    try { request = buildProductionRequest(project); } catch (e) { setError(e instanceof Error ? e.message : "Fix the project first."); return; }
    const snapshotFp = fingerprint;
    const snapshotScenes = project.scenes.map(s => ({ text: s.text.trim(), durationSec: s.durationSec }));
    const controller = new AbortController(); active.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, RENDER_TIMEOUT_MS);
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await apiRequest("POST", request.endpoint, request.body, { signal: controller.signal, maxRetries: 0, timeout: RENDER_TIMEOUT_MS });
      const data = await response.json();
      const media = readLocalMediaResult("video", data);
      if (active.current !== controller) return;
      setOutput({ media, fingerprint: snapshotFp, timeline: readProductionTimeline(data), scenes: snapshotScenes });
      onGenerated?.(media);
    } catch (failure) {
      if (active.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setError(timedOut ? "Render timed out after 180 seconds. Your project and last result are unchanged."
        : failure && typeof failure === "object" && "userMessage" in failure && typeof failure.userMessage === "string"
          ? `${failure.userMessage}${"message" in failure && typeof failure.message === "string" && failure.message !== failure.userMessage ? ` (${failure.message})` : ""}`
          : failure instanceof Error ? failure.message : "Render failed. Please retry.");
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  function cancel() { active.current?.abort(); active.current = null; setBusy(false); setNotice("Render cancelled. The server may still finish, but this result will be ignored."); }

  async function importProject(file: File | undefined) {
    if (!file) return;
    const epoch = editEpoch.current;
    if (file.size > MAX_PROJECT_FILE_BYTES) { setError("Project file is larger than 16 MiB."); return; }
    try {
      const next = parseProject(await file.text());
      if (epoch !== editEpoch.current || active.current) {
        setError("The project changed while the file loaded. Open the file again.");
        return;
      }
      if (hasAuthoredWork(project) && !window.confirm("Replace the current project with the imported file? You can undo this.")) return;
      editEpoch.current++;
      lastEditKey.current = null;
      setHistory(h => historyPush(h, next));
      setError(null); setNotice(`Opened ${file.name}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open that project."); }
  }

  function resetProject() {
    if (hasAuthoredWork(project) && !window.confirm("Start a new empty project? You can undo this.")) return;
    edit(createEmptyProject(platform));
  }

  return <section className="space-y-5" aria-label="Production workspace">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Production workspace</h3>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={undo} disabled={busy || !history.past.length} aria-label="Undo" data-testid="button-undo"><Undo2 className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="ghost" onClick={redo} disabled={busy || !history.future.length} aria-label="Redo" data-testid="button-redo"><Redo2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Assemble 1 to {MAX_SCENES} scenes from your own words and artwork. Your images are placed as backgrounds with your chosen transition and grade; nothing is generated from them, and no copy is written for you.</p>
      <details className="rounded-md border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">What this workspace can and cannot do</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Can: timed text scenes, your uploaded stills, a logo overlay, transitions, color grades, a synthetic instrumental and local synthetic narration.</li>
          <li>Cannot: generate people, footage or new subjects; clone voices; edit video clips; multi-track timelines; cloud project sync.</li>
          <li>Narration uses the built-in local text-to-speech voice. It is clearly synthetic.</li>
          <li>If any requested music or narration fails, the whole render fails rather than shipping a partial soundtrack.</li>
        </ul>
      </details>
    </header>

    <fieldset disabled={busy} className="space-y-5" aria-busy={busy}>
      <div className="space-y-1">
        <label htmlFor={`${id}-brief`} className={label}>Brief (optional)</label>
        <textarea id={`${id}-brief`} className={field} rows={2} maxLength={MAX_BRIEF_CHARS} value={project.brief}
          onChange={e => edit({ ...project, brief: e.target.value }, "brief")} data-testid="input-brief" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-aspect`} className={label}>Aspect ratio</label>
          <select id={`${id}-aspect`} className={field} value={project.aspect} onChange={e => edit({ ...project, aspect: e.target.value as AspectId })} data-testid="select-aspect">
            {Object.entries(ASPECTS).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.width}x{v.height})</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-transition`} className={label}>Transition</label>
          <select id={`${id}-transition`} className={field} value={project.transition} onChange={e => edit({ ...project, transition: e.target.value as ProductionProject["transition"] })} data-testid="select-transition">
            {TRANSITIONS.map(t => <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-grade`} className={label}>Color grade</label>
          <select id={`${id}-grade`} className={field} value={project.colorGrade} onChange={e => edit({ ...project, colorGrade: e.target.value as ProductionProject["colorGrade"] })} data-testid="select-grade">
            {COLOR_GRADES.map(g => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Scenes <span className="font-normal text-muted-foreground">({project.scenes.length}/{MAX_SCENES} · {total.toFixed(2)}s of {MAX_TOTAL_SEC}s)</span></h4>
          <Button type="button" size="sm" variant="outline" onClick={() => edit(addScene(project))} disabled={project.scenes.length >= MAX_SCENES} data-testid="button-add-scene"><Plus className="mr-1 h-4 w-4" />Add scene</Button>
        </div>
        <ol className="space-y-3">
          {project.scenes.map((s, i) => {
            const imgId = `${id}-img-${s.id}`;
            return <li key={s.id} className="rounded-lg border p-3" data-testid={`card-scene-${i}`}>
              <div className="flex gap-3">
                <div className="w-24 shrink-0 space-y-1">
                  {s.image
                    ? <img src={`data:${s.image.mime};base64,${s.image.b64}`} alt={`Scene ${i + 1} background preview`} className="h-24 w-24 rounded object-cover" />
                    : <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed text-center text-xs text-muted-foreground">Graded background</div>}
                  <label htmlFor={imgId} className="flex cursor-pointer items-center gap-1 text-xs underline"><ImagePlus className="h-3 w-3" />{s.image ? "Replace" : "Add image"}</label>
                  <input id={imgId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={e => { void attachImage(e.target.files?.[0], s.id); e.target.value = ""; }} data-testid={`input-scene-image-${i}`} />
                  {s.image && <button type="button" className="flex items-center gap-1 text-xs text-destructive underline"
                    onClick={() => edit(updateScene(project, s.id, { image: undefined }))} data-testid={`button-remove-image-${i}`}><X className="h-3 w-3" />Remove image</button>}
                </div>
                <div className="flex-1 space-y-2">
                  <label htmlFor={`${id}-text-${s.id}`} className={label}>Scene {i + 1} on-screen text</label>
                  <textarea id={`${id}-text-${s.id}`} className={field} rows={2} maxLength={MAX_SCENE_TEXT} value={s.text}
                    onChange={e => edit(updateScene(project, s.id, { text: e.target.value }), `text-${s.id}`)} data-testid={`input-scene-text-${i}`} />
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor={`${id}-dur-${s.id}`} className={label}>Seconds</label>
                      <input id={`${id}-dur-${s.id}`} type="number" min={0.5} max={30} step={0.25} className={`${field} w-24`}
                        value={Number.isFinite(s.durationSec) ? s.durationSec : ""}
                        onChange={e => edit(updateScene(project, s.id, { durationSec: e.target.valueAsNumber }), `dur-${s.id}`)} data-testid={`input-scene-duration-${i}`} />
                    </div>
                    <span className="pb-2 text-xs text-muted-foreground">{sceneFrames(s.durationSec)} frames @ {FPS}fps · {s.text.length}/{MAX_SCENE_TEXT}</span>
                    <div className="ml-auto flex gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={`Move scene ${i + 1} up`} disabled={i === 0} onClick={() => edit(moveScene(project, s.id, -1))} data-testid={`button-scene-up-${i}`}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Move scene ${i + 1} down`} disabled={i === project.scenes.length - 1} onClick={() => edit(moveScene(project, s.id, 1))} data-testid={`button-scene-down-${i}`}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Delete scene ${i + 1}`} disabled={project.scenes.length <= 1}
                        onClick={() => { if (!(s.text.trim() || s.image) || window.confirm(`Delete scene ${i + 1}? You can undo this.`)) edit(removeScene(project, s.id)); }} data-testid={`button-scene-delete-${i}`}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              </div>
            </li>;
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        {project.logo && <img src={`data:${project.logo.mime};base64,${project.logo.b64}`} alt="Logo preview" className="h-12 w-12 rounded object-contain" />}
        <div className="text-sm"><div className="font-medium">Logo overlay</div><div className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to {mib(MAX_IMAGE_BYTES)}. Media total {mib(mediaBytes)} of {mib(MAX_TOTAL_IMAGE_BYTES)}.</div></div>
        <label htmlFor={`${id}-logo`} className="ml-auto cursor-pointer text-sm underline">{project.logo ? "Replace logo" : "Add logo"}</label>
        <input id={`${id}-logo`} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
          onChange={e => { void attachImage(e.target.files?.[0], "logo"); e.target.value = ""; }} data-testid="input-logo" />
        {project.logo && <Button type="button" size="sm" variant="ghost" onClick={() => edit({ ...project, logo: undefined })} data-testid="button-remove-logo">Remove</Button>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={project.music.enabled}
            onChange={e => edit({ ...project, music: { ...project.music, enabled: e.target.checked } })} data-testid="checkbox-music" />Synthetic instrumental</label>
          {project.music.enabled && <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor={`${id}-bpm`} className={label}>Tempo (BPM)</label>
              <input id={`${id}-bpm`} type="number" min={60} max={200} className={field} value={Number.isFinite(project.music.bpm) ? project.music.bpm : ""}
                onChange={e => edit({ ...project, music: { ...project.music, bpm: e.target.valueAsNumber } }, "bpm")} data-testid="input-bpm" /></div>
            <div><label htmlFor={`${id}-key`} className={label}>Key</label>
              <select id={`${id}-key`} className={field} value={project.music.key} onChange={e => edit({ ...project, music: { ...project.music, key: e.target.value } })} data-testid="select-key">
                {MUSIC_KEYS.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label htmlFor={`${id}-inst`} className={label}>Instrument</label>
              <select id={`${id}-inst`} className={field} value={project.music.instrument} onChange={e => edit({ ...project, music: { ...project.music, instrument: e.target.value as ProductionProject["music"]["instrument"] } })} data-testid="select-instrument">
                {INSTRUMENTS.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label htmlFor={`${id}-arr`} className={label}>Arrangement</label>
              <select id={`${id}-arr`} className={field} value={project.music.arrangement} onChange={e => edit({ ...project, music: { ...project.music, arrangement: e.target.value as ProductionProject["music"]["arrangement"] } })} data-testid="select-arrangement">
                {ARRANGEMENTS.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
          </div>}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={project.narration.enabled}
            onChange={e => edit({ ...project, narration: { ...project.narration, enabled: e.target.checked } })} data-testid="checkbox-narration" />Synthetic narration</label>
          {project.narration.enabled && <>
            <label htmlFor={`${id}-narr`} className={label}>Narration script (read exactly as written)</label>
            <textarea id={`${id}-narr`} className={field} rows={3} maxLength={MAX_NARRATION_CHARS} value={project.narration.text}
              onChange={e => edit({ ...project, narration: { ...project.narration, text: e.target.value } }, "narr")} data-testid="input-narration" />
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor={`${id}-voice`} className={label}>Voice</label>
                <select id={`${id}-voice`} className={field} value={project.narration.voice} onChange={e => edit({ ...project, narration: { ...project.narration, voice: e.target.value as ProductionProject["narration"]["voice"] } })} data-testid="select-voice">
                  {VOICES.map(v => <option key={v} value={v}>{v === "en-us" ? "English (US), synthetic" : "English (UK), synthetic"}</option>)}</select></div>
              <div><label htmlFor={`${id}-wpm`} className={label}>Pace (words/min)</label>
                <input id={`${id}-wpm`} type="number" min={100} max={220} step={1} className={field} value={Number.isFinite(project.narration.wpm) ? project.narration.wpm : ""}
                  onChange={e => edit({ ...project, narration: { ...project.narration, wpm: e.target.valueAsNumber } }, "wpm")} data-testid="input-wpm" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Estimated speech {estimateNarrationSec(project.narration.text, project.narration.wpm)}s against a {total.toFixed(2)}s video.</p>
          </>}
        </div>
      </div>
    </fieldset>

    <div className="flex flex-wrap gap-2 border-t pt-4">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => downloadText("production-project.json", serializeProject(project), "application/json")} data-testid="button-export-project"><FileJson className="mr-1 h-4 w-4" />Save portable project (.json)</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => importRef.current?.click()} data-testid="button-import-project"><Upload className="mr-1 h-4 w-4" />Open project</Button>
      <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Open project file"
        onChange={e => { void importProject(e.target.files?.[0]); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => downloadText("production-script.txt", buildScriptText(project), "text/plain")} data-testid="button-download-script"><FileText className="mr-1 h-4 w-4" />Script (.txt)</Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={resetProject} data-testid="button-new-project">New project</Button>
    </div>
    <p className="text-xs text-muted-foreground">Saving downloads a file to this device including your images and settings. It is not cloud sync.</p>

    {errors.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground" aria-live="polite" data-testid="list-validation">{errors.slice(0, 4).map(e => <li key={e}>{e}</li>)}</ul>}
    {error && <p role="alert" className="text-sm text-destructive" data-testid="status-error">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

    <div className="flex gap-2">
      <Button type="button" onClick={() => void render()} disabled={busy || errors.length > 0} aria-busy={busy} className="flex-1" data-testid="button-render-production">
        {busy ? `Rendering... ${elapsed}s` : output ? "Render again" : "Render video"}
      </Button>
      {busy && <Button type="button" variant="outline" onClick={cancel} data-testid="button-cancel-render">Cancel</Button>}
    </div>

    {output && <div className="space-y-2 rounded-lg border p-3" aria-label="Rendered video" data-testid="panel-production-result">
      {stale && <p role="status" className="rounded bg-amber-500/15 px-2 py-1 text-sm text-amber-700 dark:text-amber-300" data-testid="status-stale">Out of date: the project changed after this render. Render again to match your edits.</p>}
      {error && <p className="text-xs text-muted-foreground">Showing the last successful render.</p>}
      <video controls playsInline src={output.media.url} className="max-h-96 w-full rounded bg-black/80" />
      {output.media.audioFinishing && <p className="text-sm text-muted-foreground">
        Measured soundtrack: {output.media.audioFinishing.integratedLufs.toFixed(1)} LUFS
        {" · "}{output.media.audioFinishing.truePeakDbtp.toFixed(1)} dBTP.
        {output.media.audioFinishing.adaptiveDucking && " Music is reduced during narration and recovers between phrases."}
      </p>}
      <p className="text-sm text-muted-foreground">{output.media.width} x {output.media.height}{output.media.durationSec ? ` · ${output.media.durationSec.toFixed(2)}s` : ""}{output.timeline ? ` · ${output.timeline.length} scenes confirmed by receipt` : ""}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={output.media.url} download="production.mp4" className="inline-flex items-center gap-1 font-medium underline" data-testid="link-download-video"><Download className="h-4 w-4" />Download video</a>
        <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => downloadText("scene-captions.srt", buildSceneSrt(output.scenes), "application/x-subrip")} data-testid="button-download-srt"><FileText className="h-4 w-4" />Scene captions (.srt)</button>
      </div>
      <p className="text-xs text-muted-foreground">Scene captions contain your on-screen text at the rendered scene boundaries. They are not a transcription of narration.</p>
    </div>}
  </section>;
}

export default ProductionWorkbench;

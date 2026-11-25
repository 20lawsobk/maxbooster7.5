// Actual ordinary-user HTTP integration. No admin/cache-eviction/model-control APIs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hash, canonical } from './runner.mjs';

const exec = promisify(execFile);
const root = 'external/maxcore/artifacts/ai-training-server/';
const sourceFiles = ['server.py','ai_model/awareness/engine.py','ai_model/generation/plan.py',
  'ai_model/generation/awareness.py','ai_model/generation/dedicated.py',
  'ai_model/gpu/awareness_kernels.py'];
const requireValue = (ok, code) => { if (!ok) throw new Error(code); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function apiRequest(test, seed) {
  const common = {prompt:test.prompt, topic:test.prompt, instruction:test.prompt, seed,
    constraints:{evaluation_only:true, no_external_paid_models:true, no_publishing:true}};
  if (test.id === 'music') return {path:'/api/generate/audio',
    body:{...common, duration:4, instrument:'piano', mood:'mellow'}};
  if (test.id === 'video-clip') return {path:'/api/video/generate-ai',
    body:{...common, idea:test.prompt, platform:test.platform ?? 'tiktok', duration:4, tone:'calm'}};
  // The public text endpoint is used for a scene specification, not passed off as video.
  return {path:'/api/generate/text',
    body:{...common, mode:'content', platform:test.platform ?? 'general',
      tone:'authentic', format:test.kind === 'scene-spec' ? 'scene specification':'text'}};
}

export function semanticOutput(result) {
  for (const key of ['text','content','script','caption']) {
    if (typeof result?.[key] === 'string' && result[key].trim()) return result[key];
  }
  const outputs = result?.outputs;
  if (Array.isArray(outputs)) return outputs.map(x => x.text ?? x.content ?? x.script ?? '').join('\n');
  return '';
}

export function observe(result, frozen, request) {
  const plan = result?.generation_plan;
  const snapshot = plan?.snapshot;
  const output = semanticOutput(result);
  const sameSnapshot = plan?.snapshot_id === frozen.snapshotId && snapshot?.id === frozen.snapshotId;
  const checkpoint = plan?.checkpoint;
  return {
    status:result?.refusal === true ? 'REFUSED' :
      result?.fallback === true || (result?.source && !['model','ai_model','model_composed'].includes(result.source) && output) ? 'FAILED_FALLBACK' :
      plan ? 'RESPONSE_OBSERVED':'NOT_ESTABLISHED',
    snapshotId:plan?.snapshot_id ?? null,
    snapshotMatch:sameSnapshot ? 'PASS':'FAIL',
    snapshotHash:snapshot ? hash(snapshot) : null,
    sourceProvenanceHash:snapshot ? hash({domains:snapshot.domains, source_health:snapshot.source_health}) : null,
    checkpointHash:checkpoint ?? null,
    checkpointPinned:/^[a-f0-9]{64}$/.test(checkpoint ?? '') && checkpoint === frozen.checkpointHash,
    seed:plan?.seed ?? null,
    requestedSeed:request.body.seed,
    seedMatch:plan?.seed === request.body.seed,
    cacheIdentity:plan?.plan_hash ?? null,
    cached:typeof result?.cached === 'boolean' ? result.cached : null,
    checkpointInference:result?.checkpoint_inference === true,
    capabilityStatus:result?.capability_status ?? null,
    validation:result?.validation ?? null,
    output, outputHash:output ? hash(output) : null,
    // A process-wide delta is never represented as request-attributed GPU evidence.
    requestScopedGpuDispatch:'NOT_ESTABLISHED',
    quality:'NOT_ESTABLISHED',
  };
}

export function compareAttempts(a, b) {
  const frozen = a.snapshotMatch === 'PASS' && b.snapshotMatch === 'PASS' &&
    a.checkpointPinned && a.checkpointHash === b.checkpointHash &&
    a.seed === b.seed && a.cacheIdentity && a.cacheIdentity === b.cacheIdentity;
  return {sameFrozenInputs:frozen ? 'PASS':'NOT_ESTABLISHED',
    exactTextReplay:frozen && a.outputHash && b.outputHash ? (a.outputHash === b.outputHash ? 'PASS':'FAIL') : 'NOT_ESTABLISHED',
    uncachedReplay:frozen && a.cached === false && b.cached === false && a.outputHash && b.outputHash ?
      (a.outputHash === b.outputHash ? 'PASS':'FAIL') : 'NOT_ESTABLISHED'};
}

export async function decodeMedia(file, kind, expectedDuration = 4) {
  try {
    const {stdout} = await exec('ffprobe', ['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],
      {timeout:30000, maxBuffer:1024 * 1024});
    const probe = JSON.parse(stdout);
    const stream = probe.streams.find(s => s.codec_type === kind);
    requireValue(stream, 'MISSING_MEDIA_STREAM');
    const duration = Number(stream.duration ?? probe.format?.duration);
    const {stderr} = await exec('ffmpeg', ['-v','error','-nostdin','-i',file,'-f','null','-'],
      {timeout:30000, maxBuffer:1024 * 1024});
    requireValue(!stderr.trim(), 'DECODE_ERRORS');
    return {decode:'PASS', durationSeconds:duration,
      durationGate:Number.isFinite(duration) && Math.abs(duration - expectedDuration) <= .25 ? 'PASS':'FAIL',
      codec:stream.codec_name, width:stream.width, height:stream.height,
      sampleRate:stream.sample_rate, channels:stream.channels,
      decodedFrames:Number(stream.nb_read_frames),
      multipleFrames:kind === 'video' ? (Number(stream.nb_read_frames) > 1 ? 'PASS':'FAIL') : 'NOT_APPLICABLE',
      semanticFidelity:'NOT_ESTABLISHED', temporalConsistency:'NOT_ESTABLISHED'};
  } catch { return {decode:'NOT_ESTABLISHED', reason:'FFMPEG_OR_FFPROBE_FAILED'}; }
}

export async function runActualApi(env = process.env) {
  requireValue(env.MAXCORE_FUSED_PARENT_READY === 'yes' && env.MAXCORE_FUSED_ALLOW_GENERATION === 'yes', 'PARENT_APPROVAL_REQUIRED');
  const base = new URL(env.MAXCORE_FUSED_BASE_URL || (env.REPLIT_DEV_DOMAIN ? `https://${env.REPLIT_DEV_DOMAIN}` : 'http://127.0.0.1:5000'));
  requireValue(!base.username && !base.password && base.pathname === '/' &&
    (base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname))), 'INVALID_ORIGIN');
  const cookies = new Map();
  if (env.E2E_SESSION_COOKIE) for (const pair of env.E2E_SESSION_COOKIE.split(';')) {
    const at = pair.indexOf('='); if (at > 0) cookies.set(pair.slice(0,at).trim(),pair.slice(at+1).trim());
  }
  let csrf = env.E2E_CSRF_TOKEN;
  let requests = 0;
  const deadline = Date.now() + 12 * 60 * 1000;
  async function request(path, body, binary = false) {
    requireValue(++requests <= 140 && Date.now() < deadline, 'RUN_BUDGET_EXHAUSTED');
    const url = new URL(path, base);
    requireValue(url.origin === base.origin && url.pathname.startsWith('/api/') &&
      !/training|reload|internal|autopilot|publish|admin/.test(url.pathname), 'UNSAFE_API');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(120000, deadline - Date.now()));
    try {
      const response = await fetch(url, {method:body ? 'POST':'GET', redirect:'error', signal:controller.signal,
        headers:{'content-type':'application/json', cookie:[...cookies].map(([k,v]) => `${k}=${v}`).join('; '),
          ...(csrf ? {'x-csrf-token':csrf} : {})}, ...(body ? {body:canonical(body)} : {})});
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0], at = pair.indexOf('=');
        cookies.set(pair.slice(0,at),pair.slice(at+1));
      }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > (binary ? 32 * 1024 * 1024 : 4 * 1024 * 1024)) {
          controller.abort(); throw new Error('BODY_LIMIT');
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (binary) return {status:response.status, bytes};
      let json = null;
      try { json = JSON.parse(bytes.toString()); } catch {}
      return {status:response.status, json};
    } finally { clearTimeout(timer); }
  }
  const runDirectory = `reports/maxcore-fused/live-${Date.now()}`;
  await mkdir(runDirectory, {recursive:true, mode:0o700});
  const write = (name, value) => writeFile(`${runDirectory}/${name}`, JSON.stringify(value,null,2)+'\n', {mode:0o600,flag:'wx'});
  const report = {version:2, execution:'STARTED', quality:'NOT_ESTABLISHED', veoComparison:'NOT_ESTABLISHED', cases:[]};
  try {
    const token = await request('/api/csrf-token');
    csrf = token.json?.csrfToken ?? csrf;
    if (!env.E2E_SESSION_COOKIE) {
      requireValue(env.E2E_USERNAME && env.E2E_PASSWORD, 'NORMAL_E2E_CREDENTIALS_REQUIRED');
      const login = await request('/api/auth/login', {username:env.E2E_USERNAME,password:env.E2E_PASSWORD,
        ...(env.E2E_TWO_FACTOR_CODE ? {twoFactorCode:env.E2E_TWO_FACTOR_CODE} : {})});
      requireValue(login.status === 200 && !login.json?.requiresTwoFactor, 'NORMAL_LOGIN_FAILED');
      csrf = (await request('/api/csrf-token')).json?.csrfToken ?? csrf;
    }
    const readiness = await request('/api/ready');
    report.readinessHttpStatus = readiness.status;
    requireValue(readiness.status === 200, 'READINESS_NOT_READY');
    const before = await request('/api/awareness/unified/status');
    requireValue(before.status === 200 && before.json?.ready === true, 'AWARENESS_NOT_READY');
    // Context endpoint performs no refresh/ingestion, only reads the actual canonical snapshot.
    const context = await request('/api/awareness/unified/context', {platform:'general',modality:'text'});
    requireValue(context.status === 200 && typeof context.json?.context === 'string' &&
      context.json.snapshot_id === before.json.snapshot_id, 'CONTEXT_UNAVAILABLE_OR_DRIFTED');
    const capabilities = await request('/api/generation/capabilities');
    const checkpointHash = capabilities.json?.serving_release?.checkpoint_sha256;
    const releasePath = `${root}ai_model/weights/model.release.json`;
    const release = JSON.parse(await readFile(releasePath,'utf8'));
    requireValue(capabilities.status === 200 && /^[a-f0-9]{64}$/.test(checkpointHash ?? ''), 'CHECKPOINT_PIN_UNAVAILABLE');
    requireValue(release.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(release.sha256 ?? ''),
      'LOCAL_RELEASE_MANIFEST_INVALID');
    requireValue(checkpointHash === release.sha256, 'CHECKPOINT_RELEASE_MISMATCH');
    const cases = JSON.parse(await readFile('evaluations/maxcore-fused/cases.json','utf8'));
    const pins = {};
    for (const path of [...sourceFiles.map(p => root+p),
      releasePath,
      'client/src/pages/SocialMedia.tsx','client/src/lib/socialPlatformStatus.ts',
      'shared/social-platform-optimization.json',
      'evaluations/maxcore-quality/cases.json','evaluations/maxcore-quality/types.json',
      'evaluations/maxcore-fused/cases.json','evaluations/maxcore-fused/live-api.mjs']) pins[path] = hash(await readFile(path));
    const frozen = {snapshotId:context.json.snapshot_id, expiresAt:context.json.expires_at, checkpointHash,
      actualContext:context.json.context, contextDigest:hash(context.json.context),
      sourceHealth:before.json.source_health, sourceProvenanceHash:hash(before.json.source_health),
      sourcePins:pins, cases, requests:cases.cases.map(t => ({id:t.id,...apiRequest(t,cases.seed)}))};
    frozen.digest = hash(frozen);
    await write('snapshot.json', frozen);
    report.snapshotDigest = frozen.digest;
    report.awarenessBefore = {snapshotId:before.json.snapshot_id,gpu:before.json.gpu};
    for (const test of cases.cases) {
      requireValue(Date.now() / 1000 < frozen.expiresAt, 'SNAPSHOT_EXPIRED');
      const req = apiRequest(test,cases.seed);
      const row = {id:test.id, kind:test.kind, platform:test.platform ?? null,
        prompt:test.prompt, criteria:test.criteria, requestHash:hash(req), attempts:[]};
      report.cases.push(row);
      for (let attempt = 0; attempt < (test.kind === 'text' || test.kind === 'scene-spec' ? 2 : 1); attempt++) {
        const response = await request(req.path, req.body);
        if (response.status !== 200) {
          row.attempts.push({status:[422,503].includes(response.status) ? 'EXPLICIT_REJECTION':'HTTP_FAILURE',
            httpStatus:response.status, errorDigest:hash(response.json), noFallback:true});
          requireValue(![401,403].includes(response.status),'AUTHORIZATION_FAILED');
          continue;
        }
        const result = response.json;
        const observation = observe(result,frozen,req);
        observation.uncachedLimitation = 'No ordinary-user uncached/bypass control exposed by inspected API; cache hits never establish uncached replay.';
        row.attempts.push(observation);
        if (result?.generation_plan?.snapshot) {
          await write(`${test.id}-${attempt}-provenance.json`, {
            snapshot:result.generation_plan.snapshot, checkpoint:result.generation_plan.checkpoint,
            planHash:result.generation_plan.plan_hash, seed:result.generation_plan.seed,
            requestHash:hash(req), sourcePins:pins});
        }
        // Poll only the job generated by this request; never enumerate users' jobs.
        if (['audio','video'].includes(test.kind)) {
          let completed = result;
          const id = result?.job_id ?? result?.jobId;
          if (id && /^[A-Za-z0-9_-]{1,100}$/.test(id)) {
            const pollPath = test.kind === 'audio' ? `/api/audio-job/${id}` : `/api/video-job/${id}`;
            for (let n = 0; n < 12 && !['done','completed','failed','error'].includes(completed.status); n++) {
              await sleep(2000);
              const poll = await request(pollPath);
              if (poll.status !== 200) break;
              completed = poll.json;
            }
          }
          const mediaUrl = completed?.url ?? completed?.audio_url ?? result?.url;
          if (typeof mediaUrl === 'string') {
            const url = new URL(mediaUrl,base);
            // Never send session credentials to object storage or another origin.
            if (url.origin === base.origin && /^\/api\/(maxcore-media\/|video-job\/|audio-job\/|storage\/)/.test(url.pathname)) {
              const media = await request(url.pathname + url.search, undefined, true);
              if (media.status === 200) {
                const name = `${test.id}-${attempt}.media`;
                await writeFile(`${runDirectory}/${name}`,media.bytes,{mode:0o600,flag:'wx'});
                observation.artifact = {sha256:hash(media.bytes), bytes:media.bytes.length,
                  ...await decodeMedia(`${runDirectory}/${name}`,test.kind,test.durationSeconds)};
              }
            }
          }
          observation.decodedMedia = observation.artifact?.decode ?? 'NOT_ESTABLISHED';
        }
      }
      if (row.attempts.length === 2) row.replay = compareAttempts(...row.attempts);
    }
    const after = await request('/api/awareness/unified/status');
    report.awarenessAfter = {snapshotId:after.json?.snapshot_id,gpu:after.json?.gpu};
    report.awarenessDispatchDelta = Number.isFinite(after.json?.gpu?.completed) ?
      after.json.gpu.completed - before.json.gpu.completed : null;
    report.dispatchAttribution = 'PROCESS_WIDE_ONLY_NOT_REQUEST_ATTRIBUTED';
    report.execution = 'COMPLETE';
  } catch {
    report.execution = 'BLOCKED';
    report.error = 'AUTH_READINESS_SNAPSHOT_OR_REQUEST_FAILED_NO_FALLBACK';
  }
  report.httpRequests = requests;
  await write('report.json',report);
  return {directory:runDirectory, execution:report.execution};
}
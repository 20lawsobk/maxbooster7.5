from __future__ import annotations
import time
import os
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ScriptGenerateRequest, ScriptGenerateResponse,
    VisualSpecGenerateRequest, VisualSpecGenerateResponse,
    DistributionGenerateRequest, DistributionGenerateResponse,
    ContentGenerateRequest, ContentGenerateResponse,
    MultiPlatformRequest, MultiPlatformResponse,
    BoostSheetCreateRequest, BoostSheetResponse,
    OptimizeRequest, OptimizeResponse,
    TrainRequest, TrainResponse,
    SyntheticDataRequest, SyntheticDataResponse,
    TrainingStatusResponse,
    VideoGenerateRequest, VideoGenerateResponse,
    CinematicTemplatesResponse, CinematicTemplateInfo,
    HealthResponse,
)
from ..model.tokenizer import SimpleTokenizer
from ..model.transformer import TransformerLM
from ..model.creative_model import CreativeModel
from ..agents.script_agent import ScriptAgent, ScriptRequest
from ..agents.visual_spec_agent import VisualSpecAgent, VisualSpecRequest
from ..agents.distribution_agent import DistributionAgent, DistributionRequest
from ..agents.optimization_agent import OptimizationAgent, OptimizationRequest
from ..boostsheets.boostsheet import BoostSheet
from ..boostsheets.repository import BoostSheetRepository
from ..boostsheets.lifecycle import BoostSheetLifecycle
from ..boostsheets.versioning import BoostSheetVersioning, diff_sheets
from ..adapters.url_adapter import UrlToBoostSheetAdapter
from ..render_manager import RenderManager

app = FastAPI(
    title="Max Booster AI Content Model",
    description="Custom transformer-based content generation for 8 social platforms",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = "cpu"
WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights")
WEIGHTS_PATH = os.path.join(WEIGHTS_DIR, "model.pt")

tokenizer: SimpleTokenizer = None  # type: ignore
creative_model: CreativeModel = None  # type: ignore
script_agent: ScriptAgent = None  # type: ignore
visual_spec_agent: VisualSpecAgent = None  # type: ignore
distribution_agent: DistributionAgent = None  # type: ignore
optimization_agent: OptimizationAgent = None  # type: ignore
repo: BoostSheetRepository = None  # type: ignore
adapter: UrlToBoostSheetAdapter = None  # type: ignore
render_manager: RenderManager = None  # type: ignore

PLATFORM_NORMALIZE = {
    "googlebusiness": "google_business",
    "google_business": "google_business",
    "twitter": "twitter",
    "x": "twitter",
}


def normalize_platform(p: str) -> str:
    return PLATFORM_NORMALIZE.get(p.lower(), p.lower())


@app.on_event("startup")
async def startup():
    global tokenizer, creative_model, script_agent, visual_spec_agent
    global distribution_agent, optimization_agent, repo, adapter, render_manager

    print("[AI Model] Initializing Max Booster AI Content Model...")
    tokenizer = SimpleTokenizer()

    dim = int(os.environ.get("AI_MODEL_DIM", "128"))
    n_layers = int(os.environ.get("AI_MODEL_LAYERS", "3"))
    n_heads = int(os.environ.get("AI_MODEL_HEADS", "4"))
    max_len = int(os.environ.get("AI_MODEL_MAX_LEN", "128"))

    if os.path.exists(WEIGHTS_PATH):
        print(f"[AI Model] Loading weights from {WEIGHTS_PATH}")
        checkpoint = torch.load(WEIGHTS_PATH, map_location=DEVICE)
        if isinstance(checkpoint, dict) and "vocab" in checkpoint:
            tokenizer.vocab = checkpoint["vocab"]
            tokenizer.inv_vocab = checkpoint["inv_vocab"]
            tokenizer.next_id = checkpoint["next_id"]
            print(f"[AI Model] Restored vocab ({tokenizer.vocab_size} tokens)")
            state_dict = checkpoint["model_state_dict"]

            if "config" in checkpoint:
                cfg = checkpoint["config"]
                dim = cfg.get("dim", dim)
                n_layers = cfg.get("layers", n_layers)
                n_heads = cfg.get("heads", n_heads)
                max_len = cfg.get("max_len", max_len)
                print(f"[AI Model] Using checkpoint config: dim={dim}, layers={n_layers}, heads={n_heads}, max_len={max_len}")
            else:
                dim = state_dict["token_emb.weight"].shape[1]
                max_len = state_dict["pos_emb.weight"].shape[0]
                n_layers = sum(1 for k in state_dict if k.startswith("layers.") and k.endswith(".attn.qkv.weight"))
                n_heads_inferred = dim // (state_dict["layers.0.attn.qkv.weight"].shape[0] // 3 // (dim // n_heads)) if "layers.0.attn.qkv.weight" in state_dict else n_heads
                n_heads = n_heads_inferred
                print(f"[AI Model] Inferred config from weights: dim={dim}, layers={n_layers}, heads={n_heads}, max_len={max_len}")

            saved_vocab = state_dict["token_emb.weight"].shape[0]
            if saved_vocab != tokenizer.vocab_size:
                print(f"[AI Model] WARNING: Vocab mismatch (checkpoint={saved_vocab}, tokenizer={tokenizer.vocab_size}). Using checkpoint vocab size.")
        else:
            state_dict = checkpoint
            saved_vocab = max(len(tokenizer.vocab), 1000)

        base_model = TransformerLM(
            vocab_size=saved_vocab,
            dim=dim,
            n_layers=n_layers,
            n_heads=n_heads,
            max_len=max_len,
        )
        base_model.load_state_dict(state_dict)
    else:
        print("[AI Model] No pre-trained weights found, using random initialization")
        base_model = TransformerLM(
            vocab_size=max(len(tokenizer.vocab), 1000),
            dim=dim,
            n_layers=n_layers,
            n_heads=n_heads,
            max_len=max_len,
        )

    creative_model = CreativeModel(base_model, tokenizer, device=DEVICE)
    script_agent = ScriptAgent(creative_model)
    visual_spec_agent = VisualSpecAgent(creative_model)
    distribution_agent = DistributionAgent(creative_model)
    optimization_agent = OptimizationAgent(creative_model)
    repo = BoostSheetRepository(path="boostsheets_db")
    adapter = UrlToBoostSheetAdapter(repo)
    render_manager = RenderManager()

    print(f"[AI Model] Model initialized (dim={dim}, layers={n_layers}, heads={n_heads})")
    print(f"[AI Model] Vocab size: {len(tokenizer.vocab)}")
    print(f"[AI Model] Device: {DEVICE}")
    print("[AI Model] Ready to serve requests on port 9878")


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        model_loaded=creative_model is not None,
        vocab_size=len(tokenizer.vocab) if tokenizer else 0,
        device=DEVICE,
    )


@app.post("/generate/script", response_model=ScriptGenerateResponse)
async def generate_script(req: ScriptGenerateRequest):
    start = time.time()
    platform = normalize_platform(req.platform)
    result = script_agent.run(ScriptRequest(
        idea=req.idea,
        platform=platform,
        goal=req.goal,
        tone=req.tone,
    ))
    return ScriptGenerateResponse(
        success=True,
        hook=result.hook,
        body=result.body,
        cta=result.cta,
        platform=platform,
        source=getattr(result, "source", "template"),
        processing_time_ms=(time.time() - start) * 1000,
    )


@app.post("/generate/visual-spec", response_model=VisualSpecGenerateResponse)
async def generate_visual_spec(req: VisualSpecGenerateRequest):
    platform = normalize_platform(req.platform)
    result = visual_spec_agent.run(VisualSpecRequest(
        idea=req.idea,
        platform=platform,
        tone=req.tone,
    ))
    return VisualSpecGenerateResponse(
        success=True,
        thumbnail_prompt=result.thumbnail_prompt,
        color_scheme=result.color_scheme,
        layout=result.layout,
        platform=platform,
    )


@app.post("/generate/distribution", response_model=DistributionGenerateResponse)
async def generate_distribution(req: DistributionGenerateRequest):
    platform = normalize_platform(req.platform)
    result = distribution_agent.run(DistributionRequest(
        script=req.script,
        platform=platform,
        goal=req.goal,
    ))
    return DistributionGenerateResponse(
        success=True,
        caption=result.caption,
        content=result.caption,
        hashtags=result.hashtags,
        posting_time=result.posting_time,
        platform=platform,
    )


@app.post("/generate/content", response_model=ContentGenerateResponse)
async def generate_content(req: ContentGenerateRequest):
    start = time.time()
    platform = normalize_platform(req.platform)

    script_result = script_agent.run(ScriptRequest(
        idea=req.topic,
        platform=platform,
        goal=req.goal,
        tone=req.tone,
    ))

    dist_result = None
    if req.include_distribution:
        full_script = f"{script_result.hook}\n{script_result.body}\n{script_result.cta}"
        dist_result = distribution_agent.run(DistributionRequest(
            script=full_script,
            platform=platform,
            goal=req.goal,
        ))

    visual_spec = None
    if req.include_visual_spec:
        vs_result = visual_spec_agent.run(VisualSpecRequest(
            idea=req.topic,
            platform=platform,
            tone=req.tone,
        ))
        visual_spec = {
            "thumbnail_prompt": vs_result.thumbnail_prompt,
            "color_scheme": vs_result.color_scheme,
            "layout": vs_result.layout,
        }

    caption = dist_result.caption if dist_result else f"{script_result.hook}\n{script_result.body}\n{script_result.cta}"
    hashtags = dist_result.hashtags if dist_result else []

    return ContentGenerateResponse(
        success=True,
        platform=platform,
        caption=caption,
        content=caption,
        hashtags=hashtags,
        hook=script_result.hook,
        body=script_result.body,
        cta=script_result.cta,
        source=getattr(script_result, "source", "template"),
        visual_spec=visual_spec,
        posting_time=dist_result.posting_time if dist_result else None,
        processing_time_ms=(time.time() - start) * 1000,
    )


@app.post("/generate/multi-platform", response_model=MultiPlatformResponse)
async def generate_multi_platform(req: MultiPlatformRequest):
    start = time.time()
    generated_content = []

    valid_platforms = [
        "tiktok", "instagram", "youtube", "facebook",
        "twitter", "linkedin", "google_business", "googlebusiness", "threads"
    ]

    for plat in req.platforms:
        platform = normalize_platform(plat)
        if platform not in valid_platforms and plat not in valid_platforms:
            continue

        script_result = script_agent.run(ScriptRequest(
            idea=req.topic,
            platform=platform,
            goal=req.goal,
            tone=req.tone,
        ))

        full_script = f"{script_result.hook}\n{script_result.body}\n{script_result.cta}"

        dist_result = distribution_agent.run(DistributionRequest(
            script=full_script,
            platform=platform,
            goal=req.goal,
        ))

        caption = dist_result.caption
        if req.url:
            caption += f"\n\n\U0001F517 {req.url}"

        entry = {
            "platform": plat,
            "caption": caption,
            "content": caption,
            "hashtags": dist_result.hashtags,
            "posting_time": dist_result.posting_time,
            "hook": script_result.hook,
            "body": script_result.body,
            "cta": script_result.cta,
            "source": getattr(script_result, "source", "template"),
            "format": req.format,
            "target_audience": req.target_audience,
        }

        if req.url:
            entry["sourceUrl"] = req.url

        generated_content.append(entry)

    return MultiPlatformResponse(
        success=True,
        generated_content=generated_content,
        processing_time_ms=(time.time() - start) * 1000,
    )


@app.post("/boostsheet/create", response_model=BoostSheetResponse)
async def create_boostsheet(req: BoostSheetCreateRequest):
    result = {
        "platform": req.platform,
        "content": req.content,
        "format": req.format,
        "url": req.url,
    }
    sheet = adapter.create_from_url_result(result)

    lifecycle = BoostSheetLifecycle(sheet)
    lifecycle.transition("generated_by_agent")
    repo.save(sheet)

    return BoostSheetResponse(
        success=True,
        sheet_id=sheet.sheet_id,
        type=sheet.type,
        platform=sheet.platform,
        blocks=sheet.blocks,
        history=sheet.history,
    )


@app.get("/boostsheet/{sheet_id}", response_model=BoostSheetResponse)
async def get_boostsheet(sheet_id: str):
    try:
        sheet = repo.load(sheet_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="BoostSheet not found")
    return BoostSheetResponse(
        success=True,
        sheet_id=sheet.sheet_id,
        type=sheet.type,
        platform=sheet.platform,
        blocks=sheet.blocks,
        history=sheet.history,
    )


@app.get("/boostsheet")
async def list_boostsheets():
    ids = repo.list_ids()
    return {"success": True, "sheet_ids": ids, "count": len(ids)}


@app.post("/optimize", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    try:
        sheet = repo.load(req.sheet_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="BoostSheet not found")

    opt_req = OptimizationRequest(
        sheet=sheet,
        performance=req.performance,
        diffs=[],
        platform=normalize_platform(req.platform),
        goal=req.goal,
    )
    result = optimization_agent.run(opt_req)
    repo.save(result.revised_sheet)

    return OptimizeResponse(
        success=True,
        notes=result.notes,
        sheet_id=sheet.sheet_id,
    )


@app.post("/train", response_model=TrainResponse)
async def train_model(req: TrainRequest):
    from ..training.dataset import CreativeDataset
    from ..training.trainer import train as run_train, evaluate
    from ..training.config import TrainConfig, DEFAULT_TRAIN_CONFIG
    from ..training.synthetic import generate_synthetic_samples

    if req.generate_synthetic or not os.path.exists(req.data_path):
        print(f"[AI Model] Generating {req.synthetic_count} synthetic training samples...")
        generate_synthetic_samples(req.data_path, n=req.synthetic_count)

    if not os.path.exists(req.data_path):
        raise HTTPException(status_code=404, detail=f"Training data not found at {req.data_path}")

    tokenizer.unfreeze()

    max_len = creative_model.model.pos_emb.num_embeddings

    dataset = CreativeDataset(req.data_path, tokenizer, max_len=max_len)
    if len(dataset) == 0:
        tokenizer.freeze()
        raise HTTPException(status_code=400, detail="Training dataset is empty")

    dim = creative_model.model.token_emb.embedding_dim
    cfg = TrainConfig({
        "model": {"dim": dim, "layers": len(creative_model.model.layers), "heads": 4, "max_len": max_len},
        "train": {
            "lr": req.learning_rate,
            "batch_size": req.batch_size,
            "epochs": req.epochs,
            "data_path": req.data_path,
        }
    })

    creative_model.resize_embeddings()

    print(f"[AI Model] Training with {len(dataset)} samples, vocab={tokenizer.vocab_size}")
    run_train(creative_model.model, dataset, tokenizer, cfg, device=DEVICE)

    ppl = evaluate(creative_model.model, dataset, tokenizer, device=DEVICE)
    print(f"[AI Model] Training complete. Perplexity: {ppl}")

    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    n_layers = len(creative_model.model.layers)
    checkpoint = {
        "model_state_dict": creative_model.model.state_dict(),
        "vocab": tokenizer.vocab,
        "inv_vocab": tokenizer.inv_vocab,
        "next_id": tokenizer.next_id,
        "config": {
            "dim": dim,
            "layers": n_layers,
            "heads": cfg.heads,
            "max_len": max_len,
        },
    }
    torch.save(checkpoint, WEIGHTS_PATH)

    import json
    meta = {
        "vocab_size": tokenizer.vocab_size,
        "dim": dim,
        "layers": n_layers,
        "heads": cfg.heads,
        "max_len": max_len,
        "perplexity": ppl,
        "samples": len(dataset),
    }
    with open(os.path.join(WEIGHTS_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    tokenizer.freeze()

    return TrainResponse(
        success=True,
        message=f"Training completed. {len(dataset)} samples, perplexity: {ppl:.2f}" if ppl else "Training completed.",
        epochs_completed=req.epochs,
        vocab_size=tokenizer.vocab_size,
        samples_trained=len(dataset),
        perplexity=ppl,
    )


@app.post("/train/synthetic", response_model=SyntheticDataResponse)
async def generate_synthetic(req: SyntheticDataRequest):
    from ..training.synthetic import generate_synthetic_samples
    generate_synthetic_samples(req.path, n=req.count)
    return SyntheticDataResponse(
        success=True,
        samples_generated=req.count,
        path=req.path,
    )


@app.get("/train/status", response_model=TrainingStatusResponse)
async def training_status():
    from ..training.logger import TrainingLogger
    logger = TrainingLogger()
    return TrainingStatusResponse(
        success=True,
        samples_available=logger.sample_count(),
        weights_exist=os.path.exists(WEIGHTS_PATH),
        data_path="training/boostsheet_samples.json",
    )


@app.post("/train/log-sheet")
async def log_sheet_for_training(sheet_id: str):
    from ..training.logger import TrainingLogger
    try:
        sheet = repo.load(sheet_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="BoostSheet not found")
    logger = TrainingLogger()
    logger.log_from_sheet(sheet)
    return {"success": True, "message": f"BoostSheet {sheet_id} logged for training", "total_samples": logger.sample_count()}


@app.post("/train/gpu")
async def train_on_gpu(epochs: int = 3, lr: float = 5e-4, lanes: int = 32):
    from ..gpu.gpu_trainer import train_on_digital_gpu
    from ..training.config import TrainConfig
    cfg = TrainConfig()
    cfg.epochs = epochs
    cfg.lr = lr
    cfg.batch_size = 4
    try:
        model, best_val, profile = train_on_digital_gpu(
            data_path="training/boostsheet_samples_v2.json",
            config=cfg,
            lanes=lanes,
        )
        import math
        return {
            "success": True,
            "backend": "digital_gpu",
            "lanes": lanes,
            "epochs": epochs,
            "best_val_loss": round(best_val, 4),
            "ppl": round(math.exp(min(best_val, 20)), 2),
            "profile": profile,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/gpu/status")
async def gpu_status():
    from ..gpu.torch_backend import DigitalGPUBackend
    backend = DigitalGPUBackend(lanes=32)
    status = backend.status()
    return {
        "available": True,
        "backend": "digital_gpu",
        **status,
    }


@app.post("/generate/video", response_model=VideoGenerateResponse)
async def generate_video(req: VideoGenerateRequest):
    from ..video.cinematic_engine import render_video_auto
    from ..video.renderer import PLATFORM_RATIOS

    start = time.time()
    platform = normalize_platform(req.platform)

    hook = req.hook
    body = req.body
    cta = req.cta
    source = "custom"

    if req.topic and (not hook or not body):
        script_result = script_agent.run(ScriptRequest(
            idea=req.topic,
            platform=platform,
            goal=req.goal,
            tone=req.tone,
        ))
        hook = hook or script_result.hook
        body = body or script_result.body
        cta = cta or script_result.cta
        source = getattr(script_result, "source", "template")

    ratio = req.aspect_ratio or PLATFORM_RATIOS.get(platform, "9:16")
    quality = req.quality if req.quality in ["quick", "cinematic"] else "cinematic"

    result = render_video_auto(
        hook=hook, body=body, cta=cta,
        platform=platform, aspect_ratio=ratio,
        template=req.template, duration=req.duration,
        artist_name=req.artist_name or "", quality=quality,
        bg_color=req.bg_color, text_color=req.text_color,
        accent_color=req.accent_color,
    )

    if not result.success:
        return VideoGenerateResponse(
            success=False,
            error=result.error,
            platform=platform,
            quality=quality,
            processing_time_ms=(time.time() - start) * 1000,
        )

    return VideoGenerateResponse(
        success=True,
        filename=result.filename,
        url=f"/uploads/videos/{result.filename}",
        duration=result.duration,
        width=result.width,
        height=result.height,
        aspect_ratio=ratio,
        template=req.template,
        template_name=result.template_name,
        platform=platform,
        hook=hook,
        body=body,
        cta=cta,
        source=source,
        quality=quality,
        scenes_rendered=result.scenes_rendered,
        render_time_ms=result.render_time_ms,
        processing_time_ms=(time.time() - start) * 1000,
    )


@app.get("/generate/video/templates", response_model=CinematicTemplatesResponse)
async def get_cinematic_templates():
    from ..video.templates_v2 import get_template_list
    templates = get_template_list()
    return CinematicTemplatesResponse(
        success=True,
        templates=[CinematicTemplateInfo(**t) for t in templates],
    )


@app.post("/render/thumbnail")
async def render_thumbnail(sheet_id: str):
    try:
        sheet = repo.load(sheet_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="BoostSheet not found")
    result = render_manager.render_thumbnail(sheet)
    repo.save(sheet)
    return {"success": True, **result}


@app.post("/render/video")
async def render_video(sheet_id: str):
    try:
        sheet = repo.load(sheet_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="BoostSheet not found")
    result = render_manager.render_video(sheet)
    repo.save(sheet)
    return {"success": True, **result}

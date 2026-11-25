/**
 * DATASET DISCOVERY SERVICE
 *
 * Automatically searches public repositories for datasets across all content
 * types required for photorealistic content generation. Runs on a configurable
 * schedule and persists results to the DB.
 *
 * Sources:
 *   - HuggingFace Hub  (primary — free REST API, no auth)
 *   - Zenodo           (academic datasets, no auth)
 *   - Papers With Code (ML benchmark datasets, no auth)
 *   - Archive.org      (public domain collections — audio, image, video, text)
 *   - OpenML           (ML repository, no auth)
 *   - FigShare         (academic data repository, no auth)
 *
 * Content-type coverage:
 *   Music · Social · Visual Images · Faces/Humans · Video · 3D/Depth ·
 *   Text-Image Pairs · Synthetic Renders · Textures/Materials
 */

import { db } from "../lib/db.js";
import { discoveredDatasets } from "@workspace/db/schema";
import { logger } from "../logger.js";

// ── Config ────────────────────────────────────────────────────────────────

const DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PER_SOURCE = 100; // raised from 50

/** Max concurrent outbound requests per batch — avoids overwhelming sources. */
const BATCH_SIZE = 12;
/** Delay between batches (ms). */
const BATCH_DELAY_MS = 400;

// ── Music search queries — comprehensive MIR / audio-ML coverage ──────────

const MUSIC_QUERIES: string[] = [
  // ── General ───────────────────────────────────────────────────
  "music dataset",
  "audio dataset",
  "music audio recordings",
  "audio corpus",
  "open music dataset",

  // ── Core MIR tasks ────────────────────────────────────────────
  "music classification",
  "music generation",
  "music transcription",
  "music information retrieval",
  "music source separation",
  "music segmentation",
  "beat tracking dataset",
  "chord recognition dataset",
  "key detection music",
  "tempo estimation dataset",
  "onset detection audio",
  "pitch estimation dataset",
  "melody extraction dataset",
  "vocal melody extraction",
  "music emotion recognition",
  "cover song identification",
  "music auto-tagging",
  "automatic music transcription",
  "music structure analysis",
  "music similarity dataset",
  "query by humming",
  "music event detection",
  "lyric transcription dataset",

  // ── Format / representation ───────────────────────────────────
  "midi dataset",
  "multi-track audio dataset",
  "stem audio dataset",
  "polyphonic music dataset",
  "audio fingerprinting dataset",
  "symbolic music dataset",
  "music score dataset",
  "sheet music dataset",
  "audio spectrogram dataset",
  "mel spectrogram audio",
  "MFCC audio features",
  "audio features dataset",
  "music embedding dataset",
  "audio waveform dataset",

  // ── Generative / synthesis ────────────────────────────────────
  "music synthesis dataset",
  "text to music dataset",
  "music generation neural",
  "audio synthesis dataset",
  "sound synthesis dataset",
  "music diffusion dataset",
  "neural audio codec",

  // ── Instruments ───────────────────────────────────────────────
  "piano dataset",
  "guitar dataset",
  "drum dataset",
  "violin dataset",
  "singing voice dataset",
  "vocal audio dataset",
  "instrument recognition dataset",
  "orchestral music dataset",
  "bass guitar dataset",
  "flute dataset audio",
  "saxophone dataset",
  "solo instrument recording",

  // ── Genres ────────────────────────────────────────────────────
  "jazz music dataset",
  "classical music dataset",
  "electronic music dataset",
  "folk music dataset",
  "hip hop music dataset",
  "rock music dataset",
  "pop music dataset",
  "blues music dataset",
  "country music dataset",
  "ambient music dataset",

  // ── Speech × music ────────────────────────────────────────────
  "speech music dataset",
  "singing speech dataset",
  "music speech separation",

  // ── Environmental / scene audio ───────────────────────────────
  "environmental sound dataset",
  "sound event detection dataset",
  "acoustic scene classification",
  "urban sound dataset",
  "audio captioning dataset",
  "foley sound dataset",

  // ── Well-known benchmarks (name-based search) ─────────────────
  "FMA music dataset",
  "GTZAN music dataset",
  "NSynth audio dataset",
  "MagnaTagATune dataset",
  "MusicNet dataset",
  "GuitarSet dataset",
  "IRMAS dataset",
  "OpenMIC dataset",
  "MAPS piano dataset",
  "RWC music dataset",
  "DALI dataset singing",
  "Slakh dataset",
  "MedleyDB dataset",
  "MUSDB18 dataset",
  "FSD50K dataset",
  "AudioSet music",
  "MusicBrainz dataset",
  "Million Song Dataset",
];

// ── Social media search queries ───────────────────────────────────────────

const SOCIAL_QUERIES: string[] = [
  "social media dataset",
  "twitter dataset",
  "reddit dataset",
  "instagram dataset",
  "tiktok dataset",
  "youtube comments dataset",
  "social network dataset",
  "sentiment analysis dataset",
  "user generated content dataset",
  "viral content dataset",
  "social media engagement",
  "online community dataset",
  "hashtag dataset",
  "influencer dataset",
  "social media misinformation",
];

// ── Visual / photographic image queries ──────────────────────────────────

const VISUAL_IMAGE_QUERIES: string[] = [
  // General
  "high resolution image dataset",
  "photorealistic image dataset",
  "photograph dataset",
  "image dataset large scale",
  "open image dataset",
  "RAW image dataset",
  "HDR image dataset",
  "DSLR photography dataset",
  "stock photo dataset",

  // Scene types
  "landscape photography dataset",
  "nature photography dataset",
  "urban photography dataset",
  "street photography dataset",
  "indoor scene dataset",
  "outdoor scene dataset",
  "aerial photography dataset",
  "underwater photography dataset",
  "nighttime photography dataset",
  "macro photography dataset",
  "architecture photography dataset",
  "wildlife photography dataset",
  "weather scene dataset",
  "season scene dataset",

  // Image quality / restoration tasks
  "super resolution dataset",
  "image restoration dataset",
  "image denoising dataset",
  "image deblurring dataset",
  "image enhancement dataset",
  "image quality assessment dataset",
  "image inpainting dataset",
  "image colorization dataset",
  "low light image dataset",
  "image compression artifact dataset",

  // Object recognition
  "object detection dataset",
  "image segmentation dataset",
  "instance segmentation dataset",
  "semantic segmentation dataset",
  "panoptic segmentation dataset",
  "product image dataset",
  "food image dataset",
  "animal image dataset",
  "vehicle image dataset",
  "medical image dataset",

  // Well-known benchmarks
  "ImageNet dataset",
  "COCO image dataset",
  "Open Images dataset",
  "DIV2K dataset",
  "Flickr30k dataset",
  "SUN database scene",
  "Places365 dataset",
  "MIT indoor scenes dataset",
  "PASCAL VOC dataset",
  "ADE20K dataset",
  "LSUN dataset",
  "CUB-200 birds dataset",
  "CIFAR image dataset",
  "STL-10 dataset",
  "Tiny ImageNet dataset",
];

// ── Face and human body queries ───────────────────────────────────────────

const FACE_HUMAN_QUERIES: string[] = [
  // Face general
  "face dataset",
  "facial recognition dataset",
  "face detection dataset",
  "portrait dataset",
  "face generation dataset",
  "high resolution face dataset",
  "face image collection",

  // Facial attributes and analysis
  "facial expression dataset",
  "face attribute dataset",
  "face age estimation dataset",
  "face landmark dataset",
  "face alignment dataset",
  "face parsing dataset",
  "face occlusion dataset",
  "face in the wild dataset",
  "unconstrained face dataset",
  "face makeup dataset",
  "face emotion recognition",

  // Human body
  "human pose estimation dataset",
  "body pose dataset",
  "skeleton detection dataset",
  "human body segmentation",
  "person re-identification dataset",
  "pedestrian detection dataset",
  "crowd counting dataset",
  "human action recognition faces",
  "whole body dataset",
  "hand gesture dataset",

  // Well-known benchmarks
  "FFHQ face dataset",
  "CelebA dataset",
  "LFW dataset Labeled Faces",
  "VGGFace dataset",
  "AFLW face dataset",
  "300W face dataset",
  "WIDER face dataset",
  "IJB face dataset",
  "MegaFace dataset",
  "MS-Celeb dataset",
  "HELEN face dataset",
  "CelebA-HQ dataset",
  "Multi-PIE face dataset",
  "CMU Multi-PIE",
  "CASIA webface dataset",
  "AffectNet dataset",
  "RAF-DB expression dataset",
  "MPII human pose dataset",
  "COCO keypoints dataset",
  "Human3.6M dataset",
  "CMU Panoptic dataset",
];

// ── Video dataset queries ─────────────────────────────────────────────────

const VIDEO_QUERIES: string[] = [
  // General
  "video dataset large scale",
  "video understanding dataset",
  "video classification dataset",
  "natural scene video dataset",
  "high resolution video dataset",
  "4K video dataset",
  "cinematic video dataset",
  "raw video dataset",

  // Motion and action
  "action recognition dataset",
  "human action dataset",
  "motion capture dataset",
  "optical flow dataset",
  "video prediction dataset",
  "slow motion video dataset",
  "sports video dataset",
  "dance motion dataset",

  // Scene and content
  "driving video dataset",
  "surveillance video dataset",
  "time lapse dataset",
  "video object detection dataset",
  "video instance segmentation",
  "video object segmentation",
  "video semantic segmentation",
  "video saliency dataset",
  "video captioning dataset",
  "video question answering dataset",

  // Generative video
  "video generation dataset",
  "video synthesis dataset",
  "video inpainting dataset",
  "video stabilization dataset",
  "video super resolution dataset",
  "video denoising dataset",

  // Well-known benchmarks
  "Kinetics video dataset",
  "UCF101 action dataset",
  "HMDB51 video dataset",
  "Something-Something dataset",
  "ActivityNet dataset",
  "AVA actions dataset",
  "YouTube-8M dataset",
  "Moments in Time dataset",
  "Epic-Kitchens dataset",
  "Charades video dataset",
  "DAVIS video segmentation",
  "YouTube-VOS dataset",
  "MOT tracking dataset",
  "BDD100K driving dataset",
  "nuScenes dataset",
];

// ── 3D reconstruction and depth queries ──────────────────────────────────

const DEPTH_3D_QUERIES: string[] = [
  // Depth estimation
  "depth estimation dataset",
  "monocular depth dataset",
  "stereo depth dataset",
  "RGBD dataset",
  "depth completion dataset",
  "depth super resolution",
  "depth map dataset",

  // 3D reconstruction
  "3D reconstruction dataset",
  "multi-view stereo dataset",
  "photogrammetry dataset",
  "structure from motion dataset",
  "3D scene dataset",
  "indoor 3D dataset",
  "outdoor 3D reconstruction",

  // Point clouds and LiDAR
  "point cloud dataset",
  "LiDAR dataset",
  "3D point cloud segmentation",
  "outdoor LiDAR scan dataset",
  "autonomous driving LiDAR",

  // Neural radiance fields and implicit representations
  "NeRF dataset",
  "neural radiance field dataset",
  "implicit neural representation dataset",
  "3D Gaussian splatting dataset",
  "novel view synthesis dataset",

  // 3D objects and meshes
  "3D object dataset",
  "mesh dataset 3D",
  "voxel dataset 3D",
  "CAD model dataset",
  "3D shape dataset",

  // Well-known benchmarks
  "ShapeNet 3D dataset",
  "ModelNet dataset",
  "Objaverse 3D dataset",
  "NYU Depth v2 dataset",
  "KITTI depth dataset",
  "ScanNet 3D dataset",
  "Matterport3D dataset",
  "ETH3D dataset",
  "Middlebury stereo dataset",
  "DIODE depth dataset",
  "MegaDepth dataset",
  "DeMoN depth dataset",
  "Tanks and Temples dataset",
  "DTU MVS dataset",
];

// ── Text-image pair queries ───────────────────────────────────────────────

const TEXT_IMAGE_QUERIES: string[] = [
  // Image-text pairing
  "image text pairs dataset",
  "image caption dataset",
  "image description dataset",
  "image annotation dataset",
  "visual language dataset",
  "multimodal dataset image text",
  "CLIP training dataset",
  "contrastive language image",

  // Visual question answering and reasoning
  "visual question answering dataset",
  "visual reasoning dataset",
  "visual commonsense dataset",
  "image grounding dataset",
  "visual grounding dataset",
  "referring expression dataset",
  "image retrieval dataset",
  "cross modal retrieval",

  // Image generation conditioning
  "text to image dataset",
  "diffusion model training dataset",
  "image generation conditioning",
  "prompt image pair dataset",
  "visual semantic embedding dataset",
  "image text alignment dataset",
  "dense caption dataset",
  "region caption dataset",

  // Well-known benchmarks
  "LAION image text dataset",
  "LAION-5B dataset",
  "Conceptual Captions dataset",
  "CC3M dataset",
  "CC12M dataset",
  "COCO captions dataset",
  "Visual Genome dataset",
  "Flickr8k captions dataset",
  "Nocaps dataset",
  "SBU captions dataset",
  "WIT Wikipedia image text",
  "YFCC100M dataset",
  "RedCaps dataset",
  "Datacomp dataset",
  "ShareGPT4V dataset",
  "LLaVA instruction dataset",
];

// ── Synthetic and rendered image queries ──────────────────────────────────

const SYNTHETIC_RENDER_QUERIES: string[] = [
  // Synthetic general
  "synthetic image dataset",
  "computer generated imagery dataset",
  "rendered image dataset",
  "photorealistic rendering dataset",
  "ray tracing rendered dataset",
  "physically based rendering dataset",

  // Game engine and simulation
  "game engine dataset",
  "virtual environment dataset",
  "simulation dataset",
  "Unity rendering dataset",
  "Unreal Engine dataset",
  "sim to real transfer dataset",
  "domain adaptation synthetic dataset",

  // Blender and 3D rendering
  "Blender rendered dataset",
  "3D rendered scene dataset",
  "synthetic scene understanding",
  "rendered depth ground truth",
  "rendered surface normal dataset",
  "synthetic optical flow dataset",

  // Specific applications
  "synthetic face dataset",
  "synthetic human dataset",
  "avatar rendering dataset",
  "synthetic driving dataset",
  "synthetic indoor dataset",
  "synthetic object dataset",
  "synthetic crowd dataset",

  // Well-known benchmarks
  "CLEVR reasoning dataset",
  "GTA5 synthetic dataset",
  "SYNTHIA dataset",
  "Virtual KITTI dataset",
  "SceneFlow synthetic dataset",
  "MPI Sintel dataset",
  "FlyingThings3D dataset",
  "Falling Things dataset",
  "CARLA driving dataset",
  "InteriorNet dataset",
  "Hypersim dataset",
  "BlenderProc dataset",
];

// ── Texture and material queries ──────────────────────────────────────────

const TEXTURE_MATERIAL_QUERIES: string[] = [
  // General textures
  "texture dataset",
  "material dataset",
  "surface texture dataset",
  "texture recognition dataset",
  "texture synthesis dataset",
  "texture classification dataset",
  "texture segmentation dataset",

  // PBR materials
  "PBR material dataset",
  "physically based rendering material",
  "albedo map dataset",
  "normal map dataset",
  "roughness map dataset",
  "metallic map dataset",
  "displacement map dataset",
  "BRDF material dataset",

  // Specific material types
  "fabric texture dataset",
  "wood texture dataset",
  "stone texture dataset",
  "metal texture dataset",
  "concrete texture dataset",
  "skin texture dataset",
  "ground texture dataset",
  "wall texture dataset",

  // Environment and lighting
  "HDRI dataset",
  "HDR environment map dataset",
  "sky image dataset",
  "light estimation dataset",
  "illumination dataset",
  "indoor lighting dataset",
  "outdoor illumination dataset",

  // Well-known benchmarks
  "DTD texture dataset",
  "KTH-TIPS texture dataset",
  "FMD material dataset",
  "MINC material dataset",
  "PolyHaven HDRI",
  "OpenSurfaces material dataset",
  "GTOS ground texture dataset",
  "Describable Textures Dataset",
];

// ── Result type ───────────────────────────────────────────────────────────

export interface DatasetResult {
  externalId: string;
  source: string;
  name: string;
  description: string;
  url: string;
  downloadUrl?: string;
  sizeBytes?: number;
  category: string;
  tags: string[];
  license?: string;
  author?: string;
  likes?: number;
  downloads?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function batchedAll<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
  delayMs: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map((fn) => fn());
    const settled = await Promise.allSettled(batch);
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
    if (i + batchSize < tasks.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── Source: HuggingFace Hub ───────────────────────────────────────────────

async function searchHuggingFace(
  query: string,
  category: string,
): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    search: query,
    sort: "lastModified",
    direction: "-1",
    limit: String(MAX_PER_SOURCE),
  });

  const res = await fetch(`https://huggingface.co/api/datasets?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
  });

  if (!res.ok) return [];
  const data = (await res.json()) as any[];

  return data.map((d: any) => ({
    externalId: `hf:${d.id}`,
    source: "huggingface",
    name: d.id,
    description: d.description ?? d.cardData?.description ?? "",
    url: `https://huggingface.co/datasets/${d.id}`,
    downloadUrl: `https://huggingface.co/datasets/${d.id}/resolve/main/`,
    category,
    tags: (d.tags ?? []).slice(0, 20),
    license: d.cardData?.license ?? d.license ?? "unknown",
    author: d.author ?? d.id.split("/")[0],
    likes: d.likes ?? 0,
    downloads: d.downloads ?? 0,
  }));
}

// ── Source: Zenodo ────────────────────────────────────────────────────────

async function searchZenodo(
  query: string,
  category: string,
): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    q: query,
    type: "dataset",
    sort: "mostrecent",
    size: String(MAX_PER_SOURCE),
    status: "published",
  });

  const res = await fetch(`https://zenodo.org/api/records?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
  });

  if (!res.ok) return [];
  const body = (await res.json()) as any;
  const hits: any[] = body.hits?.hits ?? [];

  return hits.map((h: any) => {
    const files: any[] = h.files ?? [];
    const largestFile = [...files].sort(
      (a: any, b: any) => (b.size ?? 0) - (a.size ?? 0),
    )[0];
    return {
      externalId: `zenodo:${h.id}`,
      source: "zenodo",
      name: h.metadata?.title ?? `Zenodo ${h.id}`,
      description: h.metadata?.description ?? "",
      url: `https://zenodo.org/record/${h.id}`,
      downloadUrl: largestFile?.links?.self,
      sizeBytes:
        files.reduce((s: number, f: any) => s + (f.size ?? 0), 0) || undefined,
      category,
      tags: (h.metadata?.keywords ?? []).slice(0, 20),
      license: h.metadata?.license?.id ?? "unknown",
      author: h.metadata?.creators?.[0]?.name ?? "unknown",
    };
  });
}

// ── Source: Papers With Code ──────────────────────────────────────────────

async function searchPapersWithCode(
  query: string,
  category: string,
): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    q: query,
    items_per_page: String(MAX_PER_SOURCE),
  });

  const res = await fetch(
    `https://paperswithcode.com/api/v1/datasets/?${params}`,
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
    },
  );

  if (!res.ok) return [];
  const body = (await res.json()) as any;
  const results: any[] = body.results ?? [];

  return results.map((d: any) => ({
    externalId: `pwc:${d.id}`,
    source: "paperswithcode",
    name: d.name,
    description: d.description ?? "",
    url: d.url ?? `https://paperswithcode.com/dataset/${d.id}`,
    downloadUrl: d.url,
    category,
    tags: [],
    license: "unknown",
    author: "unknown",
  }));
}

// ── Source: Archive.org ───────────────────────────────────────────────────

async function searchArchiveOrg(
  query: string,
  category: string,
  mediatype: "audio" | "image" | "movies" | "texts" = "audio",
): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    q: `${query} AND mediatype:${mediatype}`,
    fl: "identifier,title,description,subject,creator,licenseurl,item_size",
    sort: "addeddate desc",
    rows: String(MAX_PER_SOURCE),
    output: "json",
  });

  const res = await fetch(`https://archive.org/advancedsearch.php?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "User-Agent": "MaxBooster-PDIM/1.0" },
  });

  if (!res.ok) return [];
  const body = (await res.json()) as any;
  const docs: any[] = body.response?.docs ?? [];

  return docs.map((d: any) => ({
    externalId: `archive:${d.identifier}`,
    source: "archive.org",
    name: d.title ?? d.identifier,
    description: Array.isArray(d.description)
      ? d.description.join(" ")
      : (d.description ?? ""),
    url: `https://archive.org/details/${d.identifier}`,
    downloadUrl: `https://archive.org/download/${d.identifier}`,
    sizeBytes: d.item_size ? Number(d.item_size) : undefined,
    category,
    tags: Array.isArray(d.subject) ? d.subject.slice(0, 20) : [],
    license: d.licenseurl ?? "public domain",
    author: Array.isArray(d.creator) ? d.creator[0] : (d.creator ?? "unknown"),
  }));
}

// ── Source: OpenML ────────────────────────────────────────────────────────
// Free REST API — no authentication required.
// https://www.openml.org/apis

async function searchOpenML(
  query: string,
  category: string,
): Promise<DatasetResult[]> {
  const params = new URLSearchParams({
    data_name: query,
    status: "active",
    limit: String(MAX_PER_SOURCE),
  });

  const res = await fetch(
    `https://www.openml.org/api/v1/json/data/list/${params}`,
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "MaxBooster-PDIM/1.0",
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) return [];

  let body: any;
  try {
    body = await res.json();
  } catch {
    return [];
  }

  const datasets: any[] = body?.data?.dataset ?? [];

  return datasets.map((d: any) => ({
    externalId: `openml:${d.did}`,
    source: "openml",
    name: d.name ?? `OpenML ${d.did}`,
    description: d.description ?? "",
    url: `https://www.openml.org/d/${d.did}`,
    downloadUrl: `https://www.openml.org/data/download/${d.did}`,
    sizeBytes: d.file_size ? Number(d.file_size) : undefined,
    category,
    tags: (d.tag ?? []).slice(0, 20),
    license: d.licence ?? "unknown",
    author: d.creator ?? d.uploader ?? "unknown",
    downloads: d.version ?? 0,
  }));
}

// ── Source: FigShare ──────────────────────────────────────────────────────
// Free public REST API — no authentication required.
// https://docs.figshare.com/

async function searchFigShare(
  query: string,
  category: string,
): Promise<DatasetResult[]> {
  const body = JSON.stringify({
    search_for: query,
    item_type: 3, // 3 = dataset
    page_size: MAX_PER_SOURCE,
    order: "published_date",
    order_direction: "desc",
  });

  const res = await fetch("https://api.figshare.com/v2/articles/search", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": "MaxBooster-PDIM/1.0",
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) return [];

  let articles: any[];
  try {
    articles = (await res.json()) as any[];
  } catch {
    return [];
  }
  if (!Array.isArray(articles)) return [];

  return articles.map((a: any) => ({
    externalId: `figshare:${a.id}`,
    source: "figshare",
    name: a.title ?? `FigShare ${a.id}`,
    description: a.description ?? "",
    url: a.url_public_html ?? `https://figshare.com/articles/dataset/${a.id}`,
    downloadUrl: a.url_public_html,
    sizeBytes: a.size ? Number(a.size) : undefined,
    category,
    tags: (a.tags ?? []).slice(0, 20),
    license: a.license?.name ?? "unknown",
    author: a.authors?.[0]?.full_name ?? "unknown",
  }));
}

// ── Persistence ───────────────────────────────────────────────────────────

async function upsertDatasets(datasets: DatasetResult[]): Promise<number> {
  let newCount = 0;
  for (const d of datasets) {
    try {
      await db
        .insert(discoveredDatasets)
        .values({
          externalId: d.externalId,
          source: d.source,
          name: d.name,
          description: d.description?.slice(0, 2000),
          url: d.url,
          downloadUrl: d.downloadUrl,
          sizeBytes: d.sizeBytes,
          category: d.category,
          tags: d.tags,
          license: d.license,
          author: d.author,
          likes: d.likes ?? 0,
          downloads: d.downloads ?? 0,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: discoveredDatasets.externalId,
          set: {
            likes: d.likes ?? 0,
            downloads: d.downloads ?? 0,
            lastSeenAt: new Date(),
            downloadUrl: d.downloadUrl,
          },
        });
      newCount++;
    } catch {
      // ignore per-row errors
    }
  }
  return newCount;
}

// ── Discovery Service ─────────────────────────────────────────────────────

export class DatasetDiscoveryService {
  private static instance: DatasetDiscoveryService;
  private timer: ReturnType<typeof setInterval> | null = null;

  running = false;
  lastRun: Date | null = null;
  lastFoundCount = 0;

  stats = {
    totalDiscovered: 0,
    musicDatasets: 0,
    socialDatasets: 0,
    visualImageDatasets: 0,
    faceHumanDatasets: 0,
    videoDatasets: 0,
    depth3dDatasets: 0,
    textImageDatasets: 0,
    syntheticRenderDatasets: 0,
    textureMaterialDatasets: 0,
    runs: 0,
    sourceBreakdown: {} as Record<string, number>,
    categoryBreakdown: {} as Record<string, number>,
  };

  private constructor() {}

  static getInstance(): DatasetDiscoveryService {
    if (!DatasetDiscoveryService.instance) {
      DatasetDiscoveryService.instance = new DatasetDiscoveryService();
    }
    return DatasetDiscoveryService.instance;
  }

  /**
   * Run a full discovery sweep across all sources and all query categories.
   * Requests are batched (BATCH_SIZE at a time) with a small delay between
   * batches to avoid hammering third-party APIs.
   *
   * Categories: music · social · visual-image · face-human · video ·
   *             depth-3d · text-image · synthetic-render · texture-material
   */
  async discover(): Promise<{ found: number; new: number }> {
    this.running = true;
    const totalQueries =
      MUSIC_QUERIES.length +
      SOCIAL_QUERIES.length +
      VISUAL_IMAGE_QUERIES.length +
      FACE_HUMAN_QUERIES.length +
      VIDEO_QUERIES.length +
      DEPTH_3D_QUERIES.length +
      TEXT_IMAGE_QUERIES.length +
      SYNTHETIC_RENDER_QUERIES.length +
      TEXTURE_MATERIAL_QUERIES.length;

    logger.info(
      `[DatasetDiscovery] Starting full sweep — ${totalQueries} queries across 9 categories × 6 sources`,
    );

    const tasks: Array<() => Promise<DatasetResult[]>> = [];

    // ── Music ─────────────────────────────────────────────────────────────
    for (const q of MUSIC_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "music").catch(() => []));
      tasks.push(() => searchZenodo(q, "music").catch(() => []));
      tasks.push(() => searchArchiveOrg(q, "music", "audio").catch(() => []));
      tasks.push(() => searchFigShare(q, "music").catch(() => []));
      tasks.push(() => searchOpenML(q, "music").catch(() => []));
    }
    for (const q of [
      "music audio",
      "music information retrieval",
      "audio classification",
      "automatic music transcription",
      "music generation",
      "music source separation",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "music").catch(() => []));
    }

    // ── Social ────────────────────────────────────────────────────────────
    for (const q of SOCIAL_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "social").catch(() => []));
      tasks.push(() => searchZenodo(q, "social").catch(() => []));
    }
    for (const q of [
      "social media",
      "sentiment analysis",
      "social network analysis",
      "user behavior dataset",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "social").catch(() => []));
    }

    // ── Visual Images ─────────────────────────────────────────────────────
    for (const q of VISUAL_IMAGE_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "visual-image").catch(() => []));
      tasks.push(() => searchZenodo(q, "visual-image").catch(() => []));
      tasks.push(() =>
        searchArchiveOrg(q, "visual-image", "image").catch(() => []),
      );
      tasks.push(() => searchFigShare(q, "visual-image").catch(() => []));
    }
    for (const q of [
      "image recognition",
      "object detection",
      "image segmentation",
      "super resolution",
      "image generation",
      "scene understanding",
      "image captioning",
      "visual recognition",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "visual-image").catch(() => []));
    }

    // ── Faces / Humans ────────────────────────────────────────────────────
    for (const q of FACE_HUMAN_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "face-human").catch(() => []));
      tasks.push(() => searchZenodo(q, "face-human").catch(() => []));
      tasks.push(() => searchFigShare(q, "face-human").catch(() => []));
    }
    for (const q of [
      "face recognition",
      "face detection",
      "facial expression recognition",
      "human pose estimation",
      "face generation",
      "person re-identification",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "face-human").catch(() => []));
    }

    // ── Video ─────────────────────────────────────────────────────────────
    for (const q of VIDEO_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "video").catch(() => []));
      tasks.push(() => searchZenodo(q, "video").catch(() => []));
      tasks.push(() => searchArchiveOrg(q, "video", "movies").catch(() => []));
      tasks.push(() => searchFigShare(q, "video").catch(() => []));
    }
    for (const q of [
      "action recognition",
      "video classification",
      "video understanding",
      "video object detection",
      "optical flow estimation",
      "video generation",
      "video prediction",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "video").catch(() => []));
    }

    // ── Depth / 3D ────────────────────────────────────────────────────────
    for (const q of DEPTH_3D_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "depth-3d").catch(() => []));
      tasks.push(() => searchZenodo(q, "depth-3d").catch(() => []));
      tasks.push(() => searchFigShare(q, "depth-3d").catch(() => []));
    }
    for (const q of [
      "depth estimation",
      "3D reconstruction",
      "point cloud segmentation",
      "novel view synthesis",
      "NeRF neural radiance",
      "stereo matching",
      "3D object detection",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "depth-3d").catch(() => []));
    }

    // ── Text-Image Pairs ──────────────────────────────────────────────────
    for (const q of TEXT_IMAGE_QUERIES) {
      tasks.push(() => searchHuggingFace(q, "text-image").catch(() => []));
      tasks.push(() => searchZenodo(q, "text-image").catch(() => []));
      tasks.push(() => searchFigShare(q, "text-image").catch(() => []));
    }
    for (const q of [
      "image captioning",
      "visual question answering",
      "text to image generation",
      "multimodal learning",
      "visual grounding",
      "image text matching",
    ]) {
      tasks.push(() => searchPapersWithCode(q, "text-image").catch(() => []));
    }

    // ── Synthetic Renders ─────────────────────────────────────────────────
    for (const q of SYNTHETIC_RENDER_QUERIES) {
      tasks.push(() =>
        searchHuggingFace(q, "synthetic-render").catch(() => []),
      );
      tasks.push(() => searchZenodo(q, "synthetic-render").catch(() => []));
      tasks.push(() => searchFigShare(q, "synthetic-render").catch(() => []));
    }
    for (const q of [
      "synthetic data generation",
      "domain adaptation",
      "sim to real",
      "virtual dataset",
      "photorealistic rendering",
    ]) {
      tasks.push(() =>
        searchPapersWithCode(q, "synthetic-render").catch(() => []),
      );
    }

    // ── Textures / Materials ──────────────────────────────────────────────
    for (const q of TEXTURE_MATERIAL_QUERIES) {
      tasks.push(() =>
        searchHuggingFace(q, "texture-material").catch(() => []),
      );
      tasks.push(() => searchZenodo(q, "texture-material").catch(() => []));
      tasks.push(() => searchFigShare(q, "texture-material").catch(() => []));
    }
    for (const q of [
      "texture recognition",
      "material recognition",
      "texture synthesis",
      "surface material classification",
    ]) {
      tasks.push(() =>
        searchPapersWithCode(q, "texture-material").catch(() => []),
      );
    }

    // Execute with batching
    const batchedResults = await batchedAll(tasks, BATCH_SIZE, BATCH_DELAY_MS);
    const allDatasets = batchedResults.flat();

    // Deduplicate by externalId
    const seen = new Set<string>();
    const unique = allDatasets.filter((d) => {
      if (seen.has(d.externalId)) return false;
      seen.add(d.externalId);
      return true;
    });

    const found = unique.length;
    const newCount = await upsertDatasets(unique);

    // Per-category and per-source breakdown
    const catBreakdown: Record<string, number> = {};
    const srcBreakdown: Record<string, number> = {};
    for (const d of unique) {
      catBreakdown[d.category] = (catBreakdown[d.category] ?? 0) + 1;
      srcBreakdown[d.source] = (srcBreakdown[d.source] ?? 0) + 1;
    }

    // Update stats
    this.lastRun = new Date();
    this.lastFoundCount = found;
    this.stats.totalDiscovered += newCount;
    this.stats.musicDatasets = catBreakdown["music"] ?? 0;
    this.stats.socialDatasets = catBreakdown["social"] ?? 0;
    this.stats.visualImageDatasets = catBreakdown["visual-image"] ?? 0;
    this.stats.faceHumanDatasets = catBreakdown["face-human"] ?? 0;
    this.stats.videoDatasets = catBreakdown["video"] ?? 0;
    this.stats.depth3dDatasets = catBreakdown["depth-3d"] ?? 0;
    this.stats.textImageDatasets = catBreakdown["text-image"] ?? 0;
    this.stats.syntheticRenderDatasets = catBreakdown["synthetic-render"] ?? 0;
    this.stats.textureMaterialDatasets = catBreakdown["texture-material"] ?? 0;
    this.stats.runs++;
    this.stats.sourceBreakdown = srcBreakdown;
    this.stats.categoryBreakdown = catBreakdown;

    this.running = false;

    logger.info(
      `[DatasetDiscovery] Sweep complete: ${found} found, ${newCount} new/updated\n` +
        `  Categories: ` +
        Object.entries(catBreakdown)
          .map(([c, n]) => `${c}:${n}`)
          .join(" ") +
        `\n  Sources: ` +
        Object.entries(srcBreakdown)
          .map(([s, n]) => `${s}:${n}`)
          .join(" "),
    );

    return { found, new: newCount };
  }

  /** List datasets from the DB with optional filters. */
  async list(
    opts: {
      category?: string;
      source?: string;
      downloaded?: boolean;
      queued?: boolean;
      limit?: number;
    } = {},
  ): Promise<(typeof discoveredDatasets.$inferSelect)[]> {
    const rows = await db.select().from(discoveredDatasets);

    return rows
      .filter((r) => {
        if (opts.category && r.category !== opts.category) return false;
        if (opts.source && r.source !== opts.source) return false;
        if (opts.downloaded !== undefined && r.isDownloaded !== opts.downloaded)
          return false;
        if (opts.queued !== undefined && r.isQueued !== opts.queued)
          return false;
        return true;
      })
      .sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime())
      .slice(0, opts.limit ?? 200);
  }

  /** Start the auto-discovery scheduler. */
  startScheduler(intervalMs = DISCOVERY_INTERVAL_MS): void {
    if (this.timer) return;
    logger.info(
      `[DatasetDiscovery] Scheduler started (every ${intervalMs / 60000} min)`,
    );
    this.discover().catch((e) => logger.error("[DatasetDiscovery]", e));
    this.timer = setInterval(() => {
      this.discover().catch((e) => logger.error("[DatasetDiscovery]", e));
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("[DatasetDiscovery] Scheduler stopped");
    }
  }

  isSchedulerRunning(): boolean {
    return this.timer !== null;
  }
}

export const datasetDiscovery = DatasetDiscoveryService.getInstance();

export interface WebGLCapabilities {
  webgl2: boolean;
  webgl1: boolean;
  maxTextureSize: number;
  maxTextureUnits: number;
  floatTextures: boolean;
  depthTextures: boolean;
  vertexArrayObjects: boolean;
  instancedArrays: boolean;
  blendMinMax: boolean;
  colorBufferFloat: boolean;
}

export interface CanvasCapabilities {
  offscreenCanvas: boolean;
  canvas2d: boolean;
  captureStream: boolean;
  imageEncoding: boolean;
  willReadFrequently: boolean;
}

export interface MediaCapabilities {
  mediaRecorder: boolean;
  codecs: {
    vp9: boolean;
    vp8: boolean;
    h264: boolean;
    av1: boolean;
  };
  mimeTypes: string[];
  maxBitrate: number;
}

export interface AudioCapabilities {
  audioContext: boolean;
  offlineAudioContext: boolean;
  audioWorklet: boolean;
  webAudioApi: boolean;
  mediaElementSource: boolean;
  analyserNode: boolean;
  decodeAudioData: boolean;
}

export interface DeviceCapabilities {
  deviceMemory: number;
  hardwareConcurrency: number;
  maxFrameRate: number;
  preferredResolution: '720p' | '1080p' | '4k';
  isMobile: boolean;
  isLowPower: boolean;
  supportsHDR: boolean;
}

export interface BrowserCapabilities {
  webgl: WebGLCapabilities;
  canvas: CanvasCapabilities;
  media: MediaCapabilities;
  audio: AudioCapabilities;
  device: DeviceCapabilities;
  overall: {
    tier: 'low' | 'medium' | 'high';
    recommendedRenderer: 'webgl2' | 'webgl1' | 'canvas2d';
    maxSafeResolution: number;
    supportsExport: boolean;
    supportsRealtime: boolean;
  };
}

export interface RenderingFallback {
  primary: 'webgl2' | 'webgl1' | 'canvas2d';
  fallbacks: Array<'webgl2' | 'webgl1' | 'canvas2d'>;
  available: boolean;
  context: WebGL2RenderingContext | WebGLRenderingContext | CanvasRenderingContext2D | null;
}

const CODEC_MIME_TYPES: Record<string, string[]> = {
  vp9: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9'],
  vp8: ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8'],
  h264: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E'],
  av1: ['video/webm;codecs=av01.0.04M.08', 'video/mp4;codecs=av01.0.04M.08'],
};

class BrowserCapabilitiesDetector {
  private cachedCapabilities: BrowserCapabilities | null = null;
  private testCanvas: HTMLCanvasElement | null = null;

  async detect(): Promise<BrowserCapabilities> {
    if (this.cachedCapabilities) {
      return this.cachedCapabilities;
    }

    this.testCanvas = document.createElement('canvas');
    this.testCanvas.width = 1;
    this.testCanvas.height = 1;

    const [webgl, canvas, media, audio, device] = await Promise.all([
      this.detectWebGL(),
      this.detectCanvas(),
      this.detectMedia(),
      this.detectAudio(),
      this.detectDevice(),
    ]);

    const overall = this.calculateOverall(webgl, canvas, media, audio, device);

    this.cachedCapabilities = { webgl, canvas, media, audio, device, overall };
    this.testCanvas = null;
    
    return this.cachedCapabilities;
  }

  private detectWebGL(): WebGLCapabilities {
    const canvas = this.testCanvas!;
    
    let webgl2 = false;
    let webgl1 = false;
    let maxTextureSize = 0;
    let maxTextureUnits = 0;
    let floatTextures = false;
    let depthTextures = false;
    let vertexArrayObjects = false;
    let instancedArrays = false;
    let blendMinMax = false;
    let colorBufferFloat = false;

    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      webgl2 = true;
      webgl1 = true;
      maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE);
      maxTextureUnits = gl2.getParameter(gl2.MAX_TEXTURE_IMAGE_UNITS);
      floatTextures = gl2.getExtension('EXT_color_buffer_float') !== null;
      depthTextures = true;
      vertexArrayObjects = true;
      instancedArrays = true;
      blendMinMax = true;
      colorBufferFloat = floatTextures;
    } else {
      const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl1) {
        webgl1 = true;
        const gl = gl1 as WebGLRenderingContext;
        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        floatTextures = gl.getExtension('OES_texture_float') !== null;
        depthTextures = gl.getExtension('WEBGL_depth_texture') !== null;
        vertexArrayObjects = gl.getExtension('OES_vertex_array_object') !== null;
        instancedArrays = gl.getExtension('ANGLE_instanced_arrays') !== null;
        blendMinMax = gl.getExtension('EXT_blend_minmax') !== null;
        colorBufferFloat = gl.getExtension('WEBGL_color_buffer_float') !== null;
      }
    }

    return {
      webgl2,
      webgl1,
      maxTextureSize,
      maxTextureUnits,
      floatTextures,
      depthTextures,
      vertexArrayObjects,
      instancedArrays,
      blendMinMax,
      colorBufferFloat,
    };
  }

  private detectCanvas(): CanvasCapabilities {
    const offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
    
    let canvas2d = false;
    let willReadFrequently = false;
    try {
      const ctx = this.testCanvas!.getContext('2d');
      canvas2d = ctx !== null;
      if (ctx) {
        const testCtx = this.testCanvas!.getContext('2d', { willReadFrequently: true });
        willReadFrequently = testCtx !== null;
      }
    } catch {}

    let captureStream = false;
    try {
      captureStream = typeof this.testCanvas!.captureStream === 'function';
    } catch {}

    let imageEncoding = false;
    try {
      imageEncoding = typeof this.testCanvas!.toBlob === 'function';
    } catch {}

    return {
      offscreenCanvas,
      canvas2d,
      captureStream,
      imageEncoding,
      willReadFrequently,
    };
  }

  private detectMedia(): MediaCapabilities {
    const mediaRecorder = typeof MediaRecorder !== 'undefined';
    
    const codecs = {
      vp9: false,
      vp8: false,
      h264: false,
      av1: false,
    };

    const mimeTypes: string[] = [];

    if (mediaRecorder) {
      for (const [codec, types] of Object.entries(CODEC_MIME_TYPES)) {
        for (const mimeType of types) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            codecs[codec as keyof typeof codecs] = true;
            mimeTypes.push(mimeType);
            break;
          }
        }
      }
    }

    const maxBitrate = this.estimateMaxBitrate();

    return {
      mediaRecorder,
      codecs,
      mimeTypes,
      maxBitrate,
    };
  }

  private detectAudio(): AudioCapabilities {
    const audioContext = typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined';
    const offlineAudioContext = typeof OfflineAudioContext !== 'undefined';
    const audioWorklet = audioContext && typeof AudioWorkletNode !== 'undefined';
    
    let webAudioApi = false;
    let mediaElementSource = false;
    let analyserNode = false;
    let decodeAudioData = false;

    if (audioContext) {
      try {
        const ctx = new (AudioContext || (window as any).webkitAudioContext)();
        webAudioApi = true;
        mediaElementSource = typeof ctx.createMediaElementSource === 'function';
        analyserNode = typeof ctx.createAnalyser === 'function';
        decodeAudioData = typeof ctx.decodeAudioData === 'function';
        ctx.close();
      } catch {}
    }

    return {
      audioContext,
      offlineAudioContext,
      audioWorklet,
      webAudioApi,
      mediaElementSource,
      analyserNode,
      decodeAudioData,
    };
  }

  private async detectDevice(): Promise<DeviceCapabilities> {
    const navigator_any = navigator as any;
    const deviceMemory = navigator_any.deviceMemory ?? 4;
    const hardwareConcurrency = navigator.hardwareConcurrency ?? 4;
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLowPower = deviceMemory < 4 || hardwareConcurrency < 4;
    
    let maxFrameRate = 60;
    let preferredResolution: '720p' | '1080p' | '4k' = '1080p';
    
    if (isLowPower || isMobile) {
      maxFrameRate = 30;
      preferredResolution = '720p';
    } else if (deviceMemory >= 8 && hardwareConcurrency >= 8) {
      maxFrameRate = 60;
      preferredResolution = '4k';
    }

    let supportsHDR = false;
    if (typeof window.matchMedia === 'function') {
      supportsHDR = window.matchMedia('(dynamic-range: high)').matches;
    }

    return {
      deviceMemory,
      hardwareConcurrency,
      maxFrameRate,
      preferredResolution,
      isMobile,
      isLowPower,
      supportsHDR,
    };
  }

  private estimateMaxBitrate(): number {
    const navigator_any = navigator as any;
    const connection = navigator_any.connection;
    
    if (connection) {
      const effectiveType = connection.effectiveType;
      switch (effectiveType) {
        case 'slow-2g':
        case '2g':
          return 500_000;
        case '3g':
          return 2_000_000;
        case '4g':
        default:
          return 50_000_000;
      }
    }
    
    return 50_000_000;
  }

  private calculateOverall(
    webgl: WebGLCapabilities,
    canvas: CanvasCapabilities,
    media: MediaCapabilities,
    audio: AudioCapabilities,
    device: DeviceCapabilities
  ): BrowserCapabilities['overall'] {
    let tier: 'low' | 'medium' | 'high' = 'medium';
    let recommendedRenderer: 'webgl2' | 'webgl1' | 'canvas2d' = 'canvas2d';
    let maxSafeResolution = 720;
    
    if (webgl.webgl2 && webgl.floatTextures && device.deviceMemory >= 8) {
      tier = 'high';
      recommendedRenderer = 'webgl2';
      maxSafeResolution = 2160;
    } else if (webgl.webgl2 || (webgl.webgl1 && webgl.vertexArrayObjects)) {
      tier = 'medium';
      recommendedRenderer = webgl.webgl2 ? 'webgl2' : 'webgl1';
      maxSafeResolution = 1080;
    } else if (webgl.webgl1) {
      tier = 'low';
      recommendedRenderer = 'webgl1';
      maxSafeResolution = 720;
    } else if (canvas.canvas2d) {
      tier = 'low';
      recommendedRenderer = 'canvas2d';
      maxSafeResolution = 720;
    }

    if (device.isLowPower) {
      maxSafeResolution = Math.min(maxSafeResolution, 720);
      if (tier === 'high') tier = 'medium';
    }

    const supportsExport = media.mediaRecorder && canvas.captureStream;
    const supportsRealtime = (webgl.webgl2 || webgl.webgl1) && audio.webAudioApi && device.maxFrameRate >= 30;

    return {
      tier,
      recommendedRenderer,
      maxSafeResolution,
      supportsExport,
      supportsRealtime,
    };
  }

  clearCache(): void {
    this.cachedCapabilities = null;
  }
}

let detectorInstance: BrowserCapabilitiesDetector | null = null;

export function getBrowserCapabilities(): Promise<BrowserCapabilities> {
  if (!detectorInstance) {
    detectorInstance = new BrowserCapabilitiesDetector();
  }
  return detectorInstance.detect();
}

export function clearCapabilitiesCache(): void {
  if (detectorInstance) {
    detectorInstance.clearCache();
  }
}

export function createRenderingContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  preferred: 'webgl2' | 'webgl1' | 'canvas2d' = 'webgl2'
): RenderingFallback {
  const fallbackOrder: Array<'webgl2' | 'webgl1' | 'canvas2d'> = [];
  
  switch (preferred) {
    case 'webgl2':
      fallbackOrder.push('webgl2', 'webgl1', 'canvas2d');
      break;
    case 'webgl1':
      fallbackOrder.push('webgl1', 'canvas2d');
      break;
    case 'canvas2d':
      fallbackOrder.push('canvas2d');
      break;
  }

  for (const rendererType of fallbackOrder) {
    try {
      let context: WebGL2RenderingContext | WebGLRenderingContext | CanvasRenderingContext2D | null = null;
      
      switch (rendererType) {
        case 'webgl2':
          context = canvas.getContext('webgl2', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
          }) as WebGL2RenderingContext;
          break;
        case 'webgl1':
          context = (canvas.getContext('webgl', {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
          }) || canvas.getContext('experimental-webgl')) as WebGLRenderingContext;
          break;
        case 'canvas2d':
          context = canvas.getContext('2d', {
            alpha: true,
          }) as CanvasRenderingContext2D;
          break;
      }

      if (context) {
        return {
          primary: rendererType,
          fallbacks: fallbackOrder.slice(fallbackOrder.indexOf(rendererType) + 1),
          available: true,
          context,
        };
      }
    } catch {}
  }

  return {
    primary: 'canvas2d',
    fallbacks: [],
    available: false,
    context: null,
  };
}

export function getOptimalExportSettings(capabilities: BrowserCapabilities): {
  format: 'webm' | 'mp4';
  codec: string;
  resolution: '720p' | '1080p' | '4k';
  frameRate: 24 | 30 | 60;
  bitrate: number;
} {
  const { media, device, overall } = capabilities;

  let format: 'webm' | 'mp4' = 'webm';
  let codec = 'vp8';
  
  if (media.codecs.vp9) {
    format = 'webm';
    codec = 'vp9';
  } else if (media.codecs.h264) {
    format = 'mp4';
    codec = 'h264';
  } else if (media.codecs.vp8) {
    format = 'webm';
    codec = 'vp8';
  }

  let resolution: '720p' | '1080p' | '4k' = '1080p';
  if (overall.maxSafeResolution >= 2160) {
    resolution = '4k';
  } else if (overall.maxSafeResolution >= 1080) {
    resolution = '1080p';
  } else {
    resolution = '720p';
  }

  let frameRate: 24 | 30 | 60 = 30;
  if (device.maxFrameRate >= 60 && !device.isLowPower) {
    frameRate = 60;
  } else if (device.maxFrameRate >= 30) {
    frameRate = 30;
  } else {
    frameRate = 24;
  }

  const baseBitrate: Record<string, number> = {
    '720p': 5_000_000,
    '1080p': 10_000_000,
    '4k': 35_000_000,
  };

  const bitrate = Math.min(
    baseBitrate[resolution] * (frameRate / 30),
    media.maxBitrate
  );

  return { format, codec, resolution, frameRate, bitrate };
}

export function supportsFeature(feature: string): boolean {
  switch (feature) {
    case 'webgl2':
      return typeof WebGL2RenderingContext !== 'undefined';
    case 'webgl1':
      return typeof WebGLRenderingContext !== 'undefined';
    case 'offscreenCanvas':
      return typeof OffscreenCanvas !== 'undefined';
    case 'mediaRecorder':
      return typeof MediaRecorder !== 'undefined';
    case 'audioContext':
      return typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined';
    case 'audioWorklet':
      return typeof AudioWorkletNode !== 'undefined';
    case 'sharedArrayBuffer':
      return typeof SharedArrayBuffer !== 'undefined';
    case 'webWorker':
      return typeof Worker !== 'undefined';
    case 'transferableStreams':
      try {
        new ReadableStream().getReader();
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function getWebGLLimits(): {
  maxTextureSize: number;
  maxCubeMapSize: number;
  maxViewportDims: [number, number];
  maxRenderbufferSize: number;
  maxVertexAttribs: number;
  maxVaryingVectors: number;
  maxFragmentUniformVectors: number;
  maxVertexUniformVectors: number;
} | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  if (!gl) return null;

  return {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxCubeMapSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
    maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
    maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
    maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
    maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
  };
}

export function estimateRenderPerformance(
  capabilities: BrowserCapabilities,
  width: number,
  height: number,
  layerCount: number
): {
  estimatedFps: number;
  canRealtime: boolean;
  recommendedQuality: 'low' | 'medium' | 'high';
} {
  const pixels = width * height;
  const { device, overall } = capabilities;

  let baseFps = 60;
  
  if (pixels > 1920 * 1080) baseFps *= 0.5;
  else if (pixels > 1280 * 720) baseFps *= 0.75;

  if (layerCount > 10) baseFps *= 0.7;
  else if (layerCount > 5) baseFps *= 0.85;

  if (overall.tier === 'low') baseFps *= 0.5;
  else if (overall.tier === 'medium') baseFps *= 0.75;

  if (device.isLowPower) baseFps *= 0.6;

  const estimatedFps = Math.round(Math.min(60, Math.max(10, baseFps)));
  const canRealtime = estimatedFps >= 24;
  
  let recommendedQuality: 'low' | 'medium' | 'high' = 'high';
  if (estimatedFps < 30) recommendedQuality = 'low';
  else if (estimatedFps < 45) recommendedQuality = 'medium';

  return { estimatedFps, canRealtime, recommendedQuality };
}

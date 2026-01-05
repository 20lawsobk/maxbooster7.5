import {
  type PromoTemplateOptions,
  type CompiledTemplate,
  type AspectRatio,
  type ColorPalette,
  type Platform,
  type ReleaseAnnouncementOptions,
  type TourEventOptions,
  type BehindTheScenesOptions,
  type QuoteLyricOptions,
  type CountdownTimerOptions,
  type SplitScreenOptions,
  type SocialTeaserOptions,
  type BackgroundConfig,
  type LogoConfig,
  type CallToActionConfig,
  type AudioReactiveConfig,
  ASPECT_RATIOS,
  DEFAULT_PALETTES,
  compileTemplate,
} from './PromoTemplates';

export type TemplateType = 'release' | 'tour' | 'bts' | 'quote' | 'countdown' | 'split' | 'teaser';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  category: 'announcement' | 'event' | 'content' | 'engagement' | 'comparison';
  tags: string[];
  thumbnail?: string;
  previewVideo?: string;
  defaultDuration: number;
  supportedAspectRatios: AspectRatio[];
  supportedPlatforms: Platform[];
  isPremium: boolean;
  isNew?: boolean;
  popularity: number;
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  templateId: string;
  palette: ColorPalette;
  backgroundConfig: Partial<BackgroundConfig>;
  animationStyle?: string;
  thumbnail?: string;
}

export interface TemplateCustomization {
  palette?: Partial<ColorPalette>;
  background?: Partial<BackgroundConfig>;
  aspectRatio?: AspectRatio;
  duration?: number;
  fps?: number;
  logo?: Partial<LogoConfig>;
  callToAction?: Partial<CallToActionConfig>;
  audioReactive?: Partial<AudioReactiveConfig>;
}

export interface TemplatePreviewConfig {
  width: number;
  height: number;
  quality: 'low' | 'medium' | 'high';
  frames: number;
  includeAudio: boolean;
}

export interface ExportedTemplateConfig {
  version: string;
  templateId: string;
  options: PromoTemplateOptions;
  customizations: TemplateCustomization;
  createdAt: string;
  exportedAt: string;
}

const TEMPLATE_REGISTRY: Map<string, TemplateMetadata> = new Map([
  ['release-announcement', {
    id: 'release-announcement',
    name: 'Release Announcement',
    description: 'Announce your new single, album, or EP with stunning visuals and cover art reveal',
    type: 'release',
    category: 'announcement',
    tags: ['music', 'release', 'album', 'single', 'ep', 'streaming'],
    defaultDuration: 10,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook', 'spotify'],
    isPremium: false,
    popularity: 95,
  }],
  ['tour-event', {
    id: 'tour-event',
    name: 'Tour & Event Announcement',
    description: 'Showcase your upcoming tour dates and events with dynamic date reveals',
    type: 'tour',
    category: 'event',
    tags: ['tour', 'concert', 'event', 'live', 'dates', 'tickets'],
    defaultDuration: 15,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'],
    isPremium: false,
    popularity: 88,
  }],
  ['behind-the-scenes', {
    id: 'behind-the-scenes',
    name: 'Behind The Scenes',
    description: 'Share exclusive behind-the-scenes footage with authentic, documentary-style edits',
    type: 'bts',
    category: 'content',
    tags: ['bts', 'studio', 'recording', 'exclusive', 'documentary'],
    defaultDuration: 30,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube'],
    isPremium: false,
    popularity: 82,
  }],
  ['quote-lyric', {
    id: 'quote-lyric',
    name: 'Quote & Lyric Highlight',
    description: 'Feature powerful lyrics or quotes with beautiful typography and animations',
    type: 'quote',
    category: 'content',
    tags: ['lyrics', 'quote', 'typography', 'text', 'inspiration'],
    defaultDuration: 8,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    supportedPlatforms: ['instagram', 'tiktok', 'twitter', 'facebook', 'spotify'],
    isPremium: false,
    popularity: 90,
  }],
  ['countdown-timer', {
    id: 'countdown-timer',
    name: 'Countdown Timer',
    description: 'Build anticipation with dynamic countdown timers for releases and events',
    type: 'countdown',
    category: 'engagement',
    tags: ['countdown', 'timer', 'release', 'anticipation', 'hype'],
    defaultDuration: 12,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube', 'twitter'],
    isPremium: false,
    isNew: true,
    popularity: 85,
  }],
  ['split-screen', {
    id: 'split-screen',
    name: 'Split Screen Comparison',
    description: 'Compare before/after, versions, or create engaging VS content',
    type: 'split',
    category: 'comparison',
    tags: ['comparison', 'vs', 'before-after', 'split', 'dual'],
    defaultDuration: 10,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube'],
    isPremium: true,
    popularity: 78,
  }],
  ['social-teaser', {
    id: 'social-teaser',
    name: 'Social Media Teaser',
    description: 'Short, punchy teasers optimized for social media engagement',
    type: 'teaser',
    category: 'engagement',
    tags: ['teaser', 'social', 'short', 'hook', 'viral'],
    defaultDuration: 15,
    supportedAspectRatios: ['9:16', '1:1', '16:9'],
    supportedPlatforms: ['instagram', 'tiktok', 'youtube'],
    isPremium: false,
    isNew: true,
    popularity: 92,
  }],
]);

const TEMPLATE_PRESETS: Map<string, TemplatePreset[]> = new Map([
  ['release-announcement', [
    {
      id: 'release-modern-dark',
      name: 'Modern Dark',
      description: 'Sleek dark theme with vibrant accents',
      templateId: 'release-announcement',
      palette: DEFAULT_PALETTES.modern,
      backgroundConfig: { type: 'gradient', gradientAngle: 135 },
    },
    {
      id: 'release-neon-glow',
      name: 'Neon Glow',
      description: 'Electric neon aesthetics with glow effects',
      templateId: 'release-announcement',
      palette: DEFAULT_PALETTES.neon,
      backgroundConfig: { type: 'solid' },
      animationStyle: 'glitch',
    },
    {
      id: 'release-minimal-light',
      name: 'Minimal Light',
      description: 'Clean, minimalist light theme',
      templateId: 'release-announcement',
      palette: DEFAULT_PALETTES.minimal,
      backgroundConfig: { type: 'solid' },
    },
    {
      id: 'release-vintage',
      name: 'Vintage Warmth',
      description: 'Warm, nostalgic vintage vibes',
      templateId: 'release-announcement',
      palette: DEFAULT_PALETTES.vintage,
      backgroundConfig: { type: 'gradient', gradientAngle: 180 },
    },
  ]],
  ['tour-event', [
    {
      id: 'tour-electric',
      name: 'Electric Energy',
      description: 'High-energy electric theme for tours',
      templateId: 'tour-event',
      palette: DEFAULT_PALETTES.electric,
      backgroundConfig: { type: 'gradient', gradientAngle: 180 },
    },
    {
      id: 'tour-modern',
      name: 'Modern Professional',
      description: 'Professional modern aesthetic',
      templateId: 'tour-event',
      palette: DEFAULT_PALETTES.modern,
      backgroundConfig: { type: 'solid' },
    },
  ]],
  ['quote-lyric', [
    {
      id: 'quote-neon',
      name: 'Neon Typography',
      description: 'Glowing neon text effect',
      templateId: 'quote-lyric',
      palette: DEFAULT_PALETTES.neon,
      backgroundConfig: { type: 'solid' },
      animationStyle: 'neon',
    },
    {
      id: 'quote-minimal',
      name: 'Minimal Elegance',
      description: 'Clean, elegant typography',
      templateId: 'quote-lyric',
      palette: DEFAULT_PALETTES.minimal,
      backgroundConfig: { type: 'solid' },
      animationStyle: 'minimal',
    },
    {
      id: 'quote-pastel',
      name: 'Pastel Dreams',
      description: 'Soft pastel colors with gentle animations',
      templateId: 'quote-lyric',
      palette: DEFAULT_PALETTES.pastel,
      backgroundConfig: { type: 'gradient', gradientAngle: 135 },
    },
  ]],
  ['countdown-timer', [
    {
      id: 'countdown-digital',
      name: 'Digital Clock',
      description: 'Retro digital display style',
      templateId: 'countdown-timer',
      palette: DEFAULT_PALETTES.neon,
      backgroundConfig: { type: 'solid' },
      animationStyle: 'digital',
    },
    {
      id: 'countdown-minimal',
      name: 'Minimal Timer',
      description: 'Clean, modern countdown',
      templateId: 'countdown-timer',
      palette: DEFAULT_PALETTES.modern,
      backgroundConfig: { type: 'gradient' },
      animationStyle: 'minimal',
    },
  ]],
  ['social-teaser', [
    {
      id: 'teaser-viral',
      name: 'Viral Hook',
      description: 'Optimized for maximum engagement',
      templateId: 'social-teaser',
      palette: DEFAULT_PALETTES.electric,
      backgroundConfig: { type: 'gradient' },
    },
    {
      id: 'teaser-clean',
      name: 'Clean Modern',
      description: 'Professional, clean aesthetic',
      templateId: 'social-teaser',
      palette: DEFAULT_PALETTES.modern,
      backgroundConfig: { type: 'solid' },
    },
  ]],
]);

export class TemplateManager {
  private compiledCache: Map<string, CompiledTemplate> = new Map();
  private previewCache: Map<string, ImageData[]> = new Map();

  getAllTemplates(): TemplateMetadata[] {
    return Array.from(TEMPLATE_REGISTRY.values());
  }

  getTemplate(id: string): TemplateMetadata | undefined {
    return TEMPLATE_REGISTRY.get(id);
  }

  getTemplatesByCategory(category: TemplateMetadata['category']): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  getTemplatesByPlatform(platform: Platform): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => t.supportedPlatforms.includes(platform));
  }

  getTemplatesByType(type: TemplateType): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => t.type === type);
  }

  searchTemplates(query: string): TemplateMetadata[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTemplates().filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  getPopularTemplates(limit: number = 5): TemplateMetadata[] {
    return this.getAllTemplates()
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  getNewTemplates(): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => t.isNew);
  }

  getPremiumTemplates(): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => t.isPremium);
  }

  getFreeTemplates(): TemplateMetadata[] {
    return this.getAllTemplates().filter(t => !t.isPremium);
  }

  getPresetsForTemplate(templateId: string): TemplatePreset[] {
    return TEMPLATE_PRESETS.get(templateId) || [];
  }

  getPreset(presetId: string): TemplatePreset | undefined {
    for (const presets of TEMPLATE_PRESETS.values()) {
      const preset = presets.find(p => p.id === presetId);
      if (preset) return preset;
    }
    return undefined;
  }

  instantiateTemplate(
    templateId: string,
    options: Partial<PromoTemplateOptions>,
    customization?: TemplateCustomization
  ): CompiledTemplate {
    const metadata = this.getTemplate(templateId);
    if (!metadata) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const baseOptions = this.createBaseOptions(metadata, options, customization);
    const fullOptions = this.mergeTemplateOptions(metadata.type, baseOptions, options);
    
    const compiled = compileTemplate(fullOptions);
    
    const cacheKey = this.generateCacheKey(fullOptions);
    this.compiledCache.set(cacheKey, compiled);
    
    return compiled;
  }

  instantiateFromPreset(
    presetId: string,
    options: Partial<PromoTemplateOptions>,
    customization?: TemplateCustomization
  ): CompiledTemplate {
    const preset = this.getPreset(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    const mergedCustomization: TemplateCustomization = {
      ...customization,
      palette: { ...preset.palette, ...customization?.palette },
      background: { ...preset.backgroundConfig, ...customization?.background },
    };

    return this.instantiateTemplate(preset.templateId, options, mergedCustomization);
  }

  private createBaseOptions(
    metadata: TemplateMetadata,
    options: Partial<PromoTemplateOptions>,
    customization?: TemplateCustomization
  ): Partial<PromoTemplateOptions> {
    const aspectRatio = customization?.aspectRatio || options.aspectRatio || metadata.supportedAspectRatios[0];
    const palette = this.mergePalette(DEFAULT_PALETTES.modern, customization?.palette);
    
    return {
      id: options.id || `${metadata.id}_${Date.now()}`,
      name: options.name || metadata.name,
      aspectRatio,
      duration: customization?.duration || options.duration || metadata.defaultDuration,
      fps: customization?.fps || options.fps || 30,
      palette,
      background: this.mergeBackground(customization?.background, palette),
      logo: customization?.logo ? this.mergeLogoConfig(customization.logo) : options.logo,
      callToAction: customization?.callToAction ? this.mergeCTAConfig(customization.callToAction) : options.callToAction,
      audioReactive: customization?.audioReactive ? this.mergeAudioReactive(customization.audioReactive) : options.audioReactive,
    };
  }

  private mergeTemplateOptions(
    type: TemplateType,
    baseOptions: Partial<PromoTemplateOptions>,
    options: Partial<PromoTemplateOptions>
  ): PromoTemplateOptions {
    switch (type) {
      case 'release':
        return this.createReleaseOptions(baseOptions, options as Partial<ReleaseAnnouncementOptions>);
      case 'tour':
        return this.createTourOptions(baseOptions, options as Partial<TourEventOptions>);
      case 'bts':
        return this.createBTSOptions(baseOptions, options as Partial<BehindTheScenesOptions>);
      case 'quote':
        return this.createQuoteOptions(baseOptions, options as Partial<QuoteLyricOptions>);
      case 'countdown':
        return this.createCountdownOptions(baseOptions, options as Partial<CountdownTimerOptions>);
      case 'split':
        return this.createSplitOptions(baseOptions, options as Partial<SplitScreenOptions>);
      case 'teaser':
        return this.createTeaserOptions(baseOptions, options as Partial<SocialTeaserOptions>);
      default:
        throw new Error(`Unknown template type: ${type}`);
    }
  }

  private createReleaseOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<ReleaseAnnouncementOptions>
  ): ReleaseAnnouncementOptions {
    return {
      type: 'release',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      artistName: options.artistName || 'Artist Name',
      releaseName: options.releaseName || 'Release Title',
      releaseType: options.releaseType || 'single',
      releaseDate: options.releaseDate || 'Coming Soon',
      coverArtUrl: options.coverArtUrl,
      preorderUrl: options.preorderUrl,
      streamingPlatforms: options.streamingPlatforms,
      featuredArtists: options.featuredArtists,
      trackCount: options.trackCount,
      tagline: options.tagline,
      animation: options.animation,
    };
  }

  private createTourOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<TourEventOptions>
  ): TourEventOptions {
    return {
      type: 'tour',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      tourName: options.tourName || 'Tour Name',
      artistName: options.artistName || 'Artist Name',
      dates: options.dates || [],
      ticketUrl: options.ticketUrl,
      vipPackageAvailable: options.vipPackageAvailable,
      supportingActs: options.supportingActs,
      animation: options.animation,
    };
  }

  private createBTSOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<BehindTheScenesOptions>
  ): BehindTheScenesOptions {
    return {
      type: 'bts',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      title: options.title || 'Behind The Scenes',
      subtitle: options.subtitle,
      mediaClips: options.mediaClips || [],
      artistName: options.artistName || 'Artist Name',
      projectName: options.projectName,
      location: options.location,
      date: options.date,
      filmGrain: options.filmGrain,
      vintageEffect: options.vintageEffect,
      animation: options.animation,
    };
  }

  private createQuoteOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<QuoteLyricOptions>
  ): QuoteLyricOptions {
    return {
      type: 'quote',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      quote: options.quote || 'Your quote here',
      attribution: options.attribution,
      artistName: options.artistName || 'Artist Name',
      songTitle: options.songTitle,
      albumTitle: options.albumTitle,
      quotationStyle: options.quotationStyle || 'minimal',
      backgroundBlur: options.backgroundBlur,
      animation: options.animation,
    };
  }

  private createCountdownOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<CountdownTimerOptions>
  ): CountdownTimerOptions {
    return {
      type: 'countdown',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      title: options.title || 'Coming Soon',
      targetDate: options.targetDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      eventName: options.eventName || 'New Release',
      artistName: options.artistName || 'Artist Name',
      timerStyle: options.timerStyle || 'digital',
      showLabels: options.showLabels !== false,
      urgencyThreshold: options.urgencyThreshold,
      completionMessage: options.completionMessage,
      coverArtUrl: options.coverArtUrl,
      animation: options.animation,
    };
  }

  private createSplitOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<SplitScreenOptions>
  ): SplitScreenOptions {
    return {
      type: 'split',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      leftContent: options.leftContent || { title: 'Before' },
      rightContent: options.rightContent || { title: 'After' },
      dividerStyle: options.dividerStyle || 'solid',
      dividerColor: options.dividerColor,
      comparisonType: options.comparisonType || 'before-after',
      animation: options.animation,
    };
  }

  private createTeaserOptions(
    base: Partial<PromoTemplateOptions>,
    options: Partial<SocialTeaserOptions>
  ): SocialTeaserOptions {
    return {
      type: 'teaser',
      id: base.id!,
      name: base.name!,
      aspectRatio: base.aspectRatio!,
      duration: base.duration!,
      fps: base.fps,
      palette: base.palette!,
      background: base.background!,
      logo: base.logo,
      callToAction: base.callToAction,
      audioReactive: base.audioReactive,
      hookText: options.hookText || 'You won\'t believe this...',
      mainContent: options.mainContent || 'Main content here',
      artistName: options.artistName || 'Artist Name',
      contentType: options.contentType || 'announcement',
      teaserLength: options.teaserLength || 15,
      audioPreviewUrl: options.audioPreviewUrl,
      coverArtUrl: options.coverArtUrl,
      hashtags: options.hashtags,
      mentionHandle: options.mentionHandle,
      swipeUpText: options.swipeUpText,
      animation: options.animation,
    };
  }

  private mergePalette(base: ColorPalette, override?: Partial<ColorPalette>): ColorPalette {
    return {
      primary: override?.primary || base.primary,
      secondary: override?.secondary || base.secondary,
      accent: override?.accent || base.accent,
      background: override?.background || base.background,
      text: override?.text || base.text,
      textSecondary: override?.textSecondary || base.textSecondary,
      overlay: override?.overlay || base.overlay,
    };
  }

  private mergeBackground(override?: Partial<BackgroundConfig>, palette?: ColorPalette): BackgroundConfig {
    return {
      type: override?.type || 'gradient',
      color: override?.color || palette?.background,
      gradientColors: override?.gradientColors || (palette ? [palette.primary, palette.secondary] : undefined),
      gradientAngle: override?.gradientAngle || 135,
      imageUrl: override?.imageUrl,
      videoUrl: override?.videoUrl,
      blur: override?.blur || 0,
      opacity: override?.opacity || 1,
      overlay: override?.overlay || palette?.overlay,
      parallax: override?.parallax || false,
      audioReactive: override?.audioReactive || false,
      audioReactiveIntensity: override?.audioReactiveIntensity || 0.5,
    };
  }

  private mergeLogoConfig(override: Partial<LogoConfig>): LogoConfig {
    return {
      imageUrl: override.imageUrl,
      position: override.position || 'bottom-right',
      customPosition: override.customPosition,
      size: override.size || 80,
      opacity: override.opacity || 0.9,
      animation: override.animation,
    };
  }

  private mergeCTAConfig(override: Partial<CallToActionConfig>): CallToActionConfig {
    return {
      text: override.text || 'Learn More',
      subtext: override.subtext,
      style: override.style || 'button',
      position: override.position || 'bottom',
      customPosition: override.customPosition,
      backgroundColor: override.backgroundColor,
      textColor: override.textColor,
      borderRadius: override.borderRadius,
      animation: override.animation,
      url: override.url,
      icon: override.icon,
    };
  }

  private mergeAudioReactive(override: Partial<AudioReactiveConfig>): AudioReactiveConfig {
    return {
      enabled: override.enabled !== false,
      sensitivity: override.sensitivity || 0.5,
      smoothing: override.smoothing || 0.8,
      frequencyRange: override.frequencyRange || 'bass',
      targets: override.targets || [],
    };
  }

  private generateCacheKey(options: PromoTemplateOptions): string {
    return `${options.type}_${options.id}_${options.aspectRatio}_${JSON.stringify(options.palette)}`;
  }

  exportTemplateConfig(compiled: CompiledTemplate, options: PromoTemplateOptions): ExportedTemplateConfig {
    return {
      version: '1.0.0',
      templateId: compiled.id,
      options,
      customizations: {
        palette: options.palette,
        background: options.background,
        aspectRatio: options.aspectRatio,
        duration: options.duration,
        fps: options.fps,
        logo: options.logo,
        callToAction: options.callToAction,
        audioReactive: options.audioReactive,
      },
      createdAt: compiled.metadata.createdAt,
      exportedAt: new Date().toISOString(),
    };
  }

  importTemplateConfig(config: ExportedTemplateConfig): CompiledTemplate {
    return this.instantiateTemplate(
      config.templateId.split('_')[0],
      config.options,
      config.customizations
    );
  }

  async generatePreview(
    compiled: CompiledTemplate,
    config: TemplatePreviewConfig
  ): Promise<ImageData[]> {
    const cacheKey = `preview_${compiled.id}_${config.width}x${config.height}_${config.quality}`;
    
    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey)!;
    }

    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create canvas context for preview');
    }

    const frames: ImageData[] = [];
    const frameDuration = compiled.duration / config.frames;
    const scaleX = config.width / compiled.width;
    const scaleY = config.height / compiled.height;

    for (let i = 0; i < config.frames; i++) {
      const currentTime = i * frameDuration;
      
      ctx.clearRect(0, 0, config.width, config.height);
      ctx.save();
      ctx.scale(scaleX, scaleY);
      
      for (const layer of compiled.layers) {
        if (currentTime >= layer.startTime && currentTime <= layer.endTime && layer.visible) {
          this.renderPreviewLayer(ctx, layer, currentTime, compiled.width, compiled.height);
        }
      }
      
      ctx.restore();
      frames.push(ctx.getImageData(0, 0, config.width, config.height));
    }

    this.previewCache.set(cacheKey, frames);
    return frames;
  }

  private renderPreviewLayer(
    ctx: CanvasRenderingContext2D,
    layer: CompiledTemplate['layers'][0],
    currentTime: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    
    const transform = layer.transform;
    ctx.translate(transform.x + width * transform.anchorX, transform.y + height * transform.anchorY);
    ctx.rotate(transform.rotation);
    ctx.scale(transform.scaleX, transform.scaleY);
    ctx.translate(-width * transform.anchorX, -height * transform.anchorY);
    
    let opacity = layer.opacity;
    for (const anim of layer.animations) {
      if (currentTime >= anim.startTime && currentTime <= anim.endTime) {
        const progress = (currentTime - anim.startTime) / (anim.endTime - anim.startTime);
        if (anim.property === 'opacity') {
          opacity = anim.from + (anim.to - anim.from) * progress;
        }
      }
    }
    ctx.globalAlpha = opacity;

    switch (layer.type) {
      case 'background':
        this.renderBackgroundPreview(ctx, layer.config as Record<string, unknown>, width, height);
        break;
      case 'text':
        this.renderTextPreview(ctx, layer.config as Record<string, unknown>);
        break;
      case 'shape':
        this.renderShapePreview(ctx, layer.config as Record<string, unknown>);
        break;
    }

    ctx.restore();
  }

  private renderBackgroundPreview(
    ctx: CanvasRenderingContext2D,
    config: Record<string, unknown>,
    width: number,
    height: number
  ): void {
    if (config.type === 'gradient' && Array.isArray(config.gradientColors)) {
      const angle = (config.gradientAngle as number) || 135;
      const radians = (angle * Math.PI) / 180;
      const x1 = width / 2 - Math.cos(radians) * width;
      const y1 = height / 2 - Math.sin(radians) * height;
      const x2 = width / 2 + Math.cos(radians) * width;
      const y2 = height / 2 + Math.sin(radians) * height;
      
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      const colors = config.gradientColors as string[];
      colors.forEach((color, i) => {
        gradient.addColorStop(i / (colors.length - 1), color);
      });
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = (config.color as string) || '#000000';
    }
    ctx.fillRect(0, 0, width, height);
  }

  private renderTextPreview(ctx: CanvasRenderingContext2D, config: Record<string, unknown>): void {
    const font = config.font as string || 'Inter';
    const fontSize = config.fontSize as number || 24;
    const fontWeight = config.fontWeight as string || '400';
    
    ctx.font = `${fontWeight} ${fontSize}px ${font}`;
    ctx.fillStyle = config.color as string || '#ffffff';
    ctx.textAlign = (config.align as CanvasTextAlign) || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.text as string || '', 0, 0);
  }

  private renderShapePreview(ctx: CanvasRenderingContext2D, config: Record<string, unknown>): void {
    const shapeType = config.type as string;
    const fill = config.fill as string;
    const width = config.width as number || 100;
    const height = config.height as number || 100;

    if (fill) {
      ctx.fillStyle = fill;
    }

    switch (shapeType) {
      case 'rectangle':
        ctx.fillRect(-width / 2, -height / 2, width, height);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, (config.radius as number) || 50, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  getSupportedAspectRatios(): Record<AspectRatio, { width: number; height: number; name: string }> {
    const result: Record<AspectRatio, { width: number; height: number; name: string }> = {} as Record<AspectRatio, { width: number; height: number; name: string }>;
    for (const [key, value] of Object.entries(ASPECT_RATIOS)) {
      result[key as AspectRatio] = {
        width: value.width,
        height: value.height,
        name: value.name,
      };
    }
    return result;
  }

  getAvailablePalettes(): Record<string, ColorPalette> {
    return { ...DEFAULT_PALETTES };
  }

  clearCache(): void {
    this.compiledCache.clear();
    this.previewCache.clear();
  }

  getCacheStats(): { compiledCount: number; previewCount: number } {
    return {
      compiledCount: this.compiledCache.size,
      previewCount: this.previewCache.size,
    };
  }
}

export const templateManager = new TemplateManager();

export {
  ASPECT_RATIOS,
  DEFAULT_PALETTES,
  compileTemplate,
} from './PromoTemplates';

export type {
  PromoTemplateOptions,
  CompiledTemplate,
  AspectRatio,
  ColorPalette,
  Platform,
  BackgroundConfig,
  LogoConfig,
  CallToActionConfig,
  AudioReactiveConfig,
  ReleaseAnnouncementOptions,
  TourEventOptions,
  BehindTheScenesOptions,
  QuoteLyricOptions,
  CountdownTimerOptions,
  SplitScreenOptions,
  SocialTeaserOptions,
} from './PromoTemplates';

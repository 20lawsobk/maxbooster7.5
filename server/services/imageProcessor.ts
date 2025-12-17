import { logger } from '../logger.js';
import { UPLOAD_LIMITS, type UploadCategory } from '../middleware/uploadSecurity.js';

// Optional sharp support with graceful fallback
let sharpModule: any = null;
let sharpAvailable = false;

async function getSharp() {
  if (sharpModule !== null) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
    sharpAvailable = true;
    logger.info('Sharp module loaded for image processing');
    return sharpModule;
  } catch (error) {
    logger.warn('Sharp not available - image processing will be limited');
    sharpModule = false;
    return null;
  }
}

// Initialize on module load
getSharp().catch(() => {});

export type OutputFormat = 'jpeg' | 'png' | 'webp';

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: OutputFormat;
  stripMetadata?: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
  mimeType: string;
  originalSize: number;
  processedSize: number;
  metadataStripped: boolean;
}

const DEFAULT_OPTIONS: ImageProcessingOptions = {
  maxWidth: 3000,
  maxHeight: 3000,
  quality: 85,
  outputFormat: 'jpeg',
  stripMetadata: true,
};

const CATEGORY_OPTIONS: Record<UploadCategory, ImageProcessingOptions> = {
  avatar: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 90,
    outputFormat: 'webp',
    stripMetadata: true,
  },
  artwork: {
    maxWidth: 3000,
    maxHeight: 3000,
    quality: 90,
    outputFormat: 'jpeg',
    stripMetadata: true,
  },
  audio: DEFAULT_OPTIONS,
  document: DEFAULT_OPTIONS,
};

export async function validateImageFormat(buffer: Buffer): Promise<{
  valid: boolean;
  format?: string;
  width?: number;
  height?: number;
  error?: string;
}> {
  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    return { valid: false, error: 'Image processing not available' };
  }
  
  try {
    const metadata = await sharpInstance(buffer).metadata();
    
    if (!metadata.format) {
      return { valid: false, error: 'Unable to determine image format' };
    }

    const allowedFormats = ['jpeg', 'png', 'webp', 'jpg'];
    if (!allowedFormats.includes(metadata.format)) {
      return {
        valid: false,
        error: `Unsupported image format: ${metadata.format}. Allowed: ${allowedFormats.join(', ')}`,
      };
    }

    if (!metadata.width || !metadata.height) {
      return { valid: false, error: 'Unable to determine image dimensions' };
    }

    if (metadata.width > 10000 || metadata.height > 10000) {
      return { valid: false, error: 'Image dimensions too large (max 10000x10000)' };
    }

    return {
      valid: true,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    logger.error('Image format validation failed', { error });
    return { valid: false, error: 'Invalid or corrupted image file' };
  }
}

export async function processImage(
  buffer: Buffer,
  category: UploadCategory,
  customOptions?: Partial<ImageProcessingOptions>
): Promise<ProcessedImage> {
  const categoryOptions = CATEGORY_OPTIONS[category] || DEFAULT_OPTIONS;
  const options: ImageProcessingOptions = {
    ...categoryOptions,
    ...customOptions,
  };

  const validation = await validateImageFormat(buffer);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image');
  }

  const categoryLimits = UPLOAD_LIMITS[category];
  if (categoryLimits?.maxDimensions) {
    options.maxWidth = Math.min(options.maxWidth || categoryLimits.maxDimensions.width, categoryLimits.maxDimensions.width);
    options.maxHeight = Math.min(options.maxHeight || categoryLimits.maxDimensions.height, categoryLimits.maxDimensions.height);
  }

  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    throw new Error('Image processing not available');
  }

  let pipeline = sharpInstance(buffer);

  if (options.stripMetadata !== false) {
    pipeline = pipeline.rotate();
  }

  const metadata = await sharpInstance(buffer).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  let targetWidth = originalWidth;
  let targetHeight = originalHeight;

  if (options.maxWidth && options.maxHeight) {
    if (originalWidth > options.maxWidth || originalHeight > options.maxHeight) {
      const widthRatio = options.maxWidth / originalWidth;
      const heightRatio = options.maxHeight / originalHeight;
      const ratio = Math.min(widthRatio, heightRatio);
      
      targetWidth = Math.round(originalWidth * ratio);
      targetHeight = Math.round(originalHeight * ratio);
      
      pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
  }

  const outputFormat = options.outputFormat || 'jpeg';
  const quality = options.quality || 85;

  switch (outputFormat) {
    case 'jpeg':
      pipeline = pipeline.jpeg({
        quality,
        progressive: true,
        mozjpeg: true,
      });
      break;
    case 'png':
      pipeline = pipeline.png({
        compressionLevel: 9,
        progressive: true,
      });
      break;
    case 'webp':
      pipeline = pipeline.webp({
        quality,
        effort: 6,
      });
      break;
  }

  const processedBuffer = await pipeline.toBuffer();
  const processedMetadata = await sharpInstance(processedBuffer).metadata();

  const mimeTypes: Record<OutputFormat, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };

  logger.info('Image processed successfully', {
    originalSize: buffer.length,
    processedSize: processedBuffer.length,
    originalDimensions: `${originalWidth}x${originalHeight}`,
    processedDimensions: `${processedMetadata.width}x${processedMetadata.height}`,
    format: outputFormat,
    metadataStripped: options.stripMetadata !== false,
  });

  return {
    buffer: processedBuffer,
    width: processedMetadata.width || targetWidth,
    height: processedMetadata.height || targetHeight,
    format: outputFormat,
    mimeType: mimeTypes[outputFormat],
    originalSize: buffer.length,
    processedSize: processedBuffer.length,
    metadataStripped: options.stripMetadata !== false,
  };
}

export async function stripImageMetadata(buffer: Buffer): Promise<Buffer> {
  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    throw new Error('Image processing not available');
  }
  
  try {
    const result = await sharpInstance(buffer)
      .rotate()
      .toBuffer();
    
    logger.debug('Image metadata stripped', {
      originalSize: buffer.length,
      strippedSize: result.length,
    });

    return result;
  } catch (error) {
    logger.error('Failed to strip image metadata', { error });
    throw new Error('Failed to process image metadata');
  }
}

export async function convertToSafeFormat(
  buffer: Buffer,
  targetFormat: OutputFormat = 'jpeg',
  quality: number = 85
): Promise<{ buffer: Buffer; mimeType: string }> {
  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    throw new Error('Image processing not available');
  }
  
  try {
    let pipeline = sharpInstance(buffer).rotate();

    switch (targetFormat) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ compressionLevel: 9, progressive: true });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 6 });
        break;
    }

    const result = await pipeline.toBuffer();

    const mimeTypes: Record<OutputFormat, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    return {
      buffer: result,
      mimeType: mimeTypes[targetFormat],
    };
  } catch (error) {
    logger.error('Failed to convert image format', { error, targetFormat });
    throw new Error(`Failed to convert image to ${targetFormat}`);
  }
}

export async function resizeImage(
  buffer: Buffer,
  maxWidth: number,
  maxHeight: number,
  options?: { fit?: 'cover' | 'contain' | 'inside' | 'outside' }
): Promise<Buffer> {
  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    throw new Error('Image processing not available');
  }
  
  try {
    return await sharpInstance(buffer)
      .resize(maxWidth, maxHeight, {
        fit: options?.fit || 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch (error) {
    logger.error('Failed to resize image', { error, maxWidth, maxHeight });
    throw new Error('Failed to resize image');
  }
}

export async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const sharpInstance = await getSharp();
  if (!sharpInstance) {
    throw new Error('Image processing not available');
  }
  
  try {
    const metadata = await sharpInstance(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to determine image dimensions');
    }
    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    logger.error('Failed to get image dimensions', { error });
    throw new Error('Failed to get image dimensions');
  }
}

export async function processAvatarImage(buffer: Buffer): Promise<ProcessedImage> {
  return processImage(buffer, 'avatar', {
    maxWidth: 512,
    maxHeight: 512,
    outputFormat: 'webp',
    quality: 90,
  });
}

export async function processArtworkImage(buffer: Buffer): Promise<ProcessedImage> {
  return processImage(buffer, 'artwork', {
    maxWidth: 3000,
    maxHeight: 3000,
    outputFormat: 'jpeg',
    quality: 90,
  });
}

export function isImageMimeType(mimeType: string): boolean {
  const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  return imageMimeTypes.includes(mimeType);
}

export { getSharp };

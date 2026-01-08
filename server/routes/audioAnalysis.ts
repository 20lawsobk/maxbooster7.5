import { Router, Request, Response } from 'express';
import { audioNormalizationService, LOUDNESS_TARGETS } from '../services/audioNormalizationService.js';
import { audioMetadataService } from '../services/audioMetadataService.js';
import { waveformCacheService } from '../services/waveformCacheService.js';
import { logger } from '../logger.js';
import { audioUpload } from '../middleware/uploadHandler.js';

const router = Router();

router.post('/analyze-metadata', audioUpload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const metadata = await audioMetadataService.extractMetadata(
      req.file.buffer,
      req.file.mimetype
    );

    const formatInfo = audioMetadataService.analyzeFormat(metadata);
    const distributionCheck = audioMetadataService.isDistributionReady(metadata);
    const recommendations = audioMetadataService.getFormatRecommendations(metadata);

    const { coverArt, ...metadataWithoutCoverArt } = metadata;

    res.json({
      success: true,
      metadata: metadataWithoutCoverArt,
      formatInfo,
      distributionReady: distributionCheck.ready,
      distributionIssues: distributionCheck.issues,
      recommendations,
      hasCoverArt: metadata.hasCoverArt,
    });
  } catch (error) {
    logger.error('Error analyzing audio metadata:', error);
    res.status(500).json({
      error: 'Failed to analyze audio metadata',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/analyze-loudness', audioUpload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const metadata = await audioMetadataService.extractMetadata(
      req.file.buffer,
      req.file.mimetype
    );

    res.json({
      success: true,
      message: 'Loudness analysis requires decoded PCM data. Use the studio for real-time LUFS metering.',
      metadata: {
        format: metadata.codec,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        lossless: metadata.lossless,
      },
      loudnessTargets: LOUDNESS_TARGETS,
    });
  } catch (error) {
    logger.error('Error analyzing loudness:', error);
    res.status(500).json({
      error: 'Failed to analyze loudness',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/generate-waveform', audioUpload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const resolution = parseInt(req.body.resolution as string) || 800;
    const clampedResolution = Math.min(2000, Math.max(100, resolution));

    const cacheKey = `upload:${Date.now()}:${req.file.originalname}`;

    const waveformData = await waveformCacheService.getWaveform(
      cacheKey,
      req.file.buffer,
      clampedResolution
    );

    res.json({
      success: true,
      waveform: waveformData,
    });
  } catch (error) {
    logger.error('Error generating waveform:', error);
    res.status(500).json({
      error: 'Failed to generate waveform',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/validate-distribution', audioUpload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const platforms = (req.body.platforms as string)?.split(',') || ['spotify', 'appleMusic', 'youtube'];

    const metadata = await audioMetadataService.extractMetadata(
      req.file.buffer,
      req.file.mimetype
    );

    const platformValidation: Record<string, { valid: boolean; issues: string[] }> = {};
    for (const platform of platforms) {
      platformValidation[platform] = audioMetadataService.validateForPlatform(metadata, platform);
    }

    const generalCheck = audioMetadataService.isDistributionReady(metadata);
    const formatInfo = audioMetadataService.analyzeFormat(metadata);
    const recommendations = audioMetadataService.getFormatRecommendations(metadata);

    res.json({
      success: true,
      overallReady: generalCheck.ready && Object.values(platformValidation).every(v => v.valid),
      generalValidation: generalCheck,
      platformValidation,
      formatInfo,
      recommendations,
      metadata: {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        duration: metadata.duration,
        format: metadata.codec,
        sampleRate: metadata.sampleRate,
        bitDepth: metadata.bitDepth,
        lossless: metadata.lossless,
        hasCoverArt: metadata.hasCoverArt,
        hasISRC: !!metadata.isrc,
      },
    });
  } catch (error) {
    logger.error('Error validating for distribution:', error);
    res.status(500).json({
      error: 'Failed to validate audio for distribution',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/loudness-targets', (_req: Request, res: Response) => {
  res.json({
    success: true,
    targets: LOUDNESS_TARGETS,
    description: {
      streaming: 'Target loudness levels for major streaming platforms (LUFS)',
      broadcast: 'Broadcast standard loudness targets for TV/radio (LUFS)',
      mastering: 'Mastering reference levels for physical media (LUFS)',
    },
    recommendations: {
      general: 'For streaming, target -14 LUFS with a true peak of -1 dBTP',
      dynamic: 'Preserve dynamics - loudness normalization will bring quiet tracks up',
      truePeak: 'Keep true peak below -1 dBTP to avoid inter-sample clipping on lossy codecs',
    },
  });
});

router.get('/supported-formats', (_req: Request, res: Response) => {
  res.json({
    success: true,
    formats: {
      lossless: {
        wav: { extensions: ['.wav'], description: 'Uncompressed PCM audio', maxSampleRate: 192000, maxBitDepth: 32 },
        flac: { extensions: ['.flac'], description: 'Free Lossless Audio Codec', maxSampleRate: 192000, maxBitDepth: 24 },
        aiff: { extensions: ['.aiff', '.aif'], description: 'Audio Interchange File Format', maxSampleRate: 192000, maxBitDepth: 32 },
        alac: { extensions: ['.m4a'], description: 'Apple Lossless Audio Codec', maxSampleRate: 192000, maxBitDepth: 24 },
      },
      lossy: {
        mp3: { extensions: ['.mp3'], description: 'MPEG-1 Audio Layer III', maxBitrate: 320 },
        aac: { extensions: ['.aac', '.m4a'], description: 'Advanced Audio Coding', maxBitrate: 320 },
        ogg: { extensions: ['.ogg'], description: 'Ogg Vorbis', maxBitrate: 500 },
        opus: { extensions: ['.opus'], description: 'Opus Interactive Audio Codec', maxBitrate: 510 },
      },
    },
    maxFileSize: '500MB',
    recommendations: {
      distribution: 'Use WAV or FLAC at 44.1kHz/16-bit minimum for distribution',
      production: 'Use WAV at 48kHz/24-bit or higher for production',
      mastering: 'Use WAV at 96kHz/32-bit float for mastering',
    },
  });
});

export default router;

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import archiver from 'archiver';
import { create } from 'xmlbuilder2';
import { logger } from '../logger.js';

interface ReleaseMetadata {
  id: string;
  title: string;
  artistName: string;
  releaseType: 'single' | 'EP' | 'album';
  upc: string;
  releaseDate: string;
  labelName?: string;
  copyrightYear: number;
  copyrightOwner: string;
  publishingRights?: string;
  primaryGenre: string;
  secondaryGenre?: string;
  isExplicit: boolean;
  coverArtPath?: string;
  territories?: string[];
}

interface TrackMetadata {
  id: string;
  title: string;
  isrc: string;
  trackNumber: number;
  duration: number;
  audioFilePath: string;
  explicit: boolean;
  lyrics?: string;
  primaryArtist: string;
  featuredArtists?: string[];
  songwriters?: RoyaltySplit[];
  producers?: RoyaltySplit[];
}

interface RoyaltySplit {
  name: string;
  email: string;
  role: string;
  percentage: number;
}

export class DDEXPackageService {
  private static readonly DDEX_VERSION = '4.3';
  private static readonly MESSAGE_SCHEMA_VERSION = 'ern/43';

  async generateDDEXXML(release: ReleaseMetadata, tracks: TrackMetadata[]): Promise<string> {
    const messageId = this.generateMessageId(release.id);
    const releaseId = `REL${release.id.replace(/-/g, '').substring(0, 12).toUpperCase()}`;

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('ernm:NewReleaseMessage', {
      'xmlns:ernm': 'http://ddex.net/xml/ern/43',
      'xmlns:xs': 'http://www.w3.org/2001/XMLSchema-instance',
      MessageSchemaVersionId: this.MESSAGE_SCHEMA_VERSION,
      LanguageAndScriptCode: 'en',
    });

    // Message Header
    const header = doc.ele('MessageHeader');
    header.ele('MessageThreadId').txt(messageId);
    header.ele('MessageId').txt(messageId);
    header
      .ele('MessageSender')
      .ele('PartyName')
      .ele('FullName')
      .txt('Max Booster Distribution')
      .up()
      .up();
    header.ele('SentOnBehalfOf').ele('PartyName').ele('FullName').txt(release.artistName).up().up();
    header.ele('MessageCreatedDateTime').txt(new Date().toISOString());

    // Update Indicator (New release)
    doc.ele('UpdateIndicator').txt('OriginalMessage');
    doc.ele('IsBackfill').txt('false');

    // Resource List (Audio files and images)
    const resourceList = doc.ele('ResourceList');

    // Add sound recordings
    for (const track of tracks) {
      const soundRecording = resourceList.ele('SoundRecording');
      soundRecording.ele('SoundRecordingType').txt('MusicalWorkSoundRecording');
      soundRecording.ele('IsArtistRelated').txt('true');

      const soundRecordingId = soundRecording.ele('SoundRecordingId');
      soundRecordingId.ele('ISRC').txt(track.isrc);
      soundRecordingId.ele('ProprietaryId', { Namespace: 'DPID:MAX_BOOSTER' }).txt(track.id);

      const referenceTitle = soundRecording.ele('ReferenceTitle');
      referenceTitle.ele('TitleText').txt(track.title);

      // Duration in ISO 8601 format (PT3M45S)
      const duration = this.formatDuration(track.duration);
      soundRecording.ele('Duration').txt(duration);

      // Artists
      const artistParty = soundRecording.ele('SoundRecordingDetailsByTerritory');
      artistParty.ele('TerritoryCode').txt('Worldwide');

      const displayArtist = artistParty.ele('DisplayArtist', { SequenceNumber: '1' });
      displayArtist.ele('PartyName').ele('FullName').txt(track.primaryArtist).up().up();
      displayArtist.ele('ArtistRole').txt('MainArtist');

      // Featured artists
      if (track.featuredArtists && track.featuredArtists.length > 0) {
        track.featuredArtists.forEach((artist, index) => {
          const featured = artistParty.ele('DisplayArtist', { SequenceNumber: String(index + 2) });
          featured.ele('PartyName').ele('FullName').txt(artist).up().up();
          featured.ele('ArtistRole').txt('FeaturedArtist');
        });
      }

      // Parental Warning
      artistParty.ele('ParentalWarningType').txt(track.explicit ? 'Explicit' : 'NotExplicit');

      // Technical details
      const technicalDetails = artistParty.ele('TechnicalSoundRecordingDetails', {
        SequenceNumber: '1',
      });
      technicalDetails.ele('TechnicalResourceDetailsReference').txt(`T${track.trackNumber}`);
      technicalDetails.ele('AudioCodecType').txt('FLAC');
      technicalDetails.ele('BitRate').txt('1411');
      technicalDetails.ele('SamplingRate').txt('44100');
      technicalDetails.ele('BitsPerSample').txt('16');
      technicalDetails.ele('NumberOfChannels').txt('2');

      // File reference
      technicalDetails
        .ele('File')
        .ele('FileName')
        .txt(`track_${track.trackNumber}.flac`)
        .up()
        .ele('FilePath')
        .txt(track.audioFilePath)
        .up()
        .ele('HashSum', { HashSumAlgorithmType: 'MD5' })
        .txt(await this.calculateMD5(track.audioFilePath));
    }

    // Add cover artwork
    if (release.coverArtPath) {
      const image = resourceList.ele('Image');
      image.ele('ImageType').txt('FrontCoverImage');

      const imageId = image.ele('ImageId');
      imageId.ele('ProprietaryId', { Namespace: 'DPID:MAX_BOOSTER' }).txt(`${release.id}-cover`);

      const referenceTitle = image.ele('ReferenceTitle');
      referenceTitle.ele('TitleText').txt(`${release.title} - Cover Art`);

      const imageDetails = image.ele('ImageDetailsByTerritory');
      imageDetails.ele('TerritoryCode').txt('Worldwide');

      const technicalDetails = imageDetails.ele('TechnicalImageDetails', { SequenceNumber: '1' });
      technicalDetails.ele('ImageCodecType').txt('JPEG');
      technicalDetails.ele('ImageHeight').txt('3000');
      technicalDetails.ele('ImageWidth').txt('3000');

      technicalDetails
        .ele('File')
        .ele('FileName')
        .txt('cover.jpg')
        .up()
        .ele('FilePath')
        .txt(release.coverArtPath)
        .up()
        .ele('HashSum', { HashSumAlgorithmType: 'MD5' })
        .txt(await this.calculateMD5(release.coverArtPath));
    }

    // Release List
    const releaseList = doc.ele('ReleaseList');
    const releaseElem = releaseList.ele('Release', { IsMainRelease: 'true' });

    releaseElem.ele('ReleaseReference').txt(releaseId);

    const releaseIdElem = releaseElem.ele('ReleaseId');
    releaseIdElem.ele('ICPN', { IsEan: 'true' }).txt(release.upc);
    releaseIdElem.ele('ProprietaryId', { Namespace: 'DPID:MAX_BOOSTER' }).txt(release.id);

    // Release type
    const releaseType =
      {
        single: 'Single',
        EP: 'EP',
        album: 'Album',
      }[release.releaseType] || 'Album';
    releaseElem.ele('ReleaseType').txt(releaseType);

    // Title
    const releaseTitle = releaseElem.ele('ReferenceTitle');
    releaseTitle.ele('TitleText').txt(release.title);

    // Main artist
    const mainArtist = releaseElem.ele('ReleaseResourceReference', { SequenceNumber: '1' });
    mainArtist.txt(tracks[0]?.id || '');

    // Release details by territory
    const releaseDetails = releaseElem.ele('ReleaseDetailsByTerritory');
    const territories =
      release.territories && release.territories.length > 0 ? release.territories : ['Worldwide'];

    territories.forEach((territory) => {
      releaseDetails.ele('TerritoryCode').txt(territory);
    });

    // Display artists
    const displayArtist = releaseDetails.ele('DisplayArtist', { SequenceNumber: '1' });
    displayArtist.ele('PartyName').ele('FullName').txt(release.artistName).up().up();
    displayArtist.ele('ArtistRole').txt('MainArtist');

    // Label name
    const labelName = releaseDetails.ele('LabelName');
    labelName.txt(release.labelName || 'Independent');

    // Release date
    releaseDetails.ele('ReleaseDate').txt(release.releaseDate);

    // Parental warning
    releaseDetails.ele('ParentalWarningType').txt(release.isExplicit ? 'Explicit' : 'NotExplicit');

    // Genre
    const genre = releaseDetails.ele('Genre');
    genre.ele('GenreText').txt(release.primaryGenre);

    // Copyright
    const copyrightLine = releaseDetails.ele('CLine');
    copyrightLine.ele('Year').txt(String(release.copyrightYear));
    copyrightLine.ele('CLineText').txt(`© ${release.copyrightYear} ${release.copyrightOwner}`);

    const pLine = releaseDetails.ele('PLine');
    pLine.ele('Year').txt(String(release.copyrightYear));
    pLine.ele('PLineText').txt(`℗ ${release.copyrightYear} ${release.copyrightOwner}`);

    // Track list
    tracks.forEach((track, index) => {
      const trackRelease = releaseDetails.ele('TrackRelease', {
        SequenceNumber: String(index + 1),
      });
      trackRelease.ele('ReleaseResourceReference').txt(track.id);
      trackRelease.ele('TrackNumber').txt(String(track.trackNumber));
    });

    // Deal (distribution terms)
    const dealList = doc.ele('DealList');
    const releaseDeal = dealList.ele('ReleaseDeal');

    const deal = releaseDeal.ele('Deal');
    deal.ele('DealReleaseReference').txt(releaseId);

    const dealTerms = deal.ele('DealTerms');
    dealTerms.ele('CommercialModelType').txt('SubscriptionModel');
    dealTerms.ele('Usage').txt('PermanentDownload');

    territories.forEach((territory) => {
      dealTerms.ele('TerritoryCode').txt(territory);
    });

    dealTerms.ele('ValidityPeriod').ele('StartDate').txt(release.releaseDate).up();

    // Convert to XML string
    const xml = doc.end({ prettyPrint: true });
    return xml;
  }

  async createDDEXPackage(
    release: ReleaseMetadata,
    tracks: TrackMetadata[],
    outputPath: string
  ): Promise<string> {
    const xml = await this.generateDDEXXML(release, tracks);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    const output = require('fs').createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        resolve(outputPath);
      });

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.pipe(output);

      // Add XML file
      archive.append(xml, { name: 'release.xml' });

      // Add audio files
      for (const track of tracks) {
        archive.file(track.audioFilePath, { name: `track_${track.trackNumber}.flac` });
      }

      // Add cover art
      if (release.coverArtPath) {
        archive.file(release.coverArtPath, { name: 'cover.jpg' });
      }

      archive.finalize();
    });
  }

  async validateDDEXXML(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Basic XML validation
      const doc = create(xml);

      // Check for required elements
      const requiredElements = ['MessageHeader', 'ResourceList', 'ReleaseList', 'DealList'];

      for (const element of requiredElements) {
        if (!xml.includes(element)) {
          errors.push(`Missing required element: ${element}`);
        }
      }

      // Validate ISRC format (2 letters + 3 alphanumeric + 2 digits + 5 digits)
      const isrcPattern = /[A-Z]{2}[A-Z0-9]{3}\d{7}/g;
      const isrcMatches = xml.match(/<ISRC>([^<]+)<\/ISRC>/g);
      if (isrcMatches) {
        isrcMatches.forEach((match) => {
          const isrc = match.replace(/<\/?ISRC>/g, '');
          if (!isrcPattern.test(isrc)) {
            errors.push(`Invalid ISRC format: ${isrc}`);
          }
        });
      }

      // Validate UPC format (12 or 13 digits)
      const upcPattern = /^\d{12,13}$/;
      const upcMatches = xml.match(/<ICPN[^>]*>([^<]+)<\/ICPN>/g);
      if (upcMatches) {
        upcMatches.forEach((match) => {
          const upc = match.replace(/<\/?ICPN[^>]*>/g, '');
          if (!upcPattern.test(upc)) {
            errors.push(`Invalid UPC format: ${upc}`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error: unknown) {
      return {
        valid: false,
        errors: [`XML parsing error: ${(error as Error).message}`],
      };
    }
  }

  private generateMessageId(releaseId: string): string {
    const timestamp = Date.now();
    const hash = createHash('md5')
      .update(`${releaseId}-${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    return `MB${timestamp}-${hash}`.toUpperCase();
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let duration = 'PT';
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (secs > 0 || duration === 'PT') duration += `${secs}S`;

    return duration;
  }

  private async calculateMD5(filePath: string): Promise<string> {
    try {
      const fileBuffer = await readFile(filePath);
      return createHash('md5').update(fileBuffer).digest('hex');
    } catch (error: unknown) {
      logger.error(`Error calculating MD5 for ${filePath}:`, error);
      return '';
    }
  }
}

export const ddexPackageService = new DDEXPackageService();

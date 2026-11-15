// @ts-nocheck
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import archiver from "archiver";
import { create } from "xmlbuilder2";

const MESSAGE_SCHEMA_VERSION = "ern/43";
const MAX_DDEX_AUDIO_BYTES = 200 * 1024 * 1024;
const MAX_DDEX_PACKAGE_BYTES = 1024 * 1024 * 1024;
const MAX_DDEX_ARTWORK_BYTES = 25 * 1024 * 1024;
function hasValidGs1CheckDigit(code: string): boolean {
  if (!/^(?:\d{12}|\d{13})$/.test(code)) return false;
  const dataDigits = code.slice(0, -1);
  const firstWeight = code.length === 12 ? 3 : 1;
  const sum = [...dataDigits].reduce(
    (total, digit, index) =>
      total + Number(digit) * (index % 2 === 0 ? firstWeight : 4 - firstWeight),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

export interface DDEXReleaseMetadata {
  id: string;
  title: string;
  artistName: string;
  releaseType: "single" | "EP" | "album";
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
  coverArtCodec?: string;
  coverArtWidth?: number;
  coverArtHeight?: number;
  territories?: string[];
}

export interface DDEXTrackMetadata {
  id: string;
  title: string;
  isrc: string;
  trackNumber: number;
  duration: number;
  audioFilePath: string;
  explicit: boolean;
  lyrics?: string;
  primaryArtist: string;
  audioCodec: string;
  sampleRate: number;
  channels: number;
  bitDepth?: number;
  bitrate?: number;
  featuredArtists?: string[];
  songwriters?: RoyaltySplit[];
  producers?: RoyaltySplit[];
}

export interface RoyaltySplit {
  name: string;
  email: string;
  role: string;
  percentage: number;
}

export class DDEXPackageService {
  private async assertPackageInputs(
    release: DDEXReleaseMetadata,
    tracks: DDEXTrackMetadata[],
  ): Promise<void> {
    const requiredReleaseFields: Array<[string, unknown]> = [
      ["release title", release?.title],
      ["artist name", release?.artistName],
      ["release type", release?.releaseType],
      ["UPC/EAN", release?.upc],
      ["release date", release?.releaseDate],
      ["label name", release?.labelName],
      ["copyright year", release?.copyrightYear],
      ["copyright owner", release?.copyrightOwner],
      ["primary genre", release?.primaryGenre],
    ];
    const missing = requiredReleaseFields
      .filter(([, value]) => value === undefined || value === null || value === "")
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(`Missing required release metadata: ${missing.join(", ")}`);
    }
    if (!["single", "EP", "album"].includes(release.releaseType)) {
      throw new Error("Release type must be single, EP, or album");
    }
    if (!Number.isInteger(release.copyrightYear) ||
        release.copyrightYear < 1900 ||
        release.copyrightYear > new Date().getFullYear() + 1) {
      throw new Error("Copyright year is invalid");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) ||
        Number.isNaN(Date.parse(`${release.releaseDate}T00:00:00Z`)) ||
        new Date(`${release.releaseDate}T00:00:00Z`).toISOString().slice(0, 10) !== release.releaseDate) {
      throw new Error("Release date must be a real YYYY-MM-DD date");
    }
    if (!hasValidGs1CheckDigit(release.upc)) {
      throw new Error("UPC/EAN must have a valid GS1 check digit");
    }
    if (typeof release.isExplicit !== "boolean") {
      throw new Error("Release explicit-content status is required");
    }
    if (!Array.isArray(tracks) || tracks.length === 0 || tracks.length > 100) {
      throw new Error("DDEX packages require between 1 and 100 tracks");
    }

    const seenTrackNumbers = new Set<number>();
    let packageBytes = 0;
    for (const track of tracks) {
      if (!track?.id || !track?.title || !track?.primaryArtist) {
        throw new Error("Every track requires an ID, title, and artist");
      }
      if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(track.isrc || "")) {
        throw new Error(`Track ${track.trackNumber} has no valid ISRC`);
      }
      if (!Number.isInteger(track.trackNumber) || track.trackNumber < 1 ||
          seenTrackNumbers.has(track.trackNumber)) {
        throw new Error("Track numbers must be unique positive integers");
      }
      seenTrackNumbers.add(track.trackNumber);
      if (!track.audioFilePath || !path.isAbsolute(track.audioFilePath) ||
          /^https?:\/\//i.test(track.audioFilePath)) {
        throw new Error(`Track ${track.trackNumber} must use an owned local audio file`);
      }
      if (!Number.isFinite(track.duration) || track.duration <= 0 ||
          !track.audioCodec || track.audioCodec === "unknown" ||
          !Number.isFinite(track.sampleRate) || track.sampleRate <= 0 ||
          !Number.isInteger(track.channels) || track.channels <= 0) {
        throw new Error(`Track ${track.trackNumber} has incomplete verified audio metadata`);
      }
      const fileInfo = await stat(track.audioFilePath);
      if (!fileInfo.isFile() || fileInfo.size === 0) {
        throw new Error(`Track ${track.trackNumber} audio file is empty or unavailable`);
      }
      if (fileInfo.size > MAX_DDEX_AUDIO_BYTES) {
        throw new Error(`Track ${track.trackNumber} exceeds the 200 MiB DDEX audio limit`);
      }
      packageBytes += fileInfo.size;
    }

    if (release.coverArtPath) {
      if (!release.coverArtCodec ||
          !Number.isInteger(release.coverArtWidth) ||
          !Number.isInteger(release.coverArtHeight) ||
          (release.coverArtWidth ?? 0) <= 0 ||
          (release.coverArtHeight ?? 0) <= 0) {
        throw new Error("Cover art requires verified format and dimensions");
      }
      const artInfo = await stat(release.coverArtPath);
      if (!artInfo.isFile() || artInfo.size === 0) {
        throw new Error("Cover art file is empty or unavailable");
      }
      if (artInfo.size > MAX_DDEX_ARTWORK_BYTES) {
        throw new Error("Cover art exceeds the 25 MiB DDEX artwork limit");
      }
      packageBytes += artInfo.size;
      if (!/^[a-z0-9]{1,8}$/i.test(path.extname(release.coverArtPath).slice(1))) {
        throw new Error("Cover art has no safe package extension");
      }
    }
    if (packageBytes > MAX_DDEX_PACKAGE_BYTES) {
      throw new Error("DDEX package exceeds the 1 GiB total asset limit");
    }
  }

  async generateDDEXXML(
    release: DDEXReleaseMetadata,
    tracks: DDEXTrackMetadata[],
  ): Promise<string> {
    await this.assertPackageInputs(release, tracks);
    const messageId = this.generateMessageId(release?.id);
    const releaseId = `REL${release?.id.replace(/-/g, "").substring(0, 12).toUpperCase()}`;

    const doc = create({ version: "1.0", encoding: "UTF-8" }).ele(
      "ernm:NewReleaseMessage",
      {
        "xmlns:ernm": "http://ddex.net/xml/ern/43",
        "xmlns:xs": "http://www.w3.org/2001/XMLSchema-instance",
        MessageSchemaVersionId: MESSAGE_SCHEMA_VERSION,
        LanguageAndScriptCode: "en",
      },
    );

    // Message Header
    const header = doc?.ele("MessageHeader");
    header?.ele("MessageThreadId").txt(messageId);
    header?.ele("MessageId").txt(messageId);
    header
      .ele("MessageSender")
      .ele("PartyName")
      .ele("FullName")
      .txt("Max Booster Distribution")
      .up()
      .up();
    header
      .ele("SentOnBehalfOf")
      .ele("PartyName")
      .ele("FullName")
      .txt(release?.artistName)
      .up()
      .up();
    header?.ele("MessageCreatedDateTime").txt(new Date().toISOString());

    // Update Indicator (New release)
    doc?.ele("UpdateIndicator").txt("OriginalMessage");
    doc?.ele("IsBackfill").txt("false");

    // Resource List (Audio files and images)
    const resourceList = doc?.ele("ResourceList");

    // Add sound recordings
    for (const track of tracks) {
      const soundRecording = resourceList?.ele("SoundRecording");
      soundRecording?.ele("SoundRecordingType").txt("MusicalWorkSoundRecording");
      soundRecording?.ele("IsArtistRelated").txt("true");

      const soundRecordingId = soundRecording?.ele("SoundRecordingId");
      soundRecordingId?.ele("ISRC").txt(track?.isrc);
      soundRecordingId
        .ele("ProprietaryId", { Namespace: "DPID:MAX_BOOSTER" })
        .txt(track?.id);

      const referenceTitle = soundRecording?.ele("ReferenceTitle");
      referenceTitle?.ele("TitleText").txt(track?.title);

      // Duration in ISO 8601 format (PT3M45S)
      const duration = this.formatDuration(track?.duration);
      soundRecording?.ele("Duration").txt(duration);

      // Artists
      const artistParty = soundRecording?.ele(
        "SoundRecordingDetailsByTerritory",
      );
      artistParty?.ele("TerritoryCode").txt("Worldwide");

      const displayArtist = artistParty?.ele("DisplayArtist", {
        SequenceNumber: "1",
      });
      displayArtist
        .ele("PartyName")
        .ele("FullName")
        .txt(track?.primaryArtist)
        .up()
        .up();
      displayArtist?.ele("ArtistRole").txt("MainArtist");

      // Featured artists
      if (track?.featuredArtists && track?.featuredArtists.length > 0) {
        track?.featuredArtists.forEach((artist, index) => {
          const featured = artistParty?.ele("DisplayArtist", {
            SequenceNumber: String(index + 2),
          });
          featured?.ele("PartyName").ele("FullName").txt(artist).up().up();
          featured?.ele("ArtistRole").txt("FeaturedArtist");
        });
      }

      // Parental Warning
      artistParty
        .ele("ParentalWarningType")
        .txt(track?.explicit ? "Explicit" : "NotExplicit");

      // Technical details
      const technicalDetails = artistParty?.ele(
        "TechnicalSoundRecordingDetails",
        {
          SequenceNumber: "1",
        },
      );
      technicalDetails
        .ele("TechnicalResourceDetailsReference")
        .txt(`T${track?.trackNumber}`);
      technicalDetails?.ele("AudioCodecType").txt(track.audioCodec);
      if (track.bitrate) technicalDetails?.ele("BitRate").txt(String(track.bitrate));
      technicalDetails?.ele("SamplingRate").txt(String(track.sampleRate));
      if (track.bitDepth) {
        technicalDetails?.ele("BitsPerSample").txt(String(track.bitDepth));
      }
      technicalDetails?.ele("NumberOfChannels").txt(String(track.channels));

      // File reference
      const trackFileName = this.getTrackFileName(track);
      technicalDetails
        .ele("File")
        .ele("FileName")
        .txt(trackFileName)
        .up()
        .ele("FilePath")
        .txt(trackFileName)
        .up()
        .ele("HashSum", { HashSumAlgorithmType: "MD5" })
        .txt(await this.calculateMD5(track?.audioFilePath));
    }

    // Add cover artwork
    if (release?.coverArtPath) {
      const image = resourceList?.ele("Image");
      image?.ele("ImageType").txt("FrontCoverImage");

      const imageId = image?.ele("ImageId");
      imageId
        .ele("ProprietaryId", { Namespace: "DPID:MAX_BOOSTER" })
        .txt(`${release?.id}-cover`);

      const referenceTitle = image?.ele("ReferenceTitle");
      referenceTitle?.ele("TitleText").txt(`${release?.title} - Cover Art`);

      const imageDetails = image?.ele("ImageDetailsByTerritory");
      imageDetails?.ele("TerritoryCode").txt("Worldwide");

      const technicalDetails = imageDetails?.ele("TechnicalImageDetails", {
        SequenceNumber: "1",
      });
      technicalDetails?.ele("ImageCodecType").txt(release.coverArtCodec);
      technicalDetails?.ele("ImageHeight").txt(String(release.coverArtHeight));
      technicalDetails?.ele("ImageWidth").txt(String(release.coverArtWidth));
      const coverFileName = `cover.${path.extname(release.coverArtPath).slice(1).toLowerCase()}`;

      technicalDetails
        .ele("File")
        .ele("FileName")
        .txt(coverFileName)
        .up()
        .ele("FilePath")
        .txt(coverFileName)
        .up()
        .ele("HashSum", { HashSumAlgorithmType: "MD5" })
        .txt(await this.calculateMD5(release?.coverArtPath));
    }

    // Release List
    const releaseList = doc?.ele("ReleaseList");
    const releaseElem = releaseList?.ele("Release", { IsMainRelease: "true" });

    releaseElem?.ele("ReleaseReference").txt(releaseId);

    const releaseIdElem = releaseElem?.ele("ReleaseId");
    releaseIdElem?.ele("ICPN", { IsEan: "true" }).txt(release?.upc);
    releaseIdElem
      .ele("ProprietaryId", { Namespace: "DPID:MAX_BOOSTER" })
      .txt(release?.id);

    // Release type
    const releaseType =
      {
        single: "Single",
        EP: "EP",
        album: "Album",
      }[release?.releaseType] || "Album";
    releaseElem?.ele("ReleaseType").txt(releaseType);

    // Title
    const releaseTitle = releaseElem?.ele("ReferenceTitle");
    releaseTitle?.ele("TitleText").txt(release?.title);

    // Main artist
    const mainArtist = releaseElem?.ele("ReleaseResourceReference", {
      SequenceNumber: "1",
    });
    mainArtist?.txt(tracks[0]?.id || "");

    // Release details by territory
    const releaseDetails = releaseElem?.ele("ReleaseDetailsByTerritory");
    const territories =
      release?.territories && release?.territories.length > 0
        ? release?.territories
        : ["Worldwide"];

    territories?.forEach((territory) => {
      releaseDetails?.ele("TerritoryCode").txt(territory);
    });

    // Display artists
    const displayArtist = releaseDetails?.ele("DisplayArtist", {
      SequenceNumber: "1",
    });
    displayArtist
      .ele("PartyName")
      .ele("FullName")
      .txt(release?.artistName)
      .up()
      .up();
    displayArtist?.ele("ArtistRole").txt("MainArtist");

    // Label name
    const labelName = releaseDetails?.ele("LabelName");
    labelName?.txt(release?.labelName || "Independent");

    // Release date
    releaseDetails?.ele("ReleaseDate").txt(release?.releaseDate);

    // Parental warning
    releaseDetails
      .ele("ParentalWarningType")
      .txt(release?.isExplicit ? "Explicit" : "NotExplicit");

    // Genre
    const genre = releaseDetails?.ele("Genre");
    genre?.ele("GenreText").txt(release?.primaryGenre);

    // Copyright
    const copyrightLine = releaseDetails?.ele("CLine");
    copyrightLine?.ele("Year").txt(String(release?.copyrightYear));
    copyrightLine
      .ele("CLineText")
      .txt(`© ${release?.copyrightYear} ${release?.copyrightOwner}`);

    const pLine = releaseDetails?.ele("PLine");
    pLine?.ele("Year").txt(String(release?.copyrightYear));
    pLine
      .ele("PLineText")
      .txt(`℗ ${release?.copyrightYear} ${release?.copyrightOwner}`);

    // Track list
    tracks?.forEach((track, index) => {
      const trackRelease = releaseDetails?.ele("TrackRelease", {
        SequenceNumber: String(index + 1),
      });
      trackRelease?.ele("ReleaseResourceReference").txt(track?.id);
      trackRelease?.ele("TrackNumber").txt(String(track?.trackNumber));
    });

    // Deal (distribution terms)
    const dealList = doc?.ele("DealList");
    const releaseDeal = dealList?.ele("ReleaseDeal");

    const deal = releaseDeal?.ele("Deal");
    deal?.ele("DealReleaseReference").txt(releaseId);

    const dealTerms = deal?.ele("DealTerms");
    dealTerms?.ele("CommercialModelType").txt("SubscriptionModel");
    dealTerms?.ele("Usage").txt("PermanentDownload");

    territories?.forEach((territory) => {
      dealTerms?.ele("TerritoryCode").txt(territory);
    });

    dealTerms
      .ele("ValidityPeriod")
      .ele("StartDate")
      .txt(release?.releaseDate)
      .up();

    // Convert to XML string
    const xml = doc?.end({ prettyPrint: true });
    return xml;
  }

  private getTrackFileName(track: DDEXTrackMetadata): string {
    const extension = path.extname(track.audioFilePath).slice(1).toLowerCase();
    if (!/^[a-z0-9]{1,8}$/.test(extension)) {
      throw new Error(`Track ${track.trackNumber} has no safe package extension`);
    }
    return `track_${String(track.trackNumber).padStart(2, "0")}.${extension}`;
  }

  async createDDEXPackage(
    release: DDEXReleaseMetadata,
    tracks: DDEXTrackMetadata[],
    outputPath: string,
  ): Promise<string> {
    const xml = await this.generateDDEXXML(release, tracks);
    const archive = archiver("zip", {
      // Audio and artwork are already compressed formats; level 1 avoids
      // burning CPU attempting to recompress them at level 9.
      zlib: { level: 1 },
    });
    const output = createWriteStream(outputPath);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      output.once("close", () => settle(resolve));
      output.once("error", (error) => settle(() => reject(error)));
      archive.once("error", (error) => settle(() => reject(error)));
      archive.pipe(output);
      archive.append(xml, { name: "release.xml" });
      for (const track of tracks) {
        archive.file(track.audioFilePath, {
          name: this.getTrackFileName(track),
        });
      }
      if (release.coverArtPath) {
        const extension = path.extname(release.coverArtPath).slice(1).toLowerCase();
        if (!/^[a-z0-9]{1,8}$/.test(extension)) {
          settle(() => reject(new Error("Cover art has no safe package extension")));
          archive.abort();
          output.destroy();
          return;
        }
        archive.file(release.coverArtPath, { name: `cover.${extension}` });
      }
      archive.finalize();
    }).catch((error) => {
      archive.abort();
      output.destroy();
      throw error;
    });

    return outputPath;
  }

  async validateDDEXXML(
    xml: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Basic XML validation
      create(xml);

      // Check for required elements
      const requiredElements = [
        "MessageHeader",
        "ResourceList",
        "ReleaseList",
        "DealList",
      ];

      for (const element of requiredElements) {
        if (!xml?.includes(element)) {
          errors?.push(`Missing required element: ${element}`);
        }
      }

      // Validate ISRC format (2 letters + 3 alphanumeric + 2 digits + 5 digits)
      const isrcPattern = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
      const isrcMatches = xml?.match(/<ISRC>([^<]+)<\/ISRC>/g);
      if (isrcMatches) {
        isrcMatches?.forEach((match) => {
          const isrc = match?.replace(/<\/?ISRC>/g, "");
          if (!isrcPattern.test(isrc)) {
            errors?.push(`Invalid ISRC format: ${isrc}`);
          }
        });
      } else {
        errors.push("No ISRC elements were found");
      }

      // Validate UPC/EAN format and GS1 check digit.
      const upcMatches = xml?.match(/<ICPN[^>]*>([^<]+)<\/ICPN>/g);
      if (upcMatches) {
        upcMatches?.forEach((match) => {
          const upc = match?.replace(/<\/?ICPN[^>]*>/g, "");
          if (!hasValidGs1CheckDigit(upc)) {
            errors?.push("UPC/EAN has an invalid GS1 check digit");
          }
        });
      } else {
        errors.push("No UPC/EAN element was found");
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
    const timestamp = Date?.now();
    const hash = createHash("md5")
      .update(`${releaseId}-${timestamp}`)
      .digest("hex")
      .substring(0, 8);
    return `MB${timestamp}-${hash}`.toUpperCase();
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let duration = "PT";
    if (hours > 0) duration += `${hours}H`;
    if (minutes > 0) duration += `${minutes}M`;
    if (secs > 0 || duration === "PT") duration += `${secs}S`;

    return duration;
  }

  private async calculateMD5(filePath: string): Promise<string> {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile() || fileInfo.size === 0) {
      throw new Error("DDEX asset is empty or unavailable");
    }
    const hash = createHash("md5");
    for await (const chunk of createReadStream(filePath)) hash.update(chunk);
    return hash.digest("hex");
  }
}

export const ddexPackageService = new DDEXPackageService();

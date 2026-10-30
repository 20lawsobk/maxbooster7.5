import { db } from "../db";
import {
  catalogImportJobs,
  catalogImportRows,
  releases,
  distroReleases,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../logger.js";
import { identifierService } from "./identifierService.js";
import ExcelJS from "exceljs";
import { withCatalogImportLock } from "./catalogImportLock.js";
import {
  normalizeArtistNameForIdentity,
  normalizeReleaseTitleForIdentity,
  findExistingReleaseAcrossTables,
  buildCrossTableBackfillPatch,
  syncDistroTrackRows,
  type CrossTableReleaseMatch,
} from "./releaseIdentity.js";

export interface ImportRow {
  title: string;
  artist: string;
  albumArtist?: string;
  genre?: string;
  releaseDate?: string;
  upc?: string;
  isrc?: string;
  label?: string;
  copyrightHolder?: string;
  copyrightYear?: number;
  trackTitle?: string;
  trackNumber?: number;
  duration?: number;
  isExplicit?: boolean;
  coverUrl?: string;
  platforms?: string;
  language?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ImportResult {
  jobId: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  status: "pending" | "processing" | "completed" | "failed";
}

export interface ImportError {
  rowNumber: number;
  field: string;
  message: string;
  value?: string;
}

export interface ImportWarning {
  rowNumber: number;
  field: string;
  message: string;
  suggestion?: string;
}

export interface ImportProgress {
  jobId: string;
  totalRows: number;
  processedRows: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
  currentPhase: "parsing" | "validating" | "importing" | "finalizing";
}

const CSV_COLUMN_MAPPINGS: Record<string, string> = {
  release_title: "title",
  album_title: "title",
  album: "title",
  release: "title",
  artist_name: "artist",
  primary_artist: "artist",
  performer: "artist",
  album_artist: "albumArtist",
  genre_primary: "genre",
  primary_genre: "genre",
  release_date: "releaseDate",
  street_date: "releaseDate",
  upc_code: "upc",
  ean: "upc",
  isrc_code: "isrc",
  label_name: "label",
  record_label: "label",
  copyright: "copyrightHolder",
  p_line: "copyrightHolder",
  c_line: "copyrightHolder",
  track_title: "trackTitle",
  song_title: "trackTitle",
  track_number: "trackNumber",
  track_no: "trackNumber",
  duration_seconds: "duration",
  length: "duration",
  explicit: "isExplicit",
  parental_advisory: "isExplicit",
  language_code: "language",
  primary_language: "language",
  cover_url: "coverUrl",
  coverurl: "coverUrl",
  cover_art_url: "coverUrl",
  coverarturl: "coverUrl",
  artwork_url: "coverUrl",
  artworkurl: "coverUrl",
  artwork: "coverUrl",
  platforms: "platforms",
  platform: "platforms",
  dsp: "platforms",
  stores: "platforms",
};


class CatalogImporter {
  async createImportJob(
    userId: string,
    filename: string,
    fileType: "csv" | "xlsx" | "ddex",
    _fileSize: number,
  ): Promise<string> {
    const [job] = await db
      .insert(catalogImportJobs)
      .values({
        artistId: userId,
        sourceType: fileType,
        sourceUrl: filename,
        status: "pending",
        totalTracks: 0,
        importedTracks: 0,
        progress: 0,
      })
      .returning();

    logger.info(`Created import job ${job?.id} for user ${userId}`);
    return job?.id;
  }

  async parseCSV(content: string): Promise<ImportRow[]> {
    const lines = content?.trim().split("\n");
    if (lines?.length < 2) {
      throw new Error(
        "CSV file must have at least a header row and one data row",
      );
    }

    const headers = this.parseCSVLine(lines[0]).map((h) =>
      this.normalizeHeader(h),
    );
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines?.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row: ImportRow = {} as ImportRow;

      for (let j = 0; j < headers?.length; j++) {
        const header = headers[j];
        const value = values[j]?.trim();

        if (value) {
          const mappedField =
            CSV_COLUMN_MAPPINGS[header?.toLowerCase()] || header;
          row[mappedField] = this.parseValue(mappedField, value);
        }
      }

      if (row?.title || row?.trackTitle) {
        rows?.push(row);
      }
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line?.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_");
  }

  private parseValue(field: string, value: string): string | number | boolean | undefined {
    switch (field) {
      case "trackNumber":
      case "duration":
      case "copyrightYear":
        return parseInt(value, 10) || undefined;
      case "isExplicit":
        return ["true", "1", "yes", "y", "explicit"].includes(
          value.toLowerCase(),
        );
      case "releaseDate":
        return this.parseDate(value);
      default:
        return value;
    }
  }

  private parseDate(value: string): string | undefined {
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/,
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
      /^(\d{4})\/(\d{2})\/(\d{2})$/,
    ];

    for (const format of formats) {
      const match = value.match(format);
      if (match) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split("T")[0];
        }
      }
    }

    return undefined;
  }

  async parseDDEX(xmlContent: string): Promise<ImportRow[]> {
    logger.info("DDEX parsing initiated (simplified XML parsing)");

    const rows: ImportRow[] = [];

    const releaseMatch = xmlContent.match(
      /<ReleaseTitle[^>]*>(.*?)<\/ReleaseTitle>/s,
    );
    const artistMatch = xmlContent.match(
      /<DisplayArtistName[^>]*>(.*?)<\/DisplayArtistName>/s,
    );
    const upcMatch = xmlContent.match(/<ICPN[^>]*>(.*?)<\/ICPN>/s);

    // Simplified single-block cover art lookup: DDEX ERN can reference
    // several resource URIs (audio files, etc.), so this scopes the URI
    // search to inside the first <Image>...</Image> block rather than
    // matching any <URI> in the document.
    const imageBlockMatch = xmlContent.match(/<Image[^>]*>([\s\S]*?)<\/Image>/);
    const coverUriMatch = imageBlockMatch
      ? imageBlockMatch[1].match(/<URI[^>]*>(.*?)<\/URI>/s)
      : null;

    if (releaseMatch) {
      const row: ImportRow = {
        title: releaseMatch[1].trim(),
        artist: artistMatch![1].trim() || "Unknown Artist",
      };

      if (upcMatch) {
        row.upc = upcMatch[1].trim();
      }

      if (coverUriMatch) {
        row.coverUrl = coverUriMatch[1].trim();
      }

      const isrcMatches = Array.from(
        xmlContent.matchAll(/<ISRC[^>]*>(.*?)<\/ISRC>/gs),
      ).map((match) => match[1].trim());
      const trackMatches = xmlContent.matchAll(/<Title[^>]*>(.*?)<\/Title>/gs);

      let trackNumber = 1;
      for (const trackMatch of trackMatches) {
        const trackRow: ImportRow = {
          ...row,
          trackTitle: trackMatch[1].trim(),
          trackNumber: trackNumber,
        };
        const isrc = isrcMatches[trackNumber - 1];
        if (isrc) {
          trackRow.isrc = isrc;
        }
        trackNumber++;
        rows.push(trackRow);
      }

      if (rows.length === 0) {
        rows.push(row);
      }
    }

    return rows;
  }

  async parseXLSX(buffer: Buffer): Promise<ImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw new Error("XLSX file contains no sheets");
    }

    const headers: string[] = [];
    const jsonData: Record<string, any>[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = cell.value;
          headers[colNumber - 1] =
            val !== null && val !== undefined ? String(val) : "";
        });
      } else {
        const obj: Record<string, any> = {};
        headers.forEach((header, idx) => {
          const cell = row.getCell(idx + 1);
          obj[header] =
            cell.value !== null && cell.value !== undefined ? cell.value : "";
        });
        jsonData.push(obj);
      }
    });

    if (jsonData.length === 0) {
      throw new Error("XLSX file contains no data rows");
    }

    const rows: ImportRow[] = [];

    for (const rawRow of jsonData) {
      const row: ImportRow = {} as ImportRow;

      for (const [key, value] of Object.entries(rawRow)) {
        const normalizedHeader = this.normalizeHeader(key);
        const mappedField =
          CSV_COLUMN_MAPPINGS[normalizedHeader] || normalizedHeader;

        if (
          value !== undefined &&
          value !== null &&
          String(value).trim() !== ""
        ) {
          row[mappedField] = this.parseValue(mappedField, String(value).trim());
        }
      }

      if (row.title || row.trackTitle) {
        rows.push(row);
      }
    }

    return rows;
  }

  async validateRows(
    rows: ImportRow[],
    _jobId: string,
  ): Promise<{
    validRows: ImportRow[];
    errors: ImportError[];
    warnings: ImportWarning[];
    duplicates: number[];
  }> {
    const validRows: ImportRow[] = [];
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const duplicates: number[] = [];
    const seenIdentifiers = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      let isValid = true;

      if (!row.title && !row.trackTitle) {
        errors.push({
          rowNumber,
          field: "title",
          message: "Title is required",
        });
        isValid = false;
      }

      if (!row.artist) {
        errors.push({
          rowNumber,
          field: "artist",
          message: "Artist is required",
        });
        isValid = false;
      }

      if (row.upc) {
        const upcValidation = identifierService.validateUPC(row.upc);
        if (!upcValidation.valid) {
          errors.push({
            rowNumber,
            field: "upc",
            message: upcValidation.error || "Invalid UPC",
            value: row.upc,
          });
          isValid = false;
        }
      }

      if (row.isrc) {
        const isrcValidation = identifierService.validateISRC(row.isrc);
        if (!isrcValidation.valid) {
          errors.push({
            rowNumber,
            field: "isrc",
            message: isrcValidation.error || "Invalid ISRC",
            value: row.isrc,
          });
          isValid = false;
        }
      }

      // A release commonly appears once per track in distributor exports.
      // Include the track identity so valid multi-track rows are not dropped
      // as duplicate releases; only repeated copies of the same track row are
      // treated as duplicates.
      const trackIdentity =
        row.isrc ||
        `${row.trackNumber || ""}|${row.trackTitle || ""}`;
      const identifier = `${row.title || row.trackTitle}|${row.artist}|${row.upc || ""}|${trackIdentity}`;
      if (seenIdentifiers.has(identifier)) {
        duplicates.push(rowNumber);
        warnings.push({
          rowNumber,
          field: "duplicate",
          message: "Duplicate entry detected",
          suggestion: "This row appears to be a duplicate of an earlier row",
        });
      } else {
        seenIdentifiers.add(identifier);
      }

      const title = row.title || row.trackTitle || "";
      if (title === title.toUpperCase() && title.length > 3) {
        warnings.push({
          rowNumber,
          field: "title",
          message: "Title is in ALL CAPS",
          suggestion: "Use Title Case for better presentation",
        });
      }

      if (!row.genre) {
        warnings.push({
          rowNumber,
          field: "genre",
          message: "Genre is missing",
          suggestion: "Add a genre for better discoverability",
        });
      }

      if (!row.releaseDate) {
        warnings.push({
          rowNumber,
          field: "releaseDate",
          message: "Release date is missing",
          suggestion: "Add a release date for scheduling",
        });
      }

      if (isValid && !duplicates.includes(rowNumber)) {
        validRows.push(row);
      }
    }

    return { validRows, errors, warnings, duplicates };
  }

  async importRows(
    jobId: string,
    userId: string,
    rows: ImportRow[],
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportResult> {
    await db
      .update(catalogImportJobs)
      .set({
        status: "processing",
        startedAt: new Date(),
        totalTracks: rows.length,
        progress: 0,
      })
      .where(eq(catalogImportJobs.id, jobId));

    const validation = await this.validateRows(rows, jobId);
    const result: ImportResult = {
      jobId,
      totalRows: rows.length,
      processedRows: 0,
      successfulRows: 0,
      failedRows: validation.errors.filter((e) => e.field !== "duplicate")
        .length,
      duplicateRows: validation.duplicates.length,
      errors: validation.errors,
      warnings: validation.warnings,
      status: "processing",
    };

    const releaseGroups = this.groupRowsByRelease(validation.validRows);

    await withCatalogImportLock(userId, async (tx) => {
      for (const [releaseKey, releaseRows] of Object.entries(releaseGroups)) {
        try {
          const firstRow = releaseRows[0];

          const existingRelease = await this.findExistingRelease(
            userId,
            firstRow.title,
            firstRow.artist,
            firstRow.upc,
            tx,
          );

          if (existingRelease) {
            result.duplicateRows++;
            validation.warnings.push({
              rowNumber: rows.indexOf(firstRow) + 1,
              field: "release",
              message:
                existingRelease.table === "distro_releases"
                  ? "Release already exists in your distribution catalog"
                  : "Release already exists in catalog",
              suggestion: "Skip or update existing release",
            });
            if (existingRelease.table === "distro_releases") {
              // No cross-table merge — the row stays in distro_releases —
              // but this row group's cover art/track/platform data must not
              // be silently discarded just because the release already
              // exists in the other table. Failure here is logged, not
              // fatal: the row is still correctly reported as a duplicate
              // either way.
              try {
                await tx.transaction((spTx: any) =>
                  this.backfillDistroReleaseFromRows(
                    spTx,
                    existingRelease.id,
                    releaseRows,
                  ),
                );
              } catch (backfillErr) {
                logger.warn(
                  { err: backfillErr },
                  `[CatalogImporter] Failed to backfill distro release ${existingRelease.id} from row group ${releaseKey}`,
                );
              }
            }
            result.processedRows += releaseRows.length;
            if (onProgress) {
              onProgress({
                jobId,
                totalRows: rows.length,
                processedRows: result.processedRows,
                percentComplete: Math.round(
                  (result.processedRows / (rows.length || 1)) * 100,
                ),
                currentPhase: "importing",
              });
            }
            continue;
          }

          // The release, its tracks, and the per-row audit trail must commit
          // or roll back together. Without this savepoint, a failure partway
          // through (e.g. the audit-row insert) would still leave the release
          // committed by the outer transaction while this group is reported
          // to the user as failed — silently creating a release nobody is
          // told succeeded.
          await tx.transaction(async (groupTx: any) => {
            await this.createReleaseFromRows(userId, releaseRows, groupTx);

            for (const row of releaseRows) {
              await groupTx.insert(catalogImportRows).values({
                jobId,
                trackTitle: row.trackTitle || row.title || "Untitled Track",
                artistName: row.artist || null,
                releaseTitle: row.title || null,
                isrc: row.isrc || null,
                upc: row.upc || null,
                status: "success",
                rawData: row,
              });
            }
          });
          result.successfulRows += releaseRows.length;
        } catch (error) {
          result.failedRows += releaseRows.length;
          logger.warn(
            { err: error },
            `Error importing release group ${releaseKey}:`,
          );

          for (const row of releaseRows) {
            result.errors.push({
              rowNumber: rows.indexOf(row) + 1,
              field: "import",
              message: error instanceof Error ? error.message : "Import failed",
            });
          }
        }

        result.processedRows += releaseRows.length;

        if (onProgress) {
          onProgress({
            jobId,
            totalRows: rows.length,
            processedRows: result.processedRows,
            percentComplete: Math.round(
              (result.processedRows / (rows.length || 1)) * 100,
            ),
            currentPhase: "importing",
          });
        }
      }
    });

    result.status = result.failedRows === rows.length ? "failed" : "completed";

    await db
      .update(catalogImportJobs)
      .set({
        status: result.status,
        completedAt: new Date(),
        importedTracks: result.successfulRows,
        progress: 100,
        errors: result.errors as unknown as Record<string, unknown>,
      })
      .where(eq(catalogImportJobs.id, jobId));

    logger.info(
      `Import job ${jobId} completed: ${result.successfulRows}/${result.totalRows} successful`,
    );

    return result;
  }

  private groupRowsByRelease(rows: ImportRow[]): Record<string, ImportRow[]> {
    const groups: Record<string, ImportRow[]> = {};

    for (const row of rows) {
      const base = `${normalizeReleaseTitleForIdentity(row.title || "untitled")}|${normalizeArtistNameForIdentity(row.artist)}`;
      const candidates = Object.keys(groups).filter((key) =>
        key.startsWith(`${base}|`),
      );
      const matchingUpc = row.upc
        ? candidates.find((key) =>
            groups[key].some(
              (candidate) => candidate.upc && candidate.upc === row.upc,
            ),
          )
        : undefined;
      const missingUpc = candidates.find((key) =>
        groups[key].every((candidate) => !candidate.upc),
      );
      const key =
        matchingUpc ||
        missingUpc ||
        (!row.upc && candidates.length === 1
          ? candidates[0]
          : `${base}|${row.upc || "no-upc"}`);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    }

    return groups;
  }

  /**
   * Checks BOTH the legacy `releases` table (this importer's own table) and
   * `distro_releases` (written by profile auto-sync / Too Lost catalog
   * import) so the same real-world release can't end up once per table.
   * A match in either table is reported as existing; only a `releases` hit
   * is something this importer can enrich in place, since there's no
   * cross-table update path.
   */
  private async findExistingRelease(
    userId: string,
    title: string,
    artist: string,
    upc: string | undefined,
    queryDb: any = db,
  ): Promise<CrossTableReleaseMatch | null> {
    return findExistingReleaseAcrossTables(
      userId,
      { title, artistName: artist, upc },
      queryDb,
    );
  }

  private async createReleaseFromRows(
    userId: string,
    rows: ImportRow[],
    queryDb: any = db,
  ): Promise<string> {
    const firstRow = rows[0];

    let upc = firstRow.upc;
    if (!upc) {
      upc = await identifierService.generateUPC({ userId }, queryDb);
    }

    // Track rows live in `releases.metadata.tracks`, not the `distro_tracks`
    // table. Every reader of `distro_tracks` looks rows up by a
    // `distro_releases.id`; this legacy `releases` table never produces one,
    // so rows previously written there under a `releases.id` were permanently
    // orphaned (never read back by anything). Persisting full track data
    // (including the explicit flag, which was previously dropped entirely)
    // on the release's own metadata mirrors the pattern already used for
    // `distro_releases` and is the only place any reader of this table can
    // actually see it.
    const trackRows = rows.filter(
      (row) => row.trackTitle || rows.length === 1,
    );
    const tracks: Array<Record<string, unknown>> = [];
    for (let i = 0; i < trackRows.length; i++) {
      const row = trackRows[i];
      let isrc = row.isrc;
      if (!isrc) {
        isrc = await identifierService.generateISRC(
          "US",
          "MXB",
          undefined,
          { userId },
          queryDb,
        );
      }
      tracks.push({
        title: row.trackTitle || row.title || "Untitled Track",
        trackNumber: row.trackNumber || i + 1,
        isrc,
        duration: row.duration,
        explicit: Boolean(row.isExplicit),
      });
    }

    const [release] = await queryDb
      .insert(releases)
      .values({
        userId,
        title: firstRow.title || "Untitled Release",
        upc,
        status: "draft",
        releaseDate: firstRow.releaseDate
          ? new Date(firstRow.releaseDate)
          : null,
        artworkUrl: firstRow.coverUrl || null,
        metadata: {
          artistName: firstRow.artist,
          genre: firstRow.genre,
          label: firstRow.label,
          copyrightHolder: firstRow.copyrightHolder,
          copyrightYear: firstRow.copyrightYear,
          language: firstRow.language,
          coverUrl: firstRow.coverUrl || null,
          coverArtUrl: firstRow.coverUrl || null,
          distributionPlatforms: firstRow.platforms
            ? firstRow.platforms
                .split(/[|;,]/)
                .map((platform) => platform.trim())
                .filter(Boolean)
            : [],
          platforms: firstRow.platforms
            ? firstRow.platforms
                .split(/[|;,]/)
                .map((platform) => platform.trim())
                .filter(Boolean)
            : [],
          isExplicit: firstRow.isExplicit,
          tracks,
          importedAt: new Date(),
        },
      })
      .returning();

    return release.id;
  }

  /**
   * Backfill gaps on a `distro_releases` row this CSV/DDEX row group matched
   * by identity (never overwrites data the row already has). Mirrors
   * `createReleaseFromRows`'s platform/track parsing so the two paths agree
   * on shape, minus ISRC minting — this is a supplementary enrichment of an
   * already-existing release, not the primary creation path, so a track
   * without a source ISRC just merges by track number instead of consuming
   * a freshly-issued one.
   */
  private async backfillDistroReleaseFromRows(
    tx: any,
    matchId: string,
    rows: ImportRow[],
  ): Promise<void> {
    const firstRow = rows[0];
    const [existingRow] = await tx
      .select()
      .from(distroReleases)
      .where(eq(distroReleases.id, matchId));
    if (!existingRow) return;

    const trackRows = rows.filter(
      (row) => row.trackTitle || rows.length === 1,
    );
    const tracks = trackRows.map((row, i) => ({
      title: row.trackTitle || row.title || "Untitled Track",
      trackNumber: row.trackNumber || i + 1,
      isrc: row.isrc || undefined,
      duration: row.duration,
      explicit: Boolean(row.isExplicit),
    }));
    const platforms = firstRow.platforms
      ? firstRow.platforms
          .split(/[|;,]/)
          .map((platform) => platform.trim())
          .filter(Boolean)
      : [];

    const patch = buildCrossTableBackfillPatch(
      { artworkUrl: existingRow.artworkUrl, metadata: existingRow.metadata },
      {
        upc: firstRow.upc,
        coverUrl: firstRow.coverUrl,
        platforms,
        tracks,
      },
    );
    if (!patch) return;

    const [updated] = await tx
      .update(distroReleases)
      .set(patch)
      .where(eq(distroReleases.id, matchId))
      .returning();

    if (Array.isArray(patch.metadata.tracks)) {
      await syncDistroTrackRows(
        tx,
        updated.id,
        patch.metadata.tracks as Array<Record<string, unknown>>,
      );
    }
  }

  async getImportJob(jobId: string): Promise<any | null> {
    const jobs = await db
      .select()
      .from(catalogImportJobs)
      .where(eq(catalogImportJobs.id, jobId))
      .limit(1);

    return jobs.length > 0 ? jobs[0] : null;
  }

  async getImportJobs(userId: string): Promise<any[]> {
    return db
      .select()
      .from(catalogImportJobs)
      .where(eq(catalogImportJobs.artistId, userId))
      .orderBy(desc(catalogImportJobs.createdAt));
  }

  async getImportRows(jobId: string): Promise<any[]> {
    return db
      .select()
      .from(catalogImportRows)
      .where(eq(catalogImportRows.jobId, jobId))
      .orderBy(catalogImportRows.createdAt);
  }

  getSupportedFormats(): {
    format: string;
    extension: string;
    description: string;
  }[] {
    return [
      {
        format: "csv",
        extension: ".csv",
        description: "Comma-separated values",
      },
      { format: "xlsx", extension: ".xlsx", description: "Microsoft Excel" },
      { format: "ddex", extension: ".xml", description: "DDEX ERN format" },
    ];
  }

  getTemplateCSV(): string {
    const headers = [
      "title",
      "artist",
      "album_artist",
      "genre",
      "release_date",
      "upc",
      "label",
      "copyright_holder",
      "copyright_year",
      "track_title",
      "track_number",
      "isrc",
      "duration",
      "explicit",
      "language",
    ];

    const exampleRow = [
      "My Album Title",
      "Artist Name",
      "Artist Name",
      "Pop",
      "2025-01-01",
      "619123456789",
      "My Record Label",
      "2025 My Record Label",
      "2025",
      "First Song",
      "1",
      "USRC12500001",
      "180",
      "false",
      "en",
    ];

    return `${headers.join(",")}\n${exampleRow.join(",")}`;
  }
}

export const catalogImporter = new CatalogImporter();

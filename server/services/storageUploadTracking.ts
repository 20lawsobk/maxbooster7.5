/** A successful PDIM write is not a successful upload until its owner record is durable. */
export interface StoredUploadRecord {
  userId: string;
  fileKey: string;
  deletedAt: Date | null;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
}

export type ExpectedUploadRecord = Omit<StoredUploadRecord, "deletedAt">;

export function assertTrackedUpload(
  tracked: StoredUploadRecord | null | undefined,
  expected: ExpectedUploadRecord,
): void {
  if (
    !tracked ||
    tracked.userId !== expected.userId ||
    tracked.fileKey !== expected.fileKey ||
    tracked.deletedAt !== null ||
    tracked.sizeBytes !== expected.sizeBytes ||
    tracked.mimeType !== expected.mimeType ||
    tracked.fileName !== expected.fileName
  ) {
    throw new Error("Uploaded file tracking was not committed for this owner and object");
  }
}

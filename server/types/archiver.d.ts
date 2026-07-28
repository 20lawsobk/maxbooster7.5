// Minimal ambient type declaration for `archiver` (no @types package installed).
// Covers the surface used within this codebase; preserves runtime behavior.
declare module "archiver" {
  import type { Writable } from "stream";

  interface ArchiverAppendOptions {
    name?: string;
    [key: string]: unknown;
  }

  interface Archiver {
    on(event: "error", listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    pipe(destination: Writable): Writable;
    append(
      source: Buffer | string | NodeJS.ReadableStream,
      options?: ArchiverAppendOptions,
    ): this;
    file(filepath: string, options?: ArchiverAppendOptions): this;
    finalize(): Promise<void>;
    pointer(): number;
  }

  interface ArchiverOptions {
    zlib?: { level?: number };
    [key: string]: unknown;
  }

  function archiver(format: string, options?: ArchiverOptions): Archiver;

  export default archiver;
}

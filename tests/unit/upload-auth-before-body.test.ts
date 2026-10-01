import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const mockState = vi.hoisted(() => ({
  authenticated: true,
  selectRows: [] as Array<Array<{ id: string }>>,
  insertedValues: [] as any[],
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  uploadFileAtKey: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("../../server/db.js", () => ({
  db: {
    select: mockState.select,
    insert: mockState.insert,
    update: mockState.update,
    delete: mockState.delete,
  },
}));

vi.mock("../../server/config/env.js", () => ({
  env: { SESSION_SECRET: "upload-ordering-test-secret-only" },
}));

vi.mock("../../server/middleware/auth.js", () => {
  const authenticate = (req: any, res: any, next: any) => {
    if (!mockState.authenticated) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.user = { id: "upload-test-user", role: "admin" };
    req.isAuthenticated = () => true;
    next();
  };
  return {
    requireAuth: authenticate,
    requireAuthOnly: authenticate,
  };
});

vi.mock("../../server/services/storageService.js", () => ({
  storageService: {
    uploadFileAtKey: mockState.uploadFileAtKey,
    getDownloadUrl: mockState.getDownloadUrl,
    deleteFile: mockState.deleteFile,
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/middleware/requestValidation.js", () => ({
  requireUUIDParam: () => (_req: any, _res: any, next: any) => next(),
  requireSafeParam: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../../shared/schema.js", () => {
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, column) => ({ table: name, column: String(column) }),
      },
    );
  return {
    userStorage: table("user_storage"),
    userStorageFiles: table("user_storage_files"),
  };
});

vi.mock("drizzle-orm", () => {
  const expression = (...args: unknown[]) => args;
  return {
    and: expression,
    desc: expression,
    eq: expression,
    isNotNull: expression,
    isNull: expression,
    sql: expression,
  };
});

let server: Server;

function sendRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: Buffer | string,
): Promise<{ status: number; text: string }> {
  const { port } = server.address() as AddressInfo;

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { hostname: "127.0.0.1", port, method, path, headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

function sendHeaderOnlyRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const { port } = server.address() as AddressInfo;

  return new Promise((resolve, reject) => {
    let request: ReturnType<typeof httpRequest> | undefined;
    const timeout = setTimeout(() => {
      request?.destroy();
      reject(new Error("Timed out waiting for pre-body rejection"));
    }, 3000);
    request = httpRequest(
      { hostname: "127.0.0.1", port, method, path, headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          clearTimeout(timeout);
          resolve({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request?.flushHeaders();
  });
}

function multipartFile(
  boundary: string,
  field: string,
  filename: string,
  contentType: string,
  contents: string,
): Buffer {
  return Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n` +
      `${contents}\r\n` +
      `--${boundary}--\r\n`,
  );
}

async function reserveUpload(size: number): Promise<string> {
  const body = JSON.stringify({
    name: "track.wav",
    category: "audio",
    contentType: "audio/wav",
    size,
  });
  const response = await sendRequest(
    "POST",
    "/api/uploads/request-url",
    { "content-type": "application/json" },
    body,
  );

  expect(response.status).toBe(200);
  return JSON.parse(response.text).uploadURL as string;
}

beforeAll(async () => {
  // files.ts owns a periodic in-memory job cleanup timer; keep it fake so
  // this isolated router test does not leave a live timer behind.
  vi.useFakeTimers();
  const [{ default: filesRouter }, { default: uploadsRouter }] =
    await Promise.all([
      import("../../server/routes/files.js"),
      import("../../server/routes/uploads.js"),
    ]);
  vi.useRealTimers();

  const app = express();
  app.use(express.json());
  app.use("/api/files", filesRouter);
  app.use("/api/uploads", uploadsRouter);

  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
});

afterAll(async () => {
  if (!server) return;
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  await closed;
  vi.useRealTimers();
});

beforeEach(() => {
  mockState.authenticated = true;
  mockState.selectRows = [];
  mockState.insertedValues = [];
  mockState.select.mockReset().mockImplementation(() => {
    const rows = mockState.selectRows.shift() ?? [];
    return {
      from: () => ({
        where: () => ({ limit: async () => rows }),
      }),
    };
  });
  mockState.insert.mockReset().mockImplementation(() => ({
    values: (values: unknown) => {
      mockState.insertedValues.push(values);
      return {
        onConflictDoNothing: () => ({
          returning: async () => [{ id: "tracked-file" }],
        }),
      };
    },
  }));
  mockState.update.mockReset();
  mockState.delete.mockReset();
  mockState.uploadFileAtKey.mockReset().mockResolvedValue(undefined);
  mockState.getDownloadUrl
    .mockReset()
    .mockResolvedValue("http://local.test/download");
  mockState.deleteFile.mockReset().mockResolvedValue(undefined);
});

describe("upload authentication and body preflight", () => {
  it.each([
    "/api/files/upload",
    "/api/files/upload/chunk",
    "/api/files/validate",
  ])("rejects unauthenticated multipart requests before parsing (%s)", async (path) => {
    mockState.authenticated = false;
    const boundary = "upload-ordering-test";
    const malformedMultipart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="broken.wav"\r\n`,
    );
    const response = await sendRequest(
      "POST",
      path,
      {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(malformedMultipart.length),
      },
      malformedMultipart,
    );

    expect(response.status).toBe(401);
    expect(JSON.parse(response.text).error).toBe("Authentication required");
  });

  it("keeps authenticated uploads subject to the existing MIME allowlist", async () => {
    const boundary = "upload-content-check";
    const body = multipartFile(
      boundary,
      "file",
      "payload.bin",
      "application/x-test",
      "x",
    );
    const response = await sendRequest(
      "POST",
      "/api/files/upload",
      {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      body,
    );

    expect(response.status).toBe(400);
    expect(JSON.parse(response.text).outcome).toBe("invalid_type");
    expect(mockState.select).not.toHaveBeenCalled();
    expect(mockState.uploadFileAtKey).not.toHaveBeenCalled();
  });

  it("checks signed-token validity before a declared oversized body is parsed", async () => {
    const response = await sendHeaderOnlyRequest(
      "PUT",
      "/api/uploads/direct/not-a-valid-token",
      {
        "content-type": "application/octet-stream",
        "content-length": String(500 * 1024 * 1024 + 1),
      },
    );

    expect(response.status).toBe(404);
    expect(JSON.parse(response.text).error).toMatch(/invalid or expired/i);
    expect(mockState.select).not.toHaveBeenCalled();
    expect(mockState.uploadFileAtKey).not.toHaveBeenCalled();
  });

  it("rejects a body larger than its signed reservation before reading it", async () => {
    const uploadURL = await reserveUpload(4);
    const response = await sendRequest(
      "PUT",
      uploadURL,
      {
        "content-type": "audio/wav",
        "content-length": "5",
      },
      Buffer.from("12345"),
    );

    expect(response.status).toBe(413);
    expect(JSON.parse(response.text).error).toMatch(/reserved upload size/i);
    expect(mockState.select).not.toHaveBeenCalled();
    expect(mockState.uploadFileAtKey).not.toHaveBeenCalled();
  });

  it("applies the signed reservation as the raw-body limit for chunked uploads", async () => {
    const uploadURL = await reserveUpload(4);
    const response = await sendRequest(
      "PUT",
      uploadURL,
      { "content-type": "audio/wav" },
      Buffer.from("12345"),
    );

    expect(response.status).toBe(413);
    expect(mockState.select).not.toHaveBeenCalled();
    expect(mockState.uploadFileAtKey).not.toHaveBeenCalled();
  });

  it("still stores a valid upload authorized by its signed reservation", async () => {
    const uploadURL = await reserveUpload(4);
    mockState.selectRows = [[], [{ id: "storage-row" }]];
    const body = Buffer.from("1234");
    const response = await sendRequest(
      "PUT",
      uploadURL,
      {
        "content-type": "audio/wav",
        "content-length": String(body.length),
      },
      body,
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text).success).toBe(true);
    expect(mockState.uploadFileAtKey).toHaveBeenCalledWith(
      body,
      expect.stringMatching(/^users\/upload-test-user\/audio\//),
      "audio/wav",
    );
    expect(mockState.insert).toHaveBeenCalled();
    expect(mockState.insertedValues[0]).toMatchObject({
      userId: "upload-test-user",
      storageId: "storage-row",
      sizeBytes: body.length,
      mimeType: "audio/wav",
    });
  });
});
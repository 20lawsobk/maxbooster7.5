import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError as MaxCoreApiError,
  ResponseParseError as MaxCoreResponseParseError,
  customFetch as maxCoreCustomFetch,
  setAuthHeaderProvider,
} from "../../external/maxcore/lib/api-client-react/src/custom-fetch.js";
import {
  ApiError as PdimApiError,
  ResponseParseError as PdimResponseParseError,
  customFetch as pdimCustomFetch,
} from "../../external/pdim/lib/api-client-react/src/custom-fetch.js";

type FetchClient = {
  customFetch: typeof maxCoreCustomFetch;
  ApiError: typeof MaxCoreApiError;
  ResponseParseError: typeof MaxCoreResponseParseError;
  resetAuth?: () => void;
};

const clients: Array<[string, FetchClient]> = [
  [
    "MaxCore",
    {
      customFetch: maxCoreCustomFetch,
      ApiError: MaxCoreApiError,
      ResponseParseError: MaxCoreResponseParseError,
      resetAuth: () => setAuthHeaderProvider(() => ({})),
    },
  ],
  [
    "PDIM",
    {
      customFetch: pdimCustomFetch,
      ApiError: PdimApiError,
      ResponseParseError: PdimResponseParseError,
    },
  ],
];

describe.each(clients)("%s customFetch", (_name, client) => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    client.resetAuth?.();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses explicit response types, normalizes methods, and sets JSON headers", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"saved":true}', {
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    const result = await client.customFetch<{ saved: boolean }>(
      "https://api.example.test/items",
      {
        method: "post",
        body: '{"title":"Track"}',
        responseType: "json",
      },
    );

    expect(result).toEqual({ saved: true });
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe(
      "application/json, application/problem+json",
    );
  });

  it("respects explicit content type and Accept headers", async () => {
    fetchMock.mockResolvedValue(
      new Response("ok", { headers: { "content-type": "text/plain" } }),
    );

    await client.customFetch("https://api.example.test/items", {
      method: "POST",
      body: '{"title":"Track"}',
      responseType: "text",
      headers: {
        "content-type": "application/vnd.example+json",
        accept: "application/vnd.example+json",
      },
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/vnd.example+json");
    expect(headers.get("accept")).toBe("application/vnd.example+json");
  });

  it.each(["GET", "HEAD"])("rejects a %s request body before fetching", async (method) => {
    await expect(
      client.customFetch("/items", { method, body: "not allowed" }),
    ).rejects.toThrow(`customFetch: ${method} requests cannot have a body.`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges Request and call headers, with call headers taking precedence", async () => {
    fetchMock.mockResolvedValue(
      new Response("accepted", { headers: { "content-type": "text/plain" } }),
    );
    const request = new Request("https://api.example.test/items", {
      method: "POST",
      headers: {
        "x-request": "request",
        "x-overridden": "request",
      },
    });

    await client.customFetch(request, {
      headers: {
        "x-overridden": "call",
        "x-call": "present",
      },
      responseType: "text",
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-request")).toBe("request");
    expect(headers.get("x-overridden")).toBe("call");
    expect(headers.get("x-call")).toBe("present");
    expect(init.method).toBe("POST");
  });

  it("resolves URL inputs and defaults their method to GET", async () => {
    fetchMock.mockResolvedValue(new Response("ok"));
    const url = new URL("https://api.example.test/health");

    await client.customFetch(url, { responseType: "text" });

    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("infers JSON success bodies, strips a BOM, and returns null for whitespace", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('\ufeff{"ready":true}', {
          headers: { "content-type": "application/vnd.maxcore+json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("\ufeff \n", {
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(client.customFetch("/ready")).resolves.toEqual({ ready: true });
    await expect(client.customFetch("/empty")).resolves.toBeNull();
  });

  it("infers text responses and maps empty explicit text to null", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("plain text", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(new Response(""));

    await expect(client.customFetch("/text")).resolves.toBe("plain text");
    await expect(
      client.customFetch("/empty", { responseType: "text" }),
    ).resolves.toBeNull();
  });

  it("returns blobs for binary success responses", async () => {
    const response = new Response(new Blob(["binary"]), {
      headers: { "content-type": "application/octet-stream" },
    });
    fetchMock.mockResolvedValue(response);

    const result = await client.customFetch<Blob>("/asset", {
      responseType: "blob",
    });

    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe("binary");
  });

  it("fails clearly when this runtime cannot read a requested blob", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/octet-stream" }),
      body: {},
      url: "",
      blob: undefined,
    } as unknown as Response);

    await expect(
      client.customFetch("/asset", { responseType: "blob" }),
    ).rejects.toThrow(
      'Blob responses are not supported in this runtime. Use responseType "json" or "text" instead.',
    );
  });

  it.each([
    ["HEAD", new Response("ignored"), "HEAD"],
    ["204", new Response(null, { status: 204 }), "GET"],
    ["205", new Response(null, { status: 205 }), "GET"],
    [
      "zero content length",
      new Response("ignored", { headers: { "content-length": "0" } }),
      "GET",
    ],
    ["null body", new Response(null), "GET"],
  ])("returns null for a response with no body (%s)", async (_label, response, method) => {
    fetchMock.mockResolvedValue(response);

    await expect(
      client.customFetch("/empty", { method, responseType: "text" }),
    ).resolves.toBeNull();
  });

  it("raises an empty ApiError for 304 without attempting body parsing", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 304, statusText: "Not Modified" }),
    );

    await expect(client.customFetch("/cached")).rejects.toMatchObject({
      status: 304,
      statusText: "Not Modified",
      data: null,
      message: "HTTP 304 Not Modified",
    });
  });

  it("throws ResponseParseError with the original malformed success body", async () => {
    const response = new Response('{"broken":', {
      headers: { "content-type": "application/json" },
    });
    fetchMock.mockResolvedValue(response);

    const error = await client.customFetch("/malformed").catch((value) => value);

    expect(error).toBeInstanceOf(client.ResponseParseError);
    expect(error).toMatchObject({
      method: "GET",
      url: "/malformed",
      status: 200,
      rawBody: '{"broken":',
    });
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it("creates structured ApiError details from problem JSON", async () => {
    const response = new Response(
      JSON.stringify({ title: "Invalid request", detail: "Missing artist id" }),
      {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "content-type": "application/problem+json" },
      },
    );
    fetchMock.mockResolvedValue(response);

    const error = await client.customFetch("/artists").catch((value) => value);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error).toMatchObject({
      status: 422,
      statusText: "Unprocessable Entity",
      data: { title: "Invalid request", detail: "Missing artist id" },
      method: "GET",
      url: "/artists",
    });
    expect(error.message).toBe(
      "HTTP 422 Unprocessable Entity: Invalid request — Missing artist id",
    );
  });

  it("builds useful error messages from detail, OAuth message, title, and empty data", async () => {
    const cases = [
      [{ detail: "Specific detail" }, "HTTP 400 Bad Request: Specific detail"],
      [
        { error_description: "Provider denied access" },
        "HTTP 400 Bad Request: Provider denied access",
      ],
      [{ title: "Request failed" }, "HTTP 400 Bad Request: Request failed"],
      [{ other: 42 }, "HTTP 400 Bad Request"],
      ["   ", "HTTP 400 Bad Request"],
    ] as const;

    for (const [body, message] of cases) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          typeof body === "string" ? body : JSON.stringify(body),
          {
            status: 400,
            statusText: "Bad Request",
            headers: {
              "content-type": typeof body === "string" ? "text/plain" : "application/json",
            },
          },
        ),
      );

      await expect(client.customFetch("/failure")).rejects.toMatchObject({
        message,
      });
    }
  });

  it("truncates long text errors and retains the full response data", async () => {
    const body = "x".repeat(400);
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 502,
        headers: { "content-type": "text/plain" },
      }),
    );

    const error = await client.customFetch("/failure").catch((value) => value);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error.data).toBe(body);
    expect(error.message).toContain(`${"x".repeat(299)}…`);
    expect(error.message).not.toContain("x".repeat(300));
  });

  it("keeps invalid JSON error bodies as raw text instead of masking the HTTP error", async () => {
    const body = '{"message":';
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "application/json" },
      }),
    );

    const error = await client.customFetch("/failure").catch((value) => value);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error.data).toBe(body);
    expect(error.message).toBe(`HTTP 500 Internal Server Error: ${body}`);
  });

  it("reads binary error bodies as blobs when available", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(["provider diagnostic"]), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const error = await client.customFetch("/failure").catch((value) => value);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error.data).toBeInstanceOf(Blob);
    expect(await error.data.text()).toBe("provider diagnostic");
    expect(error.message).toBe("HTTP 502 Bad Gateway");
  });

  it("falls back to text for binary errors when blob() is unavailable", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers({ "content-type": "application/octet-stream" }),
      body: {},
      url: "",
      text: async () => "upstream unavailable",
      blob: undefined,
    } as unknown as Response);

    const error = await client.customFetch("/failure").catch((value) => value);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error.data).toBe("upstream unavailable");
    expect(error.message).toBe(
      "HTTP 503 Service Unavailable: upstream unavailable",
    );
  });
});

describe("MaxCore customFetch auth headers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    setAuthHeaderProvider(() => ({
      authorization: "Bearer test-only",
      "x-overridden": "provider",
    }));
  });

  afterEach(() => {
    setAuthHeaderProvider(() => ({}));
    vi.unstubAllGlobals();
  });

  it("merges provider headers before per-call headers", async () => {
    await maxCoreCustomFetch("/resource", {
      responseType: "text",
      headers: { "x-overridden": "call", "x-call": "present" },
    });

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-only");
    expect(headers.get("x-overridden")).toBe("call");
    expect(headers.get("x-call")).toBe("present");
  });
});

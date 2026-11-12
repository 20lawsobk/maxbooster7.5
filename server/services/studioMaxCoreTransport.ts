import { AIUnavailableError } from "../lib/aiSource.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";

export async function maxCoreStudioJson<T>(
  pathName: string,
  method: "GET" | "POST",
  userId: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!userId?.trim()) {
    throw new AIUnavailableError("studio generation requires an authenticated owner");
  }
  const response = method === "POST"
    ? await MaxCoreAIClient.generate<T>(pathName, body ?? {}, userId, 60_000)
    : await MaxCoreAIClient.poll<T>(pathName, userId, 30_000, true);
  if (response === null) {
    throw new AIUnavailableError("MaxCore studio generation returned no response");
  }
  return response;
}

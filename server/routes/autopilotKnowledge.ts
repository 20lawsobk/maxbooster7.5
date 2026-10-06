import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { createHardenedUpload } from "../middleware/uploadHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  AutopilotKnowledgeBaseError,
  MAX_AUTOPILOT_KNOWLEDGE_FILE_BYTES,
  autopilotKnowledgeBaseService,
} from "../services/autopilotKnowledgeBaseService.js";
import { logger } from "../logger.js";

const router = Router();
router.use(requireAuth);

const linkSchema = z
  .object({
    url: z.string().trim().url().max(2_048),
  })
  .strict();

const knowledgeFileUpload = createHardenedUpload({
  maxFileSize: MAX_AUTOPILOT_KNOWLEDGE_FILE_BYTES,
  maxFiles: 1,
  allowedMimes: [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
  ],
  allowedExtensions: [".txt", ".md", ".csv", ".json"],
  label: "autopilot knowledge file",
});

function respondWithError(
  res: Response,
  error: unknown,
  operation: string,
): void {
  if (error instanceof AutopilotKnowledgeBaseError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  logger.warn({ err: error }, `Autopilot knowledge ${operation} failed`);
  res.status(500).json({ error: `Could not ${operation} autopilot knowledge` });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const sources = await autopilotKnowledgeBaseService.listSources(req.user!.id);
    res.json({ sources, limit: 20, supportedFileTypes: [".txt", ".md", ".csv", ".json"] });
  } catch (error) {
    respondWithError(res, error, "load");
  }
});

router.post("/links", async (req: Request, res: Response) => {
  const parsedBody = linkSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Provide one valid public HTTP or HTTPS URL." });
    return;
  }

  try {
    const result = await autopilotKnowledgeBaseService.addLink(
      req.user!.id,
      parsedBody.data.url,
    );
    res
      .status(result.created ? 201 : 200)
      .json({ source: result.source, created: result.created });
  } catch (error) {
    respondWithError(res, error, "save");
  }
});

router.post(
  "/files",
  (req: Request, res: Response, next: NextFunction) => {
    knowledgeFileUpload.single("file")(req, res, (error: unknown) => {
      if (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        const message =
          code === "LIMIT_FILE_SIZE"
            ? "Knowledge files must be 512 KB or smaller."
            : "Upload a UTF-8 .txt, .md, .csv, or .json file.";
        res.status(code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "Choose a file to upload." });
      return;
    }

    try {
      const source = await autopilotKnowledgeBaseService.addFile(
        req.user!.id,
        file.originalname,
        file.mimetype,
        file.buffer,
      );
      res.status(201).json({ source });
    } catch (error) {
      respondWithError(res, error, "save");
    }
  },
);

router.delete("/:sourceId", async (req: Request, res: Response) => {
  const parsedId = z.string().uuid().safeParse(req.params.sourceId);
  if (!parsedId.success) {
    res.status(404).json({ error: "Knowledge source not found." });
    return;
  }

  try {
    const deleted = await autopilotKnowledgeBaseService.deleteSource(
      req.user!.id,
      parsedId.data,
    );
    if (!deleted) {
      res.status(404).json({ error: "Knowledge source not found." });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    respondWithError(res, error, "remove");
  }
});

export default router;

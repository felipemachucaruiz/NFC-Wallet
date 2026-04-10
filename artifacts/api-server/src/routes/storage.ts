import { Router, type IRouter, type Request, type Response } from "express";
import { Storage } from "@google-cloud/storage";
import { getObject, isBucketConfigured } from "../lib/objectStorage";

const router: IRouter = Router();

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

router.get("/storage/objects/*objectPath", async (req: Request, res: Response) => {
  const rawParam = req.params.objectPath;
  const objectName = Array.isArray(rawParam) ? rawParam.join("/") : rawParam;

  if (!objectName) {
    res.status(400).json({ error: "Object path required" });
    return;
  }

  if (!objectName.startsWith("product-images/") && !objectName.startsWith("event-images/")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (isBucketConfigured()) {
    try {
      const result = await getObject(objectName);
      if (!result) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      (result.body as NodeJS.ReadableStream).pipe(res);
    } catch {
      res.status(404).json({ error: "Object not found" });
    }
    return;
  }

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    res.status(500).json({ error: "Object storage not configured" });
    return;
  }

  try {
    const bucket = objectStorageClient.bucket(bucketId);
    const file = bucket.file(objectName);

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string | undefined) ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    file.createReadStream().pipe(res);
  } catch {
    res.status(404).json({ error: "Object not found" });
  }
});

export default router;

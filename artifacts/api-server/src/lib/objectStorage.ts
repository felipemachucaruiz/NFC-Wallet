import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";

export function isBucketConfigured(): boolean {
  return !!(ENDPOINT && ACCESS_KEY && SECRET_KEY && BUCKET);
}

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    if (!isBucketConfigured()) {
      throw new Error("Object storage is not configured");
    }
    s3Client = new S3Client({
      region: REGION,
      endpoint: ENDPOINT!,
      credentials: {
        accessKeyId: ACCESS_KEY!,
        secretAccessKey: SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getClient();
  console.log(`[Storage] Uploading to bucket="${BUCKET}", key="${key}"`);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`[Storage] Upload successful: ${key}`);
  return `/api/storage/objects/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET!,
      Key: key,
    }),
  );
}

export async function getObject(key: string): Promise<{ body: ReadableStream | NodeJS.ReadableStream; contentType: string } | null> {
  try {
    const client = getClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET!,
        Key: key,
      }),
    );
    return {
      body: response.Body as NodeJS.ReadableStream,
      contentType: response.ContentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export function getBucketName(): string {
  return BUCKET || "";
}

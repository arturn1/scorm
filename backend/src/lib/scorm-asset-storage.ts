import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "./env";

const s3 = new S3Client({
  region: env.s3Region,
  endpoint: env.s3Endpoint,
  forcePathStyle: env.s3ForcePathStyle,
  credentials: {
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  },
});

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) {
    return;
  }

  try {
    await s3.send(
      new HeadBucketCommand({
        Bucket: env.scormAssetBucket,
      }),
    );
    bucketEnsured = true;
    return;
  } catch {
    await s3.send(
      new CreateBucketCommand({
        Bucket: env.scormAssetBucket,
      }),
    );
    bucketEnsured = true;
  }
}

function normalizeKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function buildScormStoragePrefix(params: { tenantId: string; courseId: string }): string {
  return normalizeKey(`${params.tenantId}/${params.courseId}`);
}

function guessContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

export async function purgeScormAssets(prefix: string): Promise<void> {
  await ensureBucket();
  const normalizedPrefix = normalizeKey(prefix).replace(/\/$/, "") + "/";
  let continuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.scormAssetBucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((item): item is string => Boolean(item));

    if (keys.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.scormAssetBucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function uploadScormDirectory(params: {
  sourceDir: string;
  storagePrefix: string;
}): Promise<void> {
  await ensureBucket();
  const files = await listFilesRecursive(params.sourceDir);
  const prefix = normalizeKey(params.storagePrefix).replace(/\/$/, "");

  await Promise.all(
    files.map(async (filePath) => {
      const relative = normalizeKey(path.relative(params.sourceDir, filePath));
      const key = `${prefix}/${relative}`;
      const body = await fs.readFile(filePath);
      await s3.send(
        new PutObjectCommand({
          Bucket: env.scormAssetBucket,
          Key: key,
          Body: body,
          ContentType: guessContentType(filePath),
        }),
      );
    }),
  );
}

function bodyToReadable(body: unknown): Readable {
  if (body instanceof Readable) {
    return body;
  }

  if (body && typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const readable = new Readable({ read() {} });
    (body as { transformToByteArray: () => Promise<Uint8Array> })
      .transformToByteArray()
      .then((bytes) => {
        readable.push(Buffer.from(bytes));
        readable.push(null);
      })
      .catch((error) => readable.destroy(error));
    return readable;
  }

  throw new Error("Unsupported S3 body type");
}

export async function getScormAssetObject(key: string): Promise<{
  stream: Readable;
  contentType: string;
}> {
  await ensureBucket();
  const objectKey = normalizeKey(key);
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: env.scormAssetBucket,
      Key: objectKey,
    }),
  );

  return {
    stream: bodyToReadable(response.Body),
    contentType: response.ContentType ?? guessContentType(objectKey),
  };
}

export async function readScormAssetText(key: string): Promise<string> {
  const object = await getScormAssetObject(key);
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    object.stream
      .on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on("end", () => resolve())
      .on("error", (error) => reject(error));
  });

  return Buffer.concat(chunks).toString("utf-8");
}

export async function scormAssetExists(key: string): Promise<boolean> {
  await ensureBucket();
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: env.scormAssetBucket,
        Key: normalizeKey(key),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

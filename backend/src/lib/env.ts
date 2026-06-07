import "dotenv/config";

const required = [
  "DATABASE_URL",
  "JWT_SECRET",
  "SCORM_ASSET_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET as string,
  scormAssetBucket: process.env.SCORM_ASSET_BUCKET as string,
  s3Endpoint: process.env.S3_ENDPOINT as string,
  s3Region: process.env.S3_REGION as string,
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID as string,
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() !== "false",
};

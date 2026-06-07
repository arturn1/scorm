import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import unzipper from "unzipper";
import {
  buildScormStoragePrefix,
  purgeScormAssets,
  uploadScormDirectory,
} from "../../lib/scorm-asset-storage";
import {
  detectScormVersion,
  ensureSafeExtractionPath,
  normalizeForStorage,
  resolveLaunchHrefScorm12,
  resolveLaunchHrefScorm2004,
  parseManifestXml,
} from "./manifest.service";
import type { DetectedScormVersion, LaunchResolution } from "./types";

const scormExtractTempRoot = path.join(os.tmpdir(), "scorm-extract");

async function findFirstHtmlEntry(dirPath: string): Promise<string | null> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await findFirstHtmlEntry(fullPath);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (/\.html?$/i.test(entry.name)) {
      return fullPath;
    }
  }

  return null;
}

async function mapLaunchResolutionToStoragePath(params: {
  courseDir: string;
  storagePrefix: string;
  resolution: LaunchResolution;
}): Promise<string | null> {
  const candidate = path.resolve(params.courseDir, params.resolution.hrefPathname);

  if (!candidate.startsWith(path.resolve(params.courseDir))) {
    return null;
  }

  try {
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) {
      return null;
    }

    const relative = normalizeForStorage(path.relative(params.courseDir, candidate));
    const storagePath = normalizeForStorage(path.posix.join(params.storagePrefix, relative));
    return params.resolution.launchQuery ? `${storagePath}?${params.resolution.launchQuery}` : storagePath;
  } catch {
    return null;
  }
}

async function extractZipToDir(zipFilePath: string, targetDir: string): Promise<void> {
  const directory = await unzipper.Open.file(zipFilePath);

  for (const entry of directory.files) {
    const destination = ensureSafeExtractionPath(targetDir, entry.path);

    if (entry.type === "Directory") {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      entry
        .stream()
        .pipe(createWriteStream(destination))
        .on("finish", () => resolve())
        .on("error", (error: unknown) => reject(error));
    });
  }
}

export async function ingestScormPackage(params: {
  tenantId: string;
  courseId: string;
  zipFilePath: string;
}): Promise<{ packagePath: string; detectedVersion: DetectedScormVersion }> {
  const storagePrefix = buildScormStoragePrefix({ tenantId: params.tenantId, courseId: params.courseId });
  const targetDir = path.join(scormExtractTempRoot, params.tenantId, params.courseId);

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });

  await extractZipToDir(params.zipFilePath, targetDir);

  const manifestPath = path.join(targetDir, "imsmanifest.xml");
  let launchResolution: LaunchResolution | null = null;
  let detectedVersion: DetectedScormVersion = "UNKNOWN";

  try {
    const manifest = await fs.readFile(manifestPath, "utf-8");
    const parsed = parseManifestXml(manifest);

    detectedVersion = detectScormVersion(parsed);

    if (detectedVersion === "SCORM 1.2") {
      launchResolution = resolveLaunchHrefScorm12(parsed);
    } else if (
      detectedVersion === "SCORM 2004 2nd Edition" ||
      detectedVersion === "SCORM 2004 3rd Edition" ||
      detectedVersion === "SCORM 2004 4th Edition" ||
      detectedVersion === "SCORM 2004 (Edition Unknown)"
    ) {
      launchResolution = resolveLaunchHrefScorm2004(parsed);
    } else {
      launchResolution = null;
    }
  } catch {
    launchResolution = null;
    detectedVersion = "UNKNOWN";
  }

  const launchPathFromManifest = launchResolution
    ? await mapLaunchResolutionToStoragePath({
        courseDir: targetDir,
        storagePrefix,
        resolution: launchResolution,
      })
    : null;

  await purgeScormAssets(storagePrefix);
  await uploadScormDirectory({ sourceDir: targetDir, storagePrefix });

  if (launchPathFromManifest) {
    await fs.rm(targetDir, { recursive: true, force: true });
    return { packagePath: launchPathFromManifest, detectedVersion };
  }

  const launchFileAbsolutePath = await findFirstHtmlEntry(targetDir);
  if (!launchFileAbsolutePath) {
    await fs.rm(targetDir, { recursive: true, force: true });
    throw new Error("No launchable HTML file found in SCORM package");
  }

  const fallbackRelative = normalizeForStorage(path.relative(targetDir, launchFileAbsolutePath));
  const fallbackPath = normalizeForStorage(path.posix.join(storagePrefix, fallbackRelative));
  await fs.rm(targetDir, { recursive: true, force: true });
  return { packagePath: fallbackPath, detectedVersion };
}

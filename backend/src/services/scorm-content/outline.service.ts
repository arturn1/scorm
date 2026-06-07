import {
  buildScormStoragePrefix,
  readScormAssetText,
  scormAssetExists,
} from "../../lib/scorm-asset-storage";
import {
  asArray,
  isVisibleFlag,
  mapLaunchResolutionToObjectPath,
  parseManifestXml,
  resolveDefaultOrganization,
  resolveLaunchForItem,
  resourcesById,
} from "./manifest.service";
import type {
  ManifestItem,
  ManifestResource,
  ScormOutlineItem,
} from "./types";

async function buildOutlineItem(params: {
  storagePrefix: string;
  item: ManifestItem;
  resourceMap: Map<string, ManifestResource>;
}): Promise<ScormOutlineItem> {
  const children = asArray(params.item.item);
  const launchResolution = resolveLaunchForItem(params.item, params.resourceMap);

  const launchPath = launchResolution
    ? mapLaunchResolutionToObjectPath({
        storagePrefix: params.storagePrefix,
        resolution: launchResolution,
      })
    : null;

  return {
    identifier: params.item["@_identifier"] ?? null,
    title: params.item.title ?? params.item["@_identifier"] ?? "Untitled item",
    launchPath,
    isVisible: isVisibleFlag(params.item["@_isvisible"]),
    children: await Promise.all(
      children.map((child) =>
        buildOutlineItem({
          storagePrefix: params.storagePrefix,
          item: child,
          resourceMap: params.resourceMap,
        }),
      ),
    ),
  };
}

export async function getScormOutline(params: {
  tenantId: string;
  courseId: string;
}): Promise<{ items: ScormOutlineItem[]; sequencingDetected: boolean }> {
  const storagePrefix = buildScormStoragePrefix({ tenantId: params.tenantId, courseId: params.courseId });
  const manifestPath = `${storagePrefix}/imsmanifest.xml`;

  const manifestExists = await scormAssetExists(manifestPath);
  if (!manifestExists) {
    throw new Error("SCORM manifest not found in object storage");
  }

  const manifestXml = await readScormAssetText(manifestPath);
  const parsed = parseManifestXml(manifestXml);

  const organization = resolveDefaultOrganization(parsed);
  if (!organization) {
    return { items: [], sequencingDetected: false };
  }

  const resourceMap = resourcesById(parsed);
  const rootItems = asArray(organization.item);

  const items = await Promise.all(
    rootItems.map((item) =>
      buildOutlineItem({
        storagePrefix,
        item,
        resourceMap,
      }),
    ),
  );

  return {
    items,
    sequencingDetected: Boolean(parsed.manifest?.["imsss:sequencingCollection"]),
  };
}

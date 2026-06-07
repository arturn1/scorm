import { XMLParser } from "fast-xml-parser";
import path from "node:path";
import type {
  DetectedScormVersion,
  LaunchResolution,
  ManifestItem,
  ManifestOrganization,
  ManifestResource,
  ParsedManifest,
} from "./types";

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeForStorage(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\//, "");
}

export function ensureSafeExtractionPath(baseDir: string, filePath: string): string {
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(baseDir, normalized);

  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error("Invalid path inside SCORM package");
  }

  return resolved;
}

function collectManifestItems(item: ManifestItem): ManifestItem[] {
  const nested = asArray(item.item);
  return [item, ...nested.flatMap((child) => collectManifestItems(child))];
}

export function isVisibleFlag(value?: string): boolean {
  return value?.toLowerCase() !== "false";
}

function parseHref(href: string): { pathname: string; query: string } {
  const [pathnamePart, ...queryParts] = href.split("?");
  return {
    pathname: pathnamePart ?? "",
    query: queryParts.join("?"),
  };
}

function toQueryString(parameters?: string): string {
  if (!parameters) {
    return "";
  }
  return parameters.startsWith("?") ? parameters.slice(1) : parameters;
}

function mergeQueryStrings(...parts: string[]): string {
  const merged = new URLSearchParams();

  for (const part of parts) {
    if (!part.trim()) {
      continue;
    }

    const params = new URLSearchParams(part);
    for (const [key, value] of params) {
      merged.set(key, value);
    }
  }

  return merged.toString();
}

export function parseManifestXml(manifestXml: string): ParsedManifest {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  return parser.parse(manifestXml) as ParsedManifest;
}

function normalizeVersionText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function detectScormVersion(parsed: ParsedManifest): DetectedScormVersion {
  const schema = normalizeVersionText(parsed.manifest?.metadata?.schema);
  const schemaVersion = normalizeVersionText(parsed.manifest?.metadata?.schemaversion);

  if (schemaVersion === "1.2") {
    return "SCORM 1.2";
  }

  const isScorm2004 =
    schemaVersion.includes("2004") || schemaVersion.includes("cam 1.3") || schemaVersion === "1.3";

  if (isScorm2004) {
    if (schemaVersion.includes("4th")) {
      return "SCORM 2004 4th Edition";
    }

    if (schemaVersion.includes("3rd")) {
      return "SCORM 2004 3rd Edition";
    }

    if (schemaVersion.includes("2nd")) {
      return "SCORM 2004 2nd Edition";
    }

    return "SCORM 2004 (Edition Unknown)";
  }

  if (schema.includes("adl scorm") && schemaVersion.includes("2004")) {
    return "SCORM 2004 (Edition Unknown)";
  }

  if (schema.includes("adl scorm") && schemaVersion === "1.2") {
    return "SCORM 1.2";
  }

  return "UNKNOWN";
}

export function resolveDefaultOrganization(parsed: ParsedManifest): ManifestOrganization | null {
  const organizations = asArray(parsed.manifest?.organizations?.organization);
  if (!organizations.length) {
    return null;
  }

  const defaultOrganizationId = parsed.manifest?.organizations?.["@_default"];
  if (!defaultOrganizationId) {
    return organizations[0] ?? null;
  }

  return (
    organizations.find((organization) => organization["@_identifier"] === defaultOrganizationId) ??
    organizations[0] ??
    null
  );
}

export function resourcesById(parsed: ParsedManifest): Map<string, ManifestResource> {
  const map = new Map<string, ManifestResource>();

  for (const resource of asArray(parsed.manifest?.resources?.resource)) {
    const identifier = resource["@_identifier"];
    if (identifier) {
      map.set(identifier, resource);
    }
  }

  return map;
}

export function resolveLaunchForItem(
  item: ManifestItem,
  resourceMap: Map<string, ManifestResource>,
): LaunchResolution | null {
  const identifierRef = item["@_identifierref"];
  if (!identifierRef) {
    return null;
  }

  const resource = resourceMap.get(identifierRef);
  const href = resource?.["@_href"];

  if (!href) {
    return null;
  }

  const parsedHref = parseHref(href);
  const mergedQuery = mergeQueryStrings(parsedHref.query, toQueryString(item["@_parameters"]));

  return {
    hrefPathname: parsedHref.pathname,
    launchQuery: mergedQuery,
  };
}

export function mapLaunchResolutionToObjectPath(params: {
  storagePrefix: string;
  resolution: LaunchResolution;
}): string | null {
  const normalizedPrefix = normalizeForStorage(params.storagePrefix).replace(/\/$/, "");
  const normalizedHref = path.posix.normalize(params.resolution.hrefPathname).replace(/^\/+/, "");
  if (!normalizedHref || normalizedHref.startsWith("..")) {
    return null;
  }

  const objectPath = normalizeForStorage(path.posix.join(normalizedPrefix, normalizedHref));
  return params.resolution.launchQuery ? `${objectPath}?${params.resolution.launchQuery}` : objectPath;
}

function resolveLaunchHrefByResource(parsed: ParsedManifest): LaunchResolution | null {
  const organization = resolveDefaultOrganization(parsed);
  if (!organization) {
    return null;
  }

  const resourceMap = resourcesById(parsed);
  const organizationItems = asArray(organization.item).flatMap((item) => collectManifestItems(item));
  const firstLaunchableItem = organizationItems.find((item) => item["@_identifierref"]);
  if (!firstLaunchableItem) {
    return null;
  }

  return resolveLaunchForItem(firstLaunchableItem, resourceMap);
}

export function resolveLaunchHrefScorm12(parsed: ParsedManifest): LaunchResolution | null {
  return resolveLaunchHrefByResource(parsed);
}

export function resolveLaunchHrefScorm2004(parsed: ParsedManifest): LaunchResolution | null {
  return resolveLaunchHrefByResource(parsed);
}

export { asArray };

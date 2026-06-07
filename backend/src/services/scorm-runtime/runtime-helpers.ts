import { ScormAttemptStatus } from "@prisma/client";
import type { OutlineNode } from "./types";

const SCORM_CONTENT_PREFIX = "/scorm-content/";

export function parseNumber(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveAttemptStatus(runtimeMap: Record<string, string>): {
  status: ScormAttemptStatus;
  completionStatus: string | null;
  successStatus: string | null;
  scoreRaw: number | null;
  scoreScaled: number | null;
} {
  const completionStatus = runtimeMap["cmi.completion_status"] || null;
  const successStatus = runtimeMap["cmi.success_status"] || null;
  const scoreRaw = parseNumber(runtimeMap["cmi.score.raw"]);
  const scoreScaled = parseNumber(runtimeMap["cmi.score.scaled"]);

  if (completionStatus === "completed") {
    return {
      status: ScormAttemptStatus.COMPLETED,
      completionStatus,
      successStatus,
      scoreRaw,
      scoreScaled,
    };
  }

  return {
    status: ScormAttemptStatus.IN_PROGRESS,
    completionStatus,
    successStatus,
    scoreRaw,
    scoreScaled,
  };
}

export function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeRuntimeScore(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed >= 0 && parsed <= 1) {
    return clampProgress(parsed * 100);
  }

  return clampProgress(parsed);
}

export function normalizeLaunchIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const combined = `${parsed.pathname}${parsed.search}`;
    if (combined.startsWith(SCORM_CONTENT_PREFIX)) {
      return decodeURIComponent(combined.slice(SCORM_CONTENT_PREFIX.length));
    }
    return decodeURIComponent(combined.replace(/^\//, ""));
  } catch {
    const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, "");
    if (withoutOrigin.startsWith(SCORM_CONTENT_PREFIX)) {
      return decodeURIComponent(withoutOrigin.slice(SCORM_CONTENT_PREFIX.length));
    }
    return decodeURIComponent(withoutOrigin.replace(/^\//, ""));
  }
}

function extractRuntimeItemIdentifier(runtimeKey: string): string | null {
  const encodedLaunch = runtimeKey.split("::")[1];
  if (!encodedLaunch) {
    return null;
  }

  try {
    return normalizeLaunchIdentifier(decodeURIComponent(encodedLaunch));
  } catch {
    return null;
  }
}

export function parseItemRuntimeKey(runtimeKey: string): {
  metric: string;
  launchUrl: string;
  itemKey: string;
} | null {
  if (!runtimeKey.startsWith("__item.")) {
    return null;
  }

  const [prefix, encodedLaunch] = runtimeKey.split("::");
  if (!prefix || !encodedLaunch) {
    return null;
  }

  let launchUrl: string;
  try {
    launchUrl = decodeURIComponent(encodedLaunch);
  } catch {
    return null;
  }

  return {
    metric: prefix.replace("__item.", ""),
    launchUrl,
    itemKey: normalizeLaunchIdentifier(launchUrl),
  };
}

function collectOutlineLaunchIdentifiers(items: OutlineNode[]): Set<string> {
  const launchIdentifiers = new Set<string>();

  const visit = (item: any): void => {
    if (item.launchPath) {
      launchIdentifiers.add(normalizeLaunchIdentifier(item.launchPath));
    }

    for (const child of item.children ?? []) {
      visit(child);
    }
  };

  for (const item of items) {
    visit(item);
  }

  return launchIdentifiers;
}

export function computeOverallProgressFromRuntimeValues(params: {
  outlineItems: OutlineNode[];
  itemStates?: Array<{ itemKey: string; progress: number }>;
  runtimeValues: Array<{ key: string; value: string }>;
}): number {
  const launchIdentifiers = collectOutlineLaunchIdentifiers(params.outlineItems);

  if (!launchIdentifiers.size) {
    const fallbackValues = params.runtimeValues
      .filter((entry) => entry.key.startsWith("__item.progress::"))
      .map((entry) => Number(entry.value))
      .filter((value) => Number.isFinite(value))
      .map((value) => clampProgress(value));

    return fallbackValues.length
      ? clampProgress(fallbackValues.reduce((acc, value) => acc + value, 0) / fallbackValues.length)
      : 0;
  }

  const progressByIdentifier = new Map<string, number>();
  for (const identifier of launchIdentifiers) {
    progressByIdentifier.set(identifier, 0);
  }

  if (params.itemStates?.length) {
    for (const state of params.itemStates) {
      progressByIdentifier.set(state.itemKey, clampProgress(state.progress));
    }
  }

  for (const entry of params.runtimeValues) {
    if (params.itemStates?.length) {
      break;
    }
    if (!entry.key.startsWith("__item.progress::")) {
      continue;
    }

    const identifier = extractRuntimeItemIdentifier(entry.key);
    if (!identifier) {
      continue;
    }

    const parsed = Number(entry.value);
    if (Number.isFinite(parsed)) {
      progressByIdentifier.set(identifier, clampProgress(parsed));
    }
  }

  const progressValues = Array.from(progressByIdentifier.values());
  return clampProgress(progressValues.reduce((acc, value) => acc + value, 0) / progressValues.length);
}

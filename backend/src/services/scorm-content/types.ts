export type DetectedScormVersion =
  | "SCORM 1.2"
  | "SCORM 2004 2nd Edition"
  | "SCORM 2004 3rd Edition"
  | "SCORM 2004 4th Edition"
  | "SCORM 2004 (Edition Unknown)"
  | "UNKNOWN";

export type ScormOutlineItem = {
  identifier: string | null;
  title: string;
  launchPath: string | null;
  isVisible: boolean;
  children: ScormOutlineItem[];
};

type ManifestResource = {
  "@_identifier"?: string;
  "@_href"?: string;
};

type ManifestItem = {
  "@_identifier"?: string;
  "@_identifierref"?: string;
  "@_parameters"?: string;
  "@_isvisible"?: string;
  title?: string;
  item?: ManifestItem | ManifestItem[];
};

type ManifestOrganization = {
  "@_identifier"?: string;
  item?: ManifestItem | ManifestItem[];
};

export type ParsedManifest = {
  manifest?: {
    metadata?: {
      schema?: string;
      schemaversion?: string;
    };
    organizations?: {
      "@_default"?: string;
      organization?: ManifestOrganization | ManifestOrganization[];
    };
    resources?: {
      resource?: ManifestResource | ManifestResource[];
    };
    "imsss:sequencingCollection"?: unknown;
  };
};

export type LaunchResolution = {
  hrefPathname: string;
  launchQuery: string;
};

export type {
  ManifestItem,
  ManifestOrganization,
  ManifestResource,
};

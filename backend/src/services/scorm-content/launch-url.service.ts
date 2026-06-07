export function buildScormLaunchUrl(params: { host: string; packagePath: string }): string {
  return `${params.host}/scorm-content/${params.packagePath}`;
}

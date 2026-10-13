export const DESIGN_SCHEMA_VERSION_V01 = "0.1" as const;
export const DESIGN_SCHEMA_VERSION_V02 = "0.2" as const;
export const DESIGN_SCHEMA_VERSION_V03 = "0.3" as const;
export const DESIGN_SCHEMA_VERSION_V04 = "0.4" as const;
export const DESIGN_SCHEMA_VERSION = DESIGN_SCHEMA_VERSION_V04;

export const SUPPORTED_SCHEMA_VERSIONS = [
  DESIGN_SCHEMA_VERSION_V01,
  DESIGN_SCHEMA_VERSION_V02,
  DESIGN_SCHEMA_VERSION_V03,
  DESIGN_SCHEMA_VERSION_V04,
] as const;

export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
export type DesignSchemaVersion = typeof DESIGN_SCHEMA_VERSION;

export function isSupportedSchemaVersion(version: unknown): version is SupportedSchemaVersion {
  return typeof version === "string" && (SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(version);
}


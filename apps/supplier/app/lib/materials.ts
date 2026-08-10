// The fixed set of material categories a supplier can offer. Used at onboarding
// (multiselect) and, later, by the S2 materials catalog.
export const MATERIAL_TYPES = [
  { value: "fabric", label: "Fabric" },
  { value: "trim", label: "Trim" },
  { value: "lining", label: "Lining" },
  { value: "thread", label: "Thread" },
  { value: "hardware", label: "Hardware (zips, buttons, clasps)" },
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number]["value"];

const ALLOWED = new Set<string>(MATERIAL_TYPES.map((m) => m.value));

/** Returns the input filtered to valid, de-duplicated material-type values. */
export function sanitizeMaterialTypes(input: string[]): string[] {
  return [...new Set(input.filter((v) => ALLOWED.has(v)))];
}

/** True if the value is one of the allowed material-type slugs. */
export function isMaterialType(value: string): boolean {
  return ALLOWED.has(value);
}

// Units of sale for a material listing. Values match the Prisma MaterialUnit enum exactly.
export const MATERIAL_UNITS = [
  { value: "METER", label: "Meter" },
  { value: "YARD", label: "Yard" },
  { value: "ROLL", label: "Roll" },
  { value: "PIECE", label: "Piece" },
  { value: "SPOOL", label: "Spool" },
] as const;

export type MaterialUnitValue = (typeof MATERIAL_UNITS)[number]["value"];

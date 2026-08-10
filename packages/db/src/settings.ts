import { prisma } from "./client";

export const SETTINGS = {
  free_shipping_threshold: { label: "Free shipping over (AED)", type: "number", default: 500 },
  shipping_fee:            { label: "Shipping fee (AED)",       type: "number", default: 15 },
  maintenance_banner:      { label: "Maintenance banner text",  type: "string", default: "" },
} as const;

export type SettingKey = keyof typeof SETTINGS;
type ValueType<T extends string> = T extends "number" ? number : T extends "boolean" ? boolean : string;

function coerce(type: string, raw: string, def: number | boolean | string): number | boolean | string {
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  }
  if (type === "boolean") return raw === "true";
  return raw;
}

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<ValueType<(typeof SETTINGS)[K]["type"]>> {
  const def = SETTINGS[key].default;
  const row = await prisma.platformSetting
    .findUnique({ where: { key }, select: { value: true } })
    .catch(() => null);
  const value = row ? coerce(SETTINGS[key].type, row.value, def) : def;
  return value as ValueType<(typeof SETTINGS)[K]["type"]>;
}

export async function getAllSettings(): Promise<Record<SettingKey, number | boolean | string>> {
  const rows = await prisma.platformSetting.findMany({ select: { key: true, value: true } }).catch(() => []);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, number | boolean | string>;
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const raw = byKey.get(key);
    out[key] = raw === undefined ? SETTINGS[key].default : coerce(SETTINGS[key].type, raw, SETTINGS[key].default);
  }
  return out;
}

export async function setSetting(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
  if (!(key in SETTINGS)) return { ok: false, error: "Unknown setting" };
  const type: string = SETTINGS[key as SettingKey].type;
  if (type === "number" && !Number.isFinite(Number(value))) return { ok: false, error: "Must be a number" };
  if (type === "boolean" && value !== "true" && value !== "false") return { ok: false, error: "Must be true or false" };
  try {
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save" };
  }
}

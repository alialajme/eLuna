import { Metadata } from "next";
import { SETTINGS, getAllSettings } from "@e-luna/db";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings — Luna Ops" };

export default async function SettingsPage() {
  const values = await getAllSettings();
  const fields = Object.entries(SETTINGS).map(([key, def]) => ({
    key,
    label: def.label,
    type: def.type,
  }));

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="font-display text-display-md text-ink">Settings</h2>
      <p className="text-body-md text-mist">Platform-wide configuration.</p>
      <SettingsForm fields={fields} values={values} />
    </div>
  );
}

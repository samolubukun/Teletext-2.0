// Reader settings, stored on the device only (reader-app R7: save then load round-trips).
import { z } from "zod";

export const settingsSchema = z.object({
  mode: z.enum(["classic", "clean", "ticker"]).default("classic"),
  palette: z.enum(["normal", "contrast", "cvd"]).default("normal"),
  motion: z.enum(["system", "reduced", "full"]).default("system"),
  textSize: z.enum(["normal", "large"]).default("normal"),
});

export type ReaderSettings = z.infer<typeof settingsSchema>;

const KEY = "teletext.settings.v1";
export const DEFAULT_SETTINGS: ReaderSettings = settingsSchema.parse({});

export function loadSettings(): ReaderSettings {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be full or blocked; settings then last for this visit only.
  }
}

import type { Color } from "./types";

/** Colors per content role. Mirrors .kiro/steering/teletext-style.md. */
export type StyleGuide = {
  heading: Color;
  body: Color;
  link: Color;
  alert: Color;
  label: Color;
  bullet: Color;
  tableHeader: Color;
  divider: Color;
  mosaic: Color;
  marker: Color;
  headerNumber: Color;
  headerPublisher: Color;
  headerDate: Color;
  headerTime: Color;
};

export const DEFAULT_STYLE: StyleGuide = {
  heading: "yellow",
  body: "white",
  link: "cyan",
  alert: "red",
  label: "cyan",
  bullet: "cyan",
  tableHeader: "yellow",
  divider: "blue",
  mosaic: "white",
  marker: "cyan",
  headerNumber: "white",
  headerPublisher: "cyan",
  headerDate: "white",
  headerTime: "yellow",
};

/** Non-black backgrounds allowed for headers and alert bars: [foreground, background]. */
export const ALLOWED_BACKGROUND_PAIRS: ReadonlyArray<readonly [Color, Color]> = [
  ["white", "blue"],
  ["white", "red"],
  ["black", "yellow"],
  ["black", "cyan"],
  ["black", "white"],
];

/** Minimum contrast rule (Requirement 6.2). */
export function isAllowedPair(foreground: Color, background: Color): boolean {
  if (background === "black") return foreground !== "black";
  return ALLOWED_BACKGROUND_PAIRS.some(([f, b]) => f === foreground && b === background);
}

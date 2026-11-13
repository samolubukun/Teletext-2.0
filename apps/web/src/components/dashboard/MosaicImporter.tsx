"use client";
// Turns a logo or picture into mosaic rows. The picture is decoded in this browser and never uploaded:
// only a small grid of brightness values goes to the (pure) converter in @teletext/core.
import { MOSAIC_MAX_COLS, imageToMosaic, suggestInvert, type GrayImage, type MosaicOptions } from "@teletext/core";
import { useState } from "react";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024;
/** The picture is shrunk this far before reading brightness; the converter needs far fewer dots than this. */
const MAX_SIDE = 240;

async function decode(file: File): Promise<GrayImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    // Transparent areas count as white, so a logo with no background reads as "dark on white".
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const gray = new Array<number>(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.2126 * (data[i * 4] as number) + 0.7152 * (data[i * 4 + 1] as number) + 0.0722 * (data[i * 4 + 2] as number);
    return { width, height, data: gray };
  } finally {
    bitmap.close();
  }
}

type Settings = Required<Pick<MosaicOptions, "maxCols" | "invert" | "dither">> & { auto: boolean; threshold: number };

export function MosaicImporter({ onApply }: { onApply: (rows: string[]) => void }) {
  const [image, setImage] = useState<GrayImage | null>(null);
  const [settings, setSettings] = useState<Settings>({ maxCols: 30, invert: false, dither: false, auto: true, threshold: 128 });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = (img: GrayImage, s: Settings) => {
    const result = imageToMosaic(img, { maxCols: s.maxCols, invert: s.invert, dither: s.dither, threshold: s.auto ? "auto" : s.threshold });
    onApply(result.rows);
    setInfo(`${result.cols} x ${result.rowCount} cells, ${result.lit} dots lit.${s.auto ? ` Threshold ${result.threshold} (automatic).` : ""}`);
  };

  const change = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (image) run(image, next);
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return setError("Use a PNG, JPEG, WebP or GIF picture.");
    if (file.size > MAX_BYTES) return setError("That picture is over 2 MB. Pick a smaller one.");
    try {
      const img = await decode(file);
      const next = { ...settings, invert: suggestInvert(img) };
      setImage(img);
      setSettings(next);
      run(img, next);
    } catch {
      setError("That picture could not be read. Try another file.");
    }
  };

  return (
    <div className="mb-2 rounded border border-neutral-700 p-2 text-xs">
      <p className="mb-2 text-neutral-300">
        Make mosaic art from a logo or picture. It is converted in your browser and not uploaded. Simple, high-contrast pictures work best.
      </p>
      <input type="file" accept={ACCEPTED.join(",")} onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Choose a picture for the mosaic" />
      {error && <p className="mt-2 text-red-400" role="alert">{error}</p>}
      {image && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2">
            Width (cells)
            <input type="range" min={8} max={MOSAIC_MAX_COLS} value={settings.maxCols} onChange={(e) => change({ maxCols: Number(e.target.value) })} />
            <span className="w-6 text-right">{settings.maxCols}</span>
          </label>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="mosaic-threshold">Brightness cut-off</label>
            <input id="mosaic-threshold" type="range" min={1} max={254} value={settings.threshold} disabled={settings.auto} onChange={(e) => change({ threshold: Number(e.target.value) })} />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={settings.auto} onChange={(e) => change({ auto: e.target.checked })} />
              auto
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.invert} onChange={(e) => change({ invert: e.target.checked })} />
            Swap light and dark
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.dither} onChange={(e) => change({ dither: e.target.checked })} />
            Dither (keeps shading, softer edges)
          </label>
        </div>
      )}
      {info && <p className="mt-2 text-neutral-400" role="status">{info}</p>}
    </div>
  );
}

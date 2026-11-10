"use client";
// Our own teletext screen renderer (MIT). Draws a SerializedPage as a 40 x 24 grid of cells.
// Control codes occupy a cell and show as a space, exactly like a real set.
import { decodeRow, type Color, type SerializedPage } from "@teletext/core";
import { memo, type ReactNode } from "react";

export type ScreenProps = {
  page: SerializedPage;
  /** Replaces columns 1-4 of the header (the "P412" area), e.g. "P4__" while typing. */
  headerOverride?: string;
  /** Extra text shown at the right of the header instead of the clock, e.g. "OFFLINE". */
  flashing?: boolean;
  className?: string;
  ariaHidden?: boolean;
};

type Cell = {
  ch: string;
  fg: Color;
  bg: Color;
  mosaic: boolean;
  double: boolean;
  flash: boolean;
};

function rowCells(row: string, override?: string): Cell[] {
  const tokens = decodeRow(row);
  let fg: Color = "white";
  let bg: Color = "black";
  let mosaic = false;
  let double = false;
  let flash = false;
  return tokens.map((t, i) => {
    if (t.kind === "ctl") {
      // Set-after semantics: the control cell itself keeps the previous colours and shows a space.
      const cell: Cell = { ch: " ", fg, bg, mosaic: false, double, flash };
      if (t.code === "fg") {
        fg = t.value ?? "white";
        mosaic = false;
      } else if (t.code === "mosaic") {
        fg = t.value ?? "white";
        mosaic = true;
      } else if (t.code === "bg") bg = t.value ?? "black";
      else if (t.code === "double") double = true;
      else if (t.code === "single") double = false;
      else if (t.code === "flash") flash = true;
      else if (t.code === "steady") flash = false;
      return cell;
    }
    const ch = override && i >= 1 && i <= 4 ? (override[i - 1] ?? " ") : t.ch;
    return { ch, fg, bg, mosaic, double, flash };
  });
}

/** Teletext sextant: bits 0x01 TL, 0x02 TR, 0x04 ML, 0x08 MR, 0x10 BL, 0x40 BR. */
function Sextant({ code }: { code: number }) {
  const bits = [0x01, 0x02, 0x04, 0x08, 0x10, 0x40];
  return (
    <span className="tt-sextant" aria-hidden>
      {bits.map((b) => (
        <i key={b} className={code & b ? "on" : undefined} />
      ))}
    </span>
  );
}

function renderCell(cell: Cell, key: number): ReactNode {
  const code = cell.ch.charCodeAt(0);
  const isSextant = cell.mosaic && ((code >= 0x20 && code <= 0x3f) || (code >= 0x60 && code <= 0x7f));
  const cls = [`tt-fg-${cell.fg}`, cell.bg !== "black" ? `tt-bg-${cell.bg}` : "", cell.flash ? "tt-flash" : ""].filter(Boolean).join(" ");
  return (
    <span key={key} className={`tt-cell ${cls}`}>
      {isSextant ? <Sextant code={code} /> : cell.ch === " " ? "\u00a0" : cell.ch}
    </span>
  );
}

function ScreenImpl({ page, headerOverride, className, ariaHidden = true }: ScreenProps) {
  return (
    <div className={`tt-screen ${className ?? ""}`} aria-hidden={ariaHidden}>
      {page.r.map((row, r) => {
        const cells = rowCells(row, r === 0 ? headerOverride : undefined);
        const isDouble = cells.some((c) => c.double);
        return (
          <div key={r} className={`tt-row${isDouble ? " tt-double" : ""}`}>
            {cells.map((cell, i) => renderCell(cell, i))}
          </div>
        );
      })}
    </div>
  );
}

export const TeletextScreen = memo(ScreenImpl);

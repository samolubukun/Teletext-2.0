// Page validator (Requirement 6). Errors make a page unusable; warnings are advisory.
import { COLS, FASTEXT_ROW, ROWS } from "./constants";
import { isInRange, isValidPageNumber } from "./page-number";
import { isAllowedPair } from "./style";
import { isBlankRow } from "./tokens";
import type { Color, Page, Warning } from "./types";

export function validatePage(page: Page, orgRange?: readonly [number, number]): Warning[] {
  const warnings: Warning[] = [];
  const add = (w: Warning) => {
    if (!warnings.some((x) => x.code === w.code)) warnings.push(w);
  };

  if (!isValidPageNumber(page.number)) {
    add({
      level: "error",
      code: "page-number-invalid",
      message: `Page number ${page.number} is not valid.`,
      fix: "Use a three-digit page number from 100 to 899.",
    });
  } else if (orgRange && !isInRange(page.number, orgRange)) {
    add({
      level: "error",
      code: "page-out-of-range",
      message: `Page ${page.number} is outside your page range ${orgRange[0]}-${orgRange[1]}.`,
      fix: `Pick a number from ${orgRange[0]} to ${orgRange[1]}.`,
    });
  }
  if (!Number.isInteger(page.sub) || page.sub < 1 || page.sub > page.subCount) {
    add({ level: "error", code: "subpage-invalid", message: `Sub-page ${page.sub}/${page.subCount} is not valid.`, fix: "Re-render the page." });
  }
  if (page.rows.length !== ROWS) {
    add({ level: "error", code: "rows-count", message: `The page has ${page.rows.length} rows instead of ${ROWS}.`, fix: "Re-render the page." });
  }
  if (page.fastext.length > 4) {
    add({ level: "error", code: "fastext-count", message: "A page can have at most four fastext links.", fix: "Remove extra links." });
  }

  page.rows.forEach((row, r) => {
    if (row.length !== COLS) {
      add({ level: "error", code: "row-width", message: `Row ${r} is ${row.length} cells wide instead of ${COLS}.`, fix: "Shorten the text on this row." });
    }
    let foreground: Color = "white";
    let background: Color = "black";
    let double = false;
    for (const token of row) {
      if (token.kind === "ctl") {
        if (token.code === "fg" || token.code === "mosaic") foreground = token.value ?? "white";
        else if (token.code === "bg") background = token.value ?? "black";
        else if (token.code === "double") double = true;
        continue;
      }
      if (token.ch.length !== 1 || token.ch < " " || token.ch > "~") {
        add({ level: "error", code: "bad-char", message: `Row ${r} contains a character teletext cannot show.`, fix: "Use plain letters, digits and punctuation." });
      }
      if (token.ch !== " " && !isAllowedPair(foreground, background)) {
        add({
          level: "error",
          code: "low-contrast",
          message: `Row ${r} uses ${foreground} text on a ${background} background, which is hard to read.`,
          fix: "Use the style guide colors: light text on black, or white on blue or red.",
        });
      }
    }
    if (double && r < FASTEXT_ROW - 1) {
      const below = page.rows[r + 1];
      if (below && !isBlankRow(below)) {
        add({ level: "error", code: "double-height-overlap", message: `The double-height line on row ${r} overlaps row ${r + 1}.`, fix: "Leave the row under a big heading empty." });
      }
    }
  });
  return warnings;
}

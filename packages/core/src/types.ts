// Core page model for Teletext 2.0.
// Source of truth: .kiro/specs/page-format-and-renderer/design.md ("Core types").

export type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

export type FastextColor = "red" | "green" | "yellow" | "blue";

export type Block =
  | { type: "heading"; text: string; level: 1 | 2 }
  | { type: "paragraph"; text: string; tone?: "normal" | "alert" }
  | { type: "bullets"; items: string[] }
  | { type: "keyvalue"; rows: { label: string; value: string }[] }
  | { type: "table"; header?: string[]; rows: string[][] }
  | { type: "divider" }
  | { type: "mosaic"; rows: string[] }
  | { type: "link"; label: string; page: number };

export type ControlCode =
  | "fg"
  | "bg"
  | "double"
  | "single"
  | "flash"
  | "steady"
  | "mosaic"
  | "text";

/** One cell on the grid. Control codes occupy a cell, exactly like printable characters. */
export type Token =
  | { kind: "char"; ch: string }
  | { kind: "ctl"; code: ControlCode; value?: Color };

/** Exactly COLS tokens after decoration. */
export type Row = Token[];

export type FastextLink = {
  color: FastextColor;
  label: string;
  page: number;
};

export type Page = {
  /** 100..899 */
  number: number;
  /** 1-based sub-page index */
  sub: number;
  subCount: number;
  publisher: string;
  title: string;
  /** Exactly ROWS rows. */
  rows: Row[];
  fastext: FastextLink[];
  /** ISO time passed in by the caller. Core never reads the clock. */
  updatedAt: string;
};

export type Warning = {
  level: "error" | "warning";
  code: string;
  message: string;
  fix?: string;
};

export type RenderResult = {
  pages: Page[];
  warnings: Warning[];
};

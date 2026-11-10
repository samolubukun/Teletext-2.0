// Grid geometry and page-number limits. See .kiro/steering/teletext-style.md.

/** Cells per row, counting control codes. */
export const COLS = 40;
/** Rows per page: row 0 header, rows 1-22 body, row 23 fastext bar. */
export const ROWS = 24;
export const HEADER_ROW = 0;
export const FIRST_BODY_ROW = 1;
export const LAST_BODY_ROW = 22;
export const BODY_ROWS = LAST_BODY_ROW - FIRST_BODY_ROW + 1;
export const FASTEXT_ROW = 23;

export const PAGE_MIN = 100;
export const PAGE_MAX = 899;
export const INDEX_PAGE = 100;

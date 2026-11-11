# Requirements Document: publisher-dashboard

## Introduction

Organizations sign in, get their own page numbers, create pages with a live preview, check them and publish.
Authorization is enforced by Convex functions, not by the UI.

## Requirements

### Requirement 1: Accounts and organizations

1. Publishers SHALL sign in with Google or email and password (Hexclave). Sessions are handled by the auth provider.
2. A new publisher SHALL create an organization and receive a non-overlapping range of page numbers sized by the plan.
3. A user SHALL own at most three organizations.

### Requirement 2: Roles

1. Owner can do everything including billing; Editor can create, edit and publish pages; Viewer can read only.
2. THE server SHALL enforce roles on every function. A non-member and a member without permission SHALL get the same "forbidden" answer.

### Requirement 3: Pages and editor

1. THE page list SHALL show number, title, status and last updated, and filter by status.
2. THE editor SHALL show a live teletext preview produced by the shared `render()` function, with three ways to create content: paste and condense, template, and manual blocks.
3. Templates: Notice, Results table, Alert, Timetable, FAQ, Events.
4. THE validation panel SHALL show every renderer error and warning in plain language with a suggested fix; publishing SHALL be blocked while errors remain.
5. THE fastext editor SHALL let the publisher choose the four button labels and target pages.
6. Every save SHALL create a new version.

### Requirement 4: Workflow

1. Statuses are Draft, Review, Published, Archived. Allowed moves: draft to review, review to draft, review to published, published to archived, archived to draft. Organizations without an approval requirement MAY publish a draft directly.
2. Publishing a page with unconfirmed AI values SHALL need an explicit "I checked these" confirmation.
3. A page number outside the organization's range SHALL be rejected, and page numbers SHALL be unique platform-wide.

### Requirement 5: Plans

1. Plan limits SHALL be enforced on the server: published pages, AI drafts per hour, range size.
2. Upgrades are a mock checkout for the hackathon; the limits themselves are real.

### Requirement 6: Later (stretch)

Restore an older version, scheduled publishing and expiry, QR code and printable poster, mosaic logo tool,
analytics, Google Sheets and RSS live sources, report-a-page and moderation.

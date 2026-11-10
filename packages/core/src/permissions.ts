// Permission table (publisher-dashboard D7). The server enforces this; the UI only mirrors it.

export type Role = "owner" | "editor" | "viewer";
export type Action =
  | "org.read"
  | "org.update"
  | "org.billing"
  | "members.manage"
  | "page.read"
  | "page.write"
  | "page.publish"
  | "ai.use";

export const ROLES: readonly Role[] = ["owner", "editor", "viewer"];
export const ACTIONS: readonly Action[] = [
  "org.read",
  "org.update",
  "org.billing",
  "members.manage",
  "page.read",
  "page.write",
  "page.publish",
  "ai.use",
];

export const PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: ACTIONS,
  editor: ["org.read", "page.read", "page.write", "page.publish", "ai.use"],
  viewer: ["org.read", "page.read"],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action);
}

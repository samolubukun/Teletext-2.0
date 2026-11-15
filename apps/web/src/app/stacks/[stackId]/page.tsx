import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StackReader } from "@/components/stacks/StackReader";
import { convexConfigured } from "@/lib/convexServer";

async function loadStack(stackId: string) {
  if (!convexConfigured()) return null;
  try {
    return await fetchQuery(api.stacks.published, { stackId: stackId as Id<"stacks"> });
  } catch {
    return null;
  }
}

export default async function StackPage({ params }: { params: Promise<{ stackId: string }> }) {
  const { stackId } = await params;
  const stack = await loadStack(stackId);
  if (!stack) return <p className="p-4 font-mono">This stack is not available.</p>;
  return <StackReader stackId={stack.stackId} name={stack.name} definition={stack.definition} />;
}

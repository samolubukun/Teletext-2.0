"use client";
import { useUser } from "@hexclave/next";
import { useParams } from "next/navigation";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { StackEditor } from "@/components/dashboard/StackEditor";

export default function StackEditorPage() {
  useUser({ or: "redirect" });
  const { orgId, stackId } = useParams<{ orgId: string; stackId: string }>();
  return <StackEditor orgId={orgId as Id<"organizations">} stackId={stackId as Id<"stacks">} />;
}

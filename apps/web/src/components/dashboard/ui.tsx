"use client";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { UserButton } from "@hexclave/next";
import type { ReactNode } from "react";

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { message?: string } | string;
    return typeof data === "string" ? data : (data.message ?? "Something went wrong.");
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function Shell({ children, crumbs }: { children: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <header className="mb-6 flex items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <nav className="flex flex-wrap items-center gap-2 font-mono text-sm" aria-label="Breadcrumb">
          <Link href="/" className="font-bold text-yellow-300">
            TELETEXT 2.0
          </Link>
          <span className="text-neutral-600">/</span>
          <Link href="/dashboard" className="text-cyan-300">
            Dashboard
          </Link>
          {crumbs?.map((c) => (
            <span key={c.label} className="flex items-center gap-2">
              <span className="text-neutral-600">/</span>
              {c.href ? (
                <Link href={c.href} className="text-cyan-300">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <UserButton />
      </header>
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "green" }) {
  const styles = {
    primary: "bg-cyan-400 text-black hover:bg-cyan-300",
    green: "bg-green-500 text-black hover:bg-green-400",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "border border-neutral-700 text-neutral-100 hover:bg-neutral-800",
  }[variant];
  return (
    <button {...props} className={`rounded px-3 py-2 font-mono text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Card({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-mono text-sm font-bold uppercase tracking-wide text-yellow-300">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    draft: "bg-neutral-700 text-white",
    review: "bg-yellow-300 text-black",
    published: "bg-green-500 text-black",
    archived: "bg-neutral-800 text-neutral-400",
  };
  return <span className={`rounded px-2 py-0.5 font-mono text-xs uppercase ${color[status] ?? ""}`}>{status}</span>;
}

export const inputClass = "w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-white placeholder:text-neutral-600";

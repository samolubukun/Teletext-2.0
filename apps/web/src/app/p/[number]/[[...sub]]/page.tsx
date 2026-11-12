// Short links: /p/412 and /p/412/2 open that page and sub-page directly.
import { Suspense } from "react";
import { Reader } from "@/components/reader/Reader";

async function ReaderAt({ params }: { params: Promise<{ number: string; sub?: string[] }> }) {
  const { number, sub } = await params;
  const n = Number(number);
  const s = Number(sub?.[0] ?? 1);
  const valid = /^\d{3}$/.test(number) && n >= 100 && n <= 899;
  return <Reader initialNumber={valid ? n : 100} initialSub={Number.isInteger(s) && s >= 1 ? s : 1} />;
}

export default function ShortLink(props: PageProps<"/p/[number]/[[...sub]]">) {
  return (
    <main>
      {/* The fallback must not be a second Reader: it would fetch page 100 and rewrite the address bar. */}
      <Suspense fallback={<div className="mx-auto w-full max-w-3xl px-2 py-3" aria-busy="true" />}>
        <ReaderAt params={props.params} />
      </Suspense>
    </main>
  );
}

// Embeddable widget: <iframe src="/embed/412"> shows one published page on another website.
// Read only: no navigation keys, no Convex or Hexclave code. It links back to the full reader.
import { Suspense } from "react";
import { EmbedScreen } from "@/components/reader/EmbedScreen";

async function EmbedAt({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!/^\d{3}$/.test(number) || n < 100 || n > 899) return <p className="p-3 font-mono text-sm">Page numbers go from 100 to 899.</p>;
  return <EmbedScreen number={n} />;
}

export default function EmbedPage(props: { params: Promise<{ number: string }> }) {
  return (
    <main className="mx-auto w-full max-w-xl p-1">
      <Suspense fallback={<div aria-busy="true" />}>
        <EmbedAt params={props.params} />
      </Suspense>
    </main>
  );
}

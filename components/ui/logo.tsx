import Link from "next/link";

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 no-underline" aria-label="Gravitas Campus home">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-sun font-heading text-lg font-bold text-indigo-brand">G</span>
      <span className={`font-heading text-xl font-semibold ${light ? "text-white" : "text-indigo-brand"}`}>Gravitas Campus</span>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type NavItem = { href: string; label: string; icon: string };

export function StudioNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Studio" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const active = i.href === "/studio" ? path === "/studio" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={clsx("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold no-underline",
              active ? "bg-indigo-brand text-white" : "text-ink hover:bg-white")}>
            <span aria-hidden>{i.icon}</span>{i.label}
          </Link>
        );
      })}
    </nav>
  );
}

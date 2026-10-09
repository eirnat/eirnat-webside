"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/trafikktelling", label: "Telling" },
  { href: "/trafikktelling/statistikk", label: "Statistikk" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/trafikktelling") return pathname === "/trafikktelling";
  return pathname.startsWith(href);
}

export function TrafikkTopp() {
  const pathname = usePathname();
  const onStats = pathname.startsWith("/trafikktelling/statistikk");

  return (
    <header className="bg-vv-ink pt-[env(safe-area-inset-top)]">
      <div className="flex h-2" aria-hidden="true">
        <div className="flex-1 bg-vv-orange" />
        <div className="flex-1 bg-vv-ink" />
        <div className="flex-1 bg-vv-gray" />
      </div>

      <div className="flex min-h-10 flex-col sm:flex-row">
        <h1 className="bg-vv-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-white sm:shrink-0">
          Trafikktelling
        </h1>
        <p className="flex-1 bg-vv-orange px-4 py-2.5 text-xs tracking-[0.1em] text-vv-ink">
          {onStats ? "kart og statistikk" : "registrer kjøretøy"}
        </p>
      </div>

      <div className="border-b border-vv-gray bg-white px-4 py-3 sm:px-6">
        <nav
          className="grid grid-cols-2 border border-vv-gray"
          aria-label="Trafikktelling"
        >
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  "px-2 py-3 text-center text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-vv-blue " +
                  (active
                    ? "border-t-4 border-t-vv-orange bg-vv-ink text-white"
                    : "bg-white text-vv-ink hover:bg-vv-mist")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

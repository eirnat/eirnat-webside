"use client";

import { usePathname } from "next/navigation";

export default function ConditionalFooter() {
  const pathname = usePathname();
  const shouldHideFooter = pathname === "/lag-kart";

  if (shouldHideFooter) return null;

  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-6 text-center text-xs text-slate-400">
      © {currentYear} Eirnat.{" "}
      <a className="hover:text-slate-500 transition-colors" href="mailto:hei@eirnat.no">
        hei@eirnat.no
      </a>
    </footer>
  );
}

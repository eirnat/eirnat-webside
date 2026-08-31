import Link from "next/link";
import { QrCode, ArrowLeft, Shield } from "lucide-react";
import { listLinks, getScanCountsByLinks } from "@/lib/db/links";
import { getRedirectUrl } from "@/lib/qr/site-url";
import type { Link as QrLink } from "@/lib/db/types";
import { CreateLinkForm } from "./CreateLinkForm";
import { signOut } from "@/auth";

export const dynamic = "force-dynamic";

export default async function QrAdminPage() {
  let links: QrLink[] = [];
  let scanCounts: Record<string, number> = {};
  let dbError = false;

  try {
    links = await listLinks();
    scanCounts = await getScanCountsByLinks(links.map((l) => l.id));
  } catch (error) {
    console.error("Kunne ikke laste QR-koder", error);
    dbError = true;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"
            >
              <ArrowLeft size={16} />
              Tilbake til forsiden
            </Link>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <QrCode size={32} />
              Dynamiske QR-koder
            </h1>
            <p className="text-slate-600 mt-2 max-w-2xl">
              QR-koden peker alltid på eirnat.no. Du kan endre måladressen når som helst uten
              å printe på nytt.
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-slate-500 hover:text-slate-800 underline"
            >
              Logg ut
            </button>
          </form>
        </div>

        {dbError ? (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Database ikke tilgjengelig. Sjekk at DATABASE_URL_ADMIN er satt og at migrasjonen er
            kjørt.
          </div>
        ) : null}

        <section className="mb-10 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-2">Opprett ny kode</h2>
          <p className="text-sm text-slate-600 mb-4">
            Lag <strong>én kode per fysisk plassering</strong>, selv om flere koder peker til samme
            nettside. Da vet du hvor skanningen skjedde — IP-adresse er upålitelig for mobiltrafikk.
          </p>
          <CreateLinkForm />
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Dine koder</h2>
            <Link
              href="/qr/personvern"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
            >
              <Shield size={14} />
              Personvern
            </Link>
          </div>

          {links.length === 0 ? (
            <p className="text-slate-500 text-sm">Ingen koder ennå.</p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">{link.label}</h3>
                        {!link.active ? (
                          <span className="text-xs font-semibold uppercase tracking-wide text-red-600 bg-red-50 px-2 py-0.5 rounded">
                            Deaktivert
                          </span>
                        ) : null}
                      </div>
                      {link.place_name ? (
                        <p className="text-sm text-slate-500 mt-0.5">{link.place_name}</p>
                      ) : null}
                      <p className="text-sm text-slate-600 mt-1 break-all">{link.target_url}</p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        {getRedirectUrl(link.slug)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Link
                        href={`/qr/${link.id}`}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      >
                        Statistikk ({scanCounts[link.id] ?? 0})
                      </Link>
                      <a
                        href={`/api/qr/${link.slug}?format=svg`}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      >
                        Last ned SVG
                      </a>
                      <a
                        href={`/api/qr/${link.slug}?format=png`}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                      >
                        Last ned PNG
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

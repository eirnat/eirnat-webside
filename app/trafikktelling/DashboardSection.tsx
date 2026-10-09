"use client";

import { useEffect, useRef } from "react";
import { GOOGLE_SCRIPT_URL } from "./google-script";

export function DashboardSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;

    import("./dashboard")
      .then((mod) =>
        mod.createDashboard(root, { dataUrl: GOOGLE_SCRIPT_URL })
      )
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
          return;
        }
        cleanupRef.current = cleanup;
      })
      .catch(() => {
        if (!cancelled) {
          console.error("Klarte ikke å laste kart og diagrammer.");
        }
      });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return (
    <section
      className="border-t border-vv-gray bg-vv-mist px-4 py-10 sm:px-6"
      aria-labelledby="dashboard-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-vv-ink">
            Oversikt
          </p>
          <h2
            id="dashboard-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-vv-ink sm:text-3xl"
          >
            Kart og statistikk
          </h2>
          <p className="mt-2 max-w-xl text-base text-vv-ink">
            Diagrammene og kartet oppdateres ut fra tellinger som hentes fra regnearket
            (samme kilde som skjemaet).
          </p>
        </div>

        <div ref={rootRef} className="dashboard-root space-y-6">
          <div className="overflow-hidden border border-vv-gray bg-white">
            <div
              data-dashboard-map
              className="z-0 h-[min(420px,70vh)] w-full"
              role="presentation"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="relative h-80 border border-vv-gray bg-white p-4">
              <canvas data-chart="bars" aria-label="Stolpediagram biler per land" />
            </div>
            <div className="relative h-80 border border-vv-gray bg-white p-4">
              <canvas
                data-chart="traffic"
                aria-label="Kakediagram privat og yrkestrafikk"
              />
            </div>
          </div>

          <div className="relative mx-auto h-80 max-w-md border border-vv-gray bg-white p-4">
            <canvas data-chart="car-types" aria-label="Kakediagram biltyper" />
          </div>
        </div>
      </div>
    </section>
  );
}

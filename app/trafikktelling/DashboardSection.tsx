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
      className="px-6 py-14 md:py-20 border-t border-foreground/10 bg-background"
      aria-labelledby="dashboard-heading"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-meadow font-semibold uppercase tracking-widest mb-2">
            Oversikt
          </div>
          <h2
            id="dashboard-heading"
            className="text-2xl md:text-3xl font-bold text-foreground tracking-tight"
          >
            Kart og statistikk
          </h2>
          <p className="mt-2 text-base text-foreground/80 max-w-xl mx-auto">
            Diagrammene og kartet oppdateres ut fra tellinger som hentes fra regnearket
            (samme kilde som skjemaet).
          </p>
        </div>

        <div
          ref={rootRef}
          className="dashboard-root space-y-8 md:space-y-10"
        >
          <div className="rounded-2xl border border-foreground/10 overflow-hidden shadow-md bg-background">
            <div
              data-dashboard-map
              className="h-[min(420px,70vh)] w-full z-0"
              role="presentation"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-foreground/10 bg-background p-4 shadow-md min-h-[320px]">
              <canvas data-chart="bars" aria-label="Stolpediagram biler per land" />
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background p-4 shadow-md min-h-[300px] flex flex-col justify-center">
              <canvas
                data-chart="traffic"
                aria-label="Kakediagram privat og yrkestrafikk"
              />
            </div>
          </div>

          <div className="max-w-md mx-auto rounded-2xl border border-foreground/10 bg-background p-4 shadow-md min-h-[300px] flex flex-col justify-center">
            <canvas data-chart="car-types" aria-label="Kakediagram biltyper" />
          </div>
        </div>
      </div>
    </section>
  );
}

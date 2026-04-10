"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Gauge,
  Loader2,
  Swords,
  Timer,
  Zap,
} from "lucide-react";
import { LichessLastGameBoard } from "@/components/LichessLastGameBoard";

const LICHESS_USERNAME = "eirnat";

type PerfSlice = { games?: number; rating?: number };

type LichessUserJson = {
  username: string;
  url: string;
  perfs?: {
    bullet?: PerfSlice;
    blitz?: PerfSlice;
    rapid?: PerfSlice;
  };
  count?: { all?: number };
};

function formatRating(perf: PerfSlice | undefined): string {
  if (!perf || typeof perf.rating !== "number") return "—";
  return String(perf.rating);
}

function StatCard({
  label,
  icon: Icon,
  rating,
  games,
  accentClass,
}: {
  label: string;
  icon: typeof Zap;
  rating: string;
  games: number | undefined;
  accentClass: string;
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-meadow/10 px-4 py-3.5 shadow-inner">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">
        <Icon className={`h-3.5 w-3.5 ${accentClass}`} aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">
        {rating}
      </p>
      <p className="mt-0.5 text-xs text-foreground/55 tabular-nums">
        {(games ?? 0).toLocaleString("nb-NO")} partier
      </p>
    </div>
  );
}

export function LichessStats() {
  const [data, setData] = useState<LichessUserJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://lichess.org/api/user/${LICHESS_USERNAME}`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Bruker ikke funnet på Lichess."
              : "Kunne ikke hente data fra Lichess."
          );
        }
        const json = (await res.json()) as LichessUserJson;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Ukjent feil ved henting av rating."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-8 max-w-xl rounded-[1.75rem] border border-foreground/10 bg-background p-5 text-foreground shadow-sm transition-shadow duration-300 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/70">
            Sjakkhub · Lichess
          </h3>
          <p className="mt-1 text-sm text-foreground/75">
            Offentlig rating for{" "}
            <span className="font-semibold text-foreground">
              @{LICHESS_USERNAME}
            </span>
          </p>
        </div>
        <a
          href={`https://lichess.org/@/${LICHESS_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-meadow/50 hover:bg-meadow/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-meadow focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Profil
          <ExternalLink className="h-3.5 w-3.5 opacity-80" aria-hidden />
        </a>
      </div>

      {loading && (
        <div
          className="mt-6 flex items-center gap-2 text-sm text-foreground/70"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin text-meadow" />
          Henter fra Lichess …
        </div>
      )}

      {error && !loading && (
        <div
          className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden />
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Bullet"
              icon={Zap}
              rating={formatRating(data.perfs?.bullet)}
              games={data.perfs?.bullet?.games}
              accentClass="text-terra"
            />
            <StatCard
              label="Blitz"
              icon={Gauge}
              rating={formatRating(data.perfs?.blitz)}
              games={data.perfs?.blitz?.games}
              accentClass="text-terra"
            />
            <StatCard
              label="Rapid"
              icon={Timer}
              rating={formatRating(data.perfs?.rapid)}
              games={data.perfs?.rapid?.games}
              accentClass="text-terra"
            />
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-foreground/10 bg-meadow/10 px-4 py-3">
            <Swords
              className="h-5 w-5 shrink-0 text-terra"
              aria-hidden
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
                Partier totalt
              </p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {(data.count?.all ?? 0).toLocaleString("nb-NO")}
              </p>
            </div>
          </div>
        </>
      )}

      <LichessLastGameBoard />
    </div>
  );
}

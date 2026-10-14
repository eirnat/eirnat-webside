"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GOOGLE_SCRIPT_URL } from "./google-script";
import {
  PERIOD_OPTIONS,
  buildView,
  csvFilename,
  filterRows,
  formatPeriodLabel,
  osloYmdString,
  parseRows,
  resolvePeriod,
  rowsToCsv,
  type CountRow,
  type PeriodId,
  type ResolvedPeriod,
} from "./statsModel";

type DashboardHandle = {
  update: (rows: CountRow[], period: ResolvedPeriod) => void;
  destroy: () => void;
};

function shareLabel(count: number, total: number) {
  if (total === 0) return "0 %";
  return `${Math.round((count / total) * 100)} %`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-vv-gray bg-white">
      <div className="h-1 bg-vv-orange" aria-hidden="true" />
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-vv-ink">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-vv-ink">{value}</p>
        {hint ? <p className="mt-1 text-sm text-vv-ink">{hint}</p> : null}
      </div>
    </div>
  );
}

function ChartCard({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="relative h-80 border border-vv-gray bg-white p-4 pt-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-vv-orange" aria-hidden="true" />
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DashboardSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dashRef = useRef<DashboardHandle | null>(null);
  const filteredRef = useRef<CountRow[]>([]);
  const periodRef = useRef<ResolvedPeriod | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rows, setRows] = useState<CountRow[]>([]);
  const [periodId, setPeriodId] = useState<PeriodId>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const period = useMemo(
    () => resolvePeriod(periodId, customFrom, customTo),
    [periodId, customFrom, customTo],
  );
  const filtered = useMemo(() => filterRows(rows, period), [rows, period]);
  const view = useMemo(() => buildView(filtered, period), [filtered, period]);

  filteredRef.current = filtered;
  periodRef.current = period;

  useEffect(() => {
    let cancelled = false;

    fetch(GOOGLE_SCRIPT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRows(parseRows(data));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;

    import("./dashboard")
      .then((mod) => {
        if (cancelled || !rootRef.current) return;
        const handle = mod.createDashboard(rootRef.current) as DashboardHandle;
        const currentPeriod = periodRef.current;
        if (currentPeriod) handle.update(filteredRef.current, currentPeriod);
        dashRef.current = handle;
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      dashRef.current?.destroy();
      dashRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    dashRef.current?.update(filtered, period);
  }, [filtered, period]);

  function onFromChange(value: string) {
    setCustomFrom(value);
    setCustomTo((current) => {
      if (periodId === "custom") return current;
      return period.to ? osloYmdString(period.to) : current;
    });
    setPeriodId("custom");
  }

  function onToChange(value: string) {
    setCustomTo(value);
    setCustomFrom((current) => {
      if (periodId === "custom") return current;
      return period.from ? osloYmdString(period.from) : current;
    });
    setPeriodId("custom");
  }

  const fromValue =
    periodId === "custom" ? customFrom : period.from ? osloYmdString(period.from) : "";
  const toValue =
    periodId === "custom" ? customTo : period.to ? osloYmdString(period.to) : "";
  const periodLabel = formatPeriodLabel(period);
  const emptyMessage = period.incomplete
    ? "Velg fra- og til-dato"
    : "Ingen tellinger i perioden";

  return (
    <section
      className="min-h-[calc(100dvh-8rem)] bg-vv-mist px-4 py-8 sm:px-6"
      aria-labelledby="dashboard-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-vv-ink">
            Rapport
          </p>
          <h2
            id="dashboard-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-vv-ink sm:text-3xl"
          >
            Kart og statistikk
          </h2>
          <p className="mt-2 max-w-2xl text-base text-vv-ink">
            Nøkkeltall, kart og diagrammer følger perioden du velger. CSV-filen
            inneholder de samme tellingene.
          </p>
        </div>

        {status === "loading" ? (
          <p className="border border-vv-gray bg-white px-4 py-3 text-vv-ink">
            Henter tellinger…
          </p>
        ) : null}

        {status === "error" ? (
          <p
            className="border border-vv-gray bg-vv-red-bg px-4 py-3 text-vv-ink"
            role="alert"
          >
            Klarte ikke å hente tellinger fra regnearket.
          </p>
        ) : null}

        {status === "ready" ? (
          <div className="space-y-6">
            <div className="border border-vv-gray bg-white">
              <div className="h-1 bg-vv-orange" aria-hidden="true" />
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div
                    role="radiogroup"
                    aria-label="Datoperiode"
                    className="flex flex-wrap border border-vv-gray"
                  >
                    {PERIOD_OPTIONS.map((option) => {
                      const active = periodId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPeriodId(option.id)}
                          className={
                            "px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-vv-blue " +
                            (active
                              ? "border-t-4 border-t-vv-orange bg-vv-ink text-white"
                              : "bg-white text-vv-ink hover:bg-vv-mist")
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={period.incomplete}
                    onClick={() =>
                      downloadCsv(csvFilename(period, filtered), rowsToCsv(filtered))
                    }
                    className="shrink-0 bg-vv-orange px-4 py-2.5 text-sm font-semibold text-vv-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vv-blue disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Last ned CSV ({filtered.length})
                  </button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-vv-ink">
                    Fra
                    <input
                      type="date"
                      value={fromValue}
                      onChange={(event) => onFromChange(event.target.value)}
                      className="mt-1 block border border-vv-gray bg-white px-2 py-2 text-sm font-normal normal-case tracking-normal text-vv-ink"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.08em] text-vv-ink">
                    Til
                    <input
                      type="date"
                      value={toValue}
                      onChange={(event) => onToChange(event.target.value)}
                      className="mt-1 block border border-vv-gray bg-white px-2 py-2 text-sm font-normal normal-case tracking-normal text-vv-ink"
                    />
                  </label>
                  <p className="pb-2 text-sm text-vv-ink">{periodLabel}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Totalt" value={String(view.total)} hint={periodLabel} />
              <StatCard
                label="Privat"
                value={String(view.privat)}
                hint={shareLabel(view.privat, view.total)}
              />
              <StatCard
                label="Yrkestrafikk"
                value={String(view.yrkes)}
                hint={shareLabel(view.yrkes, view.total)}
              />
              <StatCard
                label="Vanligste kjøretøy"
                value={view.topVehicleLabel ?? "–"}
                hint={
                  view.topVehicleLabel
                    ? `${view.topVehicleCount} ${view.topVehicleCount === 1 ? "telling" : "tellinger"}`
                    : undefined
                }
              />
            </div>

            {view.total === 0 ? (
              <p className="border border-vv-gray bg-white px-4 py-3 text-vv-ink" role="status">
                {emptyMessage}
              </p>
            ) : null}

            <div ref={rootRef} className="dashboard-root space-y-6">
              <div className="vv-map-frame">
                <div className="vv-map-frame__title">
                  <h3>Registrerte tellinger</h3>
                  <p className="text-xs font-normal">
                    {view.points.length === 0
                      ? "Ingen posisjon"
                      : `${view.points.length} med posisjon`}
                  </p>
                </div>
                <div
                  data-dashboard-map
                  className="z-0 h-[min(520px,70vh)] w-full"
                  role="presentation"
                />
              </div>

              <ChartCard label={view.bucketTitle}>
                <canvas data-chart="time" aria-label={view.bucketTitle} />
              </ChartCard>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard label="Tellinger per land">
                  <canvas data-chart="bars" aria-label="Stolpediagram biler per land" />
                </ChartCard>
                <ChartCard label="Privat vs yrkestrafikk">
                  <canvas
                    data-chart="traffic"
                    aria-label="Kakediagram privat og yrkestrafikk"
                  />
                </ChartCard>
                <ChartCard label="Biltyper">
                  <canvas data-chart="car-types" aria-label="Kakediagram biltyper" />
                </ChartCard>
                <div className="border border-vv-gray bg-white">
                  <div className="h-1 bg-vv-orange" aria-hidden="true" />
                  <div className="px-4 py-4">
                    <h3 className="text-base font-semibold text-vv-ink">Tellinger per land</h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm text-vv-ink">
                        <thead>
                          <tr className="border-b border-vv-gray bg-vv-mist">
                            <th scope="col" className="px-3 py-2 font-semibold">
                              Land
                            </th>
                            <th scope="col" className="px-3 py-2 text-right font-semibold">
                              Antall
                            </th>
                            <th scope="col" className="px-3 py-2 text-right font-semibold">
                              Andel
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {view.countries.length === 0 ? (
                            <tr>
                              <td className="px-3 py-3" colSpan={3}>
                                {emptyMessage}
                              </td>
                            </tr>
                          ) : (
                            view.countries.map((country) => (
                              <tr key={country.name} className="border-b border-vv-gray">
                                <th scope="row" className="px-3 py-2 font-normal">
                                  {country.name}
                                </th>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {country.count}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {country.share} %
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

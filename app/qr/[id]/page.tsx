import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLinkById } from "@/lib/db/links";
import {
  getTotalScans,
  getUniqueScansLast24h,
  getScansPerDay,
  getScansByHour,
  getDeviceDistribution,
  getOsDistribution,
  getGeoDistribution,
  getRecentScans,
} from "@/lib/db/scans";
import { getRedirectUrl } from "@/lib/qr/site-url";
import { EditLinkForm } from "../EditLinkForm";
import { StatsCharts } from "./StatsCharts";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function QrStatsPage({ params }: PageProps) {
  const { id } = await params;
  const link = await getLinkById(id);

  if (!link) {
    notFound();
  }

  const [
    total,
    unique24h,
    dailyRaw,
    hourlyRaw,
    devicesRaw,
    osRaw,
    geoRaw,
    recent,
  ] = await Promise.all([
    getTotalScans(id),
    getUniqueScansLast24h(id),
    getScansPerDay(id),
    getScansByHour(id),
    getDeviceDistribution(id),
    getOsDistribution(id),
    getGeoDistribution(id),
    getRecentScans(id),
  ]);

  const daily = dailyRaw.map((row) => ({
    day: row.day.slice(5),
    count: Number(row.count),
  }));

  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const found = hourlyRaw.find((row) => row.hour === hour);
    return {
      hour: `${hour.toString().padStart(2, "0")}:00`,
      count: found ? Number(found.count) : 0,
    };
  });

  const devices = devicesRaw.map((row) => ({
    label: row.device_type ?? "Ukjent",
    count: Number(row.count),
  }));

  const operatingSystems = osRaw.map((row) => ({
    label: row.os ?? "Ukjent",
    count: Number(row.count),
  }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/qr"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6"
        >
          <ArrowLeft size={16} />
          Tilbake til oversikt
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-black tracking-tight">{link.label}</h1>
          {link.place_name ? (
            <p className="text-slate-600 mt-1">{link.place_name}</p>
          ) : null}
          <p className="text-sm font-mono text-slate-400 mt-2">{getRedirectUrl(link.slug)}</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          <StatCard label="Totalt antall skanninger" value={total} />
          <StatCard label="Unike siste 24 timer" value={unique24h} />
        </div>

        <div className="mb-8">
          <StatsCharts
            daily={daily}
            hourly={hourly}
            devices={devices}
            operatingSystems={operatingSystems}
          />
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-2">Geografisk fordeling</h2>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Omtrentlig, basert på nettverk. Upålitelig for mobiltrafikk.
          </p>
          {geoRaw.length === 0 ? (
            <p className="text-sm text-slate-500">Ingen geo-data ennå.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Land</th>
                    <th className="px-4 py-3 font-semibold">Region</th>
                    <th className="px-4 py-3 font-semibold">By</th>
                    <th className="px-4 py-3 font-semibold text-right">Antall</th>
                  </tr>
                </thead>
                <tbody>
                  {geoRaw.map((row, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      <td className="px-4 py-2">{row.country ?? "—"}</td>
                      <td className="px-4 py-2">{row.region ?? "—"}</td>
                      <td className="px-4 py-2">{row.city ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Siste 50 skanninger</h2>
            <a
              href={`/api/qr/export/${id}`}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800"
            >
              Eksporter CSV
            </a>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tid</th>
                  <th className="px-4 py-3 font-semibold">Enhet</th>
                  <th className="px-4 py-3 font-semibold">OS</th>
                  <th className="px-4 py-3 font-semibold">Nettleser</th>
                  <th className="px-4 py-3 font-semibold">Geo (omtrentlig)</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-slate-500 text-center">
                      Ingen skanninger ennå.
                    </td>
                  </tr>
                ) : (
                  recent.map((scan) => (
                    <tr key={scan.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {scan.ts.toLocaleString("nb-NO")}
                      </td>
                      <td className="px-4 py-2">{scan.device_type ?? "—"}</td>
                      <td className="px-4 py-2">{scan.os ?? "—"}</td>
                      <td className="px-4 py-2">{scan.browser ?? "—"}</td>
                      <td className="px-4 py-2">
                        {[scan.city, scan.region, scan.country].filter(Boolean).join(", ") || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Rediger kode</h2>
          <EditLinkForm link={link} />
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
    </div>
  );
}

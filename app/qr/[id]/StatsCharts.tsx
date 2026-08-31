"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

type DayPoint = { day: string; count: number };
type HourPoint = { hour: string; count: number };
type LabelPoint = { label: string; count: number };

type StatsChartsProps = {
  daily: DayPoint[];
  hourly: HourPoint[];
  devices: LabelPoint[];
  operatingSystems: LabelPoint[];
};

export function StatsCharts({ daily, hourly, devices, operatingSystems }: StatsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard title="Skanninger per dag (siste 30 dager)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Fordeling på klokkeslett">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={hourly}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#64748b" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Enhetstype">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={devices} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Operativsystem">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={operatingSystems} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="font-bold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

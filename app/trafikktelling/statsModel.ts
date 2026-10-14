/**
 * Tellinger, periodefilter og CSV for statistikksiden.
 * Alle kalendergrenser er i Europe/Oslo.
 */

export const TIME_ZONE = "Europe/Oslo";

export const CAR_KEYS = [
  "personbil",
  "lastebil",
  "buss",
  "motorsykkel",
  "bobil",
  "annet",
] as const;

export type CarType = (typeof CAR_KEYS)[number];

export const CAR_LABELS: Record<CarType, string> = {
  personbil: "Personbil",
  lastebil: "Lastebil",
  buss: "Buss",
  motorsykkel: "Motorsykkel",
  bobil: "Bobil",
  annet: "Annet",
};

export const PERIOD_OPTIONS = [
  { id: "today", label: "I dag" },
  { id: "7d", label: "Siste 7 dager" },
  { id: "month", label: "Denne måneden" },
  { id: "all", label: "Hele perioden" },
  { id: "custom", label: "Egendefinert" },
] as const;

export type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];

export type CountRow = {
  tidspunkt: Date;
  land: string;
  landName: string;
  trafikk: "privat" | "yrkes" | null;
  trafikkLabel: string;
  type: CarType;
  typeLabel: string;
  lat: number | null;
  lng: number | null;
};

export type ResolvedPeriod = {
  id: PeriodId;
  from: Date | null;
  to: Date | null;
  incomplete: boolean;
};

export type MapPoint = {
  lat: number;
  lng: number;
  landName: string;
  typeLabel: string;
  whenLabel: string;
};

export type ViewModel = {
  total: number;
  privat: number;
  yrkes: number;
  topVehicleLabel: string | null;
  topVehicleCount: number;
  countries: { name: string; count: number; share: number }[];
  carTypes: { label: string; count: number }[];
  points: MapPoint[];
  buckets: { label: string; count: number }[];
  bucketTitle: string;
};

const regionNames = new Intl.DisplayNames(["nb"], { type: "region" });

function osloOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    year: "numeric",
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = name.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return sign * minutes * 60_000;
}

/** Veggur i Oslo omgjort til et UTC-tidspunkt. */
function wallTimeToUtc(
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0,
  ms = 0,
): Date {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, s, ms);
  const offset1 = osloOffsetMs(new Date(utcGuess));
  let instant = utcGuess - offset1;
  const offset2 = osloOffsetMs(new Date(instant));
  if (offset2 !== offset1) instant = utcGuess - offset2;
  return new Date(instant);
}

function osloParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  let h = num("hour");
  if (h === 24) h = 0;
  return { y: num("year"), m: num("month"), d: num("day"), h };
}

function addCalendarDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function addCalendarMonths(y: number, m: number, months: number) {
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

function startOfOsloDay(y: number, m: number, d: number) {
  return wallTimeToUtc(y, m, d, 0, 0, 0, 0);
}

function endOfOsloDay(y: number, m: number, d: number) {
  const next = addCalendarDays(y, m, d, 1);
  return new Date(startOfOsloDay(next.y, next.m, next.d).getTime() - 1);
}

export function osloYmdString(date: Date) {
  const { y, m, d } = osloParts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

function parseCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function hasPosition(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function normalizeLand(value: unknown) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase().slice(0, 2);
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function countryName(code: string) {
  if (!code) return "Ukjent";
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

function normalizeTraffic(value: unknown): "privat" | "yrkes" | null {
  const t = String(value ?? "")
    .trim()
    .toLowerCase();
  if (t === "privat") return "privat";
  if (t === "yrkes" || t === "yrkestrafikk") return "yrkes";
  return null;
}

function trafficLabel(value: "privat" | "yrkes" | null) {
  if (value === "privat") return "Privat";
  if (value === "yrkes") return "Yrkestrafikk";
  return "";
}

function isCarType(value: string): value is CarType {
  return (CAR_KEYS as readonly string[]).includes(value);
}

function normalizeCarType(value: unknown): CarType {
  const t = String(value ?? "")
    .trim()
    .toLowerCase();
  return isCarType(t) ? t : "annet";
}

function osloStamp(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

function whenLabel(date: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function parseRows(raw: unknown): CountRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: CountRow[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const tid = row.tidspunkt ?? row.timestamp ?? row.dato;
    if (typeof tid !== "string" && typeof tid !== "number") continue;
    const tidspunkt = new Date(tid);
    if (Number.isNaN(tidspunkt.getTime())) continue;

    const land = normalizeLand(row.land ?? row.country);
    const trafikk = normalizeTraffic(row.trafikk);
    const type = normalizeCarType(row.type);
    const lat = parseCoord(row.breddegrad ?? row.lat);
    const lng = parseCoord(row.lengdegrad ?? row.lng ?? row.longitude ?? row.lon);

    rows.push({
      tidspunkt,
      land,
      landName: countryName(land),
      trafikk,
      trafikkLabel: trafficLabel(trafikk),
      type,
      typeLabel: CAR_LABELS[type],
      lat: hasPosition(lat, lng) ? lat : null,
      lng: hasPosition(lat, lng) ? lng : null,
    });
  }

  rows.sort((a, b) => a.tidspunkt.getTime() - b.tidspunkt.getTime());
  return rows;
}

export function resolvePeriod(
  id: PeriodId,
  customFrom: string,
  customTo: string,
  now = new Date(),
): ResolvedPeriod {
  if (id === "all") return { id, from: null, to: null, incomplete: false };

  if (id === "custom") {
    const fromParts = parseYmd(customFrom);
    const toParts = parseYmd(customTo);
    if (!fromParts || !toParts) {
      return { id, from: null, to: null, incomplete: true };
    }
    const fromKey = fromParts.y * 10000 + fromParts.m * 100 + fromParts.d;
    const toKey = toParts.y * 10000 + toParts.m * 100 + toParts.d;
    const start = fromKey <= toKey ? fromParts : toParts;
    const end = fromKey <= toKey ? toParts : fromParts;
    return {
      id,
      from: startOfOsloDay(start.y, start.m, start.d),
      to: endOfOsloDay(end.y, end.m, end.d),
      incomplete: false,
    };
  }

  const today = osloParts(now);
  if (id === "today") {
    return {
      id,
      from: startOfOsloDay(today.y, today.m, today.d),
      to: endOfOsloDay(today.y, today.m, today.d),
      incomplete: false,
    };
  }

  if (id === "7d") {
    const start = addCalendarDays(today.y, today.m, today.d, -6);
    return {
      id,
      from: startOfOsloDay(start.y, start.m, start.d),
      to: endOfOsloDay(today.y, today.m, today.d),
      incomplete: false,
    };
  }

  return {
    id: "month",
    from: startOfOsloDay(today.y, today.m, 1),
    to: endOfOsloDay(today.y, today.m, today.d),
    incomplete: false,
  };
}

export function filterRows(rows: CountRow[], period: ResolvedPeriod) {
  if (period.incomplete) return [];
  if (!period.from || !period.to) return rows;
  const start = period.from.getTime();
  const end = period.to.getTime();
  return rows.filter((row) => {
    const t = row.tidspunkt.getTime();
    return t >= start && t <= end;
  });
}

function calendarDaySpan(from: Date, to: Date) {
  const a = osloParts(from);
  const b = osloParts(to);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

function dayLabel(y: number, m: number, d: number, withYear: boolean) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  }).format(wallTimeToUtc(y, m, d, 12));
}

function monthLabel(y: number, m: number) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: TIME_ZONE,
    month: "short",
    year: "numeric",
  }).format(wallTimeToUtc(y, m, 1, 12));
}

function buildBuckets(rows: CountRow[], period: ResolvedPeriod) {
  const bounds =
    period.from && period.to
      ? { from: period.from, to: period.to }
      : rows.length > 0
        ? { from: rows[0].tidspunkt, to: rows[rows.length - 1].tidspunkt }
        : null;

  if (!bounds) {
    return { buckets: [], bucketTitle: "Tellinger over tid" };
  }

  const span = calendarDaySpan(bounds.from, bounds.to);
  const start = osloParts(bounds.from);
  const end = osloParts(bounds.to);

  if (span === 0) {
    const counts = Array.from({ length: 24 }, () => 0);
    for (const row of rows) {
      const parts = osloParts(row.tidspunkt);
      if (
        parts.y === start.y &&
        parts.m === start.m &&
        parts.d === start.d &&
        parts.h >= 0 &&
        parts.h <= 23
      ) {
        counts[parts.h] += 1;
      }
    }
    return {
      bucketTitle: "Tellinger per time",
      buckets: counts.map((count, hour) => ({
        label: String(hour).padStart(2, "0"),
        count,
      })),
    };
  }

  if (span <= 61) {
    const withYear = start.y !== end.y;
    const buckets: { label: string; count: number }[] = [];
    const index = new Map<string, number>();
    let cursor = { y: start.y, m: start.m, d: start.d };
    const lastKey = `${end.y}-${end.m}-${end.d}`;
    for (let guard = 0; guard < 80; guard += 1) {
      const key = `${cursor.y}-${cursor.m}-${cursor.d}`;
      index.set(key, buckets.length);
      buckets.push({ label: dayLabel(cursor.y, cursor.m, cursor.d, withYear), count: 0 });
      if (key === lastKey) break;
      cursor = addCalendarDays(cursor.y, cursor.m, cursor.d, 1);
    }
    for (const row of rows) {
      const parts = osloParts(row.tidspunkt);
      const slot = index.get(`${parts.y}-${parts.m}-${parts.d}`);
      if (slot != null) buckets[slot].count += 1;
    }
    return { bucketTitle: "Tellinger per dag", buckets };
  }

  const buckets: { label: string; count: number }[] = [];
  const index = new Map<string, number>();
  let cursor = { y: start.y, m: start.m };
  const lastKey = `${end.y}-${end.m}`;
  for (let guard = 0; guard < 240; guard += 1) {
    const key = `${cursor.y}-${cursor.m}`;
    index.set(key, buckets.length);
    buckets.push({ label: monthLabel(cursor.y, cursor.m), count: 0 });
    if (key === lastKey) break;
    cursor = addCalendarMonths(cursor.y, cursor.m, 1);
  }
  for (const row of rows) {
    const parts = osloParts(row.tidspunkt);
    const slot = index.get(`${parts.y}-${parts.m}`);
    if (slot != null) buckets[slot].count += 1;
  }
  return { bucketTitle: "Tellinger per måned", buckets };
}

export function buildView(rows: CountRow[], period: ResolvedPeriod): ViewModel {
  const byLand = new Map<string, { name: string; count: number }>();
  const carCounts = Object.fromEntries(CAR_KEYS.map((key) => [key, 0])) as Record<
    CarType,
    number
  >;
  let privat = 0;
  let yrkes = 0;
  const points: MapPoint[] = [];

  for (const row of rows) {
    const name = row.landName || "Ukjent";
    const current = byLand.get(name);
    if (current) current.count += 1;
    else byLand.set(name, { name, count: 1 });

    if (row.trafikk === "privat") privat += 1;
    if (row.trafikk === "yrkes") yrkes += 1;
    carCounts[row.type] += 1;

    if (row.lat != null && row.lng != null) {
      points.push({
        lat: row.lat,
        lng: row.lng,
        landName: row.landName,
        typeLabel: row.typeLabel,
        whenLabel: whenLabel(row.tidspunkt),
      });
    }
  }

  const total = rows.length;
  const countries = [...byLand.values()]
    .map((entry) => ({
      name: entry.name,
      count: entry.count,
      share: total > 0 ? Math.round((entry.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "nb"));

  let topVehicleLabel: string | null = null;
  let topVehicleCount = 0;
  for (const key of CAR_KEYS) {
    if (carCounts[key] > topVehicleCount) {
      topVehicleCount = carCounts[key];
      topVehicleLabel = CAR_LABELS[key];
    }
  }

  const { buckets, bucketTitle } = buildBuckets(rows, period);

  return {
    total,
    privat,
    yrkes,
    topVehicleLabel: topVehicleCount > 0 ? topVehicleLabel : null,
    topVehicleCount,
    countries,
    carTypes: CAR_KEYS.map((key) => ({ label: CAR_LABELS[key], count: carCounts[key] })),
    points,
    buckets,
    bucketTitle,
  };
}

export function formatPeriodLabel(period: ResolvedPeriod) {
  if (period.id === "all") return "Hele perioden";
  if (period.incomplete || !period.from || !period.to) return "Velg fra- og til-dato";
  const fmt = new Intl.DateTimeFormat("nb-NO", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const from = fmt.format(period.from);
  const to = fmt.format(period.to);
  return from === to ? from : `${from} – ${to}`;
}

function csvField(value: string) {
  if (/[;"\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function csvCoord(value: number | null) {
  if (value == null) return "";
  return value.toFixed(6).replace(".", ",");
}

export function rowsToCsv(rows: CountRow[]) {
  const lines = ["tidspunkt;land;trafikk;type;breddegrad;lengdegrad"];
  for (const row of rows) {
    lines.push(
      [
        csvField(osloStamp(row.tidspunkt)),
        csvField(row.landName),
        csvField(row.trafikkLabel),
        csvField(row.typeLabel),
        csvCoord(row.lat),
        csvCoord(row.lng),
      ].join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvFilename(period: ResolvedPeriod, rows: CountRow[]) {
  const stamp = (date: Date) => osloYmdString(date);
  if (period.from && period.to) {
    return `trafikktelling_${stamp(period.from)}_${stamp(period.to)}.csv`;
  }
  if (rows.length === 0) return "trafikktelling_hele-perioden.csv";
  return `trafikktelling_${stamp(rows[0].tidspunkt)}_${stamp(rows[rows.length - 1].tidspunkt)}.csv`;
}

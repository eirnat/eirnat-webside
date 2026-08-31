import { getRedirectSql } from "./redirect";
import { getAdminSql } from "./admin";
import type { Scan } from "./types";

type ScanRow = {
  id: number;
  link_id: string;
  ts: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  visitor_hash: string | null;
};

function mapScan(row: ScanRow): Scan {
  return {
    ...row,
    ts: new Date(row.ts),
  };
}

export async function insertScan(input: {
  link_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  visitor_hash: string | null;
}): Promise<void> {
  const sql = getRedirectSql();
  await sql`
    insert into scans (link_id, country, region, city, device_type, os, browser, visitor_hash)
    values (
      ${input.link_id},
      ${input.country},
      ${input.region},
      ${input.city},
      ${input.device_type},
      ${input.os},
      ${input.browser},
      ${input.visitor_hash}
    )
  `;
}

export async function getTotalScans(linkId: string): Promise<number> {
  const sql = getAdminSql();
  const rows = (await sql`
    select count(*)::text as count from scans where link_id = ${linkId}
  `) as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

export async function getUniqueScansLast24h(linkId: string): Promise<number> {
  const sql = getAdminSql();
  const rows = (await sql`
    select count(distinct visitor_hash)::text as count
    from scans
    where link_id = ${linkId}
      and ts >= now() - interval '24 hours'
      and visitor_hash is not null
  `) as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

export async function getScansPerDay(linkId: string, days = 30) {
  const sql = getAdminSql();
  return (await sql`
    select date_trunc('day', ts)::date::text as day, count(*)::text as count
    from scans
    where link_id = ${linkId}
      and ts >= now() - make_interval(days => ${days})
    group by 1
    order by 1
  `) as { day: string; count: string }[];
}

export async function getScansByHour(linkId: string) {
  const sql = getAdminSql();
  return (await sql`
    select extract(hour from ts)::int as hour, count(*)::text as count
    from scans
    where link_id = ${linkId}
    group by 1
    order by 1
  `) as { hour: number; count: string }[];
}

export async function getDeviceDistribution(linkId: string) {
  const sql = getAdminSql();
  return (await sql`
    select device_type, count(*)::text as count
    from scans
    where link_id = ${linkId}
    group by device_type
    order by count(*) desc
  `) as { device_type: string | null; count: string }[];
}

export async function getOsDistribution(linkId: string) {
  const sql = getAdminSql();
  return (await sql`
    select os, count(*)::text as count
    from scans
    where link_id = ${linkId}
    group by os
    order by count(*) desc
  `) as { os: string | null; count: string }[];
}

export async function getGeoDistribution(linkId: string) {
  const sql = getAdminSql();
  return (await sql`
    select country, region, city, count(*)::text as count
    from scans
    where link_id = ${linkId}
    group by country, region, city
    order by count(*) desc
    limit 20
  `) as { country: string | null; region: string | null; city: string | null; count: string }[];
}

export async function getRecentScans(linkId: string, limit = 50): Promise<Scan[]> {
  const sql = getAdminSql();
  const rows = (await sql`
    select id, link_id, ts, country, region, city, device_type, os, browser, visitor_hash
    from scans
    where link_id = ${linkId}
    order by ts desc
    limit ${limit}
  `) as ScanRow[];
  return rows.map(mapScan);
}

export async function getAllScansForExport(linkId: string): Promise<Scan[]> {
  const sql = getAdminSql();
  const rows = (await sql`
    select id, link_id, ts, country, region, city, device_type, os, browser, visitor_hash
    from scans
    where link_id = ${linkId}
    order by ts desc
  `) as ScanRow[];
  return rows.map(mapScan);
}

export async function deleteScansOlderThan(days: number): Promise<number> {
  const sql = getAdminSql();
  const rows = (await sql`
    with deleted as (
      delete from scans
      where ts < now() - make_interval(days => ${days})
      returning 1
    )
    select count(*)::text as count from deleted
  `) as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

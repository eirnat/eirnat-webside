import { getRedirectSql } from "./redirect";
import { getAdminSql } from "./admin";
import type { Link } from "./types";

type LinkRow = {
  id: string;
  slug: string;
  target_url: string;
  label: string;
  place_name: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function mapLink(row: LinkRow): Link {
  return {
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export async function getLinkBySlug(slug: string): Promise<Link | null> {
  const sql = getRedirectSql();
  const rows = (await sql`
    select id, slug, target_url, label, place_name, active, created_at, updated_at
    from links
    where slug = ${slug}
    limit 1
  `) as LinkRow[];
  return rows[0] ? mapLink(rows[0]) : null;
}

export async function getLinkById(id: string): Promise<Link | null> {
  const sql = getAdminSql();
  const rows = (await sql`
    select id, slug, target_url, label, place_name, active, created_at, updated_at
    from links
    where id = ${id}
    limit 1
  `) as LinkRow[];
  return rows[0] ? mapLink(rows[0]) : null;
}

export async function listLinks(): Promise<Link[]> {
  const sql = getAdminSql();
  const rows = (await sql`
    select id, slug, target_url, label, place_name, active, created_at, updated_at
    from links
    order by created_at desc
  `) as LinkRow[];
  return rows.map(mapLink);
}

export async function createLink(input: {
  slug: string;
  target_url: string;
  label: string;
  place_name: string | null;
}): Promise<Link> {
  const sql = getAdminSql();
  const rows = (await sql`
    insert into links (slug, target_url, label, place_name)
    values (${input.slug}, ${input.target_url}, ${input.label}, ${input.place_name})
    returning id, slug, target_url, label, place_name, active, created_at, updated_at
  `) as LinkRow[];
  return mapLink(rows[0]);
}

export async function updateLink(
  id: string,
  input: {
    target_url: string;
    label: string;
    place_name: string | null;
    active: boolean;
  },
): Promise<Link | null> {
  const sql = getAdminSql();
  const rows = (await sql`
    update links
    set
      target_url = ${input.target_url},
      label = ${input.label},
      place_name = ${input.place_name},
      active = ${input.active},
      updated_at = now()
    where id = ${id}
    returning id, slug, target_url, label, place_name, active, created_at, updated_at
  `) as LinkRow[];
  return rows[0] ? mapLink(rows[0]) : null;
}

export async function getScanCountByLink(linkId: string): Promise<number> {
  const sql = getAdminSql();
  const rows = (await sql`
    select count(*)::text as count from scans where link_id = ${linkId}
  `) as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

export async function getScanCountsByLinks(
  linkIds: string[],
): Promise<Record<string, number>> {
  if (linkIds.length === 0) return {};

  const sql = getAdminSql();
  const rows = (await sql`
    select link_id, count(*)::text as count
    from scans
    where link_id = any(${linkIds}::uuid[])
    group by link_id
  `) as { link_id: string; count: string }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.link_id] = Number(row.count);
  }
  return counts;
}

create extension if not exists pgcrypto;

create table links (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  target_url   text not null,
  label        text not null,
  place_name   text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table scans (
  id            bigserial primary key,
  link_id       uuid not null references links(id) on delete cascade,
  ts            timestamptz not null default now(),
  country       text,
  region        text,
  city          text,
  device_type   text,
  os            text,
  browser       text,
  visitor_hash  text
);

create index scans_link_ts_idx on scans (link_id, ts desc);
create index scans_ts_idx on scans (ts desc);
create index links_slug_idx on links (slug);

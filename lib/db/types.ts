export type Link = {
  id: string;
  slug: string;
  target_url: string;
  label: string;
  place_name: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Scan = {
  id: number;
  link_id: string;
  ts: Date;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  visitor_hash: string | null;
};

import { neon } from "@neondatabase/serverless";

export function getRedirectSql() {
  const url = process.env.DATABASE_URL_REDIRECT;
  if (!url) {
    throw new Error("DATABASE_URL_REDIRECT is not set");
  }
  return neon(url);
}

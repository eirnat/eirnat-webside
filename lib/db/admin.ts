import { neon } from "@neondatabase/serverless";

export function getAdminSql() {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) {
    throw new Error("DATABASE_URL_ADMIN is not set");
  }
  return neon(url);
}

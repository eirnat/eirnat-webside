-- Kjør dette manuelt i Neon/Supabase-konsollen etter 001_initial.sql.
-- Bytt ut passord og databasenavn. Region: Frankfurt (eu-central-1) eller Stockholm.

-- CREATE ROLE qr_redirect WITH LOGIN PASSWORD 'velg-et-langt-passord';
-- CREATE ROLE qr_admin WITH LOGIN PASSWORD 'velg-et-annet-langt-passord';

-- GRANT CONNECT ON DATABASE neondb TO qr_redirect;
-- GRANT CONNECT ON DATABASE neondb TO qr_admin;

-- GRANT USAGE ON SCHEMA public TO qr_redirect;
-- GRANT SELECT ON links TO qr_redirect;
-- GRANT INSERT ON scans TO qr_redirect;
-- GRANT USAGE, SELECT ON SEQUENCE scans_id_seq TO qr_redirect;

-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO qr_admin;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO qr_admin;

-- Opprett to connection strings i Neon med disse rollene:
-- DATABASE_URL_REDIRECT=... (qr_redirect)
-- DATABASE_URL_ADMIN=...    (qr_admin)

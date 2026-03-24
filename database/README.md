# Database

This folder contains database artifacts for production and local setup.

## Suggested files
- schema.sql: base schema for a fresh database
- seed.sql: optional seed data
- migrations/: incremental SQL changes

## Production target
Use a managed Postgres database (Neon/Supabase/Render Postgres).

## Environment variables used by backend
- DATABASE_URL (recommended)
- or PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
- PGSSL, PGSSL_REJECT_UNAUTHORIZED (if SSL is required)

-- =============================================================================
-- Storage breakdown — where your Supabase space is actually going
-- =============================================================================
-- Run in Supabase: SQL Editor -> New query -> paste ONE block -> Run.
-- Read-only: these only MEASURE, they never change or delete anything.
--
-- Supabase free tier gives you 500 MB of database space. The base64 photos
-- (siting_images) and, until now, the handover PNGs are stored inside each
-- table's TOAST area; pg_total_relation_size() counts that, so the heavy tables
-- show up correctly below.
-- =============================================================================


-- 1) PER-TABLE BREAKDOWN — every table, biggest first, with % of the whole DB.
--    total = the table + its indexes + its TOAST (big text/base64 lives here).
WITH t AS (
  SELECT c.oid,
         n.nspname                       AS schema,
         c.relname                       AS table_name,
         pg_total_relation_size(c.oid)   AS total_bytes,
         pg_relation_size(c.oid)         AS table_bytes,
         pg_indexes_size(c.oid)          AS index_bytes,
         COALESCE(c.reltuples,0)::bigint AS est_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p','m')      -- tables, partitioned tables, matviews
     AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
)
SELECT schema,
       table_name,
       pg_size_pretty(total_bytes)  AS total_size,
       pg_size_pretty(table_bytes)  AS data_size,
       pg_size_pretty(index_bytes)  AS index_size,
       est_rows                     AS approx_rows,
       round(100.0 * total_bytes / NULLIF(SUM(total_bytes) OVER (),0), 1) AS pct_of_db
  FROM t
 ORDER BY total_bytes DESC;


-- 2) SCHEMA ROLL-UP — your data (public) vs Supabase's own schemas (auth,
--    storage, realtime…), so you can see how much is actually yours.
SELECT n.nspname AS schema,
       pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS total_size,
       round(100.0 * SUM(pg_total_relation_size(c.oid))
             / NULLIF(SUM(SUM(pg_total_relation_size(c.oid))) OVER (),0), 1) AS pct_of_db
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r','p','m')
   AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
 GROUP BY n.nspname
 ORDER BY SUM(pg_total_relation_size(c.oid)) DESC;


-- 3) HEADLINE — total database size, and how much of the 500 MB free tier is used.
SELECT pg_size_pretty(pg_database_size(current_database()))                    AS database_size,
       round(100.0 * pg_database_size(current_database()) / (500*1024*1024),1) AS pct_of_500mb_free_tier;

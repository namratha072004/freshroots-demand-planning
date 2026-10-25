-- Checkpoint 7: new-launch leads (unverified references) and Raghav's marks.
CREATE TABLE launch_leads (
  id            bigserial PRIMARY KEY,
  run_id        bigint REFERENCES runs (id) ON DELETE SET NULL,
  category      text NOT NULL,
  title         text NOT NULL,
  summary       text NOT NULL,
  source_url    text NOT NULL,       -- the publisher page the grounding link leads to
  grounding_uri text NOT NULL,       -- Google's grounding link, kept as the audit trail
  source_site   text,                -- grounding title (site name)
  source_date   date NOT NULL,       -- the source page's own publication date
  mark          text CHECK (mark IN ('interested', 'ignore')),
  marked_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((mark IS NULL) = (marked_at IS NULL))
);
CREATE UNIQUE INDEX launch_leads_source_url_uq ON launch_leads (lower(source_url));

ALTER TABLE runs
  ADD COLUMN launch_status text CHECK (launch_status IN ('ok', 'partial', 'failed', 'skipped')),
  ADD COLUMN launch_error  text,
  ADD COLUMN launch_stats  jsonb;

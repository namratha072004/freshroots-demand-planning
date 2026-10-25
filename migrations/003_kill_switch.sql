-- Checkpoint 5: kill-switch latch. A STOPPED event blocks runs and PO creation until a RESUMED event
-- (with a typed note) is stored. Decisions made before the latest RESUMED no longer count.
CREATE TABLE kill_switch_events (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('STOPPED', 'RESUMED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved   integer,
  rejected   integer,
  decided    integer,
  rate       numeric,
  note       text,
  CHECK (kind <> 'RESUMED' OR length(trim(note)) > 0)
);

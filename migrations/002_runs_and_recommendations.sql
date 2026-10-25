-- Checkpoint 3: runs, the organised one-row-per-SKU data, and recommendations (flags).
-- No foreign keys to sku_master: the CSV loader replaces that table on every run.

CREATE TABLE runs (
  id             bigserial PRIMARY KEY,
  trigger        text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  status         text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  asof_date      date NOT NULL,
  festival_month boolean,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  summary        jsonb,
  error          text
);

-- One row per SKU per run, with data-quality flags.
CREATE TABLE run_sku_data (
  run_id              bigint NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  sku_id              text NOT NULL,
  perishability       text,
  standard_reorder_qty integer,
  weeks_of_history    integer NOT NULL,
  latest_sales_week   text,
  avg12               numeric,
  avg4                numeric,
  units_on_hand       integer,
  inventory_as_of     date,
  data_issues         text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, sku_id)
);

CREATE TABLE recommendations (
  id                  bigserial PRIMARY KEY,
  run_id              bigint NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  sku_id              text NOT NULL,
  flags               text[] NOT NULL DEFAULT '{}',
  action              text NOT NULL CHECK (action IN ('ORDER_NOW', 'PAUSE_ORDER', 'NEEDS_RAGHAV')),
  quantity            integer,
  review_required     boolean NOT NULL DEFAULT false,
  needs_raghav        boolean NOT NULL DEFAULT false,
  needs_raghav_reason text,
  metrics             jsonb NOT NULL,
  data_issues         text[] NOT NULL DEFAULT '{}',
  reason              text,
  status              text NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  rejection_reason    text CHECK (rejection_reason IN ('wrong_data', 'rule_doesnt_fit', 'my_judgment')),
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'REJECTED') = (rejection_reason IS NOT NULL))
);

CREATE INDEX recommendations_run_idx ON recommendations (run_id);
CREATE INDEX recommendations_status_idx ON recommendations (status);

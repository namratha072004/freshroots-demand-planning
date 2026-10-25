-- Checkpoint 8: Zoho item mapping and draft purchase orders.

-- SKU -> Zoho item id, filled from the Zoho API (items READ).
CREATE TABLE zoho_item_map (
  sku_id       text PRIMARY KEY,
  zoho_item_id text NOT NULL,
  item_name    text,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per draft PO attempt. batch_key = hash of the approved recommendation ids in the batch, so the same batch
-- can never be created twice. 'dry_run' rows are never real and never block anything.
CREATE TABLE draft_purchase_orders (
  id                 bigserial PRIMARY KEY,
  batch_key          text NOT NULL,
  reference_number   text NOT NULL,
  status             text NOT NULL CHECK (status IN ('creating', 'created', 'unknown', 'failed', 'dry_run')),
  recommendation_ids bigint[] NOT NULL,
  lines              jsonb NOT NULL,
  vendor_id          text,
  zoho_po_id         text,
  zoho_po_number     text,
  zoho_status        text,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- At most one live (creating / unknown / created) row per batch. Failed and dry-run rows do not count.
CREATE UNIQUE INDEX draft_po_live_batch_uq ON draft_purchase_orders (batch_key) WHERE status IN ('creating', 'unknown', 'created');

-- A recommendation belongs to at most one live draft PO.
ALTER TABLE recommendations ADD COLUMN draft_po_id bigint REFERENCES draft_purchase_orders (id) ON DELETE SET NULL;

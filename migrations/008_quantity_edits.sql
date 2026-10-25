-- Human in the loop: the planner can change the proposed order quantity before or after approving (until a draft PO is made).
-- `quantity` stays what the rules recommended. `approved_quantity` is the planner's number, when it differs.
ALTER TABLE recommendations
  ADD COLUMN approved_quantity integer CHECK (approved_quantity IS NULL OR approved_quantity > 0);

-- Every change, so an edit is never silent.
CREATE TABLE quantity_audit (
  id                bigserial PRIMARY KEY,
  recommendation_id bigint NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
  old_quantity      integer,
  new_quantity      integer NOT NULL,
  changed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quantity_audit_rec_idx ON quantity_audit (recommendation_id, changed_at DESC);

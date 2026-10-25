-- Human in the loop, part 2: why the planner changed a quantity, and a time log of every action.

-- The reason behind a quantity change, kept with the recommendation and in the change history.
ALTER TABLE recommendations
  ADD COLUMN adjustment_reason text,
  ADD COLUMN adjustment_note   text;
ALTER TABLE quantity_audit
  ADD COLUMN reason text,
  ADD COLUMN note   text;

-- One row per action. `planner` = a person using the dashboard, `system` = something the app did by itself.
CREATE TABLE activity_log (
  id                bigserial PRIMARY KEY,
  at                timestamptz NOT NULL DEFAULT now(),
  actor             text NOT NULL CHECK (actor IN ('planner', 'system')),
  kind              text NOT NULL,
  summary           text NOT NULL,
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  sku_id            text,
  recommendation_id bigint,
  run_id            bigint
);
CREATE INDEX activity_log_at_idx   ON activity_log (at DESC, id DESC);
CREATE INDEX activity_log_kind_idx ON activity_log (kind);

-- Fill the log with what already happened, so it starts complete.
INSERT INTO activity_log (at, actor, kind, summary, details, sku_id, recommendation_id, run_id)
SELECT r.decided_at, 'planner',
       CASE r.status WHEN 'APPROVED' THEN 'decision.approved' ELSE 'decision.rejected' END,
       CASE WHEN r.status = 'APPROVED'
            THEN 'Approved ' || r.sku_id || coalesce(' (' || m.sku_name || ')', '') ||
                 CASE WHEN r.quantity IS NOT NULL THEN ' at ' || coalesce(r.approved_quantity, r.quantity)::text || ' units' ELSE '' END
            ELSE 'Rejected ' || r.sku_id || coalesce(' (' || m.sku_name || ')', '') END,
       jsonb_build_object('action', r.action, 'suggested', r.quantity, 'ordered', coalesce(r.approved_quantity, r.quantity), 'rejection_reason', r.rejection_reason),
       r.sku_id, r.id, r.run_id
FROM recommendations r LEFT JOIN sku_master m ON m.sku_id = r.sku_id
WHERE r.status IN ('APPROVED', 'REJECTED') AND r.decided_at IS NOT NULL;

INSERT INTO activity_log (at, actor, kind, summary, details, run_id)
SELECT coalesce(finished_at, started_at),
       CASE trigger WHEN 'manual' THEN 'planner' ELSE 'system' END,
       'run.completed',
       CASE trigger WHEN 'manual' THEN 'Ran the analysis manually (run #' ELSE 'Scheduled run (run #' END || id::text || ')',
       jsonb_build_object('trigger', trigger, 'flags', summary->'recommendations'),
       id
FROM runs WHERE status = 'completed';

INSERT INTO activity_log (at, actor, kind, summary, details)
SELECT created_at, 'planner', 'po.created',
       'Created draft PO ' || coalesce(zoho_po_number, reference_number) || ' in Zoho',
       jsonb_build_object('po', zoho_po_number, 'zoho_status', zoho_status, 'lines', lines)
FROM draft_purchase_orders WHERE status = 'created';

INSERT INTO activity_log (at, actor, kind, summary, details)
SELECT created_at,
       CASE kind WHEN 'STOPPED' THEN 'system' ELSE 'planner' END,
       CASE kind WHEN 'STOPPED' THEN 'killswitch.stopped' ELSE 'killswitch.resumed' END,
       CASE kind WHEN 'STOPPED' THEN 'Kill switch stopped runs and draft POs (rejection rate ' || round(coalesce(rate, 0) * 100, 1)::text || '%)'
                 ELSE 'Resumed the kill switch: ' || coalesce(note, '') END,
       jsonb_build_object('rate', rate, 'rejected', rejected, 'decided', decided, 'note', note)
FROM kill_switch_events;

INSERT INTO activity_log (at, actor, kind, summary, details)
SELECT marked_at, 'planner', 'lead.marked',
       'Marked launch lead "' || title || '" as ' || mark,
       jsonb_build_object('mark', mark, 'category', category, 'source', source_url)
FROM launch_leads WHERE marked_at IS NOT NULL;

INSERT INTO activity_log (at, actor, kind, summary, details)
SELECT changed_at, 'planner',
       CASE WHEN key = 'po.dryRun' THEN 'po.mode' ELSE 'settings.changed' END,
       'Changed setting ' || key || ' from ' || coalesce(old_value::text, 'default') || ' to ' || new_value::text,
       jsonb_build_object('key', key, 'old', old_value, 'new', new_value)
FROM settings_audit;

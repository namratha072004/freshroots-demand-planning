-- Checkpoint 6: Gemini reasons and triage. All nullable: the AI step may fail and the run still completes.
ALTER TABLE recommendations
  ADD COLUMN ai_needs_raghav   boolean,
  ADD COLUMN ai_triage_reason  text;

ALTER TABLE runs
  ADD COLUMN ai_status text CHECK (ai_status IN ('ok', 'partial', 'failed', 'skipped')),
  ADD COLUMN ai_error  text;

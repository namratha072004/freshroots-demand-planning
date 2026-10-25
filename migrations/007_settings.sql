-- Settings page: edited values override the defaults in src/config.ts. Only changed values are stored.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every change, old value to new value, so edits to the rules and the safety net are never silent.
CREATE TABLE settings_audit (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL,
  old_value  jsonb,
  new_value  jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settings_audit_time_idx ON settings_audit (changed_at DESC);

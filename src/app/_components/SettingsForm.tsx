"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { resetSettingsAction, saveSettingsAction } from "../actions";

export interface FieldSpec {
  key: string;
  label: string;
  help: string;
  unit: string;
  value: number;
  def: number;
  min: number;
  max: number;
  step: number;
  edited: boolean;
}
export interface GroupSpec {
  id: string;
  title: string;
  blurb: string;
  fields: FieldSpec[];
}

/** One editable section. Values are shown in display units (percent as 20, not 0.2) and validated again on the server. */
export function SettingsForm({ title, intro, groups, warning }: { title: string; intro?: string; groups: GroupSpec[]; warning?: string }) {
  const all = groups.flatMap((g) => g.fields);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(all.map((f) => [f.key, String(f.value)])));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; errors?: string[] } | null>(null);
  const dirty = all.some((f) => Number(values[f.key]) !== f.value);

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveSettingsAction(Object.fromEntries(all.map((f) => [f.key, values[f.key] === "" ? NaN : Number(values[f.key])])));
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.message, errors: r.errors });
    });
  const reset = () =>
    start(async () => {
      setMsg(null);
      const r = await resetSettingsAction(groups.map((g) => g.id) as never);
      if (r.ok) setValues(Object.fromEntries(all.map((f) => [f.key, String(f.def)])));
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.message, errors: r.errors });
    });

  return (
    <section className="card settings-card" aria-label={title}>
      <h2 className="settings-title">{title}</h2>
      {intro && <p className="muted settings-intro">{intro}</p>}
      {warning && <div className="banner alert" style={{ marginTop: 10 }}><div className="banner-body">{warning}</div></div>}

      {groups.map((g) => (
        <div key={g.id} className="rule-block">
          <div className="rule-head">
            <strong>{g.title}</strong>
            <span className="muted">{g.blurb}</span>
          </div>
          {g.fields.map((f) => {
            const changed = Number(values[f.key]) !== f.def;
            return (
              <div key={f.key} className="field-row">
                <label htmlFor={f.key}>
                  <span className="field-label">{f.label}</span>
                  <span className="field-help">{f.help}</span>
                </label>
                <div className="field-input">
                  <input
                    id={f.key}
                    type="number"
                    inputMode="decimal"
                    value={values[f.key]}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-describedby={`${f.key}-def`}
                  />
                  <span className="unit">{f.unit}</span>
                </div>
                <div className="field-meta" id={`${f.key}-def`}>
                  {changed ? <span className="chip warn">Edited</span> : null}
                  <span className="muted">Default {f.def}{f.unit === "%" ? "%" : ` ${f.unit}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="form-foot">
        <button className="primary" disabled={pending || !dirty} onClick={save}>
          {pending ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save changes
        </button>
        <button disabled={pending} onClick={reset}>
          <RotateCcw size={15} /> Reset to defaults
        </button>
        {msg && <span className={msg.ok ? "form-ok" : "error"} role="status">{msg.text}</span>}
      </div>
      {msg?.errors && (
        <ul className="form-errors">
          {msg.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

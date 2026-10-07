"use client";

import type { Field } from "@/lib/blocks/editor-spec";

/** Renders an author form from a list of field definitions (see editor-spec.ts). */
export function FieldsEditor({ fields, value, onChange, idPrefix }: { fields: Field[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void; idPrefix: string }) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const id = `${idPrefix}-${f.k}`;
        const v = value[f.k];
        switch (f.t) {
          case "checkbox":
            return <label key={f.k} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!v} onChange={(e) => set(f.k, e.target.checked)} />{f.label}</label>;
          case "select":
            return <div key={f.k}><label className="label" htmlFor={id}>{f.label}</label>
              <select id={id} className="input" value={String(v ?? "")} onChange={(e) => set(f.k, e.target.value)}>{f.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select></div>;
          case "multi":
            return <fieldset key={f.k}><legend className="label">{f.label}</legend><div className="flex flex-wrap gap-3">
              {f.options.map(([o, l]) => <label key={o} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={(v ?? []).includes(o)}
                onChange={(e) => set(f.k, e.target.checked ? [...(v ?? []), o] : (v ?? []).filter((x: string) => x !== o))} />{l}</label>)}</div></fieldset>;
          case "list": {
            const items: Record<string, any>[] = Array.isArray(v) ? v : [];
            const blank = Object.fromEntries(f.item.map((i) => [i.k, i.t === "checkbox" ? false : ""]));
            return (
              <fieldset key={f.k} className="rounded-xl border border-line p-3">
                <legend className="label px-1">{f.label}</legend>
                <ol className="space-y-2">
                  {items.map((it, i) => (
                    <li key={i} className="rounded-lg bg-cream p-2">
                      <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted">#{i + 1}
                        <span className="flex gap-1">
                          <button type="button" className="btn-ghost btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => { const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set(f.k, a); }}>↑</button>
                          <button type="button" className="btn-ghost btn-sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => { const a = [...items]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set(f.k, a); }}>↓</button>
                          <button type="button" className="btn-ghost btn-sm text-bad" aria-label="Remove" onClick={() => set(f.k, items.filter((_, j) => j !== i))}>✕</button>
                        </span>
                      </div>
                      <FieldsEditor fields={f.item} value={it} idPrefix={`${id}-${i}`} onChange={(nv) => set(f.k, items.map((x, j) => (j === i ? nv : x)))} />
                    </li>
                  ))}
                </ol>
                <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => set(f.k, [...items, blank])}>+ {f.addLabel ?? "Add"}</button>
              </fieldset>
            );
          }
          case "number":
            return <div key={f.k}><label className="label" htmlFor={id}>{f.label}</label><input id={id} type="number" className="input max-w-40" value={v ?? 0} onChange={(e) => set(f.k, Number(e.target.value))} /></div>;
          case "textarea": case "markdown": case "strings":
            return <div key={f.k}><label className="label" htmlFor={id}>{f.label}</label>
              <textarea id={id} className={`input ${f.t === "markdown" ? "min-h-32 font-mono text-sm" : "min-h-20"}`} value={Array.isArray(v) ? v.join("\n") : (v ?? "")} onChange={(e) => set(f.k, e.target.value)} />
              {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}</div>;
          default:
            return <div key={f.k}><label className="label" htmlFor={id}>{f.label}</label>
              <input id={id} type={f.t === "url" ? "text" : "text"} inputMode={f.t === "url" ? "url" : undefined} className="input" value={v ?? ""} onChange={(e) => set(f.k, e.target.value)} />
              {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}</div>;
        }
      })}
    </div>
  );
}

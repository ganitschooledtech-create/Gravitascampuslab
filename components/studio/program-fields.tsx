/** Program settings fields, shared by "create" and "edit". */
export function ProgramFields({ p }: { p?: any }) {
  const langs: string[] = p?.languages ?? ["en"];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="label" htmlFor="name">Program name</label><input className="input" id="name" name="name" defaultValue={p?.name} required /></div>
      <div><label className="label" htmlFor="slug">Web address (slug)</label><input className="input" id="slug" name="slug" defaultValue={p?.slug} placeholder="e.g. python-professional" required pattern="[a-z0-9-]{2,60}" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="tagline">Tagline</label><input className="input" id="tagline" name="tagline" defaultValue={p?.tagline ?? ""} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="description">Description</label><textarea className="input min-h-24" id="description" name="description" defaultValue={p?.description ?? ""} /></div>
      <div><label className="label" htmlFor="audience">Audience</label>
        <select className="input" id="audience" name="audience" defaultValue={p?.audience ?? "school"}><option value="school">School students (minors)</option><option value="adult">Adults</option></select></div>
      <div><label className="label" htmlFor="visibility">Visibility</label>
        <select className="input" id="visibility" name="visibility" defaultValue={p?.visibility ?? "draft"}>
          <option value="draft">Draft — team only</option><option value="private">Private — enrolled learners only</option><option value="public">Public — shown on website</option></select></div>
      <div><label className="label" htmlFor="pass_mark">Pass mark to unlock next level (%)</label><input className="input" id="pass_mark" name="pass_mark" type="number" min={0} max={100} defaultValue={p?.passMark ?? 50} /></div>
      <div><label className="label" htmlFor="unlock_rule">Level unlocking</label>
        <select className="input" id="unlock_rule" name="unlock_rule" defaultValue={p?.unlockRule ?? "sequential"}>
          <option value="sequential">In order — pass a level to unlock the next</option><option value="open">All levels open</option></select></div>
      <fieldset className="sm:col-span-2"><legend className="label">Languages</legend>
        <label className="mr-4"><input type="checkbox" name="languages" value="en" defaultChecked={langs.includes("en")} /> English</label>
        <label><input type="checkbox" name="languages" value="kn" defaultChecked={langs.includes("kn")} /> ಕನ್ನಡ Kannada</label></fieldset>
      {p && <label className="sm:col-span-2"><input type="checkbox" name="is_template" defaultChecked={p.isTemplate} /> Save as template (appears in “Start from a template”)</label>}
    </div>
  );
}

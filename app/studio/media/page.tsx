import { ActionForm, Submit } from "@/components/ui/action-form";
import { requirePermAnywhere } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { canAnywhere } from "@/lib/permissions";
import { createFolderAction, updateMediaAction, uploadMediaAction } from "./actions";

export const metadata = { title: "Media library" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const { q = "", folder = "" } = await searchParams;
  const user = await requirePermAnywhere("media.view");
  const canManage = canAnywhere(user.assignments, "media.manage");
  const { folders, items } = await withUser(user.id, async (tx) => ({
    folders: await tx<any[]>`select id, name from app.media_folders order by name`,
    items: await tx<any[]>`select id, storage_key, file_name, mime_type, size_bytes, alt_text, folder_id, created_at from app.media
      where deleted_at is null
        and (${folder} = '' or folder_id::text = ${folder})
        and (${q} = '' or to_tsvector('simple', file_name || ' ' || alt_text) @@ plainto_tsquery('simple', ${q}) or file_name ilike ${"%" + q + "%"})
      order by created_at desc limit 120`,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Media library</h1>
      <form className="card flex flex-wrap items-end gap-2" role="search">
        <div className="flex-1"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} className="input" placeholder="File name or alt text" /></div>
        <div><label className="label" htmlFor="folder">Folder</label>
          <select id="folder" name="folder" defaultValue={folder} className="input"><option value="">All folders</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <button className="btn-ghost">Filter</button>
      </form>
      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-2 text-lg">Upload</h2>
            <ActionForm action={uploadMediaAction} submitLabel="Upload" submitClassName="btn-primary btn-sm">
              <input type="file" name="files" multiple className="input" aria-label="Files" accept="image/*,.pdf,.txt,.csv,.docx,.pptx,.xlsx,.mp4" />
              <input name="alt" className="input" placeholder="Alt text for images (describe what is shown)" aria-label="Alt text" />
              <select name="folderId" className="input" aria-label="Folder"><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <p className="text-xs text-muted">Max 10 MB per file. Images, PDF, Office documents, CSV, MP4.</p>
            </ActionForm>
          </section>
          <section className="card">
            <h2 className="mb-2 text-lg">New folder</h2>
            <ActionForm action={createFolderAction} submitLabel="Create folder" submitClassName="btn-ghost btn-sm">
              <input name="name" className="input" placeholder="Folder name" aria-label="Folder name" />
            </ActionForm>
          </section>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => {
          const url = `/files/${m.storageKey}`;
          return (
            <li key={m.id} className="card space-y-2 p-3">
              {m.mimeType.startsWith("image/")
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={url} alt={m.altText} loading="lazy" className="h-36 w-full rounded-lg bg-cream object-contain" />
                : <div className="grid h-36 place-items-center rounded-lg bg-cream text-4xl" aria-hidden>📄</div>}
              <p className="truncate text-sm font-bold" title={m.fileName}>{m.fileName}</p>
              <p className="text-xs text-muted">{(Number(m.sizeBytes) / 1024).toFixed(0)} KB · {m.mimeType}</p>
              <input readOnly value={url} className="input py-1 text-xs" aria-label="Link to use in lessons" />
              {canManage && (
                <form action={updateMediaAction} className="space-y-1">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="alt" defaultValue={m.altText} className="input py-1 text-xs" placeholder="Alt text" aria-label="Alt text" />
                  <select name="folderId" defaultValue={m.folderId ?? ""} className="input py-1 text-xs" aria-label="Folder"><option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <div className="flex gap-1"><Submit label="Save" className="btn-ghost btn-sm" />
                    <button name="delete" value="1" className="btn-ghost btn-sm text-bad">Delete</button></div>
                </form>
              )}
            </li>
          );
        })}
        {items.length === 0 && <li className="card text-muted">No files found.</li>}
      </ul>
    </div>
  );
}

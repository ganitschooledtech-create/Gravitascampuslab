export function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = { draft: "bg-line text-muted", in_review: "bg-sun/20 text-sun-dark", published: "bg-green-100 text-ok", archived: "bg-line text-muted" };
  return <span className={`badge ${cls[status] ?? "bg-line"}`}>{status.replace("_", " ")}</span>;
}

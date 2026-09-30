"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  name: string;
  archived: boolean;
}

export default function SimpleCrudPanel({
  title,
  subtitle,
  resource,
  supportsArchive,
  initial,
  emptyText,
}: {
  title: string;
  subtitle: string;
  resource: "clients" | "tags";
  supportsArchive: boolean;
  initial: Item[];
  emptyText: string;
}): JSX.Element {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/${resource}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message ?? "Create failed");
      return;
    }
    const created = await res.json();
    setItems((cur) => [
      { id: created.id, name: created.name, archived: created.archivedAt !== null },
      ...cur,
    ]);
    setName("");
    router.refresh();
  }

  async function toggleArchive(item: Item): Promise<void> {
    const res = await fetch(`/api/${resource}/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !item.archived }),
    });
    if (res.ok) {
      const upd = await res.json();
      setItems((cur) =>
        cur.map((x) => (x.id === item.id ? { ...x, archived: upd.archivedAt !== null } : x)),
      );
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm("Delete?")) return;
    const res = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((cur) => cur.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-title text-ink">{title}</h2>
        <p className="text-body-sm text-muted">{subtitle}</p>
      </div>
      <form
        onSubmit={create}
        className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-end"
      >
        <div className="flex-1">
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full sm:w-auto">Add</button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {/* Mobile: card rows */}
      <ul className="md:hidden space-y-2">
        {items.length === 0 && (
          <li className="card p-6 text-center text-sm text-muted">
            {emptyText}
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink truncate">{item.name}</p>
              {supportsArchive && (
                <p className="text-xs text-muted">
                  {item.archived ? "Archived" : "Active"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {supportsArchive && (
                <button
                  className="btn btn-sm"
                  onClick={() => toggleArchive(item)}
                >
                  {item.archived ? "Unarchive" : "Archive"}
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => remove(item.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-canvas-2 text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              {supportsArchive && <th className="text-left px-3 py-2">Status</th>}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={supportsArchive ? 3 : 2} className="text-center py-8 text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-3 py-2">{item.name}</td>
                {supportsArchive && (
                  <td className="px-3 py-2">
                    {item.archived ? <span className="text-muted">Archived</span> : "Active"}
                  </td>
                )}
                <td className="px-3 py-2 text-right space-x-2">
                  {supportsArchive && (
                    <button className="btn btn-sm" onClick={() => toggleArchive(item)}>
                      {item.archived ? "Unarchive" : "Archive"}
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

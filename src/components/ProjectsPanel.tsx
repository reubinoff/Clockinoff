"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emitProjectsChanged } from "@/lib/events";

interface Project {
  id: string;
  name: string;
  client_id: string | null;
  default_billable: boolean;
  default_rate: string | null;
  archived: boolean;
}

interface Client {
  id: string;
  name: string;
  archived: boolean;
}

export default function ProjectsPanel({
  initial,
  clients,
}: {
  initial: Project[];
  clients: Client[];
}): JSX.Element {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [billable, setBillable] = useState(false);
  const [rate, setRate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        client_id: clientId || null,
        default_billable: billable,
        default_rate: rate === "" ? null : Number(rate),
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message ?? "Create failed");
      return;
    }
    const created = await res.json();
    setProjects((cur) => [
      {
        id: created.id,
        name: created.name,
        client_id: created.clientId,
        default_billable: created.defaultBillable,
        default_rate: created.defaultRate,
        archived: created.archivedAt !== null,
      },
      ...cur,
    ]);
    setName("");
    setClientId("");
    setBillable(false);
    setRate("");
    emitProjectsChanged();
    router.refresh();
  }

  async function toggleArchive(p: Project): Promise<void> {
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !p.archived }),
    });
    if (res.ok) {
      const upd = await res.json();
      setProjects((cur) =>
        cur.map((x) =>
          x.id === p.id ? { ...x, archived: upd.archivedAt !== null } : x,
        ),
      );
      emitProjectsChanged();
      router.refresh();
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm("Delete this project? Entries will keep the record.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((cur) => cur.filter((x) => x.id !== id));
      emitProjectsChanged();
      router.refresh();
    }
  }

  function clientNameFor(id: string | null): string | null {
    if (!id) return null;
    return clients.find((c) => c.id === id)?.name ?? null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-muted">Group your entries. Default billable + rate optional.</p>
      </div>

      <form
        onSubmit={create}
        className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3 md:items-end"
      >
        <div className="md:col-span-2">
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Client</label>
          <select
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">No client</option>
            {clients
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Default rate</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
            />
            Billable
          </label>
          <button type="submit" className="btn btn-primary ml-auto w-full sm:w-auto">
            Add
          </button>
        </div>
        {error && <p className="text-sm text-red-700 md:col-span-5">{error}</p>}
      </form>

      {/* Mobile: card rows */}
      <ul className="md:hidden space-y-2">
        {projects.length === 0 && (
          <li className="card p-6 text-center text-sm text-muted">
            No projects yet — add one so timers stay organized.
          </li>
        )}
        {projects.map((p) => {
          const client = clientNameFor(p.client_id);
          return (
            <li key={p.id} className="card p-3 space-y-1.5">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm text-ink truncate">{p.name}</p>
                {p.archived && (
                  <span className="tag text-muted shrink-0">Archived</span>
                )}
              </div>
              <p className="text-xs text-muted">
                {client ?? "No client"}
                <span className="mx-1.5">·</span>
                {p.default_billable ? "Billable" : "Not billable"}
                {p.default_rate ? (
                  <>
                    <span className="mx-1.5">·</span>
                    <span className="tabular-nums">{p.default_rate}</span>
                  </>
                ) : null}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button className="btn btn-sm" onClick={() => toggleArchive(p)}>
                  {p.archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => remove(p.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-canvas-2 text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Client</th>
              <th className="text-left px-3 py-2">Billable</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted">No projects yet.</td>
              </tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">
                  {clientNameFor(p.client_id) ?? (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">{p.default_billable ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.default_rate ?? ""}
                </td>
                <td className="px-3 py-2">
                  {p.archived ? <span className="text-muted">Archived</span> : "Active"}
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button className="btn btn-sm" onClick={() => toggleArchive(p)}>
                    {p.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}>
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

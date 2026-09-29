"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton(): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout(): Promise<void> {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={logout} disabled={pending}>
      {pending ? "…" : "Log out"}
    </button>
  );
}

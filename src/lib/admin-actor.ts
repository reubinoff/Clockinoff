import { trace } from "@opentelemetry/api";

// Azure Monitor maps `enduser.id` to the authenticated user id.
// `actor_user_id` is the same value as a custom property on admin spans.
export function attachAdminActor(actorId: string): void {
  const span = trace.getActiveSpan();
  if (!span) return;
  span.setAttribute("enduser.id", actorId);
  span.setAttribute("actor_user_id", actorId);
}

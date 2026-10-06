import { logger } from "@/lib/logger";
import { purgeExpiredSessions } from "./session";

export const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

let purgeTimer: ReturnType<typeof setInterval> | null = null;

export function shouldStartSessionPurge(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return false;
  if (env.NODE_ENV === "test" || env.VITEST) return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return Boolean(env.DATABASE_URL);
}

export async function runScheduledSessionPurge(): Promise<number | null> {
  try {
    const count = await purgeExpiredSessions();
    if (count > 0) {
      logger.info("[sessions] purged expired sessions", { count });
    }
    return count;
  } catch (err) {
    logger.exception("[sessions] expired-session purge failed", err);
    return null;
  }
}

export function startSessionPurgeLoop(
  intervalMs: number = SESSION_PURGE_INTERVAL_MS,
): void {
  if (purgeTimer) return;
  void runScheduledSessionPurge();
  purgeTimer = setInterval(() => {
    void runScheduledSessionPurge();
  }, intervalMs);
  purgeTimer.unref();
}

export function stopSessionPurgeLoop(): void {
  if (!purgeTimer) return;
  clearInterval(purgeTimer);
  purgeTimer = null;
}

export const _internal = {
  isRunning(): boolean {
    return purgeTimer !== null;
  },
};

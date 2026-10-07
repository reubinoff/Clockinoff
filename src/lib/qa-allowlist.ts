// QA seed allowlist shared with #193 (remove-test-users). Match the
// lowercased address. #195 sets users.is_test from this predicate on
// create and backfills the same pattern in drizzle/0006_users_is_test.sql.
export const QA_TEST_EMAIL_PATTERN =
  String.raw`^(gabi|dana|ariel)\.qa\.[a-z0-9.+_-]+@primesec\.ai$`;

const QA_TEST_EMAIL_RE = new RegExp(QA_TEST_EMAIL_PATTERN);

export function isQaTestEmail(email: string): boolean {
  return QA_TEST_EMAIL_RE.test(email.trim().toLowerCase());
}

-- #124: session cookies now carry a raw 256-bit token; the `sessions.id`
-- primary key stores only sha256(token) as lowercase hex. Existing rows
-- hold the plaintext cookie value and cannot be looked up after deploy,
-- so clear them. Everyone must sign in again. Acceptable per #124.
DELETE FROM "sessions";

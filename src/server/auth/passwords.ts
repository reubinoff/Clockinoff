import argon2 from "argon2";

const ARGON2_OPTS = { type: argon2.argon2id } as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Dummy argon2id digest started at module load with the same params as
// `hashPassword` (#149). Login always verifies against either the stored
// hash or this one so unknown-email / Google-only / wrong-password take
// the same CPU path. argon2 0.45 has no hashSync; awaiting the same
// promise is the module-load equivalent.
const DUMMY_PASSWORD_HASH = argon2.hash("clockinoff-login-timing-dummy", ARGON2_OPTS);

export async function dummyPasswordHash(): Promise<string> {
  return DUMMY_PASSWORD_HASH;
}

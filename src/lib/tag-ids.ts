import { z } from "zod";
import { errors } from "@/lib/errors";
import { isUuid } from "@/lib/uuid";

export const MAX_TAG_IDS = 50;

const tagIdSchema = z.string().refine((value) => isUuid(value), {
  message: "Each tag_ids entry must be a UUID",
});

export const tagIdsSchema = z
  .array(tagIdSchema)
  .max(MAX_TAG_IDS, `At most ${MAX_TAG_IDS} tags allowed`);

// Shared boundary for entry/timer writes (#146). Rejects a non-array, more
// than MAX_TAG_IDS items, or a non-UUID element with 400 VALIDATION.
// `undefined` means "caller omitted the field" and becomes an empty list.
export function parseTagIds(value: unknown): string[] {
  if (value === undefined) return [];
  const parsed = tagIdsSchema.safeParse(value);
  if (!parsed.success) {
    const tooMany = Array.isArray(value) && value.length > MAX_TAG_IDS;
    throw errors.validation(tooMany ? `At most ${MAX_TAG_IDS} tags allowed` : "Invalid tag_ids");
  }
  return Array.from(new Set(parsed.data));
}

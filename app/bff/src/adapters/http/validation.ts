/**
 * JSON body validation that speaks the BFF error contract: every error
 * response is `{ error: string }`, here with `code: 'invalid_input'` so a UI can localize it. `@hono/zod-validator`'s default hook emits
 * the raw ZodError instead, which a client renders as `[object Object]`.
 */

import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';

export function zJson<T extends z.ZodTypeAny>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues[0]?.message ?? 'Invalid request body', code: 'invalid_input' },
        400,
      );
    }
  });
}

/** Same contract for query-string parameters (`?limit=…`), whose failures read as `{ error }` too. */
export function zQuery<T extends z.ZodTypeAny>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues[0]?.message ?? 'Invalid query parameters', code: 'invalid_input' },
        400,
      );
    }
  });
}

/**
 * Public waitlist route (no bearer token): the landing page form posts here.
 *
 * Mounted behind its own per-IP rate limit in `app.ts`, like `/auth/*`. It always answers 201,
 * whether the address is new or already on the list, so the endpoint cannot be used to discover
 * who has signed up.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { IWaitlistRepository } from '../../../domain/ports/index.js';
import { normalizeE164 } from '../../../domain/value-objects/phone.js';
import { zJson } from '../validation.js';

const waitlistBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  /** Optional: accepted when it parses as E.164, refused with a format hint when it does not. */
  waNumber: z.string().trim().max(40).optional(),
  useCase: z.string().trim().max(500).optional(),
  /** Preferred language for the invite: `en`, `fr`, `ar` today, any BCP-47-ish tag later. */
  locale: z
    .string()
    .trim()
    .max(16)
    .regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/)
    .optional(),
  // Campaign tags are deliberately opaque here: malformed values are dropped below so they
  // can never turn an otherwise valid waitlist submission into a failed sign-up.
  ref: z.unknown().optional(),
  utm_source: z.unknown().optional(),
  utm_campaign: z.unknown().optional(),
});

function campaignTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  return normalized.length <= 64 && /^[a-z0-9_-]+$/.test(normalized) ? normalized : null;
}

export function waitlistRoutes({ waitlist }: { waitlist: IWaitlistRepository }): Hono {
  const r = new Hono();

  r.post('/', zJson(waitlistBody), async (c) => {
    const body = c.req.valid('json');

    let waNumber: string | null = null;
    if (body.waNumber) {
      waNumber = normalizeE164(body.waNumber);
      if (!waNumber) {
        throw new HTTPException(400, {
          message: 'Enter the WhatsApp number in international format, e.g. +212612345678',
        });
      }
    }

    await waitlist.add({
      email: body.email,
      waNumber,
      useCase: body.useCase ? body.useCase : null,
      locale: body.locale ?? 'en',
      sourceRef: campaignTag(body.ref),
      utmSource: campaignTag(body.utm_source),
      utmCampaign: campaignTag(body.utm_campaign),
    });

    return c.json({ ok: true }, 201);
  });

  return r;
}

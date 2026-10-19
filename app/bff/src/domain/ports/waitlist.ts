/**
 * Waitlist port — leads captured by the public landing page form.
 *
 * Storage only: a waitlist entry is not an account and never becomes one on its own. An admin
 * still adds the number to `allowlisted_numbers` before sign-up accepts it, which is what
 * `POST /admin/waitlist/:id/invite` does; `status` records whether that has happened yet.
 */

export interface WaitlistEntryInput {
  /** Already validated and lower-cased by the route. */
  email: string;
  /** E.164 if the visitor gave a number, otherwise null. */
  waNumber: string | null;
  useCase: string | null;
  locale: string;
  /** Validated campaign tags; invalid or absent values are null. */
  sourceRef?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
}

export type WaitlistStatus = 'pending' | 'invited' | 'rejected' | 'removed';

export type WaitlistEventAction = 'invited' | 'rejected' | 'removed' | 'reopened';

export interface WaitlistEntry extends WaitlistEntryInput {
  id: string;
  /** `invited` once an admin has added the number to the allowlist. */
  status: WaitlistStatus;
  createdAt: Date;
  invitedAt: Date | null;
  removedAt: Date | null;
}

export interface WaitlistEvent {
  id: string;
  waitlistId: string;
  adminId: string;
  action: WaitlistEventAction;
  createdAt: Date;
  fromStatus: WaitlistStatus;
  toStatus: WaitlistStatus;
}

export interface WaitlistQuery {
  /** Narrow the page to one status and/or a case-insensitive email or number search. */
  status?: WaitlistStatus;
  search?: string;
  limit: number;
  offset: number;
}

export interface WaitlistPage {
  entries: WaitlistEntry[];
  /** Entries matching the query, ignoring `limit`/`offset`. */
  total: number;
}

export interface WaitlistSourceCount {
  field: 'ref' | 'utm_source' | 'utm_campaign';
  value: string;
  total: number;
  last7Days: number;
}

export interface IWaitlistRepository {
  /** Idempotent on email: re-submitting an address is accepted and changes nothing. */
  add(entry: WaitlistEntryInput): Promise<void>;
  /** Newest first, paginated. */
  list(query: WaitlistQuery): Promise<WaitlistPage>;
  /** Aggregated counts only; never returns lead or other personal data. */
  sourceCounts(): Promise<WaitlistSourceCount[]>;
  get(id: string): Promise<WaitlistEntry | null>;
  events(id: string): Promise<WaitlistEvent[]>;
  /** Transitions only from pending. Returns false when the lead is in another state. */
  markInvited(id: string, adminId: string): Promise<boolean>;
  reject(id: string, adminId: string): Promise<boolean>;
  remove(id: string, adminId: string): Promise<boolean>;
  reopen(id: string, adminId: string): Promise<boolean>;
}

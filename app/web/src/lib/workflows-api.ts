/**
 * Workflow toggles — thin client for the BFF `/api/workflows` routes.
 */

import { bffFetch } from './bff';
import { getSession } from './session';

export interface WorkflowView {
  id: string;
  description: string;
  enabled: boolean;
}

async function call(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<WorkflowView[]> {
  const session = getSession();
  if (!session) throw new Error('Not signed in');

  // No tenant header: the proxy would drop it, and the BFF is meant to take the tenant from the
  // verified session once the sign-up change lands; until then these routes answer 400 through the proxy.
  const res = await bffFetch(path, {
    method,
    headers: {
      // The BFF derives the tenant from the verified token; the client never names one.
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Workflows request failed (${res.status})`);
  return ((await res.json()) as { workflows: WorkflowView[] }).workflows;
}

export const listWorkflows = () => call('GET', '/api/workflows');

export const setWorkflowEnabled = (id: string, enabled: boolean) =>
  call('PUT', `/api/workflows/${encodeURIComponent(id)}`, { enabled });

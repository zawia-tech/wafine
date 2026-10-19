/**
 * oRPC client — generated from the BFF's oRPC router.
 * For now, this is a placeholder that will be replaced with the generated client.
 */

// TODO: Replace with generated oRPC client, e.g.
// export const client: RouterClient<AppRouter> = createORPCClient(...);
// (`RouterClient` is not exported by @orpc/client@1.15, and the BFF's
// `AppRouter` is not resolvable from this package — both need wiring first.)

export const api = {
  // Placeholder — will be replaced with actual oRPC procedures
  messages: {
    send: async (_input: { plaintext: string; recipientJid: string }) => {
      throw new Error('Not implemented — wire up oRPC client');
    },
    list: async (_input: { limit: number; offset: number }) => {
      throw new Error('Not implemented — wire up oRPC client');
    },
  },
  contacts: {
    search: async (_input: { query: string }) => {
      throw new Error('Not implemented — wire up oRPC client');
    },
    list: async (_input: { limit: number; offset: number }) => {
      throw new Error('Not implemented — wire up oRPC client');
    },
  },
};

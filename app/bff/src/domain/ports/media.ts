/**
 * Read links for chat media the engine archived to object storage.
 *
 * OpenWA's chat-media archive writes each file to the private media bucket under
 * `chat-media/<sessionId>/<file>` and reports that storage key as `mediaPath` on message rows.
 * The bucket has no public hostname, so a short-lived presigned GET is the only direct way in.
 */

export interface IMediaUrlSigner {
  /** Presigned GET for an engine storage key (`chat-media/...`), valid for `ttlSeconds`. */
  presignGet(storageKey: string, ttlSeconds: number): Promise<string>;
}

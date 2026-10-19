/**
 * Domain services — pure business logic, no I/O.
 * These orchestrate crypto operations and enforce invariants.
 */

import type { AadBuilder } from '../value-objects/index.js';
import type {
  EncryptedPayload,
  WrappedKey,
  ICryptoService,
  IBlindIndexService,
} from '../ports/index.js';

export class EncryptionService {
  constructor(
    private readonly crypto: ICryptoService,
    private readonly aadBuilder: typeof AadBuilder,
  ) {}

  /**
   * Encrypt a message payload.
   * AAD binds tenant_id | table | row_id | key_version | schema_version.
   */
  async encryptMessage(
    plaintext: Uint8Array,
    dek: Uint8Array,
    tenantId: string,
    messageId: string,
    keyVersion: number,
  ): Promise<EncryptedPayload> {
    const aad = this.aadBuilder
      .create()
      .tenant(tenantId)
      .table('messages')
      .row(messageId)
      .keyVersion(keyVersion)
      .schemaVersion(1)
      .build();
    return await this.crypto.encrypt(plaintext, dek, aad);
  }

  async decryptMessage(
    payload: EncryptedPayload,
    dek: Uint8Array,
    tenantId: string,
    messageId: string,
    keyVersion: number,
  ): Promise<Uint8Array> {
    const aad = this.aadBuilder
      .create()
      .tenant(tenantId)
      .table('messages')
      .row(messageId)
      .keyVersion(keyVersion)
      .schemaVersion(1)
      .build();
    return await this.crypto.decrypt(payload, dek, aad);
  }

  /**
   * Encrypt a contact name.
   */
  async encryptContactName(
    name: Uint8Array,
    dek: Uint8Array,
    tenantId: string,
    contactId: string,
    keyVersion: number,
  ): Promise<EncryptedPayload> {
    const aad = this.aadBuilder
      .create()
      .tenant(tenantId)
      .table('contacts')
      .row(contactId)
      .keyVersion(keyVersion)
      .schemaVersion(1)
      .build();
    return await this.crypto.encrypt(name, dek, aad);
  }

  async decryptContactName(
    payload: EncryptedPayload,
    dek: Uint8Array,
    tenantId: string,
    contactId: string,
    keyVersion: number,
  ): Promise<Uint8Array> {
    const aad = this.aadBuilder
      .create()
      .tenant(tenantId)
      .table('contacts')
      .row(contactId)
      .keyVersion(keyVersion)
      .schemaVersion(1)
      .build();
    return await this.crypto.decrypt(payload, dek, aad);
  }
}

export class KeyManagementService {
  constructor(private readonly crypto: ICryptoService) {}

  /**
   * Wrap a DEK with the tenant KEK.
   */
  async wrapDek(dek: Uint8Array, kek: Uint8Array): Promise<WrappedKey> {
    return await this.crypto.wrapDek(dek, kek);
  }

  /**
   * Unwrap a DEK with the tenant KEK.
   */
  async unwrapDek(wrapped: WrappedKey, kek: Uint8Array): Promise<Uint8Array> {
    return await this.crypto.unwrapDek(wrapped, kek);
  }

  /**
   * Generate a new DEK.
   */
  async generateDek(): Promise<Uint8Array> {
    return await this.crypto.generateDek();
  }
}

export class BlindIndexService {
  constructor(private readonly blindIndex: IBlindIndexService) {}

  /**
   * Compute a blind index for a phone number (E.164).
   */
  phoneIndex(phone: string, key: Uint8Array): Uint8Array {
    const normalized = this.blindIndex.normalize(phone);
    return this.blindIndex.computeIndex(normalized, key, 'idx/phone/v1');
  }

  /**
   * Compute a blind index for a chat JID.
   */
  jidIndex(jid: string, key: Uint8Array): Uint8Array {
    const normalized = this.blindIndex.normalize(jid);
    return this.blindIndex.computeIndex(normalized, key, 'idx/jid/v1');
  }
}

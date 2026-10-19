/**
 * Domain value objects — immutable, validated at construction.
 */

export class KeyVersion {
  private constructor(
    public readonly version: number,
    public readonly algId: string,
  ) {}

  static create(version: number, algId: string): KeyVersion {
    if (version < 1) throw new Error('Key version must be >= 1');
    if (!algId) throw new Error('Algorithm ID is required');
    return new KeyVersion(version, algId);
  }

  /** Try this version first, fall back to version - 1. */
  fallback(): KeyVersion {
    return new KeyVersion(this.version - 1, this.algId);
  }
}

export class AadBuilder {
  private parts: string[] = [];

  static create(): AadBuilder {
    return new AadBuilder();
  }

  tenant(tenantId: string): this {
    this.parts.push(tenantId);
    return this;
  }

  table(tableName: string): this {
    this.parts.push(tableName);
    return this;
  }

  row(rowId: string): this {
    this.parts.push(rowId);
    return this;
  }

  keyVersion(version: number): this {
    this.parts.push(`v${version}`);
    return this;
  }

  schemaVersion(version: number): this {
    this.parts.push(`s${version}`);
    return this;
  }

  build(): Uint8Array {
    const aadString = this.parts.join('|');
    return new TextEncoder().encode(aadString);
  }
}

export class OpaqueId {
  private constructor(public readonly value: string) {}

  static generate(): OpaqueId {
    // Use crypto.randomUUID() — available in Bun, Node 19+, and browsers
    return new OpaqueId(crypto.randomUUID());
  }

  static fromString(value: string): OpaqueId {
    if (!value) throw new Error('Opaque ID cannot be empty');
    return new OpaqueId(value);
  }

  toString(): string {
    return this.value;
  }
}

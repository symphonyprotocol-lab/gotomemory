import type {
  Memory,
  SyncMemoryEnvelope,
  SyncPullResponse,
  SyncPushResponse
} from "@gotomemory/contracts";

export interface SyncTransport {
  push(envelopes: SyncMemoryEnvelope[]): Promise<SyncPushResponse>;
  pull(sinceRev?: number): Promise<SyncPullResponse>;
}

export class InMemorySyncTransport implements SyncTransport {
  readonly envelopes = new Map<string, SyncMemoryEnvelope>();

  async push(envelopes: SyncMemoryEnvelope[]): Promise<SyncPushResponse> {
    for (const envelope of envelopes) {
      const existing = this.envelopes.get(envelope.id);
      if (!existing || envelope.rev >= existing.rev) {
        this.envelopes.set(envelope.id, structuredClone(envelope));
      }
    }
    return { accepted: envelopes.length };
  }

  async pull(sinceRev = -1): Promise<SyncPullResponse> {
    return {
      envelopes: [...this.envelopes.values()]
        .filter((envelope) => envelope.rev > sinceRev)
        .sort((left, right) => left.rev - right.rev)
        .map((envelope) => structuredClone(envelope))
    };
  }
}

export async function encryptMemory(
  memory: Memory,
  passphrase: string
): Promise<SyncMemoryEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(memory));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded)
  );

  return {
    id: memory.id,
    user_id: memory.user_id,
    rev: memory.rev,
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    updated_at: memory.updated_at,
    deleted_at: memory.deleted_at
  };
}

export async function decryptMemory(
  envelope: SyncMemoryEnvelope,
  passphrase: string
): Promise<Memory> {
  const key = await deriveKey(passphrase, base64ToBytes(envelope.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    toArrayBuffer(base64ToBytes(envelope.ciphertext))
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as Memory;
}

export class EncryptedSyncClient {
  readonly #transport: SyncTransport;
  readonly #passphrase: string;

  constructor(transport: SyncTransport, passphrase: string) {
    this.#transport = transport;
    this.#passphrase = passphrase;
  }

  async push(memories: Memory[]): Promise<SyncPushResponse> {
    return this.#transport.push(
      await Promise.all(memories.map((memory) => encryptMemory(memory, this.#passphrase)))
    );
  }

  async pull(sinceRev?: number): Promise<Memory[]> {
    const response = await this.#transport.pull(sinceRev);
    return Promise.all(
      response.envelopes.map((envelope) => decryptMemory(envelope, this.#passphrase))
    );
  }
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 100_000,
      hash: "SHA-256"
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

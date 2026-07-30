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
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
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
    kdf_iterations: PBKDF2_ITERATIONS,
    updated_at: memory.updated_at,
    deleted_at: memory.deleted_at
  };
}

export async function decryptMemory(
  envelope: SyncMemoryEnvelope,
  passphrase: string
): Promise<Memory> {
  // Honour the envelope's own iteration count so envelopes written before the
  // cost was raised still decrypt.
  const key = await deriveKey(
    passphrase,
    base64ToBytes(envelope.salt),
    envelope.kdf_iterations ?? LEGACY_PBKDF2_ITERATIONS
  );
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

/**
 * OWASP's current floor for PBKDF2-HMAC-SHA256 (was 100_000 here, set years
 * before that guidance moved). The envelope stores its own salt, so raising
 * this only affects newly-derived keys.
 */
const PBKDF2_ITERATIONS = 600_000;

/** What envelopes without a recorded `kdf_iterations` were derived with. */
const LEGACY_PBKDF2_ITERATIONS = 100_000;

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
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
      iterations,
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

// `String.fromCharCode(...bytes)` spreads every byte as an argument and blows
// the call stack somewhere around 100KB — reachable with a single long
// assistant answer. Build the binary string in bounded chunks instead.
const BASE64_CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

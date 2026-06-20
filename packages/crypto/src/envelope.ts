import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Envelope-encrypted blob. The content is sealed with a per-record data key,
 * and the data key itself is wrapped with the tenant master key (system spec §13.1).
 * All binary fields are base64. Safe to persist in `content_encrypted` etc.
 */
export interface EncryptedBlob {
  /** Logical key id (e.g. tenant master key version) — maps to `encryption_key_id`. */
  keyId: string;
  /** IV for the content cipher. */
  iv: string;
  /** GCM auth tag for the content cipher. */
  tag: string;
  /** Wrapped data key, encoded as `iv.tag.ciphertext` (base64 parts). */
  wrappedKey: string;
  /** Content ciphertext. */
  ciphertext: string;
}

interface AesParts {
  iv: Buffer;
  tag: Buffer;
  ct: Buffer;
}

function aesEncrypt(key: Buffer, plaintext: Buffer): AesParts {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function aesDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * AES-256-GCM envelope cipher. One instance wraps one master key; rotate by
 * constructing a new instance with a new `keyId` (re-encryption is background work).
 */
export class EnvelopeCipher {
  private readonly masterKey: Buffer;
  readonly keyId: string;

  constructor(masterKey: Buffer, keyId = "master-1") {
    if (masterKey.length !== 32) {
      throw new Error(`master key must be 32 bytes, got ${masterKey.length}`);
    }
    this.masterKey = masterKey;
    this.keyId = keyId;
  }

  static fromBase64Key(b64: string, keyId = "master-1"): EnvelopeCipher {
    return new EnvelopeCipher(Buffer.from(b64, "base64"), keyId);
  }

  static generateMasterKey(): Buffer {
    return randomBytes(32);
  }

  encrypt(plaintext: string): EncryptedBlob {
    const dataKey = randomBytes(32);
    const content = aesEncrypt(dataKey, Buffer.from(plaintext, "utf8"));
    const wrapped = aesEncrypt(this.masterKey, dataKey);
    const wrappedKey = [wrapped.iv, wrapped.tag, wrapped.ct]
      .map((b) => b.toString("base64"))
      .join(".");
    return {
      keyId: this.keyId,
      iv: content.iv.toString("base64"),
      tag: content.tag.toString("base64"),
      wrappedKey,
      ciphertext: content.ct.toString("base64"),
    };
  }

  decrypt(blob: EncryptedBlob): string {
    const parts = blob.wrappedKey.split(".");
    if (parts.length !== 3) {
      throw new Error("malformed wrappedKey");
    }
    const [wiv, wtag, wct] = parts.map((s) => Buffer.from(s, "base64"));
    const dataKey = aesDecrypt(this.masterKey, wiv!, wtag!, wct!);
    const pt = aesDecrypt(
      dataKey,
      Buffer.from(blob.iv, "base64"),
      Buffer.from(blob.tag, "base64"),
      Buffer.from(blob.ciphertext, "base64"),
    );
    return pt.toString("utf8");
  }
}

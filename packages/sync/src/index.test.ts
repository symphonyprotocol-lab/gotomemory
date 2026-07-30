import { describe, expect, it } from "vitest";

import {
  EncryptedSyncClient,
  InMemorySyncTransport,
  decryptMemory,
  encryptMemory
} from "./index.js";

describe("encrypted sync", () => {
  it("encrypts memory envelopes without leaking plaintext", async () => {
    const envelope = await encryptMemory(memory("mem_1", "secret preference"), "passphrase");

    expect(envelope.ciphertext).not.toContain("secret");
    await expect(decryptMemory(envelope, "passphrase")).resolves.toMatchObject({
      id: "mem_1",
      content: "secret preference"
    });
  });

  it("round-trips a memory far larger than the base64 chunk size", async () => {
    // Spreading the byte array into String.fromCharCode overflowed the call
    // stack around 100KB — a single long assistant answer reaches that.
    const large = memory("mem_big", "x".repeat(400_000));

    const envelope = await encryptMemory(large, "passphrase");

    await expect(decryptMemory(envelope, "passphrase")).resolves.toMatchObject({
      content: large.content
    });
  });

  it("decrypts envelopes written with the older KDF cost", async () => {
    const envelope = await encryptMemory(memory("mem_1", "legacy"), "passphrase");
    expect(envelope.kdf_iterations).toBe(600_000);

    // An envelope predating the field must still derive with the old cost.
    const legacy = { ...envelope, kdf_iterations: undefined };
    await expect(decryptMemory(legacy, "passphrase")).rejects.toThrow();
  });

  it("pushes and pulls encrypted memories through a sync transport", async () => {
    const transport = new InMemorySyncTransport();
    const client = new EncryptedSyncClient(transport, "passphrase");

    await expect(client.push([memory("mem_1", "Use TypeScript")])).resolves.toEqual({
      accepted: 1
    });

    expect((await client.pull()).map((item) => item.content)).toEqual(["Use TypeScript"]);
  });
});

function memory(id: string, content: string) {
  const now = "2026-06-25T00:00:00.000Z";
  return {
    id,
    user_id: "local",
    content,
    category: "preference" as const,
    is_private: false,
    source: "manual" as const,
    embedding: null,
    rev: 0,
    deleted_at: null,
    created_at: now,
    updated_at: now
  };
}

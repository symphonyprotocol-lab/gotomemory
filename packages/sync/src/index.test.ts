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

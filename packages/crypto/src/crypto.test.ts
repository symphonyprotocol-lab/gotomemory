import { describe, expect, it } from "vitest";
import { EnvelopeCipher } from "./envelope.js";
import { containsSensitivePattern, makePreview, redact } from "./redact.js";

describe("EnvelopeCipher", () => {
  const cipher = new EnvelopeCipher(EnvelopeCipher.generateMasterKey());

  it("round-trips plaintext", () => {
    const blob = cipher.encrypt("用户偏好 TypeScript");
    expect(blob.ciphertext).not.toContain("TypeScript");
    expect(cipher.decrypt(blob)).toBe("用户偏好 TypeScript");
  });

  it("produces unique ciphertext per call (random data key + iv)", () => {
    const a = cipher.encrypt("same");
    const b = cipher.encrypt("same");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });

  it("detects tampering via the GCM auth tag", () => {
    const blob = cipher.encrypt("secret value");
    const tampered = { ...blob, ciphertext: Buffer.from("evil").toString("base64") };
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("cannot be decrypted with a different master key", () => {
    const blob = cipher.encrypt("hello");
    const other = new EnvelopeCipher(EnvelopeCipher.generateMasterKey());
    expect(() => other.decrypt(blob)).toThrow();
  });

  it("rejects a wrong-sized master key", () => {
    expect(() => new EnvelopeCipher(Buffer.alloc(16))).toThrow();
  });
});

describe("redact", () => {
  it("masks emails, keys, card- and ssn-like numbers", () => {
    expect(redact("reach me at a.b@x.io")).toBe("reach me at [email]");
    expect(redact("token sk-ABCDEFGH1234")).toBe("token [key]");
    expect(redact("card 4111 1111 1111 1111")).toContain("[number]");
    expect(redact("ssn 123-45-6789")).toBe("ssn [id]");
  });

  it("flags sensitive patterns for classification", () => {
    expect(containsSensitivePattern("ghp_0123456789abcdef")).toBe(true);
    expect(containsSensitivePattern("just a normal preference")).toBe(false);
  });

  it("builds a capped, redacted preview", () => {
    expect(makePreview("contact a@b.io")).toBe("contact [email]");
    expect(makePreview("word ".repeat(40)).length).toBe(140);
  });
});

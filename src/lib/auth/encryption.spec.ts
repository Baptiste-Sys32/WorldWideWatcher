/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { beforeEach, describe, it, expect } from "vitest";
import { encryptCredential, decryptCredential } from "./encryption";

const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function encryptLegacyCredential(plainText: string, masterKey: string) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
    let ciphertext = cipher.update(plainText, "utf8", "base64");
    ciphertext += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");
    return {
        version: "v1",
        salt: salt.toString("base64"),
        nonce: nonce.toString("base64"),
        ciphertext: `${ciphertext}.${authTag}`,
    };
}

describe("AES-256-GCM Encryption with PBKDF2", () => {
    beforeEach(() => {
        process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars";
        process.env.ENCRYPTION_MASTER_KEY = "legacy-master-key-at-least-32-chars";
    });

    it("should correctly encrypt and decrypt a string", async () => {
        const secret = "my-super-secret-api-key";

        const encrypted = await encryptCredential(secret);
        expect(encrypted).toHaveProperty("version", "v2");
        expect(encrypted).toHaveProperty("salt");
        expect(encrypted).toHaveProperty("nonce");
        expect(encrypted).toHaveProperty("ciphertext");

        const decrypted = await decryptCredential(encrypted);
        expect(decrypted).toBe(secret);
    });

    it("should still decrypt legacy v1 credentials", async () => {
        const secret = "legacy-secret";
        const encrypted = encryptLegacyCredential(secret, process.env.ENCRYPTION_MASTER_KEY!);

        await expect(decryptCredential(encrypted)).resolves.toBe(secret);
    });

    it("should fail to encrypt without AUTH_SECRET", async () => {
        delete process.env.AUTH_SECRET;

        await expect(encryptCredential("secret")).rejects.toThrow("AUTH_SECRET is not set");
    });

    it("should fail to decrypt with wrong payload", async () => {
        const secret = "secret";
        const encrypted = await encryptCredential(secret);

        const tampered = { ...encrypted as any, ciphertext: `tampered.${(encrypted as any).ciphertext.split(".")[1]}` };

        await expect(decryptCredential(tampered)).rejects.toThrow();
    });

    it("should throw on corrupted data", async () => {
        const encrypted = await encryptCredential("test-secret");
        const corrupted = { ...encrypted, ciphertext: "invalid-base64-or-corrupted" };
        await expect(decryptCredential(corrupted)).rejects.toThrow();
    });

    it("should reject unsupported credential versions", async () => {
        const encrypted = await encryptCredential("test-secret");
        await expect(decryptCredential({ ...encrypted, version: "v99" })).rejects.toThrow("Unsupported credential version");
    });
});

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const CURRENT_VERSION = "v2";
const LEGACY_VERSION = "v1";
const LEGACY_MASTER_KEY = "00000000000000000000000000000000";

export interface EncryptedCredential {
    version: string;
    salt: string;
    nonce: string;
    ciphertext: string;
}

function getCurrentMasterKey(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("AUTH_SECRET is not set");
    }
    return secret;
}

function getLegacyMasterKey(): string {
    return process.env.ENCRYPTION_MASTER_KEY || LEGACY_MASTER_KEY;
}

function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(masterKey, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
            if (err) return reject(err);
            resolve(key);
        });
    });
}

export async function encryptCredential(plainText: string): Promise<EncryptedCredential> {
    const salt = crypto.randomBytes(16);
    const key = await deriveKey(getCurrentMasterKey(), salt);
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);

    let ciphertext = cipher.update(plainText, "utf8", "base64");
    ciphertext += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");

    return {
        version: CURRENT_VERSION,
        salt: salt.toString("base64"),
        nonce: nonce.toString("base64"),
        ciphertext: `${ciphertext}.${authTag}`
    };
}

export async function decryptCredential(cred: EncryptedCredential): Promise<string> {
    if (cred.version !== CURRENT_VERSION && cred.version !== LEGACY_VERSION) {
        throw new Error(`Unsupported credential version: ${cred.version}`);
    }

    const salt = Buffer.from(cred.salt, "base64");
    const nonce = Buffer.from(cred.nonce, "base64");
    const payloadParts = cred.ciphertext.split(".");
    if (payloadParts.length !== 2) {
        throw new Error("Invalid ciphertext payload");
    }

    const ciphertext = payloadParts[0];
    const authTag = Buffer.from(payloadParts[1], "base64");
    const masterKey = cred.version === CURRENT_VERSION ? getCurrentMasterKey() : getLegacyMasterKey();
    const key = await deriveKey(masterKey, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(authTag);

    let plainText = decipher.update(ciphertext, "base64", "utf8");
    plainText += decipher.final("utf8");
    return plainText;
}

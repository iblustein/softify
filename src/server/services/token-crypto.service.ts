import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard IV length for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a consistent 32-byte key from the configured SHOPIFY_TOKEN_ENCRYPTION_KEY environment variable.
 */
function getKey(): Buffer | null {
  const rawKey = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) return null;
  
  // Use SHA-256 to ensure key is exactly 32 bytes (256 bits)
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts a Shopify access token using AES-256-GCM if the key is configured.
 * Falls back to an insecure development-only format if missing.
 * 
 * TODO: For production Google Cloud Run deployments, replace this local key-based
 * encryption with Google Cloud KMS (Key Management Service) API integration.
 */
export async function encryptAccessToken(token: string): Promise<string> {
  if (!token) {
    throw new Error("Cannot encrypt empty token");
  }

  const key = getKey();
  if (!key) {
    // Local development fallback
    if (process.env.NODE_ENV === "production") {
      throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY must be configured in a production environment!");
    }
    
    // Insecure placeholder with TODO
    console.warn(
      "[TOKEN CRYPTO] WARNING: SHOPIFY_TOKEN_ENCRYPTION_KEY env var is missing. Using insecure fallback base64 encryption."
    );
    return `insecure_fallback_enc_${Buffer.from(token).toString("base64")}`;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Return formatted payload: IV:AuthTag:EncryptedContent all in hex
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an encrypted access token.
 */
export async function decryptAccessToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken) {
    throw new Error("Cannot decrypt empty token");
  }

  // Handle development insecure fallback
  if (encryptedToken.startsWith("insecure_fallback_enc_")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Insecure token fallback format rejected in production environment!");
    }
    const base64 = encryptedToken.replace("insecure_fallback_enc_", "");
    return Buffer.from(base64, "base64").toString("utf8");
  }

  const key = getKey();
  if (!key) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is required to decrypt this token.");
  }

  const parts = encryptedToken.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token structure.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

import crypto from "crypto";
import env    from "../config/env";

const ALGORITHM  = "aes-256-gcm";
const KEY        = Buffer.from(env.ENCRYPTION_KEY, "hex");
const IV_LENGTH  = 16;

export const encrypt = (text: string): string | null => {
  if (!text) return null;

  const iv        = crypto.randomBytes(IV_LENGTH);
  const cipher    = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag       = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decrypt = (encryptedText: string | null | undefined): string | null => {
  if (!encryptedText) return null;

  try {
    const [ivHex, tagHex, dataHex] = encryptedText.split(":");
    const iv       = Buffer.from(ivHex,  "hex");
    const tag      = Buffer.from(tagHex, "hex");
    const data     = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
};


// Only used for lookup queries
export const hashForLookup = (text: string | null | undefined): string | null => {
  if (!text) return null;
  return crypto
    .createHmac("sha256", env.ENCRYPTION_KEY)
    .update(String(text).toLowerCase().trim())
    .digest("hex");
};
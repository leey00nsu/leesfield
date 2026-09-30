import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@/server/db/prisma";

const KEY_ENV = "MODEL_CREDENTIAL_ENCRYPTION_KEY";

function encryptionKey(): Buffer {
  const encoded = process.env[KEY_ENV]?.trim();
  if (!encoded) throw new Error("MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID");
  }
  return key;
}

export function encryptModelApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (!value || value.length > 8192) throw new Error("MODEL_API_KEY_INVALID");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptModelApiKey(credential: { ciphertext: string; iv: string; tag: string }): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(credential.iv, "base64"));
  decipher.setAuthTag(Buffer.from(credential.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getLlmModelApiKey(modelKey: string): Promise<string> {
  const model = await prisma.modelCatalog.findUnique({
    where: { key: modelKey },
    select: { type: true, isActive: true, credential: { select: { ciphertext: true, iv: true, tag: true } } },
  });
  if (!model || model.type !== "llm" || !model.isActive) throw new Error("LLM_MODEL_UNAVAILABLE");
  if (!model.credential) throw new Error("LLM_API_KEY_MISSING");
  return decryptModelApiKey(model.credential);
}

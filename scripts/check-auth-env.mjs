import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const missing = [];

if (!process.env.ADMIN_PASSWORD_HASH) {
  missing.push("ADMIN_PASSWORD_HASH");
}

if (missing.length > 0) {
  console.error("[env] 필수 값이 없습니다:", missing.join(", "));
  console.error("[env] 해시 생성: pnpm gen:admin-password-hash");
  console.error("[env] .env에 ADMIN_PASSWORD_HASH를 추가하세요.");
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

if (!missing.includes("ADMIN_PASSWORD_HASH")) {
  const decoded = Buffer.from(
    process.env.ADMIN_PASSWORD_HASH,
    "base64url"
  ).toString("utf8");
  if (!decoded.startsWith("$2")) {
    console.error(
      "[env] ADMIN_PASSWORD_HASH는 base64url 인코딩된 bcrypt 해시여야 합니다.",
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
}

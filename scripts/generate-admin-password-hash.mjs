import readline from "node:readline";
import bcrypt from "bcryptjs";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const PROMPT = "관리자 비밀번호를 입력하세요: ";

rl.stdoutMuted = false;
rl._writeToOutput = function (stringToWrite) {
  if (this.stdoutMuted) {
    if (stringToWrite === PROMPT) {
      this.output.write(stringToWrite);
      return;
    }
    if (stringToWrite.trim().length > 0) {
      this.output.write("*");
    }
    return;
  }
  this.output.write(stringToWrite);
};

const askHidden = (question) =>
  new Promise((resolve) => {
    rl.stdoutMuted = true;
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      resolve(answer);
    });
  });

const password = (await askHidden(PROMPT)).trim();
rl.close();

if (!password) {
  console.error("비밀번호가 비어있습니다.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const encodedHash = Buffer.from(hash, "utf8").toString("base64url");

console.log(`\nADMIN_PASSWORD_HASH=${encodedHash}`);
console.log(".env에 위 값을 추가하세요. (base64url)");

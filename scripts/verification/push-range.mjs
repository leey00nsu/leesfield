import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execute = promisify(execFile);
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const zero = /^0+$/;
const git = async (root, args) => (await execute("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })).stdout.trim();

export async function readPushInput(stream) {
  let input = "";
  stream.setEncoding?.("utf8");
  for await (const chunk of stream) {
    input += chunk;
    if (Buffer.byteLength(input) > 1_048_576) throw new Error("PUSH_INPUT_TOO_LARGE");
  }
  return input;
}

export function parsePushInput(input) {
  const lines = input.trim().split(/\r?\n/);
  if (!input.trim() || lines.length > 256) throw new Error("PUSH_INPUT_INVALID");
  return lines.map(line => {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !objectId.test(fields[1]) || !objectId.test(fields[3]) ||
      !fields[2].startsWith("refs/") || (!fields[0].startsWith("refs/") && fields[0] !== "HEAD" && fields[0] !== "(delete)")) throw new Error("PUSH_INPUT_INVALID");
    return { localRef: fields[0], localOid: fields[1], remoteRef: fields[2], remoteOid: fields[3] };
  });
}

export async function resolvePushRange(root, input) {
  const refs = parsePushInput(input);
  for (const ref of refs) {
    try {
      await git(root, ["check-ref-format", ref.remoteRef]);
      if (ref.localRef.startsWith("refs/")) await git(root, ["check-ref-format", ref.localRef]);
    } catch { throw new Error("PUSH_INPUT_INVALID"); }
  }
  const updates = refs.filter(ref => !zero.test(ref.localOid));
  if (!updates.length) return { refs, deletionOnly: true };
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (await git(root, ["status", "--porcelain=v1", "--untracked-files=all"])) throw new Error("PUSH_CHECKOUT_DIRTY");
  const bases = new Set(), problems = [];
  for (const ref of updates) {
    let localCommit;
    try { localCommit = await git(root, ["rev-parse", "--verify", ref.localOid + "^{commit}"]); }
    catch { throw new Error("PUSH_COMMIT_UNAVAILABLE"); }
    if (head !== localCommit) throw new Error("PUSH_COMMIT_NOT_CHECKED_OUT");
    if (zero.test(ref.remoteOid)) problems.push("new remote ref");
    else {
      try { bases.add(await git(root, ["rev-parse", "--verify", ref.remoteOid + "^{commit}"])); }
      catch { problems.push("remote commit unavailable locally"); }
    }
  }
  const tree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const payload = { refs, head, tree, bases: [...bases].sort(), rangeProblem: problems.length ? [...new Set(problems)].join("; ") : null };
  return { ...payload, input, deletionOnly: false, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

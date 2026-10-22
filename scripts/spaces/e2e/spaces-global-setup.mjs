import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export default async function setup(config) {
  // FullConfig includes CLI overrides, so direct Playwright runs also obey the
  // same concurrency limit as SPACES_E2E_WORKERS in the config.
  if (!Number.isInteger(config.workers) || config.workers < 1 || config.workers > 4) {
    throw new Error("Spaces E2E workers must be between 1 and 4");
  }

  const suppliedDirectory = process.env.SPACES_E2E_LOCK_DIR;
  if (suppliedDirectory) {
    // The isolated wrapper owns this directory and its cleanup.
    await mkdir(suppliedDirectory, { recursive: true });
    return;
  }

  const directory = await mkdtemp(path.join(tmpdir(), "leesfield-spaces-e2e-locks-"));
  process.env.SPACES_E2E_LOCK_DIR = directory;
  return async () => {
    await rm(directory, { recursive: true, force: true });
    if (suppliedDirectory === undefined) delete process.env.SPACES_E2E_LOCK_DIR;
    else process.env.SPACES_E2E_LOCK_DIR = suppliedDirectory;
  };
}

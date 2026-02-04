import { LeemageClient } from "@/shared/lib/leemage-sdk";

type LeemageConfig = {
  apiKey: string;
  baseUrl?: string;
  projectId: string;
};

let cachedClient: LeemageClient | null = null;
let cachedConfig: LeemageConfig | null = null;

function getMissingLeemageEnv() {
  const requiredLeemageEnv = [
    ["LEEMAGE_API_KEY", process.env.LEEMAGE_API_KEY],
    ["LEEMAGE_PROJECT_ID", process.env.LEEMAGE_PROJECT_ID],
  ] as const;

  return requiredLeemageEnv
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function getLeemageConfig(): LeemageConfig {
  const missingLeemageEnv = getMissingLeemageEnv();
  if (missingLeemageEnv.length > 0) {
    throw new Error(`LEEMAGE 설정이 필요합니다: ${missingLeemageEnv.join(", ")}`);
  }

  return {
    apiKey: process.env.LEEMAGE_API_KEY as string,
    baseUrl: process.env.LEEMAGE_BASE_URL,
    projectId: process.env.LEEMAGE_PROJECT_ID as string,
  };
}

function getLeemageClient() {
  const config = getLeemageConfig();
  if (
    !cachedClient ||
    !cachedConfig ||
    cachedConfig.apiKey !== config.apiKey ||
    cachedConfig.baseUrl !== config.baseUrl ||
    cachedConfig.projectId !== config.projectId
  ) {
    cachedClient = new LeemageClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeout: 20_000,
    });
    cachedConfig = config;
  }

  return cachedClient;
}

export type DeleteLeemageFilesByPrefixResult = {
  matchedCount: number;
  deletedCount: number;
};

export async function deleteLeemageFilesByPrefix(
  prefix: string,
): Promise<DeleteLeemageFilesByPrefixResult> {
  const client = getLeemageClient();
  const { projectId } = getLeemageConfig();

  const project = await client.projects.get(projectId);
  const targets = project.files.filter((file) => file.name.startsWith(prefix));

  for (const file of targets) {
    await client.files.delete(projectId, file.id);
  }

  return { matchedCount: targets.length, deletedCount: targets.length };
}


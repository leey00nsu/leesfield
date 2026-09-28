import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockOpen = vi.fn();

vi.mock("fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock("@/utils/pathValidation", () => ({
  validateWorkflowPath: (p: string) => {
    if (p.includes("..")) return { valid: false, resolved: p, error: "Path contains traversal sequences" };
    if (!p.startsWith("/")) return { valid: false, resolved: p, error: "Path must be absolute" };
    if (p.startsWith("/etc")) return { valid: false, resolved: p, error: "Access to /etc is not allowed" };
    return { valid: true, resolved: p };
  },
}));

import { GET } from "../route";

function createRequest(path?: string): NextRequest {
  const url = path
    ? `http://localhost/api/list-workflows?path=${encodeURIComponent(path)}`
    : "http://localhost/api/list-workflows";
  return new NextRequest(url);
}

function makeWorkflowHeader(name?: string): string {
  if (name) {
    return `{"version":1,"name":"${name}","nodes":[]}`;
  }
  return '{"version":1,"nodes":[{"id":"1"}],"edges":[]}';
}

function makeBufReader(content: string) {
  const srcBuf = Buffer.from(content);
  return {
    read: vi.fn().mockImplementation(async (buf: Buffer) => {
      srcBuf.copy(buf, 0, 0, Math.min(srcBuf.length, buf.length));
      return { bytesRead: Math.min(srcBuf.length, buf.length) };
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// Directory entry helpers
function dirEntry(name: string) {
  return { name, isDirectory: () => true };
}
function fileEntry(name: string) {
  return { name, isDirectory: () => false };
}

// Filesystem layout definition — maps path to directory entries or file list
type FsLayout = Record<string, (ReturnType<typeof dirEntry> | ReturnType<typeof fileEntry>)[] | string[]>;

function setupFs(layout: FsLayout, files: Record<string, string> = {}) {
  mockReaddir.mockImplementation(async (dirPath: string, opts?: { withFileTypes?: boolean }) => {
    const entries = layout[dirPath];
    if (!entries) throw new Error(`ENOENT: no such directory '${dirPath}'`);
    // If called withFileTypes, return the dirent-like objects; otherwise return string[]
    if (opts?.withFileTypes) {
      // Entries should be dirent objects
      return entries;
    }
    // Plain readdir (used inside probeWorkflow) — return string[]
    return entries as string[];
  });

  mockOpen.mockImplementation(async (filePath: string) => {
    const content = files[filePath];
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return makeBufReader(content);
  });
}

describe("/api/list-workflows route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parameter validation", () => {
    it("should return 400 when path parameter is missing", async () => {
      const response = await GET(createRequest());
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Path parameter required");
    });

    it("should return 400 for path traversal attempts", async () => {
      const response = await GET(createRequest("/home/user/../etc/passwd"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("traversal");
    });

    it("should return 400 for dangerous system paths", async () => {
      const response = await GET(createRequest("/etc/config"));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe("directory probing", () => {
    it("should return empty array when parent has no subdirectories", async () => {
      setupFs({
        "/home/user/projects": [],
      });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toEqual([]);
    });

    it("should skip subdirectories without JSON files", async () => {
      setupFs({
        "/home/user/projects": [dirEntry("empty-dir")],
        "/home/user/projects/empty-dir": [],
      });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toEqual([]);
    });

    it("should detect a valid workflow and extract name from header", async () => {
      setupFs(
        {
          "/home/user/projects": [dirEntry("my-project")],
          "/home/user/projects/my-project": ["workflow.json"],
        },
        {
          "/home/user/projects/my-project/workflow.json": makeWorkflowHeader("Cool Project"),
        }
      );
      mockStat.mockResolvedValue({ mtimeMs: 1700000000000 });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toHaveLength(1);
      expect(data.workflows[0].name).toBe("Cool Project");
      expect(data.workflows[0].directoryPath).toBe("/home/user/projects/my-project");
      expect(data.workflows[0].relativePath).toBe("my-project");
      expect(data.workflows[0].lastModified).toBe(1700000000000);
    });

    it("should skip JSON files that are not workflow files", async () => {
      setupFs(
        {
          "/home/user/projects": [dirEntry("my-project")],
          "/home/user/projects/my-project": ["package.json"],
        },
        {
          "/home/user/projects/my-project/package.json": '{"name":"my-app","version":"1.0.0","dependencies":{}}',
        }
      );

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toEqual([]);
    });

    it("should fall back to directory name when workflow has no name field", async () => {
      setupFs(
        {
          "/home/user/projects": [dirEntry("unnamed-project")],
          "/home/user/projects/unnamed-project": ["workflow.json"],
        },
        {
          "/home/user/projects/unnamed-project/workflow.json": makeWorkflowHeader(),
        }
      );
      mockStat.mockResolvedValue({ mtimeMs: 1700000000000 });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toHaveLength(1);
      expect(data.workflows[0].name).toBe("unnamed-project");
    });

    it("should sort workflows by most recently modified first", async () => {
      setupFs(
        {
          "/home/user/projects": [dirEntry("old-project"), dirEntry("new-project")],
          "/home/user/projects/old-project": ["workflow.json"],
          "/home/user/projects/new-project": ["workflow.json"],
        },
        {
          "/home/user/projects/old-project/workflow.json": makeWorkflowHeader("Old"),
          "/home/user/projects/new-project/workflow.json": makeWorkflowHeader("New"),
        }
      );

      mockStat
        .mockResolvedValueOnce({ mtimeMs: 1600000000000 })
        .mockResolvedValueOnce({ mtimeMs: 1700000000000 });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toHaveLength(2);
      expect(data.workflows[0].lastModified).toBe(1700000000000);
      expect(data.workflows[1].lastModified).toBe(1600000000000);
    });
  });

  describe("recursive discovery", () => {
    it("should discover workflows in nested subdirectories", async () => {
      setupFs(
        {
          "/home/user/projects": [dirEntry("top-project"), dirEntry("category")],
          "/home/user/projects/top-project": ["workflow.json"],
          "/home/user/projects/category": [dirEntry("nested-project")],
          "/home/user/projects/category/nested-project": ["workflow.json"],
        },
        {
          "/home/user/projects/top-project/workflow.json": makeWorkflowHeader("Top Project"),
          "/home/user/projects/category/nested-project/workflow.json": makeWorkflowHeader("Nested Project"),
        }
      );
      mockStat.mockResolvedValue({ mtimeMs: 1700000000000 });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toHaveLength(2);

      const names = data.workflows.map((w: { name: string }) => w.name);
      expect(names).toContain("Top Project");
      expect(names).toContain("Nested Project");

      const nested = data.workflows.find((w: { name: string }) => w.name === "Nested Project");
      expect(nested.relativePath).toBe("category/nested-project");

      const top = data.workflows.find((w: { name: string }) => w.name === "Top Project");
      expect(top.relativePath).toBe("top-project");
    });

    it("should skip hidden directories and node_modules", async () => {
      setupFs(
        {
          "/home/user/projects": [
            dirEntry("good-project"),
            dirEntry(".hidden"),
            dirEntry("node_modules"),
            dirEntry(".git"),
          ],
          "/home/user/projects/good-project": ["workflow.json"],
          // These should never be read — if they are, the mock will return entries
          // but we don't set up workflow files so they'd be empty anyway
          "/home/user/projects/.hidden": [dirEntry("secret")],
          "/home/user/projects/node_modules": [dirEntry("some-package")],
          "/home/user/projects/.git": [dirEntry("objects")],
        },
        {
          "/home/user/projects/good-project/workflow.json": makeWorkflowHeader("Good"),
        }
      );
      mockStat.mockResolvedValue({ mtimeMs: 1700000000000 });

      const response = await GET(createRequest("/home/user/projects"));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.workflows).toHaveLength(1);
      expect(data.workflows[0].name).toBe("Good");

      // Verify hidden/skip dirs were never traversed as withFileTypes (recursive collection)
      const readdirCalls = mockReaddir.mock.calls;
      const withFileTypeCalls = readdirCalls
        .filter((call: unknown[]) => call[1]?.withFileTypes)
        .map((call: unknown[]) => call[0]);
      expect(withFileTypeCalls).not.toContain("/home/user/projects/.hidden");
      expect(withFileTypeCalls).not.toContain("/home/user/projects/node_modules");
      expect(withFileTypeCalls).not.toContain("/home/user/projects/.git");
    });
  });

  describe("error handling", () => {
    it("should return 500 when readdir fails on parent directory", async () => {
      mockReaddir.mockRejectedValue(new Error("ENOENT: no such directory"));

      const response = await GET(createRequest("/home/user/nonexistent"));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain("ENOENT");
    });
  });
});

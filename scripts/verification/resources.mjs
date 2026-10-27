import { execFile } from "node:child_process";
import { loadavg } from "node:os";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const exec = promisify(execFile);

export async function readHostPressure(platform = process.platform) {
  try {
    if (platform === "darwin") {
      const { stdout } = await exec("sysctl", ["-n", "kern.memorystatus_vm_pressure_level", "vm.swapusage"], { timeout: 2_000 });
      const level = Number(stdout.split("\n")[0]);
      const memoryPressure = { 1: "normal", 2: "warning", 4: "critical" }[level];
      const swap = Number(stdout.match(/used = ([\d.]+)M/)?.[1]);
      if (!memoryPressure || !Number.isFinite(swap)) return { status: "unavailable" };
      return { status: "observed", memoryPressure, swapUsedBytes: Math.round(swap * 1024 ** 2), constrained: level !== 1 };
    }
    if (platform === "linux") {
      const text = await readFile("/proc/pressure/memory", "utf8");
      const fullAvg10 = Number(text.match(/^full avg10=([\d.]+)/m)?.[1]);
      if (!Number.isFinite(fullAvg10)) return { status: "unavailable" };
      return { status: "observed", memoryStallFullAvg10: fullAvg10, constrained: fullAvg10 > 0 };
    }
    return { status: "unsupported" };
  } catch { return { status: "unavailable" }; }
}

// ps is asked for numeric fields only. Never collect command lines or env.
export function summarizeProcessTree(table, rootPid) {
  const rows = table.trim().split("\n").map(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)$/);
    return match ? { pid: Number(match[1]), parent: Number(match[2]), cpu: Number(match[3]), rssKiB: Number(match[4]) } : null;
  }).filter(row => row && Object.values(row).every(Number.isFinite));
  if (!rows.some(row => row.pid === rootPid)) return null;
  const owned = new Set([rootPid]);
  let changed;
  do {
    changed = false;
    for (const row of rows) if (owned.has(row.parent) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
  } while (changed);
  const selected = rows.filter(row => owned.has(row.pid));
  return { processes: selected.length,
    cpuLifetimePercent: Math.round(selected.reduce((sum, row) => sum + row.cpu, 0) * 10) / 10,
    rssBytes: selected.reduce((sum, row) => sum + row.rssKiB * 1024, 0) };
}

export function createResourceMonitor({ rootPid = process.pid, intervalMs = 1000, platform = process.platform,
  readTable = async () => (await exec("ps", ["-axo", "pid=,ppid=,pcpu=,rss="], { timeout: 2_000, maxBuffer: 4 * 1024 * 1024 })).stdout,
  readLoad = loadavg, readHost = () => readHostPressure(platform) } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs < 100) throw new Error("Invalid resource sampling interval");
  const started = Date.now(), samples = [];
  const supported = ["darwin", "linux"].includes(platform);
  let timer, pending, failures = 0, stopped = false;
  async function sample() {
    try {
      const [table, hostPressure] = await Promise.all([readTable(), readHost()]);
      const tree = summarizeProcessTree(table, rootPid), load = readLoad();
      if (!tree || load.length !== 3 || !load.every(Number.isFinite)) throw new Error("Unavailable sample");
      samples.push({ elapsedMs: Date.now() - started, ...tree, hostLoad: load, hostPressure });
    } catch { failures++; }
  }
  function schedule() {
    timer = setTimeout(() => {
      pending = sample().finally(() => { pending = null; if (!stopped) schedule(); });
    }, intervalMs);
    timer.unref();
  }
  return {
    memoryConstrained() { return samples.some(sample => sample.hostPressure?.constrained === true); },
    start() { if (!supported || timer || stopped) return; schedule(); },
    async stop() {
      if (!stopped) {
        stopped = true; clearTimeout(timer); await pending;
        if (supported) await sample();
      }
      return {
        schemaVersion: 1, status: !supported ? "unsupported" : !samples.length ? "unavailable" : failures ? "partial" : "observed",
        intervalMs, failedSamples: failures, samples,
        peakRssBytes: samples.length ? Math.max(...samples.map(row => row.rssBytes)) : null,
        peakCpuLifetimePercent: samples.length ? Math.max(...samples.map(row => row.cpuLifetimePercent)) : null,
        limitations: ["Owned process tree only; detached Docker VM and unrelated apps excluded",
          "Summed RSS can count shared pages more than once",
          "ps CPU is a lifetime average per process, not instantaneous saturation",
          "Host load and pressure include other applications; they do not attribute a responsible app",
          "Host pressure is optional OS data; swap used includes earlier activity; thermal is not measured"],
      };
    },
  };
}

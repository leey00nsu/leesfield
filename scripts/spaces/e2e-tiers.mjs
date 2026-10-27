import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("./e2e-tiers.json", import.meta.url), "utf8"));
const identity = (title, project) => JSON.stringify([title.split(" › ").at(-1), project]);
const entries = new Map(manifest.cases.map(item => [identity(item.title, item.project), item]));
if (entries.size !== manifest.cases.length || manifest.cases.filter(item => item.tier === "core").length !== manifest.coreExecutions
  || manifest.cases.filter(item => item.tier === "extended").length !== manifest.extendedExecutions) throw new Error("Invalid E2E tier manifest");

export function validateTierCatalog(tests) {
  const actual = new Set(tests.map(item => identity(item.title, item.projectName)));
  const missing = [...entries.keys()].filter(key => !actual.has(key));
  const unknown = [...actual].filter(key => !entries.has(key));
  if (missing.length || unknown.length) throw new Error("E2E ownership mismatch: " + JSON.stringify({ missing, unknown }));
}

export function selectTier(tests, tier = "all") {
  if (!["all", "core"].includes(tier)) throw new Error("Unknown E2E tier");
  return tests.filter(item => {
    const entry = entries.get(identity(item.title, item.projectName));
    if (!entry) throw new Error("Unowned E2E case: " + item.title);
    return tier === "all" || entry.tier === "core";
  });
}

export function tierGrep(tier, project) {
  if (tier === "all") return undefined;
  if (tier !== "core") throw new Error("Unknown E2E tier");
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(?:" + manifest.cases.filter(item => item.tier === "core" && item.project === project)
    .map(item => escape(item.title)).join("|") + ")(?=\\s@|$)");
}

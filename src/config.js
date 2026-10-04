import fs from "node:fs/promises";
import path from "node:path";
import { configsRoot } from "./paths.js";

const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

export function assertValidConfigName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name) || name.startsWith(".")) {
    throw new Error(`Invalid configuration name "${name}"`);
  }
}

export function resolveConfigDir(name) {
  assertValidConfigName(name);
  const root = path.resolve(configsRoot());
  const dir = path.resolve(root, name);
  if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid configuration name");
  }
  return dir;
}

export async function listConfigNames() {
  const root = configsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && NAME_RE.test(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

export async function loadNamedConfig(name) {
  const dir = resolveConfigDir(name);
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Unknown configuration "${name}". Expected a folder under configs/.`);
  }

  const labelsPath = path.join(dir, "labels.json");
  const mergePath = path.join(dir, "merge.json");
  const rulesetPath = path.join(dir, "ruleset.json");

  const [labelsRaw, mergeRaw, rulesetRaw] = await Promise.all([
    fs.readFile(labelsPath, "utf8"),
    fs.readFile(mergePath, "utf8"),
    fs.readFile(rulesetPath, "utf8"),
  ]);

  const labelsFile = JSON.parse(labelsRaw);
  const merge = JSON.parse(mergeRaw);
  const ruleset = JSON.parse(rulesetRaw);

  if (!Array.isArray(labelsFile.labels)) {
    throw new Error(`${labelsPath} must contain a "labels" array`);
  }

  return {
    name,
    labels: labelsFile.labels,
    merge,
    ruleset,
  };
}

export async function saveNamedConfig(name, payload) {
  const dir = resolveConfigDir(name);
  await fs.mkdir(dir, { recursive: true });

  const labels = { labels: payload.labels };
  await fs.writeFile(
    path.join(dir, "labels.json"),
    `${JSON.stringify(labels, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(dir, "merge.json"),
    `${JSON.stringify(payload.merge, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(dir, "ruleset.json"),
    `${JSON.stringify(payload.ruleset, null, 2)}\n`,
    "utf8",
  );
}

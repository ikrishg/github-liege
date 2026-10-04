import fs from "node:fs/promises";
import path from "node:path";
import { packageRoot } from "./paths.js";

const STORE_FILE = path.join(packageRoot(), "data", "store.json");

const DEFAULT_STORE = {
  defaultConfigName: "default",
  lastNewRepoScanAt: null,
  appliedConfigs: {},
};

export async function readAppStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      defaultConfigName:
        typeof data.defaultConfigName === "string"
          ? data.defaultConfigName
          : DEFAULT_STORE.defaultConfigName,
      lastNewRepoScanAt:
        typeof data.lastNewRepoScanAt === "string" ? data.lastNewRepoScanAt : null,
      appliedConfigs:
        data.appliedConfigs && typeof data.appliedConfigs === "object"
          ? data.appliedConfigs
          : {},
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { ...DEFAULT_STORE, appliedConfigs: {} };
    }
    throw err;
  }
}

export async function writeAppStore(partial) {
  const current = await readAppStore();
  const next = {
    defaultConfigName: partial.defaultConfigName ?? current.defaultConfigName,
    lastNewRepoScanAt:
      partial.lastNewRepoScanAt !== undefined
        ? partial.lastNewRepoScanAt
        : current.lastNewRepoScanAt,
    appliedConfigs: partial.appliedConfigs ?? current.appliedConfigs,
  };
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function storeFilePath() {
  return STORE_FILE;
}

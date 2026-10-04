import fs from "node:fs/promises";
import path from "node:path";
import { packageRoot } from "./paths.js";

const STORE_FILE = path.join(packageRoot(), "data", "store.json");

const DEFAULT_STORE = {
  defaultConfigName: "default",
  lastNewRepoScanAtByUser: {},
  appliedConfigs: {},
};

let writeQueue = Promise.resolve();

function normalizeStore(data) {
  const lastNewRepoScanAtByUser =
    data.lastNewRepoScanAtByUser && typeof data.lastNewRepoScanAtByUser === "object"
      ? { ...data.lastNewRepoScanAtByUser }
      : {};

  if (typeof data.lastNewRepoScanAt === "string" && !Object.keys(lastNewRepoScanAtByUser).length) {
    lastNewRepoScanAtByUser.__legacy__ = data.lastNewRepoScanAt;
  }

  return {
    defaultConfigName:
      typeof data.defaultConfigName === "string"
        ? data.defaultConfigName
        : DEFAULT_STORE.defaultConfigName,
    lastNewRepoScanAtByUser,
    appliedConfigs:
      data.appliedConfigs && typeof data.appliedConfigs === "object"
        ? { ...data.appliedConfigs }
        : {},
  };
}

export async function readAppStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return {
        defaultConfigName: DEFAULT_STORE.defaultConfigName,
        lastNewRepoScanAtByUser: {},
        appliedConfigs: {},
      };
    }
    throw err;
  }
}

export function getLastNewRepoScanAt(store, login) {
  return store.lastNewRepoScanAtByUser[login] ?? null;
}

/**
 * @param {{
 *   defaultConfigName?: string;
 *   lastNewRepoScanAtForUser?: { login: string; at: string | null };
 *   appliedConfigsDelta?: Record<string, string>;
 * }} partial
 */
export function writeAppStore(partial) {
  const run = writeQueue.then(() => doWrite(partial));
  writeQueue = run.catch(() => {});
  return run;
}

async function doWrite(partial) {
  const current = await readAppStore();
  const appliedConfigs = { ...current.appliedConfigs };
  if (partial.appliedConfigsDelta) {
    for (const [repo, configName] of Object.entries(partial.appliedConfigsDelta)) {
      appliedConfigs[repo] = configName;
    }
  }

  const lastNewRepoScanAtByUser = { ...current.lastNewRepoScanAtByUser };
  if (partial.lastNewRepoScanAtForUser) {
    const { login, at } = partial.lastNewRepoScanAtForUser;
    if (at === null) {
      delete lastNewRepoScanAtByUser[login];
    } else {
      lastNewRepoScanAtByUser[login] = at;
    }
  }

  const next = {
    defaultConfigName: partial.defaultConfigName ?? current.defaultConfigName,
    lastNewRepoScanAtByUser,
    appliedConfigs,
  };

  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(tmp, STORE_FILE);
  return next;
}

export function storeFilePath() {
  return STORE_FILE;
}

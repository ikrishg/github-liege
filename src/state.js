import fs from "node:fs/promises";
import path from "node:path";
import { defaultStatePath } from "./paths.js";

export async function readState() {
  const file = defaultStatePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    if (typeof data.lastNewRepoScanAt !== "string") {
      return { lastNewRepoScanAt: null, file };
    }
    return { lastNewRepoScanAt: data.lastNewRepoScanAt, file };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { lastNewRepoScanAt: null, file };
    }
    throw err;
  }
}

export async function writeState(partial) {
  const { file } = await readState();
  const prior = await readState();
  const next = {
    lastNewRepoScanAt: partial.lastNewRepoScanAt ?? prior.lastNewRepoScanAt,
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

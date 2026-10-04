import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function packageRoot() {
  return root;
}

export function configsRoot() {
  return path.join(root, "configs");
}

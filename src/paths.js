import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function configsRoot() {
  return path.join(packageRoot, "configs");
}

export function defaultStatePath() {
  const override = process.env.GITHUB_LIEGE_STATE_FILE;
  if (override) {
    return path.resolve(override);
  }
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    return path.join(packageRoot, ".liege-state.json");
  }
  return path.join(home, ".config", "github-liege", "state.json");
}

import crypto from "node:crypto";

export function configRevision(config) {
  const payload = JSON.stringify({
    labels: config.labels,
    merge: config.merge,
    ruleset: config.ruleset,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

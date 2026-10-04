import {
  labelNeedsUpdate,
  pickMergeFields,
  rulesetMatches,
} from "./normalize.js";
import { parseRepoSlug } from "./github.js";

/**
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} repoSlug
 * @param {Awaited<ReturnType<import('./config.js').loadNamedConfig>>} config
 * @param {{ deleteExtraLabels?: boolean }} options
 */
export async function previewConfigForRepo(octokit, repoSlug, config, options = {}) {
  const { owner, repo } = parseRepoSlug(repoSlug);
  const changes = [];

  const existingLabels = await octokit.paginate(
    octokit.rest.issues.listLabelsForRepo,
    { owner, repo, per_page: 100 },
  );
  const byName = new Map(existingLabels.map((l) => [l.name, l]));

  for (const expected of config.labels) {
    const current = byName.get(expected.name);
    if (!current) {
      changes.push({ kind: "label", action: "create", name: expected.name });
      continue;
    }
    if (labelNeedsUpdate(current, expected)) {
      changes.push({ kind: "label", action: "update", name: expected.name });
    }
  }

  if (options.deleteExtraLabels) {
    const expectedNames = new Set(config.labels.map((l) => l.name));
    for (const label of existingLabels) {
      if (!expectedNames.has(label.name)) {
        changes.push({ kind: "label", action: "delete", name: label.name });
      }
    }
  }

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const mergePatch = pickMergeFields(repoData, config.merge);
  if (Object.keys(mergePatch).length > 0) {
    changes.push({ kind: "merge", action: "update", fields: mergePatch });
  }

  const { data: rulesets } = await octokit.rest.repos.getRepoRulesets({
    owner,
    repo,
  });
  const existing = rulesets.find((r) => r.name === config.ruleset.name);
  if (!existing) {
    changes.push({
      kind: "ruleset",
      action: "create",
      name: config.ruleset.name,
    });
  } else {
    const { data: full } = await octokit.rest.repos.getRepoRuleset({
      owner,
      repo,
      ruleset_id: existing.id,
    });
    if (!rulesetMatches(config.ruleset, full)) {
      changes.push({
        kind: "ruleset",
        action: "update",
        name: config.ruleset.name,
      });
    }
  }

  return {
    repo: `${owner}/${repo}`,
    changes,
    inSync: changes.length === 0,
  };
}

export function describeChange(change) {
  switch (change.kind) {
    case "label":
      if (change.action === "create") {
        return `Create label "${change.name}"`;
      }
      if (change.action === "update") {
        return `Update label "${change.name}"`;
      }
      return `Delete label "${change.name}"`;
    case "merge":
      return `Update merge settings (${Object.keys(change.fields).join(", ")})`;
    case "ruleset":
      if (change.action === "create") {
        return `Create ruleset "${change.name}"`;
      }
      return `Update ruleset "${change.name}" in place`;
    default:
      return "Unknown change";
  }
}

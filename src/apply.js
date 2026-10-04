import {
  buildRulesetUpdateBody,
  labelNeedsUpdate,
  normalizeLabelColor,
  pickMergeFields,
  rulesetMatches,
} from "./normalize.js";
import { parseRepoSlug } from "./github.js";
import {
  findRepositoryRulesetByName,
  listRepositoryRulesets,
} from "./rulesets.js";

/**
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} repoSlug owner/repo
 * @param {Awaited<ReturnType<import('./config.js').loadNamedConfig>>} config
 * @param {{ deleteExtraLabels?: boolean }} options
 */
export async function applyConfigToRepo(octokit, repoSlug, config, options = {}) {
  const { owner, repo } = parseRepoSlug(repoSlug);
  const summary = {
    repo: `${owner}/${repo}`,
    labels: { created: 0, updated: 0, deleted: 0 },
    merge: { changed: false },
    ruleset: { created: false, updated: false },
  };

  await syncLabels(octokit, owner, repo, config.labels, options, summary);
  await syncMerge(octokit, owner, repo, config.merge, summary);
  await syncRuleset(octokit, owner, repo, config.ruleset, summary);

  return summary;
}

async function syncLabels(octokit, owner, repo, expectedLabels, options, summary) {
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  });

  const byName = new Map(existing.map((l) => [l.name, l]));

  for (const expected of expectedLabels) {
    const current = byName.get(expected.name);
    if (!current) {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: expected.name,
        color: normalizeLabelColor(expected.color),
        description: expected.description ?? "",
      });
      summary.labels.created++;
      continue;
    }
    if (labelNeedsUpdate(current, expected)) {
      await octokit.rest.issues.updateLabel({
        owner,
        repo,
        name: expected.name,
        color: normalizeLabelColor(expected.color),
        description: expected.description ?? "",
      });
      summary.labels.updated++;
    }
  }

  if (options.deleteExtraLabels) {
    const expectedNames = new Set(expectedLabels.map((l) => l.name));
    for (const label of existing) {
      if (!expectedNames.has(label.name)) {
        await octokit.rest.issues.deleteLabel({
          owner,
          repo,
          name: label.name,
        });
        summary.labels.deleted++;
      }
    }
  }
}

async function syncMerge(octokit, owner, repo, expectedMerge, summary) {
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const patch = pickMergeFields(repoData, expectedMerge);
  if (Object.keys(patch).length === 0) {
    return;
  }
  await octokit.rest.repos.update({
    owner,
    repo,
    ...patch,
  });
  summary.merge.changed = true;
}

async function syncRuleset(octokit, owner, repo, expectedRuleset, summary) {
  const rulesets = await listRepositoryRulesets(octokit, owner, repo);
  const existing = findRepositoryRulesetByName(rulesets, expectedRuleset.name);

  if (!existing) {
    await octokit.rest.repos.createRepoRuleset({
      owner,
      repo,
      ...buildRulesetUpdateBody(expectedRuleset),
    });
    summary.ruleset.created = true;
    return;
  }

  const { data: full } = await octokit.rest.repos.getRepoRuleset({
    owner,
    repo,
    ruleset_id: existing.id,
  });

  if (rulesetMatches(expectedRuleset, full)) {
    return;
  }

  await octokit.rest.repos.updateRepoRuleset({
    owner,
    repo,
    ruleset_id: existing.id,
    ...buildRulesetUpdateBody(expectedRuleset),
  });
  summary.ruleset.updated = true;
}

export function formatSummary(summary) {
  const parts = [];
  const { labels, merge, ruleset } = summary;
  if (labels.created || labels.updated || labels.deleted) {
    parts.push(
      `labels +${labels.created} ~${labels.updated} -${labels.deleted}`,
    );
  }
  if (merge.changed) {
    parts.push("merge settings updated");
  }
  if (ruleset.created) {
    parts.push("ruleset created");
  }
  if (ruleset.updated) {
    parts.push("ruleset updated");
  }
  if (parts.length === 0) {
    return `${summary.repo}: already in sync`;
  }
  return `${summary.repo}: ${parts.join(", ")}`;
}

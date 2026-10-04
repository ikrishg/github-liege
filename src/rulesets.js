/**
 * Repository-owned rulesets only (excludes inherited org rulesets), paginated.
 */
export async function listRepositoryRulesets(octokit, owner, repo) {
  return octokit.paginate(octokit.rest.repos.getRepoRulesets, {
    owner,
    repo,
    includes_parents: false,
    per_page: 100,
  });
}

export function findRepositoryRulesetByName(rulesets, name) {
  return rulesets.find(
    (ruleset) =>
      ruleset.name === name &&
      (ruleset.source_type === "Repository" || ruleset.source === "Repository"),
  );
}

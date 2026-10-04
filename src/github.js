import { Octokit } from "@octokit/rest";

export function createOctokit(accessToken) {
  if (!accessToken) {
    throw new Error("Missing GitHub access token.");
  }
  return new Octokit({ auth: accessToken });
}

export function parseRepoSlug(slug) {
  const trimmed = slug.trim().replace(/^https:\/\/github\.com\//, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid repository "${slug}". Use owner/repo.`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export async function listAdminRepos(octokit) {
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner,collaborator,organization_member",
    per_page: 100,
  });

  return repos.filter((repo) => {
    if (repo.archived || repo.disabled) {
      return false;
    }
    return repo.permissions?.admin === true;
  });
}

export async function listNewAdminRepos(octokit, sinceIso) {
  const since = sinceIso ? new Date(sinceIso) : new Date(0);
  const repos = await listAdminRepos(octokit);
  return repos.filter((repo) => {
    if (repo.fork) {
      return false;
    }
    return new Date(repo.created_at) > since;
  });
}

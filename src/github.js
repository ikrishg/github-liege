import { Octokit } from "@octokit/rest";

export function createOctokit() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      "Set GITHUB_TOKEN or GH_TOKEN with permission to manage the target repositories.",
    );
  }
  return new Octokit({ auth: token });
}

export function parseRepoSlug(slug) {
  const trimmed = slug.trim().replace(/^https:\/\/github\.com\//, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Invalid repository "${slug}". Use owner/repo.`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export async function paginateReposForUser(octokit, username) {
  return octokit.paginate(octokit.rest.repos.listForUser, {
    username,
    per_page: 100,
  });
}

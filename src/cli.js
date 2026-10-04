import { Command } from "commander";
import { applyConfigToRepo, formatSummary } from "./apply.js";
import { loadNamedConfig, listConfigNames } from "./config.js";
import { createOctokit, paginateReposForUser, parseRepoSlug } from "./github.js";
import { readState, writeState } from "./state.js";

export function buildProgram() {
  const program = new Command();

  program
    .name("github-liege")
    .description("Apply named GitHub repository configurations from configs/")
    .showHelpAfterError();

  program
    .command("apply")
    .description("Apply a named configuration to one or more repositories")
    .argument("<config>", "Configuration folder name under configs/ (e.g. default)")
    .argument("<repos...>", "Repositories as owner/repo")
    .option(
      "--delete-extra-labels",
      "Delete labels on the repo that are not listed in the config",
      false,
    )
    .action(async (configName, repos, options) => {
      const octokit = createOctokit();
      const config = await loadNamedConfig(configName);
      for (const slug of repos) {
        const summary = await applyConfigToRepo(octokit, slug, config, {
          deleteExtraLabels: options.deleteExtraLabels,
        });
        console.log(formatSummary(summary));
      }
    });

  program
    .command("apply-new")
    .description(
      "Apply the default configuration to repositories created since the last apply-new run",
    )
    .option("--owner <login>", "GitHub user that owns the repositories")
    .option(
      "--config <name>",
      "Configuration to apply (default: default)",
      "default",
    )
    .option("--dry-run", "List repositories that would be updated without calling the API")
    .action(async (options) => {
      const octokit = createOctokit();
      const { data: viewer } = await octokit.rest.users.getAuthenticated();
      const owner = options.owner ?? viewer.login;

      const { lastNewRepoScanAt, file: stateFile } = await readState();
      const since = lastNewRepoScanAt ? new Date(lastNewRepoScanAt) : new Date(0);

      const repos = await paginateReposForUser(octokit, owner);
      const candidates = repos.filter((repo) => {
        if (repo.archived || repo.disabled || repo.fork) {
          return false;
        }
        const created = new Date(repo.created_at);
        return created > since;
      });

      if (options.dryRun) {
        console.log(
          `State file: ${stateFile}\nLast scan: ${lastNewRepoScanAt ?? "(never)"}\nOwner: ${owner}\nRepositories to apply:`,
        );
        for (const repo of candidates) {
          console.log(`  ${repo.full_name} (created ${repo.created_at})`);
        }
        return;
      }

      const config = await loadNamedConfig(options.config);
      const runStartedAt = new Date().toISOString();

      if (candidates.length === 0) {
        console.log(`No new repositories for ${owner} since ${since.toISOString()}`);
        await writeState({ lastNewRepoScanAt: runStartedAt });
        return;
      }

      for (const repo of candidates) {
        const summary = await applyConfigToRepo(
          octokit,
          repo.full_name,
          config,
        );
        console.log(formatSummary(summary));
      }

      await writeState({ lastNewRepoScanAt: runStartedAt });
      console.log(`Updated state: ${stateFile}`);
    });

  program
    .command("list-configs")
    .description("List available named configurations")
    .action(async () => {
      const names = await listConfigNames();
      for (const name of names) {
        console.log(name);
      }
    });

  return program;
}

export async function run(argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}

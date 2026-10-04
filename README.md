# github-liege

Named GitHub repository configurations you can apply on demand. Each configuration is a folder under `configs/` (for example `configs/default/`) with labels, merge settings, and a default-branch ruleset.

The old daily GitHub Actions sync lives on the [`v1.1.2`](https://github.com/ikrishg/github-liege/releases/tag/v1.1.2) tag. This repository is the command-line replacement: no schedule, no webhook fan-out, and no cloning repositories to nag about README or LICENSE files.

Maintained by [Krish Gupta](https://github.com/ikrishg).

## Requirements

- Node.js 20+
- A GitHub token with permission to manage settings on the target repositories (`GITHUB_TOKEN` or `GH_TOKEN`)

## Install (local)

```bash
npm install
```

The npm package name is not finalized yet; `package.json` uses a placeholder until publishing is decided.

## Commands

### Apply a named config to specific repositories

Reads live GitHub settings, compares them to the config, and patches only what differs. If everything already matches, nothing is written.

```bash
GITHUB_TOKEN=ghp_... npm run liege -- apply default ikrishg/github-liege
```

Equivalent using the bin entry after `npm install`:

```bash
GITHUB_TOKEN=ghp_... npx --no-install github-liege apply default ikrishg/github-liege
```

Optional: remove labels that are not defined in the config (default is to leave extra labels alone):

```bash
npm run liege -- apply default ikrishg/my-repo --delete-extra-labels
```

### Apply `default` to repositories created since the last run

Tracks the last successful scan in `~/.config/github-liege/state.json` (override with `GITHUB_LIEGE_STATE_FILE`). Repositories created after that timestamp get the `default` config.

```bash
GITHUB_TOKEN=ghp_... npm run liege -- apply-new --owner ikrishg
```

Preview without changing GitHub or updating state:

```bash
npm run liege -- apply-new --owner ikrishg --dry-run
```

### List configurations

```bash
npm run liege -- list-configs
```

## Configuration layout

```
configs/
  default/
    labels.json    # issue labels (create or update by name)
    merge.json     # squash/rebase on, merge commits off, delete branch on merge
    ruleset.json   # single "Default Branch" ruleset (updated in place by name)
```

Add more folders under `configs/` for other named profiles. `default` is what `apply-new` uses unless you pass `--config`.

### Default ruleset behavior

- Linear history on the default branch
- Pull requests required with one approving review
- Repository **admin** role can bypass rules (so an owner acting as admin is not blocked by self-approval limits on agent-opened PRs)
- Other rulesets on the repository are left unchanged

## Development

```bash
npm test
```

## License

GNU GPL-3.0 or later. See [LICENSE](LICENSE).

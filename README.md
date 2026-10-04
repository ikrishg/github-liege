# github-liege

Small web UI for applying **shared, named GitHub repository configurations**. Anyone signs in with their own GitHub account and applies a config only to repositories they can administer. The app reads live GitHub settings, diffs them against the config, and patches only what differs.

The old daily GitHub Actions sync is preserved on the [`v1.1.2`](https://github.com/ikrishg/github-liege/releases/tag/v1.1.2) tag. There is no npm package and nothing is published to npm.

Maintained by [Krish Gupta](https://github.com/ikrishg).

## What each configuration contains

Under `configs/<name>/`:

- `labels.json` — create or update labels by name (extra labels are kept unless the user opts in on the review screen)
- `merge.json` — squash and rebase on, merge commits off, delete branch on merge
- `ruleset.json` — one default-branch ruleset, updated **in place** by name (linear history, PR required, repository admin can bypass review)

Exactly one config can be marked **default**; that is what **new repositories** receive from the Repos screen.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` (or set `PORT`).

### GitHub OAuth app (required for real sign-in)

Create a GitHub OAuth App and set these environment variables on the server. **Do not commit real values.**

| Variable | Purpose |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App client secret |
| `GITHUB_OAUTH_CALLBACK_URL` | Callback URL registered on the app (e.g. `http://localhost:3000/auth/github/callback`) |
| `SESSION_SECRET` | Secret used to sign session cookies |
| `TRUST_PROXY` | Set to `1` when running behind a TLS-terminating reverse proxy (with `NODE_ENV=production`, enables secure session cookies) |

Optional:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `GITHUB_LIEGE_TEST_AUTH` | Set to `1` to enable `POST /api/auth/test-login` for local/tests (no GitHub API access) |

OAuth scope requested: `read:user repo` (administer repositories the user can change).

### Screens

1. **Repos** — home after login; only admin-capable repos; Apply per row; **Apply default to new repos**
2. **Configs** — shared named sets; edit on row; mark one as default
3. **Apply review** — config + repos + planned writes; optional delete-extra-labels; confirm before any write
4. **Result** — per-repo success or GitHub error (partial applies stay visible)

## Development

```bash
npm test
```

## License

GNU GPL-3.0 or later. See [LICENSE](LICENSE).

import crypto from "node:crypto";
import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyConfigToRepo } from "./src/apply.js";
import { configRevision } from "./src/configRevision.js";
import { loadNamedConfig, listConfigNames, saveNamedConfig } from "./src/config.js";
import { createOctokit, listAdminRepos, listNewAdminRepos } from "./src/github.js";
import { describeChange, previewConfigForRepo } from "./src/preview.js";
import { getLastNewRepoScanAt, readAppStore, writeAppStore } from "./src/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function oauthConfigured() {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET &&
      process.env.GITHUB_OAUTH_CALLBACK_URL,
  );
}

function sessionSecret() {
  return process.env.SESSION_SECRET ?? "dev-only-insecure-session-secret";
}

function assertConfigRevisionMatches(config, expectedRevision) {
  const actual = configRevision(config);
  if (!expectedRevision || actual !== expectedRevision) {
    const err = new Error("Configuration changed since preview. Open review again.");
    err.statusCode = 409;
    throw err;
  }
}

export function createApp() {
  const app = express();

  if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(express.json({ limit: "2mb" }));
  app.use(
    session({
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(express.static(publicDir));

  function testAuthEnabled() {
    return process.env.GITHUB_LIEGE_TEST_AUTH === "1";
  }

  function getAccessToken(req) {
    if (testAuthEnabled() && req.session.testAccessToken) {
      return req.session.testAccessToken;
    }
    return req.session.accessToken ?? null;
  }

  function requireUser(req, res, next) {
    if (req.session.user) {
      next();
      return;
    }
    res.status(401).json({ error: "Sign in required" });
  }

  function requireToken(req, res, next) {
    if (!getAccessToken(req)) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    next();
  }

  app.get("/api/auth/status", (req, res) => {
    res.json({
      signedIn: Boolean(req.session.user),
      user: req.session.user ?? null,
      oauthConfigured: oauthConfigured(),
    });
  });

  app.post("/api/auth/test-login", (req, res) => {
    if (!testAuthEnabled()) {
      res.status(404).json({ error: "Not available" });
      return;
    }
    req.session.user = { login: "test-user", name: "Test User" };
    req.session.testAccessToken = "test-token-stub";
    res.json({ ok: true, user: req.session.user });
  });

  app.get("/auth/github", (req, res) => {
    if (!oauthConfigured()) {
      res.status(503).send("GitHub OAuth is not configured on this server.");
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id: requiredEnv("GITHUB_OAUTH_CLIENT_ID"),
      redirect_uri: requiredEnv("GITHUB_OAUTH_CALLBACK_URL"),
      scope: "read:user repo",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  app.get("/auth/github/callback", async (req, res, next) => {
    try {
      if (!oauthConfigured()) {
        res.status(503).send("GitHub OAuth is not configured.");
        return;
      }
      const { code, state } = req.query;
      if (!code || state !== req.session.oauthState) {
        res.status(400).send("Invalid OAuth state.");
        return;
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: requiredEnv("GITHUB_OAUTH_CLIENT_ID"),
          client_secret: requiredEnv("GITHUB_OAUTH_CLIENT_SECRET"),
          code,
          redirect_uri: requiredEnv("GITHUB_OAUTH_CALLBACK_URL"),
        }),
      });

      if (!tokenRes.ok) {
        res.status(502).send("GitHub token exchange failed.");
        return;
      }

      const tokenJson = await tokenRes.json();
      if (!tokenJson.access_token) {
        res.status(400).send("Could not complete GitHub sign-in.");
        return;
      }

      const octokit = createOctokit(tokenJson.access_token);
      const { data: user } = await octokit.rest.users.getAuthenticated();

      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err) : resolve()));
      });

      req.session.accessToken = tokenJson.access_token;
      req.session.user = { login: user.login, name: user.name ?? user.login };
      delete req.session.oauthState;

      await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });

      res.redirect("/#/repos");
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/repos", requireUser, requireToken, async (req, res, next) => {
    try {
      const octokit = createOctokit(getAccessToken(req));
      const store = await readAppStore();
      const login = req.session.user.login;
      const repos = await listAdminRepos(octokit);
      res.json({
        repos: repos.map((repo) => ({
          fullName: repo.full_name,
          appliedConfig: store.appliedConfigs[repo.full_name] ?? null,
          createdAt: repo.created_at,
        })),
        defaultConfigName: store.defaultConfigName,
        lastNewRepoScanAt: getLastNewRepoScanAt(store, login),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/configs", requireUser, async (req, res, next) => {
    try {
      const names = await listConfigNames();
      const store = await readAppStore();
      const configs = await Promise.all(
        names.map(async (name) => {
          const config = await loadNamedConfig(name);
          return {
            name,
            isDefault: store.defaultConfigName === name,
            labelsCount: config.labels.length,
            merge: config.merge,
            rulesetName: config.ruleset.name,
          };
        }),
      );
      res.json({ configs });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/configs/:name", requireUser, async (req, res, next) => {
    try {
      const config = await loadNamedConfig(req.params.name);
      const store = await readAppStore();
      res.json({
        ...config,
        isDefault: store.defaultConfigName === config.name,
        revision: configRevision(config),
      });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/configs/:name", requireUser, async (req, res, next) => {
    try {
      const { labels, merge, ruleset } = req.body;
      if (!Array.isArray(labels) || !merge || !ruleset) {
        res.status(400).json({ error: "labels, merge, and ruleset are required" });
        return;
      }
      await saveNamedConfig(req.params.name, { labels, merge, ruleset });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/configs/:name/default", requireUser, async (req, res, next) => {
    try {
      await loadNamedConfig(req.params.name);
      await writeAppStore({ defaultConfigName: req.params.name });
      res.json({ ok: true, defaultConfigName: req.params.name });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/apply/preview", requireUser, requireToken, async (req, res, next) => {
    try {
      const { configName, repos, deleteExtraLabels } = req.body;
      if (!configName || !Array.isArray(repos) || repos.length === 0) {
        res.status(400).json({ error: "configName and repos are required" });
        return;
      }
      const config = await loadNamedConfig(configName);
      const revision = configRevision(config);
      const octokit = createOctokit(getAccessToken(req));
      const adminRepos = new Set(
        (await listAdminRepos(octokit)).map((r) => r.full_name),
      );
      const previews = [];
      for (const slug of repos) {
        if (!adminRepos.has(slug)) {
          res.status(403).json({ error: `No admin access to ${slug}` });
          return;
        }
        const preview = await previewConfigForRepo(octokit, slug, config, {
          deleteExtraLabels: Boolean(deleteExtraLabels),
        });
        previews.push({
          ...preview,
          descriptions: preview.changes.map(describeChange),
        });
      }
      res.json({
        configName,
        configRevision: revision,
        deleteExtraLabels: Boolean(deleteExtraLabels),
        previews,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/apply/confirm", requireUser, requireToken, async (req, res, next) => {
    try {
      const { configName, repos, deleteExtraLabels, configRevision: expectedRevision } =
        req.body;
      if (!configName || !Array.isArray(repos) || repos.length === 0) {
        res.status(400).json({ error: "configName and repos are required" });
        return;
      }
      const config = await loadNamedConfig(configName);
      assertConfigRevisionMatches(config, expectedRevision);
      const octokit = createOctokit(getAccessToken(req));
      const adminRepos = new Set(
        (await listAdminRepos(octokit)).map((r) => r.full_name),
      );

      const results = [];
      const appliedConfigsDelta = {};

      for (const slug of repos) {
        if (!adminRepos.has(slug)) {
          results.push({
            repo: slug,
            ok: false,
            error: "You do not have admin access to this repository.",
          });
          continue;
        }
        try {
          const summary = await applyConfigToRepo(octokit, slug, config, {
            deleteExtraLabels: Boolean(deleteExtraLabels),
          });
          appliedConfigsDelta[slug] = configName;
          results.push({ repo: slug, ok: true, summary });
        } catch (err) {
          results.push({
            repo: slug,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (Object.keys(appliedConfigsDelta).length > 0) {
        await writeAppStore({ appliedConfigsDelta });
      }
      res.json({ configName, results });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/apply-new/preview", requireUser, requireToken, async (req, res, next) => {
    try {
      const store = await readAppStore();
      const login = req.session.user.login;
      const configName = store.defaultConfigName;
      const config = await loadNamedConfig(configName);
      const revision = configRevision(config);
      const since = getLastNewRepoScanAt(store, login);
      const octokit = createOctokit(getAccessToken(req));
      const candidates = await listNewAdminRepos(octokit, since);
      const previews = [];
      for (const repo of candidates) {
        const preview = await previewConfigForRepo(octokit, repo.full_name, config, {
          deleteExtraLabels: false,
        });
        previews.push({
          ...preview,
          descriptions: preview.changes.map(describeChange),
        });
      }
      res.json({
        configName,
        configRevision: revision,
        since,
        repos: candidates.map((r) => r.full_name),
        previews,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/apply-new/confirm", requireUser, requireToken, async (req, res, next) => {
    try {
      const { configRevision: expectedRevision } = req.body ?? {};
      const store = await readAppStore();
      const login = req.session.user.login;
      const configName = store.defaultConfigName;
      const config = await loadNamedConfig(configName);
      assertConfigRevisionMatches(config, expectedRevision);
      const since = getLastNewRepoScanAt(store, login);
      const octokit = createOctokit(getAccessToken(req));
      const candidates = await listNewAdminRepos(octokit, since);
      const runStartedAt = new Date().toISOString();
      const results = [];
      const appliedConfigsDelta = {};

      for (const repo of candidates) {
        try {
          const summary = await applyConfigToRepo(octokit, repo.full_name, config, {
            deleteExtraLabels: false,
          });
          appliedConfigsDelta[repo.full_name] = configName;
          results.push({ repo: repo.full_name, ok: true, summary });
        } catch (err) {
          results.push({
            repo: repo.full_name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const allSucceeded = results.length === 0 || results.every((r) => r.ok);
      const storeUpdate = { appliedConfigsDelta };
      if (allSucceeded) {
        storeUpdate.lastNewRepoScanAtForUser = { login, at: runStartedAt };
      }
      if (Object.keys(appliedConfigsDelta).length > 0 || allSucceeded) {
        await writeAppStore(storeUpdate);
      }

      res.json({ configName, results });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    const status = err && typeof err === "object" && "statusCode" in err ? err.statusCode : 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => {
    console.log(`github-liege UI listening on http://localhost:${port}`);
  });
}

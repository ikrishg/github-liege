import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it, before, after } from "node:test";
import request from "supertest";
import { createApp } from "../server.js";

describe("web UI", () => {
  let app;

  before(() => {
    process.env.GITHUB_LIEGE_TEST_AUTH = "1";
    process.env.SESSION_SECRET = "test-session-secret";
    app = createApp();
  });

  after(() => {
    delete process.env.GITHUB_LIEGE_TEST_AUTH;
  });

  it("serves the SPA shell", async () => {
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
    assert.match(res.text, /id="app"/);
  });

  it("exposes all four screens in the client router", async () => {
    const appJs = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
    assert.match(appJs, /renderLogin/);
    assert.match(appJs, /renderRepos/);
    assert.match(appJs, /renderConfigs/);
    assert.match(appJs, /renderApplyReview/);
    assert.match(appJs, /renderResult/);
  });

  it("returns signed-out auth status", async () => {
    const res = await request(app).get("/api/auth/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.signedIn, false);
  });

  it("allows stub sign-in when test auth is enabled", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/auth/test-login").send({});
    assert.equal(login.status, 200);
    assert.equal(login.body.user.login, "test-user");

    const status = await agent.get("/api/auth/status");
    assert.equal(status.body.signedIn, true);

    const configs = await agent.get("/api/configs");
    assert.equal(configs.status, 200);
    assert.ok(configs.body.configs.some((c) => c.name === "default"));
  });

  it("requires sign-in for repos API", async () => {
    const res = await request(app).get("/api/repos");
    assert.equal(res.status, 401);
  });
});

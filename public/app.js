const app = document.getElementById("app");
const header = document.getElementById("app-header");
const logoutBtn = document.getElementById("logout-btn");

let auth = { signedIn: false, user: null, oauthConfigured: false };

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    credentials: "same-origin",
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? res.statusText);
  }
  return body;
}

function setNav(route) {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-nav") === route);
  });
}

function navigate() {
  const hash = location.hash.replace(/^#/, "") || "/login";
  const route = hash.startsWith("/") ? hash : `/${hash}`;
  render(route).catch((err) => {
    app.innerHTML = `<div class="panel"><p class="result-fail">${err.message}</p></div>`;
  });
}

logoutBtn.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  location.hash = "#/login";
  await refreshAuth();
  navigate();
});

window.addEventListener("hashchange", navigate);

async function refreshAuth() {
  auth = await api("/api/auth/status");
  header.hidden = !auth.signedIn;
}

function requireSignedIn(route) {
  if (!auth.signedIn && route !== "/login") {
    location.hash = "#/login";
    return false;
  }
  if (auth.signedIn && route === "/login") {
    location.hash = "#/repos";
    return false;
  }
  return true;
}

async function render(route) {
  await refreshAuth();
  if (!requireSignedIn(route)) {
    return;
  }

  if (route === "/login") {
    setNav("");
    renderLogin();
    return;
  }
  if (route === "/repos") {
    setNav("repos");
    await renderRepos();
    return;
  }
  if (route === "/configs") {
    setNav("configs");
    await renderConfigs();
    return;
  }
  if (route.startsWith("/apply-review")) {
    setNav("repos");
    await renderApplyReview(route);
    return;
  }
  if (route === "/result") {
    setNav("repos");
    renderResult();
    return;
  }
  app.innerHTML = `<div class="panel"><p>Unknown page.</p></div>`;
}

function renderLogin() {
  app.innerHTML = `
    <h1>Sign in</h1>
    <div class="panel stack">
      <p>Sign in with GitHub to apply shared repository configurations to repos you administer.</p>
      ${
        auth.oauthConfigured
          ? `<a class="button" href="/auth/github">Sign in with GitHub</a>`
          : `<p class="muted">OAuth is not configured. Set <code>GITHUB_OAUTH_CLIENT_ID</code>, <code>GITHUB_OAUTH_CLIENT_SECRET</code>, and <code>GITHUB_OAUTH_CALLBACK_URL</code> on the server.</p>`
      }
    </div>
  `;
}

async function renderRepos() {
  app.innerHTML = `<p class="muted">Loading repositories…</p>`;
  const data = await api("/api/repos");
  const rows =
    data.repos.length === 0
      ? `<tr><td colspan="4" class="empty">There are no repositories you can administer with this account.</td></tr>`
      : data.repos
          .map(
            (repo) => `
        <tr>
          <td>${repo.fullName}</td>
          <td>${repo.appliedConfig ? `<span class="badge">${repo.appliedConfig}</span>` : `<span class="muted">none</span>`}</td>
          <td>
            <div class="row-actions">
              <button type="button" data-apply="${repo.fullName}">Apply</button>
            </div>
          </td>
        </tr>`,
          )
          .join("");

  app.innerHTML = `
    <h1>Repos</h1>
    <div class="toolbar">
      <button type="button" id="apply-new-btn" class="secondary">Apply default to new repos</button>
      <span class="muted">Default config: <strong>${data.defaultConfigName}</strong>${
        data.lastNewRepoScanAt
          ? ` · last new-repo run ${new Date(data.lastNewRepoScanAt).toLocaleString()}`
          : ""
      }</span>
    </div>
    <div class="panel">
      <table>
        <thead>
          <tr><th>Repository</th><th>Applied config</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  app.querySelectorAll("[data-apply]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const fullName = btn.getAttribute("data-apply");
      const configs = await api("/api/configs");
      const names = configs.configs.map((c) => c.name);
      const pick = prompt(`Configuration to apply to ${fullName}:\n${names.join(", ")}`, data.defaultConfigName);
      if (!pick || !names.includes(pick)) {
        return;
      }
      sessionStorage.setItem(
        "liege.apply",
        JSON.stringify({ configName: pick, repos: [fullName], deleteExtraLabels: false }),
      );
      location.hash = "#/apply-review";
    });
  });

  document.getElementById("apply-new-btn").addEventListener("click", async () => {
    sessionStorage.setItem("liege.applyMode", "new-repos");
    location.hash = "#/apply-review";
  });
}

async function renderConfigs() {
  app.innerHTML = `<p class="muted">Loading configurations…</p>`;
  const { configs } = await api("/api/configs");
  const cards = configs
    .map(
      (c) => `
    <article class="panel" data-config="${c.name}">
      <div class="row-actions" style="justify-content: space-between;">
        <div>
          <strong>${c.name}</strong>
          ${c.isDefault ? `<span class="badge default">default for new repos</span>` : ""}
        </div>
        <div class="row-actions">
          ${c.isDefault ? "" : `<button type="button" class="secondary" data-default="${c.name}">Make default</button>`}
          <button type="button" data-edit="${c.name}">Edit</button>
        </div>
      </div>
      <p class="muted">${c.labelsCount} labels · merge settings · ruleset “${c.rulesetName}”</p>
      <div class="edit-area" hidden></div>
    </article>`,
    )
    .join("");

  app.innerHTML = `<h1>Configs</h1><p class="muted">Shared configuration library for all signed-in users.</p>${cards}`;

  app.querySelectorAll("[data-default]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/configs/${btn.getAttribute("data-default")}/default`, { method: "POST" });
      navigate();
    });
  });

  app.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-edit");
      const article = app.querySelector(`[data-config="${name}"]`);
      const area = article.querySelector(".edit-area");
      if (!area.hidden) {
        area.hidden = true;
        return;
      }
      const detail = await api(`/api/configs/${name}`);
      area.hidden = false;
      area.innerHTML = `
        <label>labels.json<textarea class="json-edit" id="labels-${name}">${JSON.stringify(detail.labels, null, 2)}</textarea></label>
        <label>merge.json<textarea class="json-edit" id="merge-${name}">${JSON.stringify(detail.merge, null, 2)}</textarea></label>
        <label>ruleset.json<textarea class="json-edit" id="ruleset-${name}">${JSON.stringify(detail.ruleset, null, 2)}</textarea></label>
        <button type="button" data-save="${name}">Save</button>
      `;
      area.querySelector(`[data-save="${name}"]`).addEventListener("click", async () => {
        const labels = JSON.parse(document.getElementById(`labels-${name}`).value);
        const merge = JSON.parse(document.getElementById(`merge-${name}`).value);
        const ruleset = JSON.parse(document.getElementById(`ruleset-${name}`).value);
        await api(`/api/configs/${name}`, {
          method: "PUT",
          body: JSON.stringify({ labels, merge, ruleset }),
        });
        navigate();
      });
    });
  });
}

async function renderApplyReview(route) {
  const params = new URLSearchParams(route.split("?")[1] ?? "");
  const mode = sessionStorage.getItem("liege.applyMode");
  const stored = sessionStorage.getItem("liege.apply");

  app.innerHTML = `<p class="muted">Computing changes…</p>`;

  let preview;
  let configName;
  let repos;
  let deleteExtraLabels = false;

  if (mode === "new-repos") {
    preview = await api("/api/apply-new/preview", { method: "POST" });
    configName = preview.configName;
    repos = preview.repos;
  } else if (stored) {
    const payload = JSON.parse(stored);
    configName = payload.configName;
    repos = payload.repos;
    deleteExtraLabels = Boolean(payload.deleteExtraLabels);
    preview = await api("/api/apply/preview", {
      method: "POST",
      body: JSON.stringify({ configName, repos, deleteExtraLabels }),
    });
  } else {
    app.innerHTML = `<div class="panel"><p>No apply session. Start from Repos.</p></div>`;
    return;
  }

  const repoBlocks = (preview.previews ?? []).map((p) => {
    const list =
      p.descriptions.length === 0
        ? "<li class='muted'>Already in sync — nothing to write</li>"
        : p.descriptions.map((d) => `<li>${d}</li>`).join("");
    return `<div class="panel"><strong>${p.repo}</strong><ul>${list}</ul></div>`;
  });

  const showDeleteOption = mode !== "new-repos" && repos.length > 0;

  app.innerHTML = `
    <h1>Review apply</h1>
    <div class="panel stack">
      <p>Configuration <strong>${configName}</strong></p>
      <p>Repositories: ${repos.length ? repos.join(", ") : "<em>none</em>"}</p>
      ${
        showDeleteOption
          ? `<label class="checkbox"><input type="checkbox" id="delete-extra" ${deleteExtraLabels ? "checked" : ""} /> Also delete labels that are not in this configuration</label>`
          : ""
      }
    </div>
    ${repoBlocks.join("") || `<div class="panel empty">No repositories selected.</div>`}
    <div class="row-actions">
      <button type="button" id="confirm-apply">Confirm and apply</button>
      <a class="button secondary" href="#/repos">Cancel</a>
    </div>
  `;

  document.getElementById("confirm-apply").addEventListener("click", async () => {
    const deleteFlag = showDeleteOption
      ? document.getElementById("delete-extra").checked
      : false;

    let results;
    if (mode === "new-repos") {
      results = await api("/api/apply-new/confirm", { method: "POST" });
    } else {
      results = await api("/api/apply/confirm", {
        method: "POST",
        body: JSON.stringify({
          configName,
          repos,
          deleteExtraLabels: deleteFlag,
        }),
      });
    }
    sessionStorage.removeItem("liege.apply");
    sessionStorage.removeItem("liege.applyMode");
    sessionStorage.setItem("liege.results", JSON.stringify(results));
    location.hash = "#/result";
  });
}

function renderResult() {
  const raw = sessionStorage.getItem("liege.results");
  if (!raw) {
    app.innerHTML = `<div class="panel"><p>No results to show.</p></div>`;
    return;
  }
  const { results, configName } = JSON.parse(raw);
  const blocks = results
    .map((r) => {
      if (r.ok) {
        const s = r.summary;
        const bits = [];
        if (s.labels.created || s.labels.updated || s.labels.deleted) {
          bits.push(`labels +${s.labels.created} ~${s.labels.updated} -${s.labels.deleted}`);
        }
        if (s.merge.changed) bits.push("merge updated");
        if (s.ruleset.created) bits.push("ruleset created");
        if (s.ruleset.updated) bits.push("ruleset updated");
        const msg = bits.length ? bits.join(", ") : "already in sync";
        return `<div class="panel"><strong class="result-ok">${r.repo}</strong><p>${msg}</p></div>`;
      }
      return `<div class="panel"><strong class="result-fail">${r.repo}</strong><p>${r.error}</p></div>`;
    })
    .join("");

  app.innerHTML = `
    <h1>Apply result</h1>
    ${configName ? `<p class="muted">Configuration: ${configName}</p>` : ""}
    ${blocks}
    <a class="button" href="#/repos">Back to repos</a>
  `;
}

navigate();

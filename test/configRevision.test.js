import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configRevision } from "../src/configRevision.js";

describe("configRevision", () => {
  it("changes when config content changes", () => {
    const base = {
      labels: [{ name: "a", color: "#000000", description: "" }],
      merge: { allow_squash_merge: true },
      ruleset: { name: "Default Branch" },
    };
    const r1 = configRevision(base);
    const r2 = configRevision({
      ...base,
      merge: { allow_squash_merge: false },
    });
    assert.notEqual(r1, r2);
  });
});

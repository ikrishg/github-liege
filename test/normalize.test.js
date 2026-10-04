import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  labelNeedsUpdate,
  pickMergeFields,
  rulesetMatches,
} from "../src/normalize.js";

describe("pickMergeFields", () => {
  it("returns only differing merge fields", () => {
    const patch = pickMergeFields(
      {
        allow_squash_merge: true,
        allow_rebase_merge: true,
        allow_merge_commit: true,
        delete_branch_on_merge: false,
      },
      {
        allow_squash_merge: true,
        allow_rebase_merge: true,
        allow_merge_commit: false,
        delete_branch_on_merge: true,
      },
    );
    assert.deepEqual(patch, {
      allow_merge_commit: false,
      delete_branch_on_merge: true,
    });
  });
});

describe("labelNeedsUpdate", () => {
  it("detects color and description drift", () => {
    assert.equal(
      labelNeedsUpdate(
        { color: "b60205", description: "old" },
        { color: "#b60205", description: "new" },
      ),
      true,
    );
    assert.equal(
      labelNeedsUpdate(
        { color: "b60205", description: "same" },
        { color: "#b60205", description: "same" },
      ),
      false,
    );
  });
});

describe("rulesetMatches", () => {
  const expected = {
    name: "Default Branch",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
    rules: [{ type: "required_linear_history" }],
    bypass_actors: [
      {
        actor_id: 5,
        actor_type: "RepositoryRole",
        bypass_mode: "always",
      },
    ],
  };

  it("ignores API metadata fields", () => {
    assert.equal(
      rulesetMatches(expected, {
        ...expected,
        id: 1,
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
        source: "Repository",
        source_type: "Repository",
      }),
      true,
    );
  });
});

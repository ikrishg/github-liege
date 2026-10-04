import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertValidConfigName, resolveConfigDir } from "../src/config.js";
import { configsRoot } from "../src/paths.js";
import path from "node:path";

describe("config name validation", () => {
  it("rejects traversal names", () => {
    assert.throws(() => assertValidConfigName("../public"));
    assert.throws(() => assertValidConfigName(".."));
    assert.throws(() => resolveConfigDir(".."));
  });

  it("accepts default and resolves under configs root", () => {
    assertValidConfigName("default");
    const dir = resolveConfigDir("default");
    assert.equal(path.basename(dir), "default");
    assert.equal(path.dirname(dir), path.resolve(configsRoot()));
  });
});

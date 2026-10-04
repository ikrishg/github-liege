import equal from "fast-deep-equal";

export function normalizeLabelColor(color) {
  return color.replace(/^#/, "").toLowerCase();
}

export function labelNeedsUpdate(existing, expected) {
  const expectedColor = normalizeLabelColor(expected.color);
  const existingColor = normalizeLabelColor(existing.color ?? "");
  const expectedDescription = expected.description ?? "";
  const existingDescription = existing.description ?? "";
  return expectedColor !== existingColor || expectedDescription !== existingDescription;
}

export function pickMergeFields(repo, expected) {
  const fields = [
    "allow_squash_merge",
    "allow_rebase_merge",
    "allow_merge_commit",
    "delete_branch_on_merge",
  ];
  const patch = {};
  for (const key of fields) {
    if (expected[key] !== undefined && repo[key] !== expected[key]) {
      patch[key] = expected[key];
    }
  }
  return patch;
}

/** Fields returned by the API that should not participate in ruleset diff. */
const RULESET_OMIT = new Set([
  "id",
  "source",
  "source_type",
  "created_at",
  "updated_at",
  "current_user_can_bypass",
  "_links",
  "node_id",
]);

export function normalizeRulesetForCompare(ruleset) {
  const copy = structuredClone(ruleset);
  for (const key of RULESET_OMIT) {
    delete copy[key];
  }
  if (copy.conditions?.ref_name) {
    copy.conditions.ref_name.include = [...(copy.conditions.ref_name.include ?? [])].sort();
    copy.conditions.ref_name.exclude = [...(copy.conditions.ref_name.exclude ?? [])].sort();
  }
  if (Array.isArray(copy.bypass_actors)) {
    copy.bypass_actors = [...copy.bypass_actors].sort(
      (a, b) =>
        `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`.localeCompare(
          `${b.actor_type}:${b.actor_id}:${b.bypass_mode}`,
        ),
    );
  }
  if (Array.isArray(copy.rules)) {
    copy.rules = [...copy.rules].sort((a, b) => a.type.localeCompare(b.type));
  }
  return copy;
}

export function rulesetMatches(expected, existing) {
  return equal(
    normalizeRulesetForCompare(expected),
    normalizeRulesetForCompare(existing),
  );
}

export function buildRulesetUpdateBody(expected) {
  return {
    name: expected.name,
    target: expected.target,
    enforcement: expected.enforcement,
    conditions: expected.conditions,
    rules: expected.rules,
    bypass_actors: expected.bypass_actors,
  };
}

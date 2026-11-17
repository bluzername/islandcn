/*
 * `shapeTransition` is a pure lookup from (from, to, options) to which named motion plays - no
 * fitted numbers involved, just the decision table in its own comment. It had zero coverage.
 *
 * Run: pnpm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { shapeTransition } from "@/lib/island/geometry";
import type { PresentationKind } from "@/lib/island/types";

const base = { swap: false, swelling: false, alert: false };
const kinds: PresentationKind[] = ["idle", "compact", "minimal", "expanded"];

test("the same presentation on both sides is always a resize", () => {
  for (const kind of kinds) {
    assert.equal(shapeTransition(kind, kind, base), "resize");
    // Even when the options would otherwise pick something else.
    assert.equal(shapeTransition(kind, kind, { swap: true, swelling: true, alert: true }), "resize");
  }
});

test("opening into the expanded view", () => {
  assert.equal(shapeTransition("idle", "expanded", base), "appearExpand");
  // From the split, or whenever the activity on show changes, the shape passes through idle.
  assert.equal(shapeTransition("minimal", "expanded", base), "swap");
  assert.equal(shapeTransition("compact", "expanded", { ...base, swap: true }), "swap");
  // Same activity, no swap: a plain expand, or `pressExpand` out of a long-press swell.
  assert.equal(shapeTransition("compact", "expanded", base), "expand");
  assert.equal(shapeTransition("compact", "expanded", { ...base, swelling: true }), "pressExpand");
});

test("leaving the expanded view", () => {
  assert.equal(shapeTransition("expanded", "minimal", base), "collapseSplit");
  assert.equal(shapeTransition("expanded", "idle", base), "dismiss");
  assert.equal(shapeTransition("expanded", "compact", base), "collapse");
  assert.equal(shapeTransition("expanded", "compact", { ...base, alert: true }), "alertCollapse");
});

test("idle and the two-activity split, with neither side expanded", () => {
  assert.equal(shapeTransition("compact", "idle", base), "dismiss");
  assert.equal(shapeTransition("idle", "compact", base), "appear");
  assert.equal(shapeTransition("idle", "minimal", base), "appear");
  assert.equal(shapeTransition("compact", "minimal", base), "split");
  assert.equal(shapeTransition("minimal", "compact", base), "unsplit");
});

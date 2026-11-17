/*
 * The spring solver (`solveSpring`) and the animated value it drives (`AnimatedValue`) are pure,
 * closed-form math with no reference recording behind them (unlike most of `lib/island`, which is
 * fitted to captured motion and needs a visual check, not a unit test). They had zero coverage.
 *
 * Run: pnpm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { AnimatedValue, solveSpring } from "@/lib/island/spring";

test("solveSpring returns the release point unchanged at or before t = 0", () => {
  const configs = [
    { response: 0.3, dampingFraction: 0.5 },
    { response: 0.3, dampingFraction: 1 },
    { response: 0.3, dampingFraction: 1.6 },
  ];
  for (const config of configs) {
    const released = solveSpring(config, 12, -4, 0);
    assert.equal(released.x, 12);
    assert.equal(released.v, -4);
  }
});

test("solveSpring settles to the target (zero displacement, zero speed) well after its response time", () => {
  const cases = [
    { response: 0.3, dampingFraction: 0.5 }, // underdamped: overshoots, then decays
    { response: 0.3, dampingFraction: 1 }, // critically damped
    { response: 0.3, dampingFraction: 1.8 }, // overdamped
  ];
  for (const config of cases) {
    const { x, v } = solveSpring(config, 10, 3, 5);
    assert.ok(Math.abs(x) < 1e-6, `expected x near 0, got ${x}`);
    assert.ok(Math.abs(v) < 1e-4, `expected v near 0, got ${v}`);
  }
});

test("a value with no transition stays at its starting number", () => {
  const value = new AnimatedValue(5);
  assert.equal(value.target, 5);
  assert.equal(value.valueAt(0), 5);
  assert.equal(value.valueAt(999), 5);
  assert.equal(value.isAtRest(0), true);
});

test("an instant transition snaps with no motion", () => {
  const value = new AnimatedValue(5);
  value.set(10, 0, { kind: "instant" });
  assert.equal(value.target, 10);
  assert.equal(value.valueAt(0), 10);
  assert.equal(value.valueAt(50), 10);
  assert.equal(value.isAtRest(0), true);
});

test("a tween moves along the eased curve between its endpoints", () => {
  const value = new AnimatedValue(0);
  value.set(20, 0, { kind: "tween", duration: 1 });
  assert.equal(value.valueAt(0), 0);
  // easeOutCubic(0.5) = 1 - 0.5^3 = 0.875, so the midpoint is 87.5% of the way there, not 50%.
  assert.ok(Math.abs(value.valueAt(0.5) - 17.5) < 1e-9);
  assert.equal(value.valueAt(1), 20);
  assert.equal(value.isAtRest(1), true);
});

test("a spring transition reaches and settles on its target", () => {
  const value = new AnimatedValue(0);
  value.set(10, 0, { kind: "spring", spring: { response: 0.3, dampingFraction: 1 } });
  assert.equal(value.isAtRest(0), false);
  assert.ok(Math.abs(value.valueAt(5) - 10) < 1e-6);
  assert.equal(value.isAtRest(5), true);
});

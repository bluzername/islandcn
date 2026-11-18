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

test("solveSpring returns the release point unchanged for negative t too", () => {
  const configs = [
    { response: 0.3, dampingFraction: 0.5 },
    { response: 0.3, dampingFraction: 1 },
    { response: 0.3, dampingFraction: 1.6 },
  ];
  for (const config of configs) {
    const released = solveSpring(config, 12, -4, -5);
    assert.equal(released.x, 12);
    assert.equal(released.v, -4);
  }
});

test("solveSpring matches the closed-form motion mid-flight, not just at the endpoints", () => {
  // Re-derives x(t)/v(t) from the spring's own definitions (response -> w0, dampingFraction -> zeta)
  // instead of calling solveSpring, so a solver that only gets the two endpoints right (e.g. one that
  // returns the rest state for every t > 0) cannot pass this by coincidence.
  const x0 = 10;
  const v0 = 3;
  const t = 0.12; // well before the response time (0.3s), so every case is still moving here.

  {
    // underdamped
    const response = 0.3;
    const zeta = 0.5;
    const w0 = (2 * Math.PI) / response;
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    const b = (v0 + zeta * w0 * x0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const expectedX = decay * (x0 * cos + b * sin);
    const expectedV = decay * (-zeta * w0 * (x0 * cos + b * sin) + (-x0 * wd * sin + b * wd * cos));
    const { x, v } = solveSpring({ response, dampingFraction: zeta }, x0, v0, t);
    assert.ok(Math.abs(x - expectedX) < 1e-9, `underdamped x: expected ${expectedX}, got ${x}`);
    assert.ok(Math.abs(v - expectedV) < 1e-9, `underdamped v: expected ${expectedV}, got ${v}`);
    // Still clearly in motion, not already settled.
    assert.ok(Math.abs(v) > 10, `expected underdamped v to still be clearly nonzero at t=${t}, got ${v}`);
  }

  {
    // critically damped
    const response = 0.3;
    const zeta = 1;
    const w0 = (2 * Math.PI) / response;
    const decay = Math.exp(-w0 * t);
    const b = v0 + w0 * x0;
    const expectedX = decay * (x0 + b * t);
    const expectedV = decay * (b - w0 * (x0 + b * t));
    const { x, v } = solveSpring({ response, dampingFraction: zeta }, x0, v0, t);
    assert.ok(Math.abs(x - expectedX) < 1e-9, `critical x: expected ${expectedX}, got ${x}`);
    assert.ok(Math.abs(v - expectedV) < 1e-9, `critical v: expected ${expectedV}, got ${v}`);
    assert.ok(Math.abs(v) > 10, `expected critical v to still be clearly nonzero at t=${t}, got ${v}`);
  }

  {
    // overdamped
    const response = 0.3;
    const zeta = 1.8;
    const w0 = (2 * Math.PI) / response;
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - root);
    const r2 = -w0 * (zeta + root);
    const c2 = (v0 - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    const e1 = Math.exp(r1 * t);
    const e2 = Math.exp(r2 * t);
    const expectedX = c1 * e1 + c2 * e2;
    const expectedV = c1 * r1 * e1 + c2 * r2 * e2;
    const { x, v } = solveSpring({ response, dampingFraction: zeta }, x0, v0, t);
    assert.ok(Math.abs(x - expectedX) < 1e-9, `overdamped x: expected ${expectedX}, got ${x}`);
    assert.ok(Math.abs(v - expectedV) < 1e-9, `overdamped v: expected ${expectedV}, got ${v}`);
    assert.ok(Math.abs(v) > 10, `expected overdamped v to still be clearly nonzero at t=${t}, got ${v}`);
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

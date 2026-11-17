/*
 * A group's alert hands over in two steps (AGENTS.md / ActivityOptions.group): the shown member
 * leaves to idle, the island waits `motion.group.handoff`, then expands the alerting one. While
 * that wait is pending, `IslandSnapshot.expanded` is already null again (nothing is expanded yet)
 * - the same as whenever nothing is expanded at all, which is most of the time. `end()` used that
 * nullness, rather than "was this the activity that was expanded", to decide whether to cancel a
 * pending alert's timers, so ending ANY other activity while an unrelated group's handoff was
 * pending silently cancelled it: the alerting activity never expanded, and `handoff` stayed stuck
 * on that group forever (every member of it hidden for good, since `isShown` refuses to show one
 * while its group is mid-handoff).
 *
 * Run: pnpm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { IslandClock } from "@/lib/island/clock";
import { createIslandStore } from "@/lib/island/store";
import { islandMotion } from "@/lib/island/motion";

/** A manually-stepped clock: timers fire in `at` order as `advance` crosses them, like the real one. */
const createTestClock = () => {
  let time = 0;
  let nextId = 1;
  let timers: { id: number; at: number; run: (due: number) => void }[] = [];
  const clock: IslandClock = {
    now: () => time,
    onFrame: () => () => {},
    at(at, run) {
      const id = nextId++;
      timers.push({ id, at, run });
      return () => {
        timers = timers.filter((timer) => timer.id !== id);
      };
    },
  };
  const advance = (ms: number) => {
    const target = time + ms;
    for (;;) {
      const due = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      timers = timers.filter((timer) => timer.id !== due.id);
      time = due.at;
      due.run(due.at);
    }
    time = target;
  };
  return { clock, advance };
};

test("ending an unrelated activity during another group's alert handoff does not cancel it", () => {
  const { clock, advance } = createTestClock();
  const store = createIslandStore({ clock, motion: () => islandMotion });

  store.api.start({ id: "a", group: "news", compact: { leading: "A" } });
  store.api.start({ id: "b", group: "news", compact: { leading: "B" } });
  store.api.start({ id: "timer", compact: { leading: "T" } });

  // "b" is hidden behind "a" (same group, started later), so alerting it starts a handoff: nothing
  // expanded yet, `handoff` set to "news", and a timer due at `group.handoff` to actually expand it.
  store.api.update("b", { alert: true });
  assert.equal(store.getSnapshot().expanded, null);
  assert.equal(store.getSnapshot().handoff, "news");

  // An unrelated activity (no group, not part of the handoff) ends while that handoff is pending.
  store.api.end("timer");

  // The handoff must still be live: "timer" ending has nothing to do with "news"'s pending alert.
  assert.equal(store.getSnapshot().handoff, "news", "an unrelated end must not cancel another group's pending handoff");

  advance(islandMotion.group.handoff * 1000 + 1);

  assert.equal(store.getSnapshot().handoff, null, "the handoff should have resolved once its wait elapsed");
  assert.equal(store.getSnapshot().expanded?.id, "b", "the alerting activity should now be expanded");

  advance(islandMotion.group.window * 1000);
  assert.equal(store.getSnapshot().expanded, null, "the alert should have returned on its own after its window");
});

test("ending the activity actually being handed off to does cancel its own handoff", () => {
  const { clock, advance } = createTestClock();
  const store = createIslandStore({ clock, motion: () => islandMotion });

  store.api.start({ id: "a", group: "news", compact: { leading: "A" } });
  store.api.start({ id: "b", group: "news", compact: { leading: "B" } });
  store.api.update("b", { alert: true });
  assert.equal(store.getSnapshot().handoff, "news");

  store.api.end("b");
  assert.equal(store.getSnapshot().handoff, null, "ending the activity the handoff was waiting on must call it off");

  advance(islandMotion.group.handoff * 1000 + 1);
  assert.equal(store.getSnapshot().expanded, null, "there is nothing left to expand");
});

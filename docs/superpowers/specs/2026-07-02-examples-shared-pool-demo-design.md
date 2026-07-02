# Design: Examples update for the shared subscription pool (v1.11.x)

**Status:** approved (user, 2026-07-02) — examples-only change, no library code, no npm release.
**Date:** 2026-07-02
**Depends on:** `ros2-web2d@1.11.1` (`pool: true` + `ROS2D.setTopicPoolGraceMs`), spec
`2026-07-01-feed-agnostic-clients-shared-subscription-design.md` §4/§4.8.

> **한 줄 요약 (KO):** 예제 스튜디오에 ① wire-level subscribe/unsubscribe op를 실시간
> 관측하는 장치를 달고, ② 같은 토픽에 client N개를 띄워 pool:true의 dedup·grace·replay를
> 눈으로 확인하는 전용 데모를 추가하고, ③ 기존 구독 데모 5개에 "Shared subscription
> pool" 체크박스를 단다.

## 1. Problem

The v1.11.x shared subscription pool is invisible in the existing example studio:
every demo creates exactly one client per topic, so `pool: true` would change
nothing observable. The pool's headline behaviors — N clients sharing ONE wire
subscription, the deferred-unsubscribe grace window, late-join replay — need
(a) a demo with N clients on one topic and (b) a way to *see* wire traffic.

## 2. Design

### 2.1 Wire-op instrumentation (`useRosConnection`)

Wrap `ros.callOnConnection` (the single chokepoint every outgoing rosbridge op
passes through) right after constructing the `ROSLIB.Ros`. Collect only
`subscribe` / `unsubscribe` ops into React state:

```
wireOps = {
  subscribes, unsubscribes,            // lifetime counters (reset per connection)
  byTopic: { [topic]: net count },     // active wire subscriptions per topic
  log: [{ id, time, op, topic }],      // most recent ~30 ops, newest first
}
```

Notes:
- Counting at `callOnConnection` time reflects op *intent*; roslib queues sends
  while disconnected — acceptable for a demo readout.
- Reset on every (re)connect; a new `Ros` instance gets a fresh wrap, and the
  library pool is per-`ros` (WeakMap), so state and pool reset together.
- Ops from TF clients also appear — it is an honest wire view.
- Works with a silent topic: subscribe ops are sent regardless of publishers,
  which also makes the smoke test robust.

### 2.2 `ConnectionPanel` readout

One helper line: live wire subscription total (`subscribes - unsubscribes`)
plus lifetime ▲/▼ counters. Makes the pool checkboxes in *existing* demos
observable from any demo.

### 2.3 New demo: `SharedPoolDemo.jsx` ("Shared Subscription Pool")

- N `PoseStampedClient`s (1–5, default 3) on ONE topic (default `/pose`,
  draft + Apply like other demos). Each client gets a `NavigationArrow` of a
  distinct size/color, so overlapping arrows read as "N renderers, one feed".
- **Pool toggle** (default ON, applies immediately): ON → N clients : 1 wire
  subscription; OFF → 1 : 1.
- **Add/remove client buttons** (apply immediately): with pool ON the wire
  count stays 1; a client added after a pose arrived renders instantly
  (late-join replay).
- **Grace window select** (0 / 2000 / 5000 ms) driving
  `setTopicPoolGraceMs()` — applies immediately, restored to 5000 on unmount.
  With 5000 ms, removing the last client shows the wire `unsubscribe` landing
  in the log ~5 s later.
- **Stable count line** for smoke assertions
  (`clients: N · wire subscriptions on <topic>: M`, class `pool-count`,
  M = `wireOps.byTopic[topic]`) and a **wire-op log panel** (class `wire-log`).
- Client lifecycle follows the existing demo pattern: one `useEffect` keyed on
  `[ros, settings, viewer]` that recreates all clients — churn that the pool
  visibly absorbs (that is the point of the demo).

### 2.4 Existing demos: `Shared subscription pool` checkbox

OccupancyGrid, MarkerArray, LaserScan, PolygonStamped, NavigationOverlay each
get one checkbox (default **OFF** — keeps prior behavior, mirrors the
library's opt-in stance) forwarded as `pool` to their client constructor(s).
NavigationOverlay's single checkbox applies to all four clients. ImageMap is
untouched (no ROS topic).

### 2.5 Docs + smoke test

- `examples/README.md`: document the new demo and what to observe.
- New Playwright smoke spec: pool demo with grace 0 and topic
  `/robot_0/pose` — assert `3 clients : 1 sub`, `add → 4 : 1`,
  `pool off → 4 : 4`, `pool on → 4 : 1`. Message-independent (subscribe ops
  flow even from a silent topic).

## 3. Out of scope

- Library (`src/`) changes, version bump, npm publish — none needed.
- Root README pool documentation (P5 docs hygiene, separate round).
- Per-client pool toggles inside NavigationOverlay.

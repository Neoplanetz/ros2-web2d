# Design: Feed-agnostic Clients (P1) + Shared Subscription Pool (P3)

**Status:** proposed — handoff brief for implementation in *this* (ros2-web2d) session.
**Date:** 2026-07-01
**Driving consumer:** `omnifleet` (multi-robot dashboard). Requirements below come from its usage.
**Prior spec in this repo:** `docs/superpowers/specs/2026-04-19-tfclient-integration-design.md`.

> **한 줄 요약 (KO):** Client가 "구독+렌더"를 묶어놓은 걸 풀어서, ①모든 Client에 "그리기만 하고 데이터는 외부에서 먹여주는" 모드를 추가하고(P1), ②같은 토픽을 여러 Client가 보면 구독 1개를 공유하는 풀을 넣는다(P3). P1은 저위험(선례 있음), P3는 큰 공사.

---

## 1. Background — the two-layer model and how omnifleet consumes it

ros2-web2d exposes two kinds of things:

- **Render primitives** (no subscription): `OccupancyGrid` (Bitmap), `NavigationImage`, `NavigationArrow`, `PathShape`, `TraceShape`, `Marker`.
- **Clients** (subscribe to a ROS topic + own a primitive + `emit('change')`): `PoseStampedClient`, `OdometryClient`, `PathClient`, `PoseArrayClient`, `PolygonStampedClient`, `LaserScanClient`, `OccupancyGridClient`, `MarkerArrayClient`. This is the conventional ros2djs usage.

**omnifleet deliberately bypasses the Client layer for its hot-path map layers.** It subscribes with its *own* transport (`useTopic` → `SubscriptionCache`) because that layer gives it (a) **wire-level dedup** — N consumers of one topic share ONE rosbridge subscription — and (b) **churn-hardening** against the `rclpy destroy_subscription` SIGSEGV race. It then drives a ros2-web2d **render primitive** by hand.

**The cost omnifleet pays for bypassing:**
1. **Duplicated mapping.** The message→shape transform (e.g. `marker.x = pose.x; marker.y = -pose.y; marker.rotation = quaternionToGlobalTheta(...)`) is re-implemented in omnifleet's `poseExtraction.ts`, mirroring what the Client does internally. Two copies → drift risk.
2. **Lost TF.** Every Client already wraps its shape in a `ROS2D.SceneNode` when given a `tfClient` (multi-frame transforms). By bypassing Clients, omnifleet's `RobotMarker`/`GoalMarker`/`PathLine` dropped TF support (a documented regression on their side).

P1 removes both costs *without* changing anything for conventional Client users.

---

## 2. Current-state findings (grounded in this repo)

### 2.1 `MarkerArrayClient` already has the exact target pattern (v1.9.0) — use it as the reference

`src/markers/MarkerArrayClient.js`:
- Ctor JSDoc documents `subscribe` (default `true`).
- Ctor gates the topic:
  ```js
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'visualization_msgs/MarkerArray', options);
    this.rosTopic.subscribe(function(message) { that.processMessage(message); });
  } else {
    this.rosTopic = null;
  }
  ```
- `processMessage(message)` is a **public prototype method** that does ALL rendering and ends with `this.emit('change')`.

**P1 = replicate this exact shape on every other Client.**

### 2.2 The other Clients do NOT have the seam yet

Example `src/clients/PoseStampedClient.js`: the subscribe callback is an **inline anonymous closure** that renders directly — there is no `processMessage` to feed. That closure is what must be extracted.

Confirmed for `PoseStampedClient`:
- Already accepts a `shape` ctor option (inject a custom `NavigationImage`) — see ctor JSDoc + `if (options.shape) { this.marker = options.shape; }`.
- Already supports TF via `SceneNode` (the `if (that.tfClient) { ... new ROS2D.SceneNode(...) }` branch).
- `unsubscribe()` already null-guards `this.rosTopic` → **`subscribe:false` (rosTopic=null) is already safe to unsubscribe.**

### 2.3 Every Client already supports TF

`grep SceneNode|tfClient` hits **all** clients (`clients/*`, `maps/OccupancyGridClient.js`, `markers/*`). So feed-mode (P1) unlocks TF for external-transport consumers across the board — not just pose.

### 2.4 `_makeTopic` is the single chokepoint for subscriptions

`src/util/topicHelper.js` — `ROS2D._makeTopic(ros, name, type, options)` is the ONE place every subscribe-only Client constructs its `ROSLIB.Topic`. It forwards `throttle_rate` / `queue_length` / `compression` / `reconnect_on_close`. **This is where P3's shared pool hooks.**

---

## 3. P1 — Feed-agnostic Clients

### 3.1 Goal
Every Client gains a `subscribe: false` ctor option and a public `processMessage(message)` method, mirroring `MarkerArrayClient` v1.9.0. Default behavior is **byte-for-byte unchanged**.

### 3.2 Per-client recipe (mechanical, mirror `MarkerArrayClient`)
For each target client:
1. Move the body of the inline `rosTopic.subscribe(function(message){ ... })` closure into a new `ClientName.prototype.processMessage = function(message) { ...; this.emit('change'); }`.
2. Gate topic creation:
   ```js
   if (options.subscribe !== false) {
     this.rosTopic = ROS2D._makeTopic(ros, this.topicName, '<msg/Type>', options);
     this.rosTopic.subscribe(function(message) { that.processMessage(message); });
   } else {
     this.rosTopic = null;
   }
   ```
3. Confirm `unsubscribe()` null-guards `this.rosTopic` (most already do; add the guard if missing).
4. Update ctor JSDoc `subscribe` + `processMessage` docs (copy MarkerArrayClient wording).

### 3.3 Target clients
`src/clients/`: **PoseStampedClient, OdometryClient, PathClient, PoseArrayClient, PolygonStampedClient, LaserScanClient**.
`src/maps/`: **OccupancyGridClient** (it already caches `lastMessage` for `setColorizer` since 1.8.x, so a `processMessage` render path is a natural fit).
`src/markers/`: MarkerArrayClient — **already done (reference)**.

**Evaluate separately / likely out of scope:** `ImageMapClient` (loads a static image URL, not a topic), `OccupancyGridSrvClient` (service call, not a subscription). Feed-mode doesn't map cleanly; document the decision rather than forcing it.

### 3.4 Invariants
- `subscribe` omitted or `true` → identical to today (same topic, same callback, same events).
- `subscribe:false` → **no `ROSLIB.Topic` created at all** (no construct-time subscribe→unsubscribe blip), `rosTopic === null`, rendering only via `processMessage`.
- `shape` + `tfClient` continue to work in both modes (feed-mode consumers get the canonical mapping AND SceneNode TF for free — this is the omnifleet payoff).

### 3.5 Tests (TDD)
Per client, using the existing fake ROSLIB harness:
- `subscribe:false` → `_makeTopic` NOT called / no topic subscribed.
- `processMessage(msg)` positions/orients the primitive identically to the subscribing path (assert on `.x`, `.y`, `.rotation`, `.visible`) and emits `'change'`.
- `unsubscribe()` is a no-op-safe when `rosTopic === null`.
- Default path regression: subscribing behavior unchanged.

### 3.6 Version
Additive, backward-compatible → **v1.10.0**.

---

## 4. P3 — Optional shared subscription pool

### 4.1 Goal
Give *conventional Client users* the dedup + churn-safety omnifleet had to build itself. Two Clients on the same topic should share ONE `ROSLIB.Topic` and tear it down safely.

### 4.2 Hook point
Behind `ROS2D._makeTopic` (the single chokepoint, §2.4). Introduce a refcounted pool keyed by the wire identity of the subscription.

### 4.3 Sketch
- Key = `topic name` + `messageType` + **wire-affecting options** (`throttle_rate`, `queue_length`, `compression`). Consumers with different throttle rates cannot share the same underlying topic → key must include them (or pick a documented policy).
- Pool entry holds one real `ROSLIB.Topic` + a set of subscriber callbacks + a refcount. `_makeTopic` (or a new `_acquireTopic`) returns a lightweight handle that fans the single topic's messages out to N callbacks.
- Teardown: decrement on unsubscribe; only call the real `topic.unsubscribe()` when refcount hits 0, and **defer it** by a short grace window so a quick unmount→remount doesn't churn the bridge (mirrors omnifleet's deferred-disconnect pattern).

### 4.4 Open decisions (resolve in this session before coding)
1. **Default-on vs opt-in.** Default-on gives every consumer dedup automatically (biggest win) but changes the object returned by `_makeTopic`. Opt-in (a `pool: true` option or a shared `TopicPool` handle in `options`) is safer but users must know to enable it. **Recommendation: prototype opt-in first, measure, consider default-on for a later major.**
2. **Key granularity** for differing `throttle_rate` / `compression`.
3. **Grace-window duration** for deferred unsubscribe.
4. **Interaction with P1:** `subscribe:false` clients never call `_makeTopic`, so they never touch the pool — consistent, no special-casing needed. State this explicitly in tests.

### 4.5 Prior art to read (cross-repo, same author)
omnifleet's `src/lib/ros/core/SubscriptionCache.ts` + `SubscriptionRegistry.ts` — a battle-tested reference implementation of exactly this (refcount, restore-on-reconnect, churn-hardening). Do not copy blindly (different runtime), but the lifecycle decisions are already solved there.

### 4.6 Version
Additive → **v1.11.0** (separate cycle from P1).

### 4.7 Validation note
After P1, omnifleet's hot-path layers subscribe via `subscribe:false` + `useTopic`, so they **bypass the pool**. P3 is therefore validated primarily by **this repo's own test suite** (+ omnifleet's `ArrowMarker`/`MarkerArray`, which still subscribe via Clients), NOT by omnifleet live smoke.

---

## 5. P5 — Docs hygiene (low effort, do alongside)
- **`CHANGELOG.md` is stale:** head is `[1.8.1]` but `package.json` + git are at **1.9.0** (the `MarkerArrayClient subscribe:false` release). Backfill the 1.9.0 entry, then add 1.10.0 (P1) / 1.11.0 (P3) as they land.
- **README:** document the two-layer model (primitives vs Clients) and the `subscribe:false` + `processMessage` feed pattern, so consumers understand the choice.

---

## 6. Cross-repo workflow (ros2-web2d ↔ omnifleet)

`omnifleet/node_modules/ros2-web2d` is a **real install, not an npm link** → the loop is:

1. **This (ros2-web2d) session:** implement P1 (TDD) → bump to 1.10.0 → `npm run build`.
2. **Local test bridge (before publish):** `npm pack` → install the tarball into omnifleet (or a temporary `npm link`) so omnifleet can smoke-test against unreleased code with a real robot/rosbridge.
3. **Publish** → in the **omnifleet session:** bump the pin to `^1.10.0`, then migrate `RobotMarker`/`GoalMarker`/`PathLine`/`Trace` to `subscribe:false` + `processMessage`, delete the `poseExtraction.ts` duplication, reclaim TF, and run live smoke.
4. Repeat the cycle for **P3** (v1.11.0).

**Validation split:** P1 → omnifleet live smoke (the payoff lands there). P3 → this repo's test suite.

---

## 7. Ordering
**P1 first, fully (implement → omnifleet migrates → validate), then P3.** P1 is low-risk with an immediate, visible omnifleet payoff; P3 is the larger investment mainly serving external users.

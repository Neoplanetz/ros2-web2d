# Design: Examples fleet overview demo (live map + per-robot nav overlays) + README refresh

**Status:** approved (user, 2026-07-03) — examples + docs only, no library code, no npm release.
**Date:** 2026-07-03
**Depends on:** `ros2-web2d@1.11.1` API surface (all clients + `pool: true`), the demo
conventions established in `2026-07-02-examples-shared-pool-demo-design.md`.

> **한 줄 요약 (KO):** ① `/map` 라이브 맵 위에 로봇 N대의 pose/path(traj)/goal(+odom)과
> MarkerArray를 한 화면에 겹쳐 보여주는 "Fleet Overview" 데모를 추가하고(로봇별 고유 색,
> 레이어 토글, 네임스페이스 콤마 입력), ② 그 화면을 Playwright로 캡처해 README 히어로
> 이미지로 올리고 낡은 수치(테스트 289 등)를 갱신한다.

## 1. Problem

Every existing demo exercises one client family at a time. There is no page that
shows the composition a real deployment actually runs: a live occupancy grid with
several robots' poses, trajectories, goals, and shared markers layered on top of
it — which is also the single most convincing screenshot the README currently
lacks (it has no image at all).

The live environment this studio runs against is multi-robot: one shared
`/map` (`nav_msgs/OccupancyGrid`), four namespaces `/robot_0..3`, each with
`pose` (`geometry_msgs/PoseStamped`), `goal_pose` (`PoseStamped`), and `traj` /
`server_traj` / `traj_progress` (`nav_msgs/Path`), plus shared `MarkerArray`
topics (`/topology_graph`, `/delay_markers`, `/wait_markers`). No `Odometry` or
`LaserScan` topics are currently published.

## 2. Design — `FleetOverviewDemo`

New file `examples/src/demos/FleetOverviewDemo.jsx`, registered as the FIRST
entry of `DEMOS` in `App.jsx` (key `fleet-overview`, label "Fleet Overview") and
made the default `activeDemoKey`, since it is the studio's new hero view.

### 2.1 Controls (draft/settings + Apply, existing convention)

| Control | Default | Notes |
|---|---|---|
| Robot namespaces (CSV) | `/robot_0,/robot_1,/robot_2,/robot_3` | trimmed, empty entries dropped; empty list → no robot overlays |
| Map topic | `/map` | `OccupancyGridClient`, `continuous: true` |
| Map colorizer | `map` | select: `map` / `costmap` |
| Marker topics (CSV) | `/topology_graph` | one `MarkerArrayClient` per entry |
| Layer: Pose | on | topic = `{ns}/{poseSuffix}` |
| Layer: Path | on | topic = `{ns}/{pathSuffix}` |
| Layer: Goal | on | topic = `{ns}/{goalSuffix}` |
| Layer: Odom | **off** | topic = `{ns}/{odomSuffix}`; off by default because no live topic exists |
| Layer: Markers | on | governs all marker topics |
| Suffix inputs | `pose` / `traj` / `goal_pose` / `odom` | lets the same page target `server_traj` etc. |
| Use TF / fixed frame | off / `map` | same semantics as NavigationOverlayDemo (`createTfClient`) |
| Shared subscription pool | off | forwards `pool` to every client, consistent with other demos |

Apply commits `draft` → `settings`; the effect tears down and rebuilds all
clients (existing convention — no incremental reconciliation).

### 2.2 Rendering

- Z-order via three roots created in order: map root (bottom) → marker root →
  robot-overlay root (top). `createDemoRoot(viewer)` per root; all removed on
  cleanup.
- First map `change` event fits the viewer once via
  `createInitialMapViewFitter(viewer)`; later map updates do not re-fit.
- Per-robot color identity: palette of 8 distinct hues, assigned by namespace
  index (cycles past 8). Within one robot's hue:
  - Pose — `NavigationArrow`, size 1.2 (deliberately larger than physical
    scale so robots stay visible at whole-map zoom, like fleet dashboards),
    solid fill with a thin dark outline (strokeSize 0.06) so any hue stays
    visible over same-colored markers or map ink.
  - Goal — `NavigationArrow`, size 0.9, same hue at ~45% alpha (hollow feel).
  - Path — stroke ~0.05 m in the robot hue.
  - Odom — `NavigationArrow`, size ~0.55, darker shade of the hue.
- Markers render with library defaults (MarkerArray messages carry their own
  colors).
- Status line: last event, e.g. `Map ready from /map` / `robot_1 pose updated`,
  plus a static readout of active client count after Apply.

### 2.3 Cleanup

Effect teardown mirrors NavigationOverlayDemo: `off('change')` every client,
`unsubscribe()` every client, `disposeTfClient`, `removeDemoRoot` × 3. Client
count is dynamic (1 map + M markers + R robots × enabled layers), so clients are
kept in arrays and iterated.

## 3. README refresh + screenshot

- Capture: run the built studio against the live rosbridge, open Fleet
  Overview, wait for map + 4 robots + topology markers to render, screenshot the
  full app shell (sidebar + viewer) via Playwright at ≥1440×900. Retina-quality
  PNG committed to `docs/media/example-studio-fleet.png` (new `docs/media/`
  directory; `docs/` is not part of the npm `files` whitelist, so no package
  bloat).
- README changes:
  - Hero image right under the intro paragraph, using the absolute raw URL
    (`https://raw.githubusercontent.com/Neoplanetz/ros2-web2d/main/docs/media/example-studio-fleet.png`)
    so it renders on npmjs.com as well as GitHub, with alt text and a one-line
    caption linking to `examples/`.
  - Examples section: mention the studio now ships 8 demos and list them;
    call out Fleet Overview as the composite view.
  - Fix stale numbers: "289 tests" → current count; anything else spotted
    inline (verify against `npm test` output at implementation time).

## 4. Testing

- New Playwright smoke: open Fleet Overview (it is the default demo — the test
  still clicks its sidebar button explicitly for robustness), assert map pixels
  painted AND at least one robot overlay painted (reuse the existing
  painted-pixel helper pattern), using the live rosbridge like the other smokes.
- Existing smokes select their demos by clicking sidebar buttons, so changing
  the default demo must not affect them — verify all 8 smokes pass locally.
- Unit tests: none needed (no `src/` or `ros2dHelpers.js` changes expected). If
  a helper change does become necessary, it gets a vitest case per existing
  test conventions.
- Full gate before PR: `npm run lint`, `npm test`, examples `npm run build`,
  Playwright smoke suite, CI green.

## 5. Out of scope

- No library (`src/`) changes, no new public API, no npm release.
- No LaserScan layer (user opted out; no live topic).
- No robot auto-discovery via rosapi (namespace CSV is enough for a demo).
- No per-robot color customization UI.

## 6. Notes / risks

- `pool: true` here dedups nothing across robots (topics are all distinct);
  the checkbox exists for convention consistency and for the shared `/map` +
  OccupancyGridDemo cross-demo case.
- 4 robots × 3 layers + map + markers ≈ 14 clients — well within what the
  studio already handles (SharedPoolDemo runs 5 clients on one topic plus
  instrumentation).
- Odom layer ships default-off; enabling it against the current live system
  shows nothing (no publisher) — the status line simply never reports odom
  updates, which is acceptable demo behavior.

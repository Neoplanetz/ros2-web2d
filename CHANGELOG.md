# Changelog

All notable changes to this project are documented here.
The project follows [Semantic Versioning](https://semver.org/).

## [1.4.3] — 2026-04-27

### Removed

- **`queue_size` and `latch` no longer forwarded** by any Client. Per
  the rosbridge protocol, these belong to the `advertise` op (publisher
  side); the `subscribe` op only carries `compression`, `throttle_rate`,
  and `queue_length`. Every Client in this library is a subscriber, so
  passing `queue_size` or `latch` had no effect on the wire — they
  were stored on the local `ROSLIB.Topic` instance and ignored. The
  v1.4.1 docs/forwarding listed them by mistake; v1.4.3 drops them
  from the API surface (helper, JSDoc, README, tests). Existing code
  that passed them was already getting silent no-op behavior, so
  removing the options does not change runtime behavior.

### Changed

- **README forwarded-options table** trimmed to the four options that
  actually reach rosbridge during subscribe (`throttle_rate`,
  `queue_length`, `compression`, `reconnect_on_close`). The
  `queue_length` description is corrected to "Bridge-side subscriber
  queue length" (it was mistakenly described as "Client-side queue
  depth"). The example code now uses `queue_length: 1` instead of
  `queue_size: 1`.
- **Forwarding tests** assert against `topic.subscribeOptions` (a new
  capture in the fake ROSLIB.Topic that records what would actually
  go on the wire when `subscribe()` is invoked) instead of
  `topic.opts`. This pins the tests to protocol-level behavior so a
  future regression that drops a key from the helper would be caught
  immediately.

## [1.4.2] — 2026-04-27

### Changed

- **`OccupancyGrid` `'costmap'` palette refinements** — based on the
  v1.4.1 code review:
  - The dedicated pink `value === 99` band has been removed. The
    inflation gradient now extends continuously through value 99 as a
    single blue → cyan → yellow → red rainbow, so adjacent cost cells
    no longer jump through unrelated hues. Lethal (`value === 100`)
    still renders as pure red but with a higher alpha than the
    gradient peak so it visibly stands above the inflation band.
  - Unknown cells (`value === -1`) now render as a faint gray (alpha
    50) instead of fully transparent, preserving a debug signal when a
    costmap publisher is misbehaving (free cells at `value === 0`
    remain fully transparent so the costmap still overlays cleanly on
    a base `/map`).
  - Gradient max alpha lowered from 180 to 160 so the lethal alpha
    (180) is visibly distinct from the high end of the inflation band.

### Added

- **Custom `colorizer` validation** — `ROS2D.OccupancyGrid` now probes
  a user-supplied colorizer function with `colorizer(0)` once before
  the render loop and throws a descriptive `Error` when the return is
  not `[r, g, b, a]` of four finite numbers. A typo'd colorizer used
  to silently produce a blank canvas; failure is now immediate and
  loud.

### Internal

- **Topic options helper** — the per-client list of forwarded
  `ROSLIB.Topic` options (`throttle_rate`, `queue_size`,
  `queue_length`, `compression`, `latch`, `reconnect_on_close`) is now
  centralized in `ROS2D._makeTopic` (see `src/util/topicHelper.js`).
  Adding a new forwarded option in the future is a one-file change.
  Public API and behavior are unchanged.

## [1.4.1] — 2026-04-26

### Added

- **ROSLIB.Topic options forwarded** by every topic-based client
  (`MarkerArrayClient`, `OccupancyGridClient`, `PathClient`,
  `PoseStampedClient`, `OdometryClient`, `PoseArrayClient`,
  `LaserScanClient`). New top-level options:
  `throttle_rate`, `queue_size`, `queue_length`, `compression`,
  `latch`, `reconnect_on_close`. Lets dashboards rate-limit live
  topic streams (e.g. cap a noisy `/scan` at 10 Hz with
  `throttle_rate: 100`) without subclassing the client.

  Backward compatible: omit any of the new options and behavior is
  byte-for-byte identical to 1.4.0.

## [1.4.0] — 2026-04-24

### Added

- **`OccupancyGrid` colorizer** — new `options.colorizer` accepts a
  preset name (`'map'`, `'costmap'`) or a custom
  `(value) => [r, g, b, a]` function. The `'costmap'` preset renders
  nav2 inflation as an rviz-style blue → cyan → yellow gradient with
  pink inscribed and red lethal bands, and sets per-cell alpha so a
  costmap overlays cleanly on a base `/map`.
- **`OccupancyGridClient`** forwards the new `colorizer` option to
  every grid it constructs, so the same client can be pointed at
  `/local_costmap/costmap` with `colorizer: 'costmap'`.
- Example studio's OccupancyGrid demo now exposes a colorizer select
  so the costmap gradient is reachable from the live demo app.

### Changed

- **Project rebrand**: the npm package and repository are now
  `ros2-web2d`, signalling the ROS 2-only, browser-based 2D role
  explicitly. The previous `ros2d` npm name is controlled by the
  upstream [ros2djs](https://github.com/RobotWebTools/ros2djs) project
  and has always referred to ROS 2-**Dimensional** (not ROS 2). The
  new name removes that ambiguity: `ros2-web2d` = **ROS 2** + **web**
  + **2D**. Import paths change from `'ros2d'` to `'ros2-web2d'`;
  the `ROS2D` browser global and the public API remain unchanged.

## [1.3.2] — 2026-04-23

### Changed

- **`RotateView`** reworked to pivot around the drag-start point and map
  horizontal drag distance to degrees linearly via a new
  `options.degreesPerPixel` (default `0.35`). The previous
  atan2-from-stage-origin model produced unpredictable rotation once
  the viewer had been shifted or zoomed. The undocumented
  `startAngle` internal field was removed; public signatures
  (`startRotate`, `rotate`) are unchanged.

### Added

- **`ImageMapClient` PGM support** — `.pgm` URLs are now decoded in the
  browser (P5 binary and P2 ASCII, 8/16-bit), so a `map_server`-style
  `map.yaml + map.pgm` pair works without pre-converting to PNG.
- **Example studio helpers** (`examples/src/lib/ros2dHelpers.js`):
  `enableViewerMouseControls` (left-drag pan / right-drag rotate /
  wheel zoom) and `createInitialMapViewFitter` (one-shot auto-fit that
  preserves user pan/zoom on subsequent map messages).

## [1.3.1] — 2026-04-22

Patch release over 1.3.0: the 1.3.0 bundle crashed in the browser
because several ES6-class constructors referenced `this` before their
`super()` call. Fixing the transpile/source ordering unblocks every
Shape-extending renderer.

### Fixed

- **Shape-extending classes** (`NavigationArrow`, `ArrowShape`,
  `PathShape`, `TraceShape`, and the new `LaserScanShape`) now hoist
  the parent-constructor call to the top of the constructor so the
  transpiled ES6 class emits `super()` before any `this` reference.
  Before this, loading `ros2d.min.js` from a CDN crashed with
  "Must call super constructor in derived class" on first instantiation.
- **`PoseStampedClient` / `OdometryClient`** set `marker.visible = true`
  on the `tfClient` path; previously the wrapped arrow inherited its
  startup `visible = false` and stayed hidden forever inside an
  otherwise-visible `SceneNode`.
- **`NavigationImage`** pulse animation binds `this` inside the Ticker
  callback (was writing `scaleX` / `scaleY` onto the Ticker object).
- **`PathShape`** guards an empty `poses` array that previously threw
  at `path.poses[0]`.

### Added

- **`ImageMapClient` YAML loader** — `options.yaml` fetches a
  `map_server`-style YAML, parses `image` / `resolution` / `origin`,
  and loads the referenced asset. Legacy
  `{image, width, height, ...}` inputs keep working.
- **`LaserScanClient` + `LaserScanShape`** replace the dead ros3djs
  `LaserScan` / `Points` ports that never ran in 2D. The client
  subscribes to `sensor_msgs/LaserScan` and wires the shape into
  `rootObject` with optional `tfClient`.
- **Vite + React example studio** (`examples/`) — a single-page app
  covering every client: OccupancyGrid, ImageMap, MarkerArray,
  LaserScan, and the navigation overlay stack.

### Changed

- `PathShape` draw logic deduplicated into a private `_drawPath`
  helper; constructor and `setPath` now share the same path.

## [1.3.0] — 2026-04-21

Introduces **TF-aware rendering** across every client via a new
`ROS2D.SceneNode`. Every client gains an optional `tfClient` slot;
when omitted, behavior is byte-for-byte identical to 1.2.x.

### Added

- **`ROS2D.SceneNode`** — a `createjs.Container` subclass that
  subscribes to a `ROSLIB.TFClient` (or `ROSLIB.ROS2TFClient`) on
  construction, stays hidden until the first transform arrives, and
  owns the single Y-negate on the TF render path. Methods:
  `setPose(pose)`, `setFrame(frameId)`, `unsubscribe()`. Emits a
  one-shot `console.warn` after 1 s without a transform to surface
  `frame_id` typos.
- **`tfClient` option** on `MarkerArrayClient`, `PathClient`,
  `PoseStampedClient`, `OdometryClient`, `PoseArrayClient`, and
  `OccupancyGridClient`. Each marker / overlay is wrapped in its own
  `SceneNode` keyed on the message's `header.frame_id`, so
  multi-robot deployments with mixed frames (e.g. `/robot_0/map`,
  `/robot_1/odom`) render correctly.
- **`Marker.applyPose`** option (default `true`). `MarkerArrayClient`
  passes `false` so the marker sits at the origin while the wrapping
  `SceneNode` handles positioning.
- **Multi-frame integration test** — two `SceneNode` instances on
  different frames remain independent under distinct transforms.

### Compatibility

- No `tfClient` → every client renders exactly as in 1.2.x.
- Test suite grows from 74 → 130 tests across 16 files.

## Earlier history

Versions prior to 1.3.0 exist only as git tags (`v1.0.0` through
`v1.2.1`). For context on the pre-fork codebase, see the upstream
project at [RobotWebTools/ros2djs](https://github.com/RobotWebTools/ros2djs).

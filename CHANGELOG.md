# Changelog

All notable changes to this project are documented here.
The project follows [Semantic Versioning](https://semver.org/).

## [1.7.0] — 2026-04-28

### Added

- **`ArrowShape` proportional dimension options** —
  `shaftLength`, `shaftWidth`, `headLength`, `headWidth` (all in the
  same unit as `size`). When any of these is provided the shape
  switches to an "extended mode" that draws a single filled
  7-vertex polygon with explicit shaft thickness, matching the
  RViz arrow appearance and the visualization_msgs/Marker
  scale.x / scale.y / scale.z convention. When none are provided,
  the legacy line-shaft + filled-triangle-head rendering is
  preserved byte-for-byte for backward compatibility.

### Changed

- **`Marker` case 0 ARROW maps `scale.x/y/z` to ArrowShape's new
  proportional options.** Pre-1.7 the case used only `scale.x` as
  `size` and ignored `scale.y` (shaft diameter) and `scale.z`
  (head length), so an omnifleet "task_marker" goal arrow at
  `(3, 0.5, 0.5)` rendered as a tiny 1 m triangle. The case now
  forwards all three dimensions to `ArrowShape` (with fallbacks:
  `shaftLength=1`, `shaftWidth=0.1`, `headLength=0.23 * shaftLength`
  when `scale.z` is 0/missing, `headWidth=2 * shaftWidth`), so
  arrows render at the size and proportions the RViz / nav2
  message intended. The `strokeSize: 0` fill-only contract from
  v1.6.2 is preserved.

## [1.6.2] — 2026-04-28

### Fixed

- **`ArrowShape` respects `strokeSize: 0`** — the `var strokeSize =
  options.strokeSize || 3;` fallback treated an explicit 0 as falsy
  and substituted 3, so callers that wanted a fill-only arrow got a
  3-unit-wide outline. `Marker` case 0 ARROW always passes
  `strokeSize: 0` to draw only the filled triangular head; under a
  typical px-per-meter scene scale (~70 px/m) the unwanted 3-unit
  stroke rendered as a 210 px outline that completely swallowed the
  ~47 px filled head, so a single nav2 task arrow appeared as a
  ~200 px square covering the robot icon. The fallback now uses an
  explicit `!== undefined` check, and the stroke commands are
  guarded by `if (strokeSize > 0)` so a zero or garbage strokeSize
  produces a clean fill-only arrow with no shaft line and no
  zero-width hairline (matches the existing `NavigationArrow`
  pattern).
- **`Marker` `TEXT_VIEW_FACING` (type 9) renders at the correct
  size** — case 9 sized the text with `` `${scale.z}px Arial` ``,
  treating `scale.z` (meters in the RViz convention) as a pixel font
  size. Sub-meter labels like the omnifleet 0.4 m "Task: T001" tag
  rasterized as a sub-pixel-tall texture that the parent scene then
  upscaled into a blurry / invisible smear. The text is now
  rasterized at a fixed 100 px font and scaled by
  `scale.z / 100` so the rendered height ends up at `scale.z`
  meters in world units, matching RViz vector text.
  `textAlign = 'center'` / `textBaseline = 'middle'` center the text
  on the marker pose, again matching RViz.

Both fixes are reported by Neoplanetz/omnifleet via multi-robot
rosbag verification. No external API change — purely rendering
correctness.

## [1.6.1] — 2026-04-28

### Fixed

- **`PolygonStampedClient` documentation accuracy.** The v1.6.0 docs
  claimed nav2 publishes the active footprint in the robot's
  `base_link` frame and recommended pairing the client with a
  `tfClient` to make the outline track the robot pose. That is
  incorrect: `nav2_costmap_2d` calls `getOrientedFootprint()` every
  publish tick to apply the current robot pose, then publishes the
  resulting polygon already oriented in the costmap global frame
  (typically `map` or `odom`). A consumer whose viewer's fixed frame
  matches the publisher's frame does not need a `tfClient` at all —
  the polygon already moves with the robot because nav2 republishes
  the transformed shape on every tick. Pair the client with a
  `tfClient` only when the viewer's fixed frame differs from the
  publisher's frame.
- Updated CHANGELOG (1.6.0 entry), README (Client reference table),
  source JSDoc (`src/clients/PolygonStampedClient.js`), examples
  studio (App.jsx demo summary, `PolygonStampedDemo.jsx` copy), and
  the unit test fixture frames (now `map` / `robot_0/map` /
  `robot_1/map` instead of `base_link` variants) to match.

No code path changed — this is a docs / fixture-only release. Behavior
of `PolygonStampedClient` and `PolygonShape` is byte-for-byte
identical to v1.6.0.

## [1.6.0] — 2026-04-28

### Added

- **`ROS2D.PolygonStampedClient`** — subscribes to
  `geometry_msgs/PolygonStamped` and renders each message as a closed
  outline. The default topic is
  `/local_costmap/published_footprint`, the standard nav2 footprint
  channel. Published footprints are already oriented in their message
  frame; pair the client with a `tfClient` only when the viewer needs
  frame conversion. In multi-robot deployments construct one client
  per robot with a distinct `strokeColor` for visual attribution.
- **`ROS2D.PolygonShape`** — read-only renderer used by
  `PolygonStampedClient`. A thin `createjs.Shape` that takes a list
  of `{ x, y }` vertices via `setPolygon(points)` and draws a stroked
  (optionally filled) closed (or open) polyline. Handles the canvas
  Y-flip via `negateY` so it works either standalone or wrapped in a
  `SceneNode`. Distinct from the existing `ROS2D.PolygonMarker`,
  which is an interactive editor with line/point callbacks; choose
  `PolygonShape` for read-only rendering and `PolygonMarker` for
  user-edit flows.

  29 new unit tests covering rendering invariants (closed/open,
  fill/no-fill, Y-flip, invalid-vertex rejection, no-overdraw on
  re-set) and client wiring (topic options forwarding via the
  v1.4.3 helper, tfClient/SceneNode integration with frame retarget,
  unsubscribe cleanup including TF subscriber teardown).

## [1.5.1] — 2026-04-27

### Fixed

- **`PoseInteractionView` now works with touch events.** The
  left-button-only check used `event.nativeEvent.button !== 0`, which
  silently rejected touch events because their `nativeEvent` does not
  expose a `button` field at all. The check now only rejects when
  `button` is explicitly a non-zero number, so mouse-down with
  button=0 and any touchstart both pass through.
- **Multi-touch isolation** — the view now records the pointer ID at
  drag start and ignores `stagemousemove` / `stagemouseup` events
  whose pointer ID does not match. A second finger touching the
  canvas mid-drag no longer hijacks the gesture. (Mouse pointers
  share a constant pointer ID, so the existing single-mouse path is
  unchanged.)

### Changed

- **`PoseInteractionView`** preview arrow is now created lazily only
  after the drag distance crosses `dragThresholdPx`, instead of on
  the first `stagemousemove` of any drag. Sub-threshold jitter on a
  pure tap no longer allocates a `NavigationArrow` or mutates the
  scene.

## [1.5.0] — 2026-04-27

### Added

- **`ROS2D.PoseInteractionView`** — interactive 2D pose picker (the
  web equivalent of rviz2's "2D Goal Pose" tool). Click on the map,
  drag to indicate a heading, and `onCommit({ x, y, yaw })` fires on
  release with the result in the ROS world frame (yaw in radians,
  CCW from +X; `undefined` when the drag was below
  `dragThresholdPx`). The view owns its own `NavigationArrow`
  preview and handles the canvas Y-flip and rotation-sign
  conventions internally. Lifecycle methods: `enable()`,
  `disable()`, `destroy()`. Construct with `enabled: false` to defer
  listener attachment.

  Extracted and generalized from a downstream consumer's "goal mode"
  implementation so dashboards no longer have to re-derive the
  drag-threshold math, the world-frame yaw, or the y-negation
  conventions every time. New file: `src/visualization/PoseInteractionView.js`.

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

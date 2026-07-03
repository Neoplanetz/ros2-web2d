# ros2-web2d

A web-based 2D visualization library **for ROS 2**. Renders
occupancy grids, markers, paths, poses, odometry, and laser scans
onto an [EaselJS](https://createjs.com/easeljs) stage, driven by
[roslibjs](https://github.com/RobotWebTools/roslibjs) over rosbridge.

> ROS 2 only. ROS 1 (`roscpp`/`rospy`) installations are not supported —
> the library targets rosbridge v2 topic types (e.g.
> `nav_msgs/msg/OccupancyGrid`, `geometry_msgs/msg/PoseStamped`). Use
> the original [ros2djs](https://github.com/RobotWebTools/ros2djs) if
> you are on ROS 1.

<p align="center">
  <img src="https://raw.githubusercontent.com/Neoplanetz/ros2-web2d/main/docs/media/example-studio-fleet.png"
       alt="ros2-web2d Fleet Overview demo: a live occupancy grid with a topology-graph MarkerArray and four robots' poses, one color per robot"
       width="850">
</p>
<p align="center"><em>The <a href="./examples">example studio</a>'s Fleet Overview demo, live over rosbridge — one shared map, a topology-graph <code>MarkerArray</code>, and four robots' poses, one color per robot.</em></p>

```js
import { Viewer, OccupancyGridClient } from 'ros2-web2d';
import ROSLIB from 'roslib';

const ros    = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
const viewer = new Viewer({ divID: 'map', width: 800, height: 600 });

new OccupancyGridClient({ ros, rootObject: viewer.scene });
```

## Features

- **TF-aware rendering** — every client accepts an optional
  `tfClient` and wraps its output in a `SceneNode` that subscribes
  to the message's `header.frame_id`. Multi-robot deployments with
  mixed frames (e.g. `/robot_0/map`, `/robot_1/odom`) render
  correctly side-by-side. Without `tfClient`, clients behave exactly
  as in 1.2.x.
- **Map rendering** — `OccupancyGridClient` for live
  `nav_msgs/OccupancyGrid` streams, `ImageMapClient` for
  `map_server`-style `map.yaml` + `.pgm` / `.png` / `.svg` assets
  (the YAML and PGM loaders run entirely in the browser).
- **Navigation overlays** — `PathClient`, `PoseStampedClient`,
  `OdometryClient`, `PoseArrayClient`, all share the same TF path
  and compose cleanly on one viewer.
- **Markers** — `MarkerArrayClient` honors the ADD / MODIFY /
  DELETE / DELETEALL actions, per-marker lifetimes, and the ten
  marker primitives that project meaningfully into 2D.
- **Sensors** — `LaserScanClient` renders `sensor_msgs/LaserScan`
  as 2D points, with optional sampling and range filters.
- **Feed mode** — every subscribing client also takes `subscribe: false`
  plus a public `processMessage(message)`, so a consumer that owns the
  topic subscription elsewhere (a shared cache, its own transport) can
  reuse the client's message→shape mapping and TF wrapping as a pure
  renderer.
- **Mouse controls** — a drop-in
  [`enableViewerMouseControls`](./examples/src/lib/ros2dHelpers.js)
  helper in the example studio wires left-drag pan, right-drag
  rotate, and wheel zoom to any `Viewer`.
- **Modern build** — ES modules, Rollup bundles (CJS / ESM /
  IIFE), TypeScript declarations, and a vitest suite with 334
  tests at the time of writing.

## Install

```bash
npm install ros2-web2d
```

Peer-installed alongside [`roslib`](https://github.com/RobotWebTools/roslibjs)
`^2.x` and `createjs` / `easeljs`.

### ESM

```js
import { Viewer, OccupancyGridClient } from 'ros2-web2d';
```

### CommonJS

```js
const { Viewer, OccupancyGridClient } = require('ros2-web2d');
```

### Browser IIFE

```html
<script src="https://cdn.jsdelivr.net/npm/easeljs@1/lib/easeljs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/roslib@2"></script>
<script src="https://cdn.jsdelivr.net/npm/ros2-web2d@1.3.2/build/ros2d.min.js"></script>
<script>
  const viewer = new ROS2D.Viewer({ divID: 'map', width: 640, height: 480 });
</script>
```

> The browser global is `ROS2D`, kept for historical compatibility with
> the original ros2djs API surface. ESM / CJS imports use the new
> `ros2-web2d` specifier but the class names are unchanged, so
> `ROS2D.Viewer` and `import { Viewer } from 'ros2-web2d'` refer to the
> same constructor. A namespace rename (e.g. `ROS2WEB2D`) is deferred
> to a future major release with a deprecation window.

## TF-aware rendering

Every client that used to ignore `header.frame_id` now accepts an
optional `tfClient`. On first message for a given `frame_id`, the
client creates a `ROS2D.SceneNode` that subscribes to TF, stays
hidden until the first transform arrives, and then composes the
message's pose into the configured `fixedFrame`.

```js
import { PoseStampedClient, OdometryClient, PathClient } from 'ros2-web2d';

const tfClient = new ROSLIB.ROS2TFClient({
  ros,
  fixedFrame: 'map',
  angularThres: 0.01,
  transThres: 0.01,
  rate: 10.0,
});

new PoseStampedClient({ ros, topic: '/goal_pose',  rootObject: viewer.scene, tfClient });
new OdometryClient   ({ ros, topic: '/odom',       rootObject: viewer.scene, tfClient });
new PathClient       ({ ros, topic: '/plan',       rootObject: viewer.scene, tfClient });
```

All four overlays converge into the same fixed frame without the
caller touching coordinate math. `SceneNode` owns the single Y-negate
on the TF path, so child display objects keep using ROS coordinates.

Multi-robot arrays work the same way — `MarkerArrayClient` picks up
each marker's own `header.frame_id`, so a single `MarkerArray` mixing
`/robot_0/odom` and `/robot_1/odom` frames renders each robot at its
own TF position.

## Costmap overlays

`OccupancyGridClient` accepts a `colorizer` option that controls how
each cell is painted. The `'map'` preset is the default grayscale
renderer (free/occupied/unknown). The `'costmap'` preset implements an
rviz-style inflation gradient — free and unknown cells are
transparent, inflation goes blue → cyan → yellow, the inscribed band
renders pink, and lethal (100) is red — with per-cell alpha scaling so
a `/local_costmap/costmap` layer overlays cleanly on a base `/map`
rendered in a lower `rootObject` layer.

```js
// Base /map, grayscale
new OccupancyGridClient({ ros, topic: '/map', rootObject: viewer.scene });
// nav2 local costmap on top of it
new OccupancyGridClient({
  ros,
  topic: '/local_costmap/costmap',
  colorizer: 'costmap',
  rootObject: viewer.scene,
});
```

Pass a function for full control: `colorizer: (value) => [r, g, b, a]`
receives the raw cell value (`-1` for unknown, `0..100` for cost) and
returns a 0..255 RGBA tuple.

## Client reference

| Client | Topic type | Notes |
|--------|------------|-------|
| `OccupancyGridClient` | `nav_msgs/OccupancyGrid` | Continuous or one-shot; `tfClient` wraps the grid in a `SceneNode`; `colorizer: 'costmap'` renders nav2 inflation gradients over a base map |
| `ImageMapClient` | (none) | Loads `map.yaml` + image asset directly; supports `.png` / `.svg` / `.pgm` |
| `MarkerArrayClient` | `visualization_msgs/MarkerArray` | Supports ADD / MODIFY / DELETE / DELETEALL and lifetimes |
| `PathClient` | `nav_msgs/Path` | Draws the path through `PathShape` |
| `PoseStampedClient` | `geometry_msgs/PoseStamped` | Default arrow via `NavigationArrow`; pass `shape` to override; `applyOrientation: false` for position-only markers |
| `OdometryClient` | `nav_msgs/Odometry` | Same arrow surface as `PoseStampedClient`; extracts `pose.pose`; supports `applyOrientation: false` |
| `PoseArrayClient` | `geometry_msgs/PoseArray` | Rebuilds every message; useful for AMCL particle clouds |
| `LaserScanClient` | `sensor_msgs/LaserScan` | 2D hit points with optional `sampleStep` / `maxRange` |
| `PolygonStampedClient` | `geometry_msgs/PolygonStamped` | Closed outline via `PolygonShape`; default topic `/local_costmap/published_footprint` for active nav2 footprints; optional `tfClient` follows `header.frame_id` when frame conversion is needed |

Shared options on ROS-driven clients: `ros`, `topic`, `rootObject`,
`tfClient`, and `subscribe` (set it to `false` to run the client as a pure
renderer you feed yourself — see [Rendering
models](#rendering-models-subscribing-clients-vs-feed-mode) below). Every
client also forwards the standard `ROSLIB.Topic` subscribe options when
supplied. Only options that the rosbridge
`subscribe` op actually carries (plus the connection-level
`reconnect_on_close`) are forwarded; advertise-only options like
`queue_size` and `latch` are intentionally omitted because every
client in this library is a subscriber.

| Option | Type | Notes |
|--------|------|-------|
| `throttle_rate` | number (ms) | Minimum interval between delivered messages |
| `queue_length` | number | Bridge-side subscriber queue length |
| `compression` | `'none'` / `'cbor'` / `'cbor-raw'` / `'png'` | rosbridge compression scheme |
| `reconnect_on_close` | boolean | Auto-resubscribe after disconnect |

```js
new MarkerArrayClient({
  ros, topic: '/markers', rootObject: viewer.scene,
  throttle_rate: 100,    // 10 Hz cap
  queue_length: 1,
  compression: 'cbor',
});
```

## Rendering models: subscribing Clients vs feed mode

The library is two layers:

- **Render primitives** — `OccupancyGrid`, `NavigationArrow`, `PathShape`,
  `PolygonShape`, `LaserScanShape`, `Marker`. Plain EaselJS display objects
  that draw a single message. They never touch ROS.
- **Clients** — `OccupancyGridClient`, `PoseStampedClient`, `PathClient`,
  `MarkerArrayClient`, … Each subscribes to a ROS topic, owns a render
  primitive, maps every incoming message onto it (the Y-negate and, with a
  `tfClient`, the `SceneNode` TF wrapping), and emits `'change'`.

Most apps just construct a Client and let it own the subscription. But if you
already own the subscription elsewhere — say a shared cache that dedupes N
consumers of one topic onto a single rosbridge subscription — you can run any
subscribe-only Client as a **pure renderer** with `subscribe: false` and feed
it messages through `processMessage(message)`:

```js
// subscribe:false → no ROSLIB.Topic is created (client.rosTopic === null).
const pose = new PoseStampedClient({
  ros, rootObject: viewer.scene, tfClient,
  subscribe: false,
});

// Drive it from your own transport / subscription cache:
myTopicCache.subscribe('/goal_pose', (msg) => pose.processMessage(msg));
```

In feed mode the Client still gives you its canonical message→shape mapping
**and** its `SceneNode` TF wrapping (`tfClient`), plus every render option
(`shape`, `colorizer`, …) — you only take over *where the messages come from*.
Omit `subscribe` (or pass `true`) and the Client subscribes itself exactly as
before; the option is purely additive, so existing code is unaffected.
`unsubscribe()` stays safe in feed mode (a no-op on the null topic that still
tears down the `SceneNode` and removes the primitive).

Supported on every subscribe-only Client: `PoseStampedClient`,
`OdometryClient`, `PathClient`, `PoseArrayClient`, `PolygonStampedClient`,
`LaserScanClient`, `MarkerArrayClient`, and `OccupancyGridClient`.
`ImageMapClient` (loads a static image) and `OccupancyGridSrvClient` (a service
call) are not topic subscribers, so they have no feed mode.

### Position-only pose markers (`applyOrientation: false`)

`PoseStampedClient` and `OdometryClient` accept `applyOrientation: false` for
markers whose rotation is owned by the shape itself — e.g. a goal flag that
must always stand upright regardless of the goal yaw:

```js
const flag = new ROS2D.NavigationImage({ size: 0.6, image: flagSvgDataUri });
flag.rotation = -90; // fixed upright; the client will never overwrite it

new PoseStampedClient({
  ros, topic: '/robot_0/goal_pose', rootObject: viewer.scene,
  shape: flag,
  applyOrientation: false, // position (and TF) only — message yaw is ignored
});
```

The marker still follows `pose.position` (Y-negated), still hides until the
first message, and still gets `SceneNode` TF wrapping with a `tfClient` — the
node is simply driven with an identity orientation so frame transforms apply
without composing the message yaw. Combine with `subscribe: false` to feed a
position-only marker from your own transport.

## Shared subscription pool (`pool: true`)

By default every Client opens its own `ROSLIB.Topic` — two clients on the same
topic mean two rosbridge subscriptions. Passing `pool: true` opts a
subscribe-only Client into a refcounted, per-connection subscription pool: all
pooled Clients whose wire identity matches (topic name + message type +
`throttle_rate` / `queue_length` / `compression` / `reconnect_on_close`) share
**one** underlying `ROSLIB.Topic`.

```js
// One rosbridge subscription on /markers, two rendering clients:
new MarkerArrayClient({ ros, topic: '/markers', rootObject: layerA, pool: true });
new MarkerArrayClient({ ros, topic: '/markers', rootObject: layerB, pool: true });
```

Pool semantics:

- **Refcounted teardown with a grace window.** When the last pooled consumer
  of a topic unsubscribes, the real `unsubscribe()` is deferred (default
  5000 ms) so a quick unmount→remount reuses the live subscription instead of
  churning the bridge — rapid subscribe/unsubscribe cycles can trip a known
  `rclpy destroy_subscription` race in rosbridge. Configure with
  `ROS2D.setTopicPoolGraceMs(ms)` (`0` = tear down immediately).
- **Late-join replay.** The last dispatched message is retained and replayed
  to a Client that joins an already-live shared topic, so a pooled Client on a
  latched topic (e.g. a map) still renders even if it subscribes after the
  last publish. The retained message is dropped on real teardown — nothing
  stale replays once the wire subscription actually ends.
- **Consumer isolation.** Each pooled Client is dispatched in its own
  `try/catch`; one throwing consumer cannot starve its siblings.
- **Strictly opt-in.** Omit `pool` and `_makeTopic` behaves exactly as before
  (a fresh `ROSLIB.Topic`, immediate unsubscribe). Clients whose wire options
  differ never coalesce — they get separate pooled entries. `subscribe: false`
  Clients never create a topic at all, so they never touch the pool.

## Footprint and polygon overlays

`PolygonStampedClient` subscribes to `geometry_msgs/PolygonStamped`
and renders each message through `PolygonShape`, a thin stroked
(optionally filled) closed polygon. The default topic is
`/local_costmap/published_footprint` because the most common use is
visualizing the active nav2 robot footprint over the costmap. Nav2's
published footprint is already oriented in the message's
`header.frame_id` (often `odom` or `map`); pass `tfClient` only when
the viewer's fixed frame differs from that message frame.

```js
new ROS2D.PolygonStampedClient({
  ros, rootObject: viewer.scene,
  topic: '/robot_0/local_costmap/published_footprint',
  tfClient: tfClient,             // optional frame conversion via header.frame_id
  strokeColor: '#ef4444',         // default red
  strokeSize: 0.03,               // ROS meters
  fillColor: 'rgba(239,68,68,0.1)', // optional translucent fill
});
```

In multi-robot deployments give each robot its own client (and topic)
with a distinct `strokeColor` so the footprints stay visually
attributable.

## Interactive pose picking

`ROS2D.PoseInteractionView` is the web equivalent of rviz2's
"2D Goal Pose" tool: the user clicks on the map, drags to indicate a
heading, and on release receives `{ x, y, yaw }` in the ROS world
frame. The view owns its own `NavigationArrow` preview and handles
the canvas Y-flip / rotation sign conventions internally.

```js
var goalPicker = new ROS2D.PoseInteractionView({
  viewer: viewer,                 // ROS2D.Viewer instance
  arrowSize: 1.5,                 // ROS meters (default 1.5)
  arrowFillColor: '#ef4444',      // default red
  dragThresholdPx: 10,            // taps under this commit yaw=undefined
  onCommit: function(commit) {
    // commit: { x, y, yaw }
    // yaw is in radians (CCW from +X) or undefined for taps
    publishGoalPose(commit);
  },
});

// Toggle on/off without losing the preview shape:
goalPicker.disable();
goalPicker.enable();

// Permanent teardown (removes preview from the scene):
goalPicker.destroy();
```

Pair the view with `setInteractionEnabled(false)` (or your equivalent)
on Pan/Rotate so the goal-placement drag does not also pan/rotate the
map. The view ignores shift-modified clicks (reserved for pan) and any
non-left mouse button.

## Example studio

`examples/` ships a Vite + React app that exercises every client
end-to-end against a running rosbridge.

```bash
cd examples
npm install
npm run dev    # → http://localhost:5173
```

<p align="center">
  <img src="https://raw.githubusercontent.com/Neoplanetz/ros2-web2d/main/docs/media/example-studio-app.png"
       alt="The full example studio: connection panel, demo list, Fleet Overview controls, and the shared viewer canvas"
       width="850">
</p>

Demos included:

- **Fleet Overview** — live map + per-robot pose / path / goal overlays,
  one color per robot namespace (the screenshots above)
- **OccupancyGridClient** — live `/map` with one-shot auto-fit
- **ImageMapClient** — bundled `sample_map.pgm` + YAML, no ROS needed
- **MarkerArrayClient** — TF-aware marker overlays
- **LaserScanClient** — `/scan` with a toggleable TF client
- **PolygonStampedClient** — nav2 footprint outlines
- **Navigation Overlays** — `path + pose + odom + particlecloud`
  composed together
- **Shared Subscription Pool** — N clients on one topic sharing one wire
  subscription (`pool: true`) with a live wire-op readout

`examples/src/lib/ros2dHelpers.js` also exports reusable pieces —
`enableViewerMouseControls`, `createInitialMapViewFitter`,
`fitMapView`, `addMetricBackdrop` — that any app can drop into its
own `Viewer` code.

## Development

```bash
npm install
npm run build      # prebuild (transpile) + rollup + tsc
npm test           # vitest
npm run lint       # eslint via grunt
```

### Source pipeline

```
src/                 single source of truth (ES5 global-namespace)
  ↓  grunt transpile
src-esm/             auto-generated ES modules (gitignored — do not edit)
  ↓  rollup
build/
  ros2d.cjs.js       CommonJS
  ros2d.esm.js       ES module
  ros2d.min.js       IIFE for browser <script>
  types/             TypeScript declarations (tsc)
```

Edit files in `src/` only. The `prebuild` hook regenerates
`src-esm/` automatically, and `npm run check:transpile` acts as a
CI guardrail against hand-edited `src-esm/` commits.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Full pipeline: prebuild + rollup + tsc |
| `npm test` | Run the vitest suite |
| `npm run lint` | ESLint via grunt |
| `npm run transpile` | Regenerate `src-esm/` with debug output |
| `npm run check:transpile` | Regenerate + assert no diff |
| `npm run doc` | Rebuild JSDoc |

See [CHANGELOG.md](./CHANGELOG.md) for per-release notes.

## Origin

This project started as a fork of
[RobotWebTools/ros2djs](https://github.com/RobotWebTools/ros2djs) and
has since diverged into an independent, **ROS 2-only** library. The
upstream project predates ROS 2 and has been unmaintained since 2022;
`ros2-web2d` picks up the 2D-visualization role with a rebuilt TF
integration, modern Rollup/ES module pipeline, a Vite + React example
studio, and a test surface spanning 334 vitest cases plus a Playwright
smoke suite. ROS 1 support is intentionally dropped.

## License

BSD-3-Clause. Original work © Robert Bosch LLC, Willow Garage Inc.,
Worcester Polytechnic Institute, and Yujin Robot. See
[LICENSE](./LICENSE) for details.

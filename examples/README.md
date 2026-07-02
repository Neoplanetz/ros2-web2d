# React Examples

This directory contains a Vite + React example app for the current `ros2djs-ros2` API surface.

## Run

```bash
cd examples
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- The example app depends on the local package via `"ros2d": "file:.."`.
- Rebuild the root package after source changes so the example app picks up the latest `build/` output:

```bash
cd ..
npm run build
```

- The `ImageMapClient` demo ships with a local sample asset at `/sample-map.yaml`.
- The ROS-driven demos expect a running rosbridge websocket, usually `ws://localhost:9090`.

## Connecting a live ROS 2 stack

```bash
# Terminal 1 — rosbridge
ros2 launch rosbridge_server rosbridge_websocket_launch.xml

# Terminal 2 — something to observe, e.g. a static map + TF
ros2 run tf2_ros static_transform_publisher \
  --x 3 --y 2 --z 0 --roll 0 --pitch 0 --yaw 0 \
  --frame-id map --child-frame-id test_frame
ros2 topic pub /markers visualization_msgs/msg/MarkerArray \
  "{markers: [{header: {frame_id: 'test_frame'}, ns: 'demo', id: 1,
    type: 1, action: 0, pose: {position: {x: 0.0, y: 0.0, z: 0.0},
    orientation: {w: 1.0}}, scale: {x: 0.5, y: 0.5, z: 0.5},
    color: {r: 1.0, g: 0.2, b: 0.2, a: 1.0}}]}" -r 1
```

Open the `MarkerArrayClient` demo, toggle **Use TF** on in the Navigation Overlays demo, and change the static transform's `--x`/`--y` — the overlays follow when TF is enabled and stay put when it is off.

## Shared subscription pool demo (v1.11.x)

The **Shared Subscription Pool** demo puts N `PoseStampedClient`s (1–5) on one
topic and makes the library's `pool: true` option observable: the connection is
instrumented at `ros.callOnConnection`, so every real `subscribe` /
`unsubscribe` op sent to rosbridge shows up in the demo's wire-op log and in
the per-topic count line (no publisher required — subscribe ops flow even on a
silent topic). Things to watch:

- **Dedup** — with the pool ON, adding clients keeps the wire count at 1;
  turning it OFF opens one subscription per client.
- **Grace window** — the select drives `setTopicPoolGraceMs()`. With 5000 ms,
  removing the last client shows the wire `unsubscribe` landing ~5 s later,
  and re-adding within the window reuses the live subscription (no churn).
- **Late-join replay** — add a client after a pose has arrived: its arrow
  renders immediately from the pool's retained last message.

The other subscribing demos each have a **Shared subscription pool** checkbox
(default off = plain per-client subscriptions) that forwards `pool: true` to
their client constructors; the **Wire subscriptions** readout in the
connection panel shows the effect from any demo.

## Smoke test

A Playwright suite under `smoke-test/` drives the demos against a
running rosbridge and a `vite preview` build of this app. Useful as a
regression guard after touching any client or helper in the library.

```bash
# One-time: install the chromium binary
npx playwright install chromium

# Build the static preview once (fresh library bundle + example app)
cd ..
npm run build
cd examples
npm run build

# Run the suite against localhost:4173 and localhost:9090 (rosbridge)
npx vite preview --port 4173 &
npm run test:smoke
```

Screenshots land under `smoke-test/screenshots/` for visual
inspection; assertions cover: rosbridge handshake, each demo's
status text flipping to its "ready/rendered/updated" line, the
canvas having drawn pixels, no `Must call super constructor` regressions,
and the RotateView right-drag changing canvas content.

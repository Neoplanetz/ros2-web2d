# Fleet Overview Demo + README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Fleet Overview" example-studio demo composing the live `/map` occupancy grid with per-robot pose/path/goal overlays and shared markers, then refresh the README with a live screenshot of it.

**Architecture:** One new React demo component (`FleetOverviewDemo.jsx`) that instantiates existing ros2-web2d clients (`OccupancyGridClient`, `PoseStampedClient`, `PathClient`, `OdometryClient`, `MarkerArrayClient`) onto three z-ordered roots (map → markers → robot overlays), driven by the studio's existing draft/settings + Apply convention. No library (`src/`) changes. README gains a hero screenshot committed under `docs/media/`.

**Tech Stack:** React 18 (examples studio), ros2-web2d 1.11.1 API, EaselJS via createjs-module, Playwright smoke tests against a live rosbridge.

## Global Constraints

- Examples + docs only — do NOT touch `src/`, `es6-support/`, `build/`, or `package.json` at the repo root.
- `examples/` uses modern JSX (root ESLint `ecmaVersion: 5` rule does NOT apply to examples).
- Smoke tests need the live rosbridge at `ws://localhost:9090` and the built studio served at `http://localhost:4173` (`npx vite preview --port 4173` from `examples/`). Rebuild + restart the preview server before every smoke run.
- A preview server from an earlier session may already occupy port 4173 — kill it first: `pkill -f "vite preview --port 4173"`.
- The live system publishes: `/map` (OccupancyGrid), `/robot_0..3/{pose,goal_pose}` (PoseStamped), `/robot_0..3/{traj,server_traj,traj_progress}` (Path), `/topology_graph`, `/delay_markers`, `/wait_markers` (MarkerArray). No Odometry topics exist (Odom layer defaults off).
- Work on branch `feat/examples-fleet-overview` (already created; spec committed).
- Commit messages follow the repo's conventional-commit style and end with the Co-Authored-By / Claude-Session trailer used by this session's earlier commits.

---

### Task 1: FleetOverviewDemo component + registration + smoke test

**Files:**
- Create: `examples/src/demos/FleetOverviewDemo.jsx`
- Modify: `examples/src/App.jsx` (import, DEMOS first entry, default demo key)
- Test: `examples/smoke-test/smoke.spec.js` (append one test)

**Interfaces:**
- Consumes: `createDemoRoot(viewer)`, `removeDemoRoot(viewer, root)`, `createInitialMapViewFitter(viewer)`, `createTfClient(ros, fixedFrame)`, `disposeTfClient(tfClient)` from `examples/src/lib/ros2dHelpers.js`; clients + `NavigationArrow` from `ros2-web2d`.
- Produces: demo registered as key `fleet-overview`, sidebar label `Fleet Overview` (Tasks 2–3 rely on it being the DEFAULT demo on page load); status line = first `.demo-card .helper-text`, `Active clients: N` = second `.demo-card .helper-text`.

- [ ] **Step 1: Append the failing smoke test**

Append inside the existing `test.describe('ros2djs-ros2 smoke test (live rosbridge)', ...)` block in `examples/smoke-test/smoke.spec.js`, after the last test:

```js
  test('Fleet Overview composes map + robot overlays + markers', async ({ page }) => {
    const logs = collectConsole(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');
    await waitForConnection(page);

    await clickDemo(page, 'Fleet Overview');

    // Defaults: 1 map + 1 marker topic + 4 robots x (pose, path, goal) = 14
    await expect(page.locator('.demo-card .helper-text').nth(1)).toHaveText('Active clients: 14');

    // A robot overlay client received a message and rendered (this status
    // keeps recurring, so polling cannot miss it; do NOT assert the
    // transient "Map ready" text — pose updates overwrite it within ~100ms).
    await expect(page.locator('.demo-card .helper-text').first()).toContainText(/\/robot_\d+ (pose|path|goal) updated/i, { timeout: 20000 });

    // The map dominates the sampled 200x200 corner when painted; robot
    // arrows alone cannot reach 1000 painted pixels there.
    await page.waitForTimeout(1000);
    const pixels = await canvasHasPixelsDrawn(page);
    console.log('FleetOverview pixels:', JSON.stringify(pixels));
    expect(pixels.ok, 'canvas appears blank').toBe(true);
    expect(pixels.painted, 'map does not appear painted').toBeGreaterThan(1000);

    await page.screenshot({ path: 'smoke-test/screenshots/08-fleet-overview.png', fullPage: true });

    const pageerrors = logs.filter((l) => l.includes('[pageerror]'));
    expect(pageerrors, `page errors:\n${pageerrors.join('\n')}`).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

```bash
cd examples && pkill -f "vite preview --port 4173"; npm run build && (npx vite preview --port 4173 &) && sleep 2 && npx playwright test -g "Fleet Overview"
```

Expected: FAIL — `clickDemo(page, 'Fleet Overview')` cannot find the sidebar button (times out; the demo does not exist yet).

- [ ] **Step 3: Create `examples/src/demos/FleetOverviewDemo.jsx`**

```jsx
import { useEffect, useState } from 'react';
import createjs from 'createjs-module';
import {
  MarkerArrayClient,
  NavigationArrow,
  OccupancyGridClient,
  OdometryClient,
  PathClient,
  PoseStampedClient,
} from 'ros2-web2d';
import {
  createDemoRoot,
  createInitialMapViewFitter,
  createTfClient,
  disposeTfClient,
  removeDemoRoot,
} from '../lib/ros2dHelpers.js';

// One visually distinct hue per robot; cycles past 8 robots.
const ROBOT_PALETTE = [
  { hex: '#2ea1ff', r: 46, g: 161, b: 255 },
  { hex: '#ff7f2a', r: 255, g: 127, b: 42 },
  { hex: '#2ec27e', r: 46, g: 194, b: 126 },
  { hex: '#e64980', r: 230, g: 73, b: 128 },
  { hex: '#a78bfa', r: 167, g: 139, b: 250 },
  { hex: '#f5c211', r: 245, g: 194, b: 17 },
  { hex: '#00c2c7', r: 0, g: 194, b: 199 },
  { hex: '#ff5c5c', r: 255, g: 92, b: 92 },
];

const DEFAULTS = {
  namespaces: '/robot_0,/robot_1,/robot_2,/robot_3',
  mapTopic: '/map',
  colorizer: 'map',
  markerTopics: '/topology_graph',
  layerPose: true,
  layerPath: true,
  layerGoal: true,
  layerOdom: false,
  layerMarkers: true,
  poseSuffix: 'pose',
  pathSuffix: 'traj',
  goalSuffix: 'goal_pose',
  odomSuffix: 'odom',
  useTf: false,
  fixedFrame: 'map',
  pool: false,
};

function parseCsv(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function joinTopic(ns, suffix) {
  return `${ns.replace(/\/$/, '')}/${suffix.replace(/^\//, '')}`;
}

export function FleetOverviewDemo({ ros, viewer }) {
  const [draft, setDraft] = useState(DEFAULTS);
  const [settings, setSettings] = useState(DEFAULTS);
  const [status, setStatus] = useState('Waiting for map and fleet overlays');
  const [clientCount, setClientCount] = useState(0);

  useEffect(() => {
    if (!ros || !viewer) {
      return undefined;
    }

    // Z-order: map at the bottom, markers above it, robot overlays on top.
    const mapRoot = createDemoRoot(viewer);
    const markerRoot = createDemoRoot(viewer);
    const overlayRoot = createDemoRoot(viewer);
    const fitInitialMapView = createInitialMapViewFitter(viewer);
    const tfClient = settings.useTf ? createTfClient(ros, settings.fixedFrame) : null;

    const clients = [];
    const listeners = [];
    const track = (client, label) => {
      const handler = () => setStatus(`${label} updated`);
      client.on('change', handler);
      listeners.push([client, handler]);
      clients.push(client);
    };

    const mapClient = new OccupancyGridClient({
      ros,
      topic: settings.mapTopic,
      continuous: true,
      colorizer: settings.colorizer,
      rootObject: mapRoot,
      pool: settings.pool,
    });
    const onMap = () => {
      fitInitialMapView(mapClient.currentGrid);
      setStatus(`Map ready from ${settings.mapTopic}`);
    };
    mapClient.on('change', onMap);
    listeners.push([mapClient, onMap]);
    clients.push(mapClient);

    if (settings.layerMarkers) {
      parseCsv(settings.markerTopics).forEach((topic) => {
        track(new MarkerArrayClient({
          ros,
          topic,
          rootObject: markerRoot,
          tfClient,
          pool: settings.pool,
        }), `markers ${topic}`);
      });
    }

    parseCsv(settings.namespaces).forEach((ns, index) => {
      const color = ROBOT_PALETTE[index % ROBOT_PALETTE.length];
      if (settings.layerPath) {
        track(new PathClient({
          ros,
          topic: joinTopic(ns, settings.pathSuffix),
          rootObject: overlayRoot,
          tfClient,
          strokeSize: 0.05,
          strokeColor: color.hex,
          pool: settings.pool,
        }), `${ns} path`);
      }
      if (settings.layerGoal) {
        track(new PoseStampedClient({
          ros,
          topic: joinTopic(ns, settings.goalSuffix),
          rootObject: overlayRoot,
          tfClient,
          shape: new NavigationArrow({
            size: 0.5,
            strokeSize: 0,
            fillColor: createjs.Graphics.getRGB(color.r, color.g, color.b, 0.45),
          }),
          pool: settings.pool,
        }), `${ns} goal`);
      }
      if (settings.layerOdom) {
        track(new OdometryClient({
          ros,
          topic: joinTopic(ns, settings.odomSuffix),
          rootObject: overlayRoot,
          tfClient,
          shape: new NavigationArrow({
            size: 0.55,
            strokeSize: 0,
            fillColor: createjs.Graphics.getRGB(
              Math.round(color.r * 0.55),
              Math.round(color.g * 0.55),
              Math.round(color.b * 0.55),
            ),
          }),
          pool: settings.pool,
        }), `${ns} odom`);
      }
      if (settings.layerPose) {
        track(new PoseStampedClient({
          ros,
          topic: joinTopic(ns, settings.poseSuffix),
          rootObject: overlayRoot,
          tfClient,
          shape: new NavigationArrow({
            size: 0.7,
            strokeSize: 0,
            fillColor: createjs.Graphics.getRGB(color.r, color.g, color.b),
          }),
          pool: settings.pool,
        }), `${ns} pose`);
      }
    });

    setClientCount(clients.length);
    setStatus('Waiting for map and fleet overlays');

    return () => {
      listeners.forEach(([client, handler]) => client.off('change', handler));
      clients.forEach((client) => client.unsubscribe());
      disposeTfClient(tfClient);
      removeDemoRoot(viewer, mapRoot);
      removeDemoRoot(viewer, markerRoot);
      removeDemoRoot(viewer, overlayRoot);
    };
  }, [ros, settings, viewer]);

  return (
    <div className="demo-card">
      <div className="demo-copy">
        <p className="eyebrow">Fleet</p>
        <h3>Fleet Overview — live map + per-robot nav overlays</h3>
        <p>
          One page composing the full deployment picture: a live occupancy
          grid, shared markers, and per-robot pose / trajectory / goal
          overlays in a distinct color per robot namespace.
        </p>
      </div>

      <div className="control-grid">
        <label className="field">
          <span>Robot namespaces</span>
          <input
            value={draft.namespaces}
            onChange={(event) => setDraft({ ...draft, namespaces: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Map topic</span>
          <input
            value={draft.mapTopic}
            onChange={(event) => setDraft({ ...draft, mapTopic: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Map colorizer</span>
          <select
            value={draft.colorizer}
            onChange={(event) => setDraft({ ...draft, colorizer: event.target.value })}
          >
            <option value="map">map (grayscale)</option>
            <option value="costmap">costmap (inflation gradient)</option>
          </select>
        </label>
        <label className="field">
          <span>Marker topics</span>
          <input
            value={draft.markerTopics}
            onChange={(event) => setDraft({ ...draft, markerTopics: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Pose suffix</span>
          <input
            value={draft.poseSuffix}
            onChange={(event) => setDraft({ ...draft, poseSuffix: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Path suffix</span>
          <input
            value={draft.pathSuffix}
            onChange={(event) => setDraft({ ...draft, pathSuffix: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Goal suffix</span>
          <input
            value={draft.goalSuffix}
            onChange={(event) => setDraft({ ...draft, goalSuffix: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Odom suffix</span>
          <input
            value={draft.odomSuffix}
            onChange={(event) => setDraft({ ...draft, odomSuffix: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Fixed frame</span>
          <input
            value={draft.fixedFrame}
            onChange={(event) => setDraft({ ...draft, fixedFrame: event.target.value })}
          />
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.layerPose}
            onChange={(event) => setDraft({ ...draft, layerPose: event.target.checked })}
          />
          <span>Pose layer</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.layerPath}
            onChange={(event) => setDraft({ ...draft, layerPath: event.target.checked })}
          />
          <span>Path layer</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.layerGoal}
            onChange={(event) => setDraft({ ...draft, layerGoal: event.target.checked })}
          />
          <span>Goal layer</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.layerOdom}
            onChange={(event) => setDraft({ ...draft, layerOdom: event.target.checked })}
          />
          <span>Odometry layer</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.layerMarkers}
            onChange={(event) => setDraft({ ...draft, layerMarkers: event.target.checked })}
          />
          <span>Marker layer</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.useTf}
            onChange={(event) => setDraft({ ...draft, useTf: event.target.checked })}
          />
          <span>Use TF</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.pool}
            onChange={(event) => setDraft({ ...draft, pool: event.target.checked })}
          />
          <span>Shared subscription pool</span>
        </label>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={() => setSettings({ ...draft })}>
          Apply
        </button>
      </div>

      <p className="helper-text">{status}</p>
      <p className="helper-text">Active clients: {clientCount}</p>
    </div>
  );
}
```

Note: the per-change `setStatus` re-render rate (~4 robots × ~10 Hz) matches what SharedPoolDemo/NavigationOverlayDemo already do; the demo card DOM is tiny, so this is fine for a demo page.

- [ ] **Step 4: Register in `examples/src/App.jsx`**

Three edits:

1. After the `SharedPoolDemo` import line, add:

```jsx
import { FleetOverviewDemo } from './demos/FleetOverviewDemo.jsx';
```

2. Insert as the FIRST element of the `DEMOS` array (before the `occupancy-grid` entry):

```jsx
  {
    key: 'fleet-overview',
    label: 'Fleet Overview',
    summary: 'Live map + per-robot pose, path, and goal overlays — one page, one color per robot.',
    render: (props) => <FleetOverviewDemo {...props} />,
  },
```

3. Make it the default demo:

```jsx
const [activeDemoKey, setActiveDemoKey] = useState('fleet-overview');
```

(Existing smokes are unaffected by the default change — every test clicks its demo button explicitly, and the boot test only checks `#root` + the connection badge.)

- [ ] **Step 5: Rebuild, restart preview, run the new smoke — verify it passes**

```bash
cd examples && pkill -f "vite preview --port 4173"; npm run build && (npx vite preview --port 4173 &) && sleep 2 && npx playwright test -g "Fleet Overview"
```

Expected: PASS (`1 passed`), console line `FleetOverview pixels: {"ok":true,"painted":<big number>}`.

- [ ] **Step 6: Run the FULL smoke suite — verify no regression from the default-demo change**

```bash
cd examples && npx playwright test
```

Expected: `8 passed` (7 existing + 1 new).

- [ ] **Step 7: Commit**

```bash
git add examples/src/demos/FleetOverviewDemo.jsx examples/src/App.jsx examples/smoke-test/smoke.spec.js
git commit -m "feat(examples): Fleet Overview demo — live map + per-robot nav overlays"
```

---

### Task 2: README hero screenshot asset

**Files:**
- Create: `docs/media/example-studio-fleet.png`
- Create (scratchpad only, NOT committed): `<scratchpad>/capture-fleet.mjs`

**Interfaces:**
- Consumes: Task 1's built studio serving on `http://localhost:4173` with Fleet Overview as the default demo, live rosbridge.
- Produces: `docs/media/example-studio-fleet.png` (2× DPR, 1600×1000 viewport crop) referenced by Task 3's README markup.

- [ ] **Step 1: Write the capture script to the scratchpad**

Write to `<scratchpad>/capture-fleet.mjs` (absolute scratchpad path from the session):

```js
import { chromium } from '@playwright/test';

const BASE = process.env.ROS2D_BASE || 'http://localhost:4173';
const OUT = process.env.OUT || 'docs/media/example-studio-fleet.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});
await page.goto(BASE, { waitUntil: 'load' });
await page.locator('.status-badge.status-connected').first().waitFor({ state: 'attached', timeout: 20000 });
// Fleet Overview is the default demo. Wait until overlays are flowing…
await page.waitForFunction(
  () => /updated|ready/i.test(document.querySelector('.demo-card .helper-text')?.textContent || ''),
  null,
  { timeout: 20000 },
);
// …then let paths/markers/robots accumulate for a fuller frame.
await page.waitForTimeout(4000);
await page.screenshot({ path: OUT, fullPage: false });
await browser.close();
console.log('saved', OUT);
```

- [ ] **Step 2: Ensure the preview server is running the Task-1 build, then capture**

```bash
mkdir -p docs/media
cd examples && OUT=/home/neoplanetz/Documents/github/ros2-web2d/docs/media/example-studio-fleet.png node <scratchpad>/capture-fleet.mjs
```

Expected: `saved /home/neoplanetz/Documents/github/ros2-web2d/docs/media/example-studio-fleet.png` (run from `examples/` so `@playwright/test` resolves).

- [ ] **Step 3: Verify the image visually**

Read `docs/media/example-studio-fleet.png` with the Read tool. Expected: full app shell (sidebar + viewer), map visible with robot arrows/paths in distinct colors. If robots are clustered/off-frame or the map is blank, re-run Step 2 (live system timing). Also `file` the PNG: expected ~3200×2000.

- [ ] **Step 4: Commit**

```bash
git add docs/media/example-studio-fleet.png
git commit -m "docs(media): example studio Fleet Overview screenshot"
```

---

### Task 3: README refresh

**Files:**
- Modify: `README.md` (hero image after the intro blockquote; Features bullet test count; Example studio section)

**Interfaces:**
- Consumes: `docs/media/example-studio-fleet.png` on branch (raw URL resolves after merge to `main`; 404 in PR preview is expected and acceptable).
- Produces: final README content for the PR.

- [ ] **Step 1: Insert the hero image**

In `README.md`, directly after the `> ROS 2 only. …` blockquote (before the quickstart ```js code block), insert:

```markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/Neoplanetz/ros2-web2d/main/docs/media/example-studio-fleet.png"
       alt="ros2-web2d example studio — Fleet Overview demo: a live occupancy grid with four robots' poses, trajectories, goals, and topology markers, one color per robot"
       width="850">
</p>
<p align="center"><em>The bundled <a href="./examples">example studio</a>'s Fleet Overview demo — one shared map, four robots, live over rosbridge.</em></p>
```

(Absolute raw URL so the image also renders on npmjs.com, where relative repo paths break.)

- [ ] **Step 2: Fix the stale test count**

In the `## Features` bullet "**Modern build**", change `a vitest suite with 289 tests at the time of writing` → `a vitest suite with 326 tests at the time of writing`. Verify the number first:

```bash
npm test 2>&1 | tail -3
```

Expected: `Tests  326 passed (326)` — if different, use the actual number.

- [ ] **Step 3: Update the "Demos included" list in `## Example studio`**

Replace the existing 5-item list with:

```markdown
Demos included:

- **Fleet Overview** — live map + per-robot pose / path / goal overlays,
  one color per robot namespace (the screenshot above)
- **OccupancyGridClient** — live `/map` with one-shot auto-fit
- **ImageMapClient** — bundled `sample_map.pgm` + YAML, no ROS needed
- **MarkerArrayClient** — TF-aware marker overlays
- **LaserScanClient** — `/scan` with a toggleable TF client
- **PolygonStampedClient** — nav2 footprint outlines
- **Navigation Overlays** — `path + pose + odom + particlecloud`
  composed together
- **Shared Subscription Pool** — N clients on one topic sharing one wire
  subscription (`pool: true`) with a live wire-op readout
```

- [ ] **Step 4: Verify rendering + commit**

```bash
grep -n "example-studio-fleet\|326 tests\|Fleet Overview" README.md
git add README.md
git commit -m "docs(readme): Fleet Overview hero screenshot + current demo list and test count"
```

Expected: three grep hits (image URL, test count, demo list).

---

### Task 4: Full gate + PR

**Files:** none new (verification + PR only)

- [ ] **Step 1: Root gate**

```bash
npm run lint && npm test 2>&1 | tail -4
```

Expected: lint `Done.`, `326 passed`.

- [ ] **Step 2: Examples build + full smoke**

```bash
cd examples && pkill -f "vite preview --port 4173"; npm run build && (npx vite preview --port 4173 &) && sleep 2 && npx playwright test
```

Expected: `8 passed`.

- [ ] **Step 3: Leave the preview server running for the user (remote viewing)**

```bash
cd examples && (npx vite preview --host 0.0.0.0 --port 4173 &) && sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4173/
```

Expected: `200`. (The user watches via Tailscale at `http://100.104.96.15:4173/`.)

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/examples-fleet-overview
gh pr create --title "feat(examples): Fleet Overview demo + README hero screenshot" --body "<summary of demo, README changes, verification evidence — smoke 8/8, lint, 326 tests>"
```

Expected: PR URL. Wait for CI (required checks `20`, `22`) green, then request user approval to merge (auto-mode classifier requires it).

- [ ] **Step 5: After approval: squash-merge, close branch, update memory**

```bash
gh pr merge <N> --squash --delete-branch
```

Update `project_followups.md` memory: examples now 8 demos (fleet-overview default), README has hero image, smoke count 7→8.

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
            size: 0.9,
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
            size: 1.2,
            strokeSize: 0.06,
            strokeColor: createjs.Graphics.getRGB(34, 34, 34),
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

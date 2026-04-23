import { useEffect, useState } from 'react';
import { OccupancyGridClient } from 'ros2-web2d';
import {
  addMetricBackdrop,
  createDemoRoot,
  createInitialMapViewFitter,
  removeDemoRoot,
} from '../lib/ros2dHelpers.js';

const COLORIZER_OPTIONS = [
  { value: 'map', label: 'map (grayscale)' },
  { value: 'costmap', label: 'costmap (inflation gradient)' },
];

export function OccupancyGridDemo({ ros, viewer }) {
  const [draft, setDraft] = useState({ topic: '/map', continuous: true, colorizer: 'map' });
  const [settings, setSettings] = useState({ topic: '/map', continuous: true, colorizer: 'map' });
  const [status, setStatus] = useState('Waiting for map data');

  useEffect(() => {
    if (!ros || !viewer) {
      return undefined;
    }

    const root = createDemoRoot(viewer);
    const overlayRoot = createDemoRoot(viewer);
    addMetricBackdrop(overlayRoot, { extent: 24, spacing: 1 });
    const fitInitialMapView = createInitialMapViewFitter(viewer);
    const client = new OccupancyGridClient({
      ros,
      topic: settings.topic,
      continuous: settings.continuous,
      colorizer: settings.colorizer,
      rootObject: root,
    });

    const handleChange = () => {
      fitInitialMapView(client.currentGrid);
      setStatus(`Map ready from ${settings.topic} (${settings.colorizer})`);
    };

    client.on('change', handleChange);

    return () => {
      client.off('change', handleChange);
      client.unsubscribe();
      removeDemoRoot(viewer, root);
      removeDemoRoot(viewer, overlayRoot);
    };
  }, [ros, settings, viewer]);

  return (
    <div className="demo-card">
      <div className="demo-copy">
        <p className="eyebrow">Map</p>
        <h3>OccupancyGridClient</h3>
        <p>
          Subscribe to a live `nav_msgs/OccupancyGrid` topic and fit the viewer
          when the first map arrives. Switch the colorizer to `costmap` to
          render nav2 costmaps (e.g. `/local_costmap/costmap`) with an
          inflation gradient instead of plain grayscale.
        </p>
      </div>

      <div className="control-grid">
        <label className="field">
          <span>Topic</span>
          <input
            value={draft.topic}
            onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Colorizer</span>
          <select
            value={draft.colorizer}
            onChange={(event) => setDraft({ ...draft, colorizer: event.target.value })}
          >
            {COLORIZER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.continuous}
            onChange={(event) => setDraft({ ...draft, continuous: event.target.checked })}
          />
          <span>Continuous updates</span>
        </label>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={() => setSettings({ ...draft })}>
          Apply
        </button>
      </div>

      <p className="helper-text">{status}</p>
    </div>
  );
}

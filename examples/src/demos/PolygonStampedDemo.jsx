import { useEffect, useState } from 'react';
import { PolygonStampedClient } from 'ros2-web2d';
import { addMetricBackdrop, centerMetricView, createDemoRoot, createTfClient, disposeTfClient, removeDemoRoot } from '../lib/ros2dHelpers.js';

export function PolygonStampedDemo({ ros, viewer }) {
  const [draft, setDraft] = useState({
    topic: '/local_costmap/published_footprint',
    strokeColor: '#ef4444',
    strokeSize: '0.04',
    fillColor: 'rgba(239, 68, 68, 0.1)',
    closed: true,
    fixedFrame: 'map',
    useTf: false,
  });
  const [settings, setSettings] = useState({
    topic: '/local_costmap/published_footprint',
    strokeColor: '#ef4444',
    strokeSize: 0.04,
    fillColor: 'rgba(239, 68, 68, 0.1)',
    closed: true,
    fixedFrame: 'map',
    useTf: false,
  });
  const [status, setStatus] = useState('Waiting for PolygonStamped data');

  useEffect(() => {
    if (!ros || !viewer) {
      return undefined;
    }

    centerMetricView(viewer, 18, 12);
    const root = createDemoRoot(viewer);
    addMetricBackdrop(root, { extent: 9, spacing: 1 });

    const tfClient = settings.useTf ? createTfClient(ros, settings.fixedFrame) : null;
    const client = new PolygonStampedClient({
      ros,
      topic: settings.topic,
      rootObject: root,
      tfClient,
      strokeColor: settings.strokeColor,
      strokeSize: settings.strokeSize,
      fillColor: settings.fillColor || null,
      closed: settings.closed,
    });

    const handleChange = () => {
      setStatus(`Polygon rendered from ${settings.topic}`);
    };

    client.on('change', handleChange);

    return () => {
      client.off('change', handleChange);
      client.unsubscribe();
      disposeTfClient(tfClient);
      removeDemoRoot(viewer, root);
    };
  }, [ros, settings, viewer]);

  return (
    <div className="demo-card">
      <div className="demo-copy">
        <p className="eyebrow">Overlays</p>
        <h3>PolygonStampedClient</h3>
        <p>
          Render a closed outline from <code>geometry_msgs/PolygonStamped</code>.
          The default topic is the nav2 active footprint, which is already
          pose-oriented in the costmap global frame (typically <code>map</code>
          or <code>odom</code>). Enable TF only when the viewer's fixed frame
          differs from the publisher's frame.
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
          <span>Stroke color</span>
          <input
            value={draft.strokeColor}
            onChange={(event) => setDraft({ ...draft, strokeColor: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Stroke size (m)</span>
          <input
            value={draft.strokeSize}
            onChange={(event) => setDraft({ ...draft, strokeSize: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Fill color</span>
          <input
            value={draft.fillColor}
            onChange={(event) => setDraft({ ...draft, fillColor: event.target.value })}
            placeholder="rgba(...) or empty"
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
            checked={draft.closed}
            onChange={(event) => setDraft({ ...draft, closed: event.target.checked })}
          />
          <span>Closed</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.useTf}
            onChange={(event) => setDraft({ ...draft, useTf: event.target.checked })}
          />
          <span>Use TF</span>
        </label>
      </div>

      <div className="button-row">
        <button
          className="primary-button"
          onClick={() => setSettings({
            topic: draft.topic,
            strokeColor: draft.strokeColor,
            strokeSize: Number.parseFloat(draft.strokeSize) || 0.04,
            fillColor: draft.fillColor,
            closed: draft.closed,
            fixedFrame: draft.fixedFrame,
            useTf: draft.useTf,
          })}
        >
          Apply
        </button>
      </div>

      <p className="helper-text">{status}</p>
    </div>
  );
}

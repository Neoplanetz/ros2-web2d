import { useEffect, useState } from 'react';
import { MarkerArrayClient } from 'ros2-web2d';
import { addMetricBackdrop, centerMetricView, createDemoRoot, removeDemoRoot } from '../lib/ros2dHelpers.js';

export function MarkerArrayDemo({ ros, viewer }) {
  const [draft, setDraft] = useState({ topic: '/markers', pool: false });
  const [settings, setSettings] = useState({ topic: '/markers', pool: false });
  const [status, setStatus] = useState('Waiting for marker arrays');

  useEffect(() => {
    if (!ros || !viewer) {
      return undefined;
    }

    centerMetricView(viewer, 18, 12);
    const root = createDemoRoot(viewer);
    addMetricBackdrop(root, { extent: 9, spacing: 1 });

    const client = new MarkerArrayClient({
      ros,
      topic: settings.topic,
      rootObject: root,
      pool: settings.pool,
    });

    const handleChange = () => {
      setStatus(`Latest MarkerArray rendered from ${settings.topic}`);
    };

    client.on('change', handleChange);

    return () => {
      client.off('change', handleChange);
      client.unsubscribe();
      removeDemoRoot(viewer, root);
    };
  }, [ros, settings, viewer]);

  return (
    <div className="demo-card">
      <div className="demo-copy">
        <p className="eyebrow">Markers</p>
        <h3>MarkerArrayClient</h3>
        <p>
          Overlay 2D projections of RViz markers, including arrows, shapes,
          text, and triangle lists.
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
    </div>
  );
}

import { useEffect, useState } from 'react';
import createjs from 'createjs-module';
import { NavigationArrow, PoseStampedClient, setTopicPoolGraceMs } from 'ros2-web2d';
import { addMetricBackdrop, centerMetricView, createDemoRoot, removeDemoRoot } from '../lib/ros2dHelpers.js';

// Distinct size/color per client so N overlapping arrows read as
// "N renderers, one feed" (concentric look on the same pose).
const ARROW_STYLES = [
  { size: 1.0, fill: [33, 148, 88] },
  { size: 0.78, fill: [211, 111, 46] },
  { size: 0.6, fill: [125, 64, 188] },
  { size: 0.45, fill: [26, 115, 232] },
  { size: 0.32, fill: [212, 63, 39] },
];

const GRACE_OPTIONS = [
  { value: '0', label: '0 ms (immediate teardown)' },
  { value: '2000', label: '2000 ms' },
  { value: '5000', label: '5000 ms (library default)' },
];

export function SharedPoolDemo({ ros, viewer, wireOps }) {
  const [draftTopic, setDraftTopic] = useState('/pose');
  const [settings, setSettings] = useState({ topic: '/pose', pool: true, clientCount: 3 });
  const [grace, setGrace] = useState('5000');
  const [status, setStatus] = useState('Waiting for pose messages');

  // The grace window is a module-level library setting — apply immediately,
  // restore the library default when the demo unmounts.
  useEffect(() => {
    setTopicPoolGraceMs(Number(grace));
  }, [grace]);
  useEffect(() => () => {
    setTopicPoolGraceMs(5000);
  }, []);

  useEffect(() => {
    if (!ros || !viewer) {
      return undefined;
    }

    centerMetricView(viewer, 16, 11);
    const root = createDemoRoot(viewer);
    addMetricBackdrop(root, { extent: 8, spacing: 1 });

    const clients = ARROW_STYLES.slice(0, settings.clientCount).map((style) => new PoseStampedClient({
      ros,
      topic: settings.topic,
      rootObject: root,
      pool: settings.pool,
      shape: new NavigationArrow({
        size: style.size,
        strokeSize: 0.03,
        fillColor: createjs.Graphics.getRGB(style.fill[0], style.fill[1], style.fill[2], 0.75),
      }),
    }));

    const handleChange = () => {
      setStatus(settings.pool
        ? `Pose received on ${settings.topic} — ${clients.length} arrows fed by ONE shared subscription`
        : `Pose received on ${settings.topic} — each of the ${clients.length} arrows holds its own subscription`);
    };
    clients.forEach((client) => client.on('change', handleChange));

    return () => {
      clients.forEach((client) => {
        client.off('change', handleChange);
        client.unsubscribe();
      });
      removeDemoRoot(viewer, root);
    };
  }, [ros, settings, viewer]);

  const topicSubs = (wireOps && wireOps.byTopic && wireOps.byTopic[settings.topic]) || 0;

  return (
    <div className="demo-card">
      <div className="demo-copy">
        <p className="eyebrow">Transport</p>
        <h3>Shared Subscription Pool (pool: true)</h3>
        <p>
          Every client below watches the <em>same</em> topic. With the pool ON they
          share ONE wire subscription (watch the count and the op log); OFF, each
          opens its own. Things to try: add a client after a pose arrived — it
          renders instantly from the pool&apos;s retained last message (late-join
          replay). Remove all but one client and toggle settings — with a grace
          window the wire <code>unsubscribe</code> lands only after the delay, so
          quick churn never touches rosbridge.
        </p>
      </div>

      <div className="control-grid">
        <label className="field">
          <span>Topic (geometry_msgs/PoseStamped)</span>
          <input
            value={draftTopic}
            onChange={(event) => setDraftTopic(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Grace window</span>
          <select value={grace} onChange={(event) => setGrace(event.target.value)}>
            {GRACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={settings.pool}
            onChange={(event) => setSettings((prev) => ({ ...prev, pool: event.target.checked }))}
          />
          <span>Shared subscription pool</span>
        </label>
      </div>

      <div className="button-row">
        <button className="primary-button" onClick={() => setSettings((prev) => ({ ...prev, topic: draftTopic }))}>
          Apply
        </button>
        <button
          className="ghost-button"
          onClick={() => setSettings((prev) => ({ ...prev, clientCount: Math.min(ARROW_STYLES.length, prev.clientCount + 1) }))}
        >
          + Add client
        </button>
        <button
          className="ghost-button"
          onClick={() => setSettings((prev) => ({ ...prev, clientCount: Math.max(1, prev.clientCount - 1) }))}
        >
          − Remove client
        </button>
      </div>

      <p className="helper-text pool-count">
        clients: {settings.clientCount} · wire subscriptions on {settings.topic}: {topicSubs}
      </p>
      <p className="helper-text">{status}</p>

      <div className="wire-log">
        <p className="eyebrow">Wire ops (rosbridge)</p>
        {!wireOps || wireOps.log.length === 0 ? (
          <p className="helper-text">No subscribe/unsubscribe ops yet.</p>
        ) : (
          <ul>
            {wireOps.log.map((entry) => (
              <li key={entry.id} className={entry.op === 'subscribe' ? 'op-subscribe' : 'op-unsubscribe'}>
                <span>{entry.time}</span>{' '}
                <strong>{entry.op === 'subscribe' ? '▲ subscribe' : '▼ unsubscribe'}</strong>{' '}
                <code>{entry.topic}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

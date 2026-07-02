import { useEffect, useState } from 'react';
import * as ROSLIB from 'roslib';

const EMPTY_WIRE_OPS = {
  subscribes: 0,
  unsubscribes: 0,
  byTopic: {},
  log: [],
};

const WIRE_LOG_LIMIT = 30;

// Wrap ros.callOnConnection — the single chokepoint every outgoing rosbridge
// op passes through — so the studio can display real wire-level subscribe /
// unsubscribe traffic. This is what makes the shared subscription pool's
// dedup + deferred teardown observable in the UI. Counting happens at call
// time (roslib queues sends while disconnected), which is the op's intent —
// good enough for a demo readout.
function instrumentWireOps(ros, onOp) {
  const original = ros.callOnConnection.bind(ros);
  ros.callOnConnection = (message) => {
    if (message && (message.op === 'subscribe' || message.op === 'unsubscribe')) {
      onOp(message);
    }
    return original(message);
  };
}

export function useRosConnection(initialUrl) {
  const [draftUrl, setDraftUrl] = useState(initialUrl);
  const [request, setRequest] = useState({ url: initialUrl, nonce: 1 });
  const [ros, setRos] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [lastError, setLastError] = useState('');
  const [wireOps, setWireOps] = useState(EMPTY_WIRE_OPS);

  useEffect(() => {
    if (!request.nonce) {
      return undefined;
    }

    const nextRos = new ROSLIB.Ros({ url: request.url });
    // Fresh connection → fresh wire stats. The library's subscription pool is
    // keyed per-ros (WeakMap), so pool state and this readout reset together.
    // `live` disarms this instance's wrapper once the effect is cleaned up: a
    // replaced connection's clients still unsubscribe through the old wrapper
    // during React cleanup (and pooled grace timers can fire long after), and
    // roslib replays reconnect_on_close subscriptions on the old instance's
    // close — none of which may touch the NEW connection's stats.
    let live = true;
    setWireOps(EMPTY_WIRE_OPS);
    instrumentWireOps(nextRos, (message) => {
      if (!live) {
        return;
      }
      setWireOps((prev) => {
        const isSubscribe = message.op === 'subscribe';
        const byTopic = { ...prev.byTopic };
        byTopic[message.topic] = (byTopic[message.topic] || 0) + (isSubscribe ? 1 : -1);
        const entry = {
          id: prev.subscribes + prev.unsubscribes + 1,
          time: new Date().toLocaleTimeString(),
          op: message.op,
          topic: message.topic,
        };
        return {
          subscribes: prev.subscribes + (isSubscribe ? 1 : 0),
          unsubscribes: prev.unsubscribes + (isSubscribe ? 0 : 1),
          byTopic,
          log: [entry, ...prev.log].slice(0, WIRE_LOG_LIMIT),
        };
      });
    });
    setRos(nextRos);
    setStatus('connecting');
    setLastError('');

    const handleConnection = () => {
      setStatus('connected');
      setLastError('');
    };
    const handleClose = () => {
      setStatus('closed');
      // On close the real wire state IS zero — and roslib immediately replays
      // every reconnect_on_close subscription through callOnConnection (its
      // topic close-handlers were registered after ours, so they fire after
      // this reset and get counted fresh). Without the reset those replays
      // would inflate the counts by one per topic per close. Guarded on
      // `live`: a replaced instance's late close must not wipe counts the
      // new connection already accumulated.
      if (live) {
        setWireOps(EMPTY_WIRE_OPS);
      }
    };
    const handleError = (error) => {
      setStatus('error');
      setLastError(error && error.message ? error.message : 'Unknown rosbridge error');
    };

    nextRos.on('connection', handleConnection);
    nextRos.on('close', handleClose);
    nextRos.on('error', handleError);

    return () => {
      // Disarm BEFORE closing: close triggers roslib's subscribe replays and
      // the demos' teardown unsubscribes on this old instance.
      live = false;
      nextRos.close();
    };
  }, [request]);

  return {
    ros,
    status,
    draftUrl,
    setDraftUrl,
    lastError,
    wireOps,
    connect() {
      setRequest({ url: draftUrl, nonce: Date.now() });
    },
    disconnect() {
      if (ros) {
        ros.close();
      }
    },
  };
}

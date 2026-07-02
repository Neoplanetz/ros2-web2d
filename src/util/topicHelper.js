/**
 * @fileOverview
 * Internal helper for constructing a ROSLIB.Topic with the standard
 * (ros, name, messageType) trio plus the optional Topic options every
 * subscribe-only Client wants to forward to ROSLIB.
 *
 * Forwarded keys (rosbridge subscribe op payload + connection):
 *   - throttle_rate     : ms between delivered messages
 *   - queue_length      : bridge-side subscriber queue length
 *   - compression       : 'none' | 'cbor' | 'cbor-raw' | 'png'
 *   - reconnect_on_close: auto-resubscribe after disconnect
 *
 * Intentionally NOT forwarded (advertise-only at the rosbridge protocol
 * level, no-op for subscribers): `queue_size`, `latch`. They were
 * forwarded in v1.4.1/v1.4.2 by mistake; removed in v1.4.3.
 *
 * Lives in its own file (not in Ros2D.js) so the helper attaches
 * directly to the ROS2D global instead of being shadowed by the
 * `var ROS2D = ROS2D || {...}` declaration at the top of Ros2D.js.
 *
 * undefined values are passed through so ROSLIB.Topic's own
 * destructure defaults still apply when the caller did not opt in.
 *
 * ─── Optional shared subscription pool (P3, v1.11.0) ──────────────────────
 * Passing `pool: true` in options opts a subscribe-only Client into a
 * refcounted, per-connection subscription pool: N Clients on the same
 * (topic, messageType, wire-options) share ONE underlying ROSLIB.Topic
 * instead of opening a duplicate subscription each. This gives conventional
 * Client users the wire-level dedup + churn-safety that a bespoke transport
 * would otherwise have to build. It is strictly opt-in — omit `pool` (or pass
 * a falsy value) and _makeTopic behaves byte-for-byte as before (a fresh
 * ROSLIB.Topic, torn down immediately on unsubscribe).
 *
 * The pooled path returns a lightweight handle exposing the same
 * `.subscribe(cb)` / `.unsubscribe()` surface a Client uses, so no Client
 * code changes. Semantics of the pool:
 *   - Key = topic name + messageType + every wire-affecting option
 *     (throttle_rate, queue_length, compression, reconnect_on_close).
 *     Consumers whose wire options differ cannot share one bridge
 *     subscription, so they get separate pool entries.
 *   - The single real ROSLIB.Topic is built + subscribed on the first
 *     consumer; a fan-out dispatcher delivers each message to every
 *     consumer (each in its own try/catch so one throwing Client cannot
 *     starve its siblings on the shared topic).
 *   - On the last consumer leaving, the real unsubscribe is DEFERRED by a
 *     grace window (default 5000 ms, see setTopicPoolGraceMs) so a quick
 *     unmount->remount reuses the live subscription instead of churning the
 *     bridge (which can trip the rclpy destroy_subscription SIGSEGV race).
 *   - The last dispatched message is retained and replayed to a consumer
 *     that joins an already-live shared topic, so a pooled Client behaves
 *     like it held its own subscription for latched topics (e.g. maps).
 *     The retained message is dropped on real teardown so nothing stale is
 *     replayed after the wire subscription actually drops.
 *
 * Interaction with feed-mode (P1): a `subscribe: false` Client never calls
 * _makeTopic, so it never touches the pool — no special-casing needed.
 */

// Per-connection pools: ros -> Map<key, entry>. A WeakMap so a pool is
// dropped when its ROSLIB.Ros is garbage-collected (e.g. connection replaced),
// which also isolates test connections from one another automatically.
var _topicPools = new WeakMap();

// Deferred-unsubscribe grace window (ms). Module-level default shared by every
// pooled entry; see ROS2D.setTopicPoolGraceMs. 0 disables deferral (the real
// unsubscribe fires synchronously once the last consumer leaves).
var _topicPoolGraceMs = 5000;

function _poolFor(ros) {
  var map = _topicPools.get(ros);
  if (!map) {
    map = new Map();
    _topicPools.set(ros, map);
  }
  return map;
}

// Wire identity of a subscription. Two Clients may share one bridge
// subscription only when all of these match; differing wire options must not
// silently coalesce (a 100 ms and a 200 ms throttle_rate are different
// subscriptions on the wire). undefined options stringify consistently, so
// callers that opt into nothing land on the same key. The space delimiter
// cannot occur in a ROS topic name or messageType (both forbid whitespace), so
// distinct field tuples cannot collide into one key.
function _poolKey(name, messageType, options) {
  return [
    name,
    messageType,
    options.throttle_rate,
    options.queue_length,
    options.compression,
    options.reconnect_on_close
  ].join(' ');
}

// Construct the single real ROSLIB.Topic. This is the pre-pool behavior of
// _makeTopic, extracted so both the direct (no-pool) path and the pool's
// shared topic build it identically.
function _buildRawTopic(ros, name, messageType, options) {
  return new ROSLIB.Topic({
    ros: ros,
    name: name,
    messageType: messageType,
    throttle_rate: options.throttle_rate,
    queue_length: options.queue_length,
    compression: options.compression,
    reconnect_on_close: options.reconnect_on_close
  });
}

function _reportConsumerError(err) {
  if (typeof console !== 'undefined' && console && console.error) {
    console.error('ros2-web2d: pooled topic consumer threw', err);
  }
}

// Fan a single wire message out to every consumer of a pool entry. Retains the
// message first (for late-join replay) and snapshots the consumer set so a
// consumer that unsubscribes during its own callback (e.g. OccupancyGridClient
// non-continuous auto-unsubscribe) cannot make a sibling get skipped. Consumers
// are per-subscribe records ({ cb }), not raw callbacks, so two handles passing
// the same callback function stay independent.
function _dispatch(entry, message) {
  entry.lastMessage = message;
  entry.hasLast = true;
  var list = [];
  entry.consumers.forEach(function(consumer) { list.push(consumer); });
  for (var i = 0; i < list.length; i++) {
    try {
      list[i].cb(message);
    } catch (err) {
      _reportConsumerError(err);
    }
  }
}

function _teardownEntry(poolMap, entry) {
  if (entry.rosTopic) {
    entry.rosTopic.unsubscribe();
    entry.rosTopic = null;
  }
  // Drop the replay latch so a re-subscribe after teardown never replays a
  // pre-teardown message.
  entry.lastMessage = undefined;
  entry.hasLast = false;
  // Only evict when the map still points at THIS entry. A grace timer that
  // fires after the entry was already torn down (e.g. a duplicate timer from a
  // repeated unsubscribe) must never delete a newer same-key entry rebuilt by
  // a later acquire.
  if (poolMap.get(entry.key) === entry) {
    poolMap.delete(entry.key);
  }
}

function _scheduleTeardown(poolMap, entry) {
  if (_topicPoolGraceMs > 0) {
    entry.drainTimer = setTimeout(function() {
      entry.drainTimer = null;
      // A consumer may have re-attached during the grace window; only tear
      // down if still idle.
      if (entry.consumers.size === 0) {
        _teardownEntry(poolMap, entry);
      }
    }, _topicPoolGraceMs);
  } else {
    _teardownEntry(poolMap, entry);
  }
}

// Return a per-consumer handle over the shared pool entry for (ros, key). The
// handle mimics the ROSLIB.Topic surface a Client uses — subscribe(cb) /
// unsubscribe() — but registers/removes only THIS handle's callbacks, so one
// Client tearing down never detaches its siblings.
function _acquirePooledTopic(ros, name, messageType, options) {
  var key = _poolKey(name, messageType, options);
  var poolMap = _poolFor(ros);
  var myConsumers = [];

  return {
    name: name,
    messageType: messageType,
    subscribe: function(cb) {
      var entry = poolMap.get(key);
      if (!entry) {
        entry = {
          key: key,
          name: name,
          messageType: messageType,
          rosTopic: null,
          consumers: new Set(),
          drainTimer: null,
          lastMessage: undefined,
          hasLast: false
        };
        poolMap.set(key, entry);
      }
      // Reactivate a draining entry: cancel the pending teardown and reuse the
      // still-live real topic — no wire re-subscribe.
      if (entry.drainTimer !== null) {
        clearTimeout(entry.drainTimer);
        entry.drainTimer = null;
      }
      // Per-subscribe record (not the raw cb) so this handle's registration is
      // distinct even if another handle subscribed the same callback function.
      var consumer = { cb: cb };
      entry.consumers.add(consumer);
      myConsumers.push(consumer);
      if (!entry.rosTopic) {
        // First consumer: build + subscribe the single shared topic with a
        // fan-out dispatcher.
        entry.rosTopic = _buildRawTopic(ros, name, messageType, options);
        entry.rosTopic.subscribe(function(message) {
          _dispatch(entry, message);
        });
      } else if (entry.hasLast) {
        // Late joiner to an already-live shared topic: replay the retained
        // last message so it renders immediately (as it would have with its
        // own latched subscription). Only this newcomer; not existing
        // consumers.
        try {
          cb(entry.lastMessage);
        } catch (err) {
          _reportConsumerError(err);
        }
      }
    },
    unsubscribe: function() {
      var entry = poolMap.get(key);
      if (!entry) {
        myConsumers.length = 0;
        return;
      }
      for (var i = 0; i < myConsumers.length; i++) {
        entry.consumers.delete(myConsumers[i]);
      }
      myConsumers.length = 0;
      // Only arm teardown when idle AND not already draining. A repeated
      // unsubscribe (e.g. a non-continuous OccupancyGridClient auto-unsubscribes
      // on first message, then a user teardown calls unsubscribe() again) must
      // not schedule a second grace timer — that would orphan the first timer
      // reference (it cannot be cancelled on re-acquire) and can tear the wrong
      // entry down.
      if (entry.consumers.size === 0 && entry.drainTimer === null) {
        _scheduleTeardown(poolMap, entry);
      }
    }
  };
}

/**
 * Construct a subscribe-only topic handle. With no `pool` option this returns a
 * fresh ROSLIB.Topic (historical behavior). With `pool: true` it returns a
 * pooled handle that shares one underlying ROSLIB.Topic across every consumer
 * with the same wire identity on the same connection. See the file overview.
 */
ROS2D._makeTopic = function(ros, name, messageType, options) {
  options = options || {};
  if (options.pool) {
    return _acquirePooledTopic(ros, name, messageType, options);
  }
  return _buildRawTopic(ros, name, messageType, options);
};

/**
 * Set the deferred-unsubscribe grace window (ms) for the shared subscription
 * pool. When the last consumer of a pooled topic leaves, the real
 * `unsubscribe()` is held for this long so a quick unmount->remount reuses the
 * live subscription instead of churning the bridge. Pass 0 to tear down
 * immediately. Affects entries torn down after the call; a pending grace timer
 * already scheduled keeps its original duration. Default 5000.
 * @param {number} ms - grace window in milliseconds; 0 tears down immediately
 */
ROS2D.setTopicPoolGraceMs = function(ms) {
  _topicPoolGraceMs = ms;
};

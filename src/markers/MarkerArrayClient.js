/**
 * @fileOverview
 * Subscribes to a visualization_msgs/MarkerArray topic and renders each
 * marker via ROS2D.Marker, keyed by namespace+id. Supports the four
 * standard actions (ADD/MODIFY/DELETE/DELETEALL) and lifetime-based
 * automatic removal.
 *
 * When a tfClient is supplied each marker is wrapped in a ROS2D.SceneNode
 * that subscribes to the marker's own header.frame_id, so multi-robot
 * arrays with mixed frames render correctly. Without tfClient the client
 * falls back to the v1 behavior of rendering poses directly in the
 * rootObject's coordinate frame.
 *
 * Emits the following events:
 *   * 'change' - one or more markers were added, modified, or removed
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the marker topic to listen to, defaults to '/markers'
 *   * rootObject (optional) - the root createjs object to add markers to
 *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient; when
 *       present, each marker is wrapped in a ROS2D.SceneNode keyed on
 *       its own header.frame_id.
 *   * rvizOrder (optional, default false) - when true, marker children of
 *       the rootObject are reordered after each message so that
 *       LINE_STRIP / LINE_LIST (types 4, 5) render below all other
 *       geometry markers, and TEXT_VIEW_FACING (type 9) renders above
 *       them - matching RViz2's implicit render order. Within each
 *       tier the publish (insertion) order is preserved.
 *   * subscribe (optional, default true) - when false, the client does not
 *       create or subscribe a ROSLIB.Topic; render it via processMessage()
 *       instead. For render-only consumers that own the subscription elsewhere.
 */
ROS2D.MarkerArrayClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;
  this.topicName = options.topic || '/markers';
  this.rootObject = options.rootObject || new createjs.Container();
  this.tfClient = options.tfClient || null;
  this.rvizOrder = options.rvizOrder === true;

  // key = ns + ':' + id  ->  { obj: child, node: SceneNode|null, timer: timeoutId|null, type: int }
  this.markers = {};

  // options.subscribe (default true). When false, do NOT create/subscribe the
  // ROSLIB.Topic — the client renders only messages fed via processMessage().
  // Used by render-only consumers that own the subscription elsewhere, avoiding
  // a construct-time subscribe→unsubscribe churn blip on the bridge.
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'visualization_msgs/MarkerArray', options);
    this.rosTopic.subscribe(function(message) {
      that.processMessage(message);
    });
  } else {
    this.rosTopic = null;
  }
};

ROS2D.MarkerArrayClient.prototype.processMessage = function(message) {
  var markers = (message && message.markers) || [];
  for (var i = 0; i < markers.length; i++) {
    this._handleMarker(markers[i]);
  }
  if (this.rvizOrder) {
    this._applyRvizOrder();
  }
  this.emit('change');
};

ROS2D.MarkerArrayClient.prototype._handleMarker = function(m) {
  // DELETEALL
  if (m.action === 3) {
    this._clearAll();
    return;
  }
  var key = (m.ns || '') + ':' + m.id;
  // DELETE
  if (m.action === 2) {
    this._removeMarker(key);
    return;
  }
  // ADD or MODIFY
  this._removeMarker(key);
  var child;
  var sceneNode = null;
  if (this.tfClient) {
    var shape = new ROS2D.Marker({ message: m, applyPose: false });
    sceneNode = new ROS2D.SceneNode({
      tfClient: this.tfClient,
      frame_id: (m.header && m.header.frame_id) || '',
      pose: m.pose,
      object: shape
    });
    child = sceneNode;
  } else {
    child = new ROS2D.Marker({ message: m });
  }
  this.rootObject.addChild(child);
  var entry = { obj: child, node: sceneNode, timer: null, type: m.type };
  var lifeSec = (m.lifetime && m.lifetime.sec) || 0;
  var lifeNs = (m.lifetime && m.lifetime.nanosec) || 0;
  if (lifeSec > 0 || lifeNs > 0) {
    var ms = lifeSec * 1000 + lifeNs / 1e6;
    var that = this;
    entry.timer = setTimeout(function() {
      // Guard against double-removal: only act if the entry is still ours.
      if (that.markers[key] === entry) {
        that._removeMarker(key);
        if (that.rvizOrder) {
          that._applyRvizOrder();
        }
        that.emit('change');
      }
    }, ms);
  }
  this.markers[key] = entry;
};

// Returns 0 (bottom), 1 (middle), or 2 (top) for the given marker type.
// visualization_msgs/Marker types: 4=LINE_STRIP, 5=LINE_LIST, 9=TEXT_VIEW_FACING.
ROS2D.MarkerArrayClient.prototype._typeRank = function(type) {
  if (type === 9) {
    return 2;
  }
  if (type === 4 || type === 5) {
    return 0;
  }
  return 1;
};

// Reorder our markers within rootObject so that lines render below
// geometry markers, which render below text markers - matching RViz2's
// implicit render order. Within each tier, current sibling order is
// preserved (so publish/insertion order survives across re-applications).
// Children of rootObject we don't own are left in their existing slots.
ROS2D.MarkerArrayClient.prototype._applyRvizOrder = function() {
  var buckets = [[], [], []];
  var slots = [];
  for (var k in this.markers) {
    if (!Object.prototype.hasOwnProperty.call(this.markers, k)) {
      continue;
    }
    var entry = this.markers[k];
    if (!entry || !entry.obj) {
      continue;
    }
    var idx = this.rootObject.getChildIndex(entry.obj);
    if (idx < 0) {
      continue;
    }
    buckets[this._typeRank(entry.type)].push({ obj: entry.obj, idx: idx });
    slots.push(idx);
  }
  for (var t = 0; t < buckets.length; t++) {
    buckets[t].sort(function(a, b) { return a.idx - b.idx; });
  }
  slots.sort(function(a, b) { return a - b; });

  var ordered = [];
  for (var t2 = 0; t2 < buckets.length; t2++) {
    for (var j = 0; j < buckets[t2].length; j++) {
      ordered.push(buckets[t2][j].obj);
    }
  }

  // Fill only the sibling slots already occupied by our markers. Moving
  // from high target index to low target index keeps unrelated children
  // anchored while setChildIndex mutates the display list.
  for (var s = ordered.length - 1; s >= 0; s--) {
    this.rootObject.setChildIndex(ordered[s], slots[s]);
  }
};

ROS2D.MarkerArrayClient.prototype._removeMarker = function(key) {
  var entry = this.markers[key];
  if (!entry) {
    return;
  }
  if (entry.timer) {
    clearTimeout(entry.timer);
  }
  if (entry.node) {
    entry.node.unsubscribe();
  }
  this.rootObject.removeChild(entry.obj);
  delete this.markers[key];
};

ROS2D.MarkerArrayClient.prototype._clearAll = function() {
  for (var k in this.markers) {
    if (Object.prototype.hasOwnProperty.call(this.markers, k)) {
      var entry = this.markers[k];
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      if (entry.node) {
        entry.node.unsubscribe();
      }
      this.rootObject.removeChild(entry.obj);
    }
  }
  this.markers = {};
};

ROS2D.MarkerArrayClient.prototype.unsubscribe = function() {
  if (this.rosTopic) {
    this.rosTopic.unsubscribe();
  }
  this._clearAll();
};

Object.setPrototypeOf(ROS2D.MarkerArrayClient.prototype, EventEmitter.prototype);

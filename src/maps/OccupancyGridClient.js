/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A map that listens to a given occupancy grid topic.
 *
 * When a tfClient is supplied the grid is wrapped in a ROS2D.SceneNode
 * keyed on the message's header.frame_id. This lets multi-robot
 * deployments publish maps in per-robot frames (e.g. /robot_0/map) and
 * have them overlay correctly via TF. Without tfClient, the grid is
 * attached directly to rootObject as in v1.
 *
 * Emits the following events:
 *   * 'change' - there was an update or change in the map
 *
 * @constructor
 * @param options - object with following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the map topic to listen to
 *   * rootObject (optional) - the root object to add this marker to
 *   * continuous (optional) - if the map should be continuously loaded (e.g., for SLAM)
 *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient
 *   * colorizer (optional) - forwarded to ROS2D.OccupancyGrid; set to
 *       'costmap' (or a custom function) to render nav2 costmap topics
 *       such as /local_costmap/costmap with an inflation gradient
 *       instead of grayscale.
 */
ROS2D.OccupancyGridClient = function(options) {
  EventEmitter.call(this);
  var that = this;
  options = options || {};
  var ros = options.ros;
  var topic = options.topic || '/map';
  this.continuous = options.continuous;
  this.rootObject = options.rootObject || new createjs.Container();
  this.tfClient = options.tfClient || null;
  this.colorizer = options.colorizer || null;
  this.node = null;
  // Last received message, cached so setColorizer() can re-render the current
  // map without re-subscribing to the topic.
  this.lastMessage = null;
  // Set by the public unsubscribe() (consumer teardown). Once disposed,
  // setColorizer() must not re-render — otherwise a late recolor would
  // re-create a detached TF SceneNode and re-attach a display child.
  this.disposed = false;

  // current grid that is displayed
  // create an empty shape to start with, so that the order remains correct.
  this.currentGrid = new createjs.Shape();
  if (!this.tfClient) {
    this.rootObject.addChild(this.currentGrid);
    // work-around for a bug in easeljs -- needs a second object to render correctly
    this.rootObject.addChild(new ROS2D.Grid({size:1}));
  }

  // subscribe to the topic
  this.rosTopic = ROS2D._makeTopic(ros, topic, 'nav_msgs/OccupancyGrid', options);

  this.rosTopic.subscribe(function(message) {
    that._renderGrid(message);
    // A fresh message may change map dimensions/origin, so emit 'change' to let
    // consumers re-fit the view. (setColorizer() deliberately does NOT emit —
    // a recolor keeps the same dimensions, so the view must not be reset.)
    that.emit('change');

    // check if we should unsubscribe
    if (!that.continuous) {
      that.rosTopic.unsubscribe();
    }
  });
};

/**
 * Build a grid Shape from a message + the current colorizer and swap it into
 * the scene (under the TF SceneNode when a tfClient is set, otherwise directly
 * under rootObject), preserving child order. Caches the message on
 * `this.lastMessage` so setColorizer() can re-render later without a new
 * subscription. Does NOT emit 'change' itself — the caller decides whether a
 * re-fit is warranted (the subscribe path emits; setColorizer does not).
 * @private
 */
ROS2D.OccupancyGridClient.prototype._renderGrid = function(message) {
  this.lastMessage = message;
  var newGrid = new ROS2D.OccupancyGrid({
    message : message,
    colorizer: this.colorizer
  });

  if (this.tfClient) {
    var frame = (message && message.header && message.header.frame_id) || '';
    if (!this.node) {
      this.node = new ROS2D.SceneNode({
        tfClient: this.tfClient,
        frame_id: frame,
        object: newGrid
      });
      this.rootObject.addChild(this.node);
    } else {
      if (this.node.frame_id !== frame) { this.node.setFrame(frame); }
      // Replace the lone child under the SceneNode with the new grid.
      if (this.node.children) {
        while (this.node.children.length > 0) {
          this.node.removeChild(this.node.children[0]);
        }
      }
      this.node.addChild(newGrid);
    }
    this.currentGrid = newGrid;
  } else {
    // check for an old map
    var index = null;
    if (this.currentGrid) {
      index = this.rootObject.getChildIndex(this.currentGrid);
      this.rootObject.removeChild(this.currentGrid);
    }
    this.currentGrid = newGrid;
    if (index !== null) {
      this.rootObject.addChildAt(this.currentGrid, index);
    }
    else {
      this.rootObject.addChild(this.currentGrid);
    }
  }
};

/**
 * Re-render the current map with a new colorizer WITHOUT re-subscribing to the
 * topic. Intended for theme switches: the cached last message is re-colorized
 * and the grid Shape swapped in place; the ROS topic subscription is left
 * untouched, so it cannot trigger subscribe/unsubscribe churn on the bridge.
 * Does NOT emit 'change' — a recolor keeps the same map dimensions, so the
 * view is preserved (no re-fit); the Viewer's createjs Ticker repaints the
 * swapped grid on the next frame. If no message has arrived yet the colorizer
 * is stored and applied to the next one. After the client has been torn down
 * via unsubscribe() this is a no-op (it will not resurrect a detached grid /
 * TF SceneNode).
 * @param colorizer - 'map' | 'costmap' | function(value) -> [r, g, b, a]
 */
ROS2D.OccupancyGridClient.prototype.setColorizer = function(colorizer) {
  this.colorizer = colorizer;
  if (this.lastMessage && !this.disposed) {
    this._renderGrid(this.lastMessage);
  }
};

/**
 * Detach from the map topic and drop any SceneNode wrap. Terminal: marks the
 * client disposed so a later setColorizer() cannot re-render / resurrect the
 * grid. (The internal non-continuous auto-unsubscribe calls rosTopic.unsubscribe
 * directly, NOT this method, so recolor-after-first-message still works.)
 */
ROS2D.OccupancyGridClient.prototype.unsubscribe = function() {
  this.disposed = true;
  if (this.rosTopic) { this.rosTopic.unsubscribe(); }
  if (this.node) {
    this.node.unsubscribe();
    this.rootObject.removeChild(this.node);
    this.node = null;
  }
};

Object.setPrototypeOf(ROS2D.OccupancyGridClient.prototype, EventEmitter.prototype);

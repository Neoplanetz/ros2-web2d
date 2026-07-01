/**
 * @fileOverview
 * Subscribes to a geometry_msgs/PoseStamped topic and drives a single
 * ROS2D.NavigationArrow. Useful for visualizing AMCL pose estimates,
 * nav2 goal_pose echoes, etc.
 *
 * Y coordinates are negated to match the library convention (ROS +Y up
 * on screen). Orientation is mapped via ROS2D.quaternionToGlobalTheta
 * so the arrow points in the correct compass direction.
 *
 * Emits the following events:
 *   * 'change' - a new pose has been applied
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the pose topic, defaults to '/pose'
 *   * rootObject (optional) - the root createjs object to attach the marker to
 *   * shape (optional) - a pre-built createjs DisplayObject to use as the
 *       pose marker (e.g. ROS2D.NavigationImage with a custom SVG, or any
 *       custom Bitmap/Shape/Container that exposes .x, .y, .rotation,
 *       and .visible). If omitted a default ROS2D.NavigationArrow is
 *       created from the size / strokeSize / strokeColor / fillColor /
 *       pulse options below.
 *   * size (optional) - forwarded to the default ROS2D.NavigationArrow
 *   * strokeSize (optional) - forwarded to the default ROS2D.NavigationArrow
 *   * strokeColor (optional) - forwarded to the default ROS2D.NavigationArrow
 *   * fillColor (optional) - forwarded to the default ROS2D.NavigationArrow
 *   * pulse (optional) - forwarded to the default ROS2D.NavigationArrow
 *   * subscribe (optional, default true) - when false, the client does not
 *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
 *       instead. For render-only consumers that own the subscription
 *       elsewhere (shape + tfClient still apply in this mode).
 */
ROS2D.PoseStampedClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;
  this.topicName = options.topic || '/pose';
  this.rootObject = options.rootObject || new createjs.Container();

  if (options.shape) {
    this.marker = options.shape;
  } else {
    this.marker = new ROS2D.NavigationArrow({
      size: options.size,
      strokeSize: options.strokeSize,
      strokeColor: options.strokeColor,
      fillColor: options.fillColor,
      pulse: options.pulse
    });
  }
  // Backwards-compatible alias — older callers referenced .arrow directly.
  this.arrow = this.marker;
  // Keep the marker hidden until the first message arrives so it does not
  // flash at the origin on startup.
  this.marker.visible = false;
  this.tfClient = options.tfClient || null;
  this.node = null;
  if (!this.tfClient) {
    this.rootObject.addChild(this.marker);
  }
  // tfClient path: we add the SceneNode on first message instead.

  // options.subscribe (default true). When false, do NOT create/subscribe the
  // ROSLIB.Topic — the client renders only messages fed via processMessage().
  // Used by render-only consumers that own the subscription elsewhere, avoiding
  // a construct-time subscribe→unsubscribe churn blip on the bridge.
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'geometry_msgs/PoseStamped', options);
    this.rosTopic.subscribe(function(message) {
      that.processMessage(message);
    });
  } else {
    this.rosTopic = null;
  }
};

/**
 * Render a single geometry_msgs/PoseStamped message: position the managed
 * marker (Y negated, orientation via quaternionToGlobalTheta), or drive the
 * SceneNode when a tfClient is set, then emit 'change'. This is the sole
 * render path — the subscribe callback simply forwards to it — so render-only
 * consumers (subscribe:false) can feed messages from their own transport and
 * still get the canonical mapping and SceneNode TF.
 */
ROS2D.PoseStampedClient.prototype.processMessage = function(message) {
  var pose = message && message.pose;
  if (!pose || !pose.position) {
    return;
  }
  if (this.tfClient) {
    this.marker.visible = true;
    var frame = (message.header && message.header.frame_id) || '';
    if (!this.node) {
      this.node = new ROS2D.SceneNode({
        tfClient: this.tfClient,
        frame_id: frame,
        pose: pose,
        object: this.marker
      });
      this.rootObject.addChild(this.node);
    } else {
      if (this.node.frame_id !== frame) { this.node.setFrame(frame); }
      this.node.setPose(pose);
    }
    // Marker stays at origin; SceneNode positions it.
  } else {
    this.marker.x = pose.position.x;
    this.marker.y = -pose.position.y;
    this.marker.rotation = ROS2D.quaternionToGlobalTheta(pose.orientation || { x: 0, y: 0, z: 0, w: 1 });
    this.marker.visible = true;
  }
  this.emit('change');
};

/**
 * Detach from the topic and remove the managed marker from the rootObject.
 */
ROS2D.PoseStampedClient.prototype.unsubscribe = function() {
  if (this.rosTopic) {
    this.rosTopic.unsubscribe();
  }
  if (this.node) {
    this.node.unsubscribe();
    this.rootObject.removeChild(this.node);
    this.node = null;
  } else if (this.marker && this.rootObject) {
    this.rootObject.removeChild(this.marker);
  }
};

Object.setPrototypeOf(ROS2D.PoseStampedClient.prototype, EventEmitter.prototype);

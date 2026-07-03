/**
 * @fileOverview
 * Subscribes to a nav_msgs/Odometry topic and drives a single marker
 * (NavigationArrow by default, or any DisplayObject the caller passes
 * via options.shape — typically a ROS2D.NavigationImage with a custom
 * robot SVG).
 *
 * Odometry shares its render path with PoseStampedClient: only the
 * topic message type and the pose extraction differ (Odometry nests
 * pose under message.pose.pose with an additional covariance field).
 *
 * Y is negated to match the library convention (ROS +Y up on screen).
 *
 * Emits the following events:
 *   * 'change' - a new odometry message has been applied
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the odometry topic, defaults to '/odom'
 *   * rootObject (optional) - the root createjs object to attach the marker to
 *   * shape (optional) - a pre-built createjs DisplayObject to use as the
 *       pose marker (see PoseStampedClient for details). Falls back to
 *       a default ROS2D.NavigationArrow built from the options below.
 *   * size, strokeSize, strokeColor, fillColor, pulse (optional) -
 *       forwarded to the default ROS2D.NavigationArrow
 *   * subscribe (optional, default true) - when false, the client does not
 *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
 *       instead. For render-only consumers that own the subscription
 *       elsewhere (shape + tfClient still apply in this mode).
 *   * applyOrientation (optional, default true) - when false, the client
 *       positions the marker but never applies the message yaw: the shape
 *       keeps whatever rotation its owner set (e.g. a fixed upright goal
 *       flag). On the TF path the SceneNode is driven with an identity
 *       orientation for the same reason (frame transforms still apply).
 */
ROS2D.OdometryClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;
  this.topicName = options.topic || '/odom';
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
  this.marker.visible = false;
  this.tfClient = options.tfClient || null;
  this.node = null;
  this.applyOrientation = options.applyOrientation !== false;
  if (!this.tfClient) {
    this.rootObject.addChild(this.marker);
  }

  // options.subscribe (default true). When false, do NOT create/subscribe the
  // ROSLIB.Topic — the client renders only messages fed via processMessage().
  // Used by render-only consumers that own the subscription elsewhere, avoiding
  // a construct-time subscribe→unsubscribe churn blip on the bridge.
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'nav_msgs/Odometry', options);
    this.rosTopic.subscribe(function(message) {
      that.processMessage(message);
    });
  } else {
    this.rosTopic = null;
  }
};

/**
 * Render a single nav_msgs/Odometry message: position the managed marker
 * (Y negated, orientation via quaternionToGlobalTheta) or drive the SceneNode
 * when a tfClient is set, then emit 'change'. This is the sole render path —
 * the subscribe callback simply forwards to it — so render-only consumers
 * (subscribe:false) can feed messages from their own transport and still get
 * the canonical mapping and SceneNode TF.
 */
ROS2D.OdometryClient.prototype.processMessage = function(message) {
  // nav_msgs/Odometry wraps the actual pose one level deeper than
  // geometry_msgs/PoseStamped: message.pose is a PoseWithCovariance,
  // whose `.pose` field holds the geometry_msgs/Pose we want.
  var pose = message && message.pose && message.pose.pose;
  if (!pose || !pose.position) {
    return;
  }
  if (this.tfClient) {
    this.marker.visible = true;
    var frame = (message.header && message.header.frame_id) || '';
    // applyOrientation:false — the SceneNode composes TF x pose into its
    // rotation, so the message yaw must be replaced with identity before
    // it reaches the node (the shape keeps its own fixed rotation).
    var nodePose = this.applyOrientation ? pose : {
      position: pose.position,
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    };
    if (!this.node) {
      this.node = new ROS2D.SceneNode({
        tfClient: this.tfClient,
        frame_id: frame,
        pose: nodePose,
        object: this.marker
      });
      this.rootObject.addChild(this.node);
    } else {
      if (this.node.frame_id !== frame) { this.node.setFrame(frame); }
      this.node.setPose(nodePose);
    }
  } else {
    this.marker.x = pose.position.x;
    this.marker.y = -pose.position.y;
    if (this.applyOrientation) {
      this.marker.rotation = ROS2D.quaternionToGlobalTheta(pose.orientation || { x: 0, y: 0, z: 0, w: 1 });
    }
    this.marker.visible = true;
  }
  this.emit('change');
};

/**
 * Detach from the topic and remove the managed marker from the rootObject.
 */
ROS2D.OdometryClient.prototype.unsubscribe = function() {
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

Object.setPrototypeOf(ROS2D.OdometryClient.prototype, EventEmitter.prototype);

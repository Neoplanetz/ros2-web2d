/**
 * @fileOverview
 * Subscribes to a nav_msgs/Path topic and renders each incoming message
 * through ROS2D.PathShape. Wraps the subscribe + setPath + change-event
 * boilerplate so callers get the same single-line UX as
 * OccupancyGridClient / MarkerArrayClient.
 *
 * When a tfClient is supplied the PathShape is lazily wrapped in a
 * ROS2D.SceneNode keyed on the message's header.frame_id. Frame changes
 * across messages are propagated via SceneNode.setFrame.
 *
 * Emits the following events:
 *   * 'change' - a new path message has been applied
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the path topic, defaults to '/path'
 *   * rootObject (optional) - the root createjs object to attach the PathShape to
 *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient
 *   * strokeSize (optional) - forwarded to ROS2D.PathShape
 *   * strokeColor (optional) - forwarded to ROS2D.PathShape
 *   * subscribe (optional, default true) - when false, the client does not
 *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
 *       instead. For render-only consumers that own the subscription
 *       elsewhere (tfClient still applies in this mode).
 */
ROS2D.PathClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;
  this.topicName = options.topic || '/path';
  this.rootObject = options.rootObject || new createjs.Container();
  this.tfClient = options.tfClient || null;

  this.pathShape = new ROS2D.PathShape({
    strokeSize: options.strokeSize,
    strokeColor: options.strokeColor
  });
  this.node = null;

  if (!this.tfClient) {
    // Default path: attach pathShape directly, as in v1.2.
    this.rootObject.addChild(this.pathShape);
  }

  // options.subscribe (default true). When false, do NOT create/subscribe the
  // ROSLIB.Topic — the client renders only messages fed via processMessage().
  // Used by render-only consumers that own the subscription elsewhere, avoiding
  // a construct-time subscribe→unsubscribe churn blip on the bridge.
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'nav_msgs/Path', options);
    this.rosTopic.subscribe(function(message) {
      that.processMessage(message);
    });
  } else {
    this.rosTopic = null;
  }
};

/**
 * Render a single nav_msgs/Path message through the managed PathShape (lazily
 * wrapping it in a SceneNode when a tfClient is set), then emit 'change'. This
 * is the sole render path — the subscribe callback simply forwards to it — so
 * render-only consumers (subscribe:false) can feed messages from their own
 * transport and still get SceneNode TF.
 */
ROS2D.PathClient.prototype.processMessage = function(message) {
  if (this.tfClient) {
    var frame = (message && message.header && message.header.frame_id) || '';
    if (!this.node) {
      this.node = new ROS2D.SceneNode({
        tfClient: this.tfClient,
        frame_id: frame,
        object: this.pathShape
      });
      this.rootObject.addChild(this.node);
    } else if (this.node.frame_id !== frame) {
      this.node.setFrame(frame);
    }
  }
  this.pathShape.setPath(message);
  this.emit('change');
};

/**
 * Detach from the topic and remove the managed PathShape (or SceneNode
 * wrapper) from the rootObject.
 */
ROS2D.PathClient.prototype.unsubscribe = function() {
  if (this.rosTopic) {
    this.rosTopic.unsubscribe();
  }
  if (this.node) {
    this.node.unsubscribe();
    this.rootObject.removeChild(this.node);
    this.node = null;
  } else if (this.pathShape && this.rootObject) {
    this.rootObject.removeChild(this.pathShape);
  }
};

Object.setPrototypeOf(ROS2D.PathClient.prototype, EventEmitter.prototype);

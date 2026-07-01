/**
 * @fileOverview
 * Subscribes to a sensor_msgs/LaserScan topic and renders each incoming
 * message through ROS2D.LaserScanShape.
 *
 * Emits the following events:
 *   * 'change' - a new scan has been applied
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the scan topic, defaults to '/scan'
 *   * rootObject (optional) - the root createjs object to attach to
 *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient
 *   * pointSize (optional) - forwarded to ROS2D.LaserScanShape
 *   * pointColor (optional) - forwarded to ROS2D.LaserScanShape
 *   * sampleStep (optional) - forwarded to ROS2D.LaserScanShape
 *   * maxRange (optional) - forwarded to ROS2D.LaserScanShape
 *   * subscribe (optional, default true) - when false, the client does not
 *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
 *       instead. For render-only consumers that own the subscription
 *       elsewhere (tfClient still applies in this mode).
 */
ROS2D.LaserScanClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;

  this.topicName = options.topic || '/scan';
  this.rootObject = options.rootObject || new createjs.Container();
  this.tfClient = options.tfClient || null;
  this.node = null;

  this.scanShape = new ROS2D.LaserScanShape({
    pointSize: options.pointSize,
    pointColor: options.pointColor,
    sampleStep: options.sampleStep,
    maxRange: options.maxRange,
    negateY: !this.tfClient
  });

  if (!this.tfClient) {
    this.rootObject.addChild(this.scanShape);
  }

  // options.subscribe (default true). When false, do NOT create/subscribe the
  // ROSLIB.Topic — the client renders only messages fed via processMessage().
  // Used by render-only consumers that own the subscription elsewhere, avoiding
  // a construct-time subscribe→unsubscribe churn blip on the bridge.
  if (options.subscribe !== false) {
    this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'sensor_msgs/LaserScan', options);
    this.rosTopic.subscribe(function(message) {
      that.processMessage(message);
    });
  } else {
    this.rosTopic = null;
  }
};

/**
 * Render a single sensor_msgs/LaserScan message through the managed
 * LaserScanShape (lazily wrapping it in a SceneNode when a tfClient is set),
 * then emit 'change'. This is the sole render path — the subscribe callback
 * simply forwards to it — so render-only consumers (subscribe:false) can feed
 * messages from their own transport and still get SceneNode TF.
 */
ROS2D.LaserScanClient.prototype.processMessage = function(message) {
  if (!message || !message.ranges || typeof message.angle_min !== 'number' ||
      typeof message.angle_increment !== 'number') {
    return;
  }

  if (this.tfClient) {
    var frame = message.header && message.header.frame_id;
    if (!frame) {
      return;
    }
    if (!this.node) {
      this.node = new ROS2D.SceneNode({
        tfClient: this.tfClient,
        frame_id: frame,
        object: this.scanShape
      });
      this.rootObject.addChild(this.node);
    } else if (this.node.frame_id !== frame) {
      this.node.setFrame(frame);
    }
  }

  this.scanShape.setScan(message);
  this.emit('change');
};

/**
 * Detach from the topic and remove the managed shape (or SceneNode
 * wrapper) from the rootObject.
 */
ROS2D.LaserScanClient.prototype.unsubscribe = function() {
  if (this.rosTopic) {
    this.rosTopic.unsubscribe();
  }
  if (this.node) {
    this.node.unsubscribe();
    this.rootObject.removeChild(this.node);
    this.node = null;
  } else if (this.scanShape && this.rootObject) {
    this.rootObject.removeChild(this.scanShape);
  }
};

Object.setPrototypeOf(ROS2D.LaserScanClient.prototype, EventEmitter.prototype);

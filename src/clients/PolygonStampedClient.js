/**
 * @fileOverview
 * Subscribes to a geometry_msgs/PolygonStamped topic and renders each
 * incoming message through ROS2D.PolygonShape.
 *
 * Typical use is rviz-style footprint visualization. nav2 publishes
 * the active robot footprint on `/local_costmap/published_footprint`
 * and `/global_costmap/published_footprint`, both as PolygonStamped
 * with header.frame_id = 'base_link' (or the robot's body frame).
 * Pair this client with a tfClient so the polygon follows the robot
 * across the map.
 *
 * Emits the following events:
 *   * 'change' - a new polygon has been applied
 *
 * @constructor
 * @param options - object with the following keys:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the polygon topic, defaults to
 *       '/local_costmap/published_footprint'
 *   * rootObject (optional) - the root createjs object to attach to
 *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient.
 *       When supplied the polygon is wrapped in a ROS2D.SceneNode
 *       keyed on the message's header.frame_id, so a footprint
 *       published in 'base_link' is drawn at the robot's current
 *       pose on the map.
 *   * strokeSize (optional) - forwarded to ROS2D.PolygonShape
 *   * strokeColor (optional) - forwarded to ROS2D.PolygonShape
 *   * fillColor (optional) - forwarded to ROS2D.PolygonShape
 *   * closed (optional) - forwarded to ROS2D.PolygonShape (default
 *       true; nav2 footprints are always closed)
 */
ROS2D.PolygonStampedClient = function(options) {
  EventEmitter.call(this);
  options = options || {};
  var that = this;
  var ros = options.ros;

  this.topicName = options.topic || '/local_costmap/published_footprint';
  this.rootObject = options.rootObject || new createjs.Container();
  this.tfClient = options.tfClient || null;
  this.node = null;

  this.polygonShape = new ROS2D.PolygonShape({
    strokeSize: options.strokeSize,
    strokeColor: options.strokeColor,
    fillColor: options.fillColor,
    closed: options.closed,
    // SceneNode applies the TF transform that already accounts for
    // the canvas Y-down convention, so the shape itself must not
    // double-negate. Without tfClient the shape draws straight into
    // the rootObject and has to flip Y itself.
    negateY: !this.tfClient
  });

  if (!this.tfClient) {
    this.rootObject.addChild(this.polygonShape);
  }

  this.rosTopic = ROS2D._makeTopic(ros, this.topicName, 'geometry_msgs/PolygonStamped', options);

  this.rosTopic.subscribe(function(message) {
    var polygon = message && message.polygon;
    var points = polygon && polygon.points;
    if (!points) {
      return;
    }

    if (that.tfClient) {
      var frame = message.header && message.header.frame_id;
      if (!frame) {
        return;
      }
      if (!that.node) {
        that.node = new ROS2D.SceneNode({
          tfClient: that.tfClient,
          frame_id: frame,
          object: that.polygonShape
        });
        that.rootObject.addChild(that.node);
      } else if (that.node.frame_id !== frame) {
        that.node.setFrame(frame);
      }
    }

    that.polygonShape.setPolygon(points);
    that.emit('change');
  });
};

/**
 * Detach from the topic and remove the managed shape (or SceneNode
 * wrapper) from the rootObject.
 */
ROS2D.PolygonStampedClient.prototype.unsubscribe = function() {
  if (this.rosTopic) {
    this.rosTopic.unsubscribe();
  }
  if (this.node) {
    this.node.unsubscribe();
    this.rootObject.removeChild(this.node);
    this.node = null;
  } else if (this.polygonShape && this.rootObject) {
    this.rootObject.removeChild(this.polygonShape);
  }
};

Object.setPrototypeOf(ROS2D.PolygonStampedClient.prototype, EventEmitter.prototype);

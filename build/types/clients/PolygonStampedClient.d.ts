export class PolygonStampedClient extends EventEmitter<string | symbol, any> {
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
    constructor(options: any);
    topicName: any;
    rootObject: any;
    tfClient: any;
    node: any;
    polygonShape: PolygonShape;
    rosTopic: import("roslib").Topic<unknown>;
    /**
     * Detach from the topic and remove the managed shape (or SceneNode
     * wrapper) from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { PolygonShape } from '../models/PolygonShape';

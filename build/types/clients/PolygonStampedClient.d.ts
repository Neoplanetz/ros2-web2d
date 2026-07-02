export class PolygonStampedClient extends EventEmitter<string | symbol, any> {
    /**
     * @fileOverview
     * Subscribes to a geometry_msgs/PolygonStamped topic and renders each
     * incoming message through ROS2D.PolygonShape.
     *
     * Typical use is rviz-style footprint visualization. nav2 publishes
     * the active robot footprint on `/local_costmap/published_footprint`
     * and `/global_costmap/published_footprint` as PolygonStamped. Those
     * published footprints are already oriented in the message's
     * `header.frame_id` (commonly the costmap global frame, such as
     * `odom` or `map`). Provide a tfClient only when the viewer needs to
     * transform that frame into its own fixed frame.
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
     *       keyed on the message's header.frame_id. Omit it when the
     *       message already arrives in the same frame as the viewer.
     *   * strokeSize (optional) - forwarded to ROS2D.PolygonShape
     *   * strokeColor (optional) - forwarded to ROS2D.PolygonShape
     *   * fillColor (optional) - forwarded to ROS2D.PolygonShape
     *   * closed (optional) - forwarded to ROS2D.PolygonShape (default
     *       true; nav2 footprints are always closed)
     *   * subscribe (optional, default true) - when false, the client does not
     *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
     *       instead. For render-only consumers that own the subscription
     *       elsewhere (tfClient still applies in this mode).
     */
    constructor(options: any);
    topicName: any;
    rootObject: any;
    tfClient: any;
    node: SceneNode;
    polygonShape: PolygonShape;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single geometry_msgs/PolygonStamped message through the managed
     * PolygonShape (lazily wrapping it in a SceneNode when a tfClient is set), then
     * emit 'change'. This is the sole render path — the subscribe callback simply
     * forwards to it — so render-only consumers (subscribe:false) can feed messages
     * from their own transport and still get SceneNode TF.
     */
    processMessage(message: any): void;
    /**
     * Detach from the topic and remove the managed shape (or SceneNode
     * wrapper) from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { SceneNode } from '../visualization/SceneNode';
import { PolygonShape } from '../models/PolygonShape';

export class OdometryClient extends EventEmitter<string | symbol, any> {
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
     */
    constructor(options: any);
    topicName: any;
    rootObject: any;
    marker: any;
    tfClient: any;
    node: SceneNode;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single nav_msgs/Odometry message: position the managed marker
     * (Y negated, orientation via quaternionToGlobalTheta) or drive the SceneNode
     * when a tfClient is set, then emit 'change'. This is the sole render path —
     * the subscribe callback simply forwards to it — so render-only consumers
     * (subscribe:false) can feed messages from their own transport and still get
     * the canonical mapping and SceneNode TF.
     */
    processMessage(message: any): void;
    /**
     * Detach from the topic and remove the managed marker from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { SceneNode } from '../visualization/SceneNode';

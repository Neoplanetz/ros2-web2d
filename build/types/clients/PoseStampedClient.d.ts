export class PoseStampedClient extends EventEmitter<string | symbol, any> {
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
     *   * applyOrientation (optional, default true) - when false, the client
     *       positions the marker but never applies the message yaw: the shape
     *       keeps whatever rotation its owner set (e.g. a fixed upright goal
     *       flag). On the TF path the SceneNode is driven with an identity
     *       orientation for the same reason (frame transforms still apply).
     */
    constructor(options: any);
    topicName: any;
    rootObject: any;
    marker: any;
    arrow: any;
    tfClient: any;
    node: SceneNode;
    applyOrientation: boolean;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single geometry_msgs/PoseStamped message: position the managed
     * marker (Y negated, orientation via quaternionToGlobalTheta), or drive the
     * SceneNode when a tfClient is set, then emit 'change'. This is the sole
     * render path — the subscribe callback simply forwards to it — so render-only
     * consumers (subscribe:false) can feed messages from their own transport and
     * still get the canonical mapping and SceneNode TF.
     */
    processMessage(message: any): void;
    /**
     * Detach from the topic and remove the managed marker from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { SceneNode } from '../visualization/SceneNode';

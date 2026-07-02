export class PathClient extends EventEmitter<string | symbol, any> {
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
    constructor(options: any);
    topicName: any;
    rootObject: any;
    tfClient: any;
    pathShape: PathShape;
    node: SceneNode;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single nav_msgs/Path message through the managed PathShape (lazily
     * wrapping it in a SceneNode when a tfClient is set), then emit 'change'. This
     * is the sole render path — the subscribe callback simply forwards to it — so
     * render-only consumers (subscribe:false) can feed messages from their own
     * transport and still get SceneNode TF.
     */
    processMessage(message: any): void;
    /**
     * Detach from the topic and remove the managed PathShape (or SceneNode
     * wrapper) from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { PathShape } from '../models/PathShape';
import { SceneNode } from '../visualization/SceneNode';

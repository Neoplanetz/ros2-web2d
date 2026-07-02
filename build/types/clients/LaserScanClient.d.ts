export class LaserScanClient extends EventEmitter<string | symbol, any> {
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
    constructor(options: any);
    topicName: any;
    rootObject: any;
    tfClient: any;
    node: SceneNode;
    scanShape: LaserScanShape;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single sensor_msgs/LaserScan message through the managed
     * LaserScanShape (lazily wrapping it in a SceneNode when a tfClient is set),
     * then emit 'change'. This is the sole render path — the subscribe callback
     * simply forwards to it — so render-only consumers (subscribe:false) can feed
     * messages from their own transport and still get SceneNode TF.
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
import { LaserScanShape } from '../models/LaserScanShape';

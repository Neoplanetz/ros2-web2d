export class PoseArrayClient extends EventEmitter<string | symbol, any> {
    /**
     * @fileOverview
     * Subscribes to a geometry_msgs/PoseArray topic and renders every pose
     * as a NavigationArrow inside a managed container. Intended for things
     * like AMCL particle clouds or trajectory fan-outs.
     *
     * Each incoming message replaces the previous set of arrows: the inner
     * container is cleared and rebuilt so there is no cross-message state
     * to reason about.
     *
     * Emits the following events:
     *   * 'change' - a new PoseArray has been applied
     *
     * @constructor
     * @param options - object with the following keys:
     *   * ros - the ROSLIB.Ros connection handle
     *   * topic (optional) - the pose array topic, defaults to '/particlecloud'
     *   * rootObject (optional) - the root createjs object to attach to
     *   * size (optional) - forwarded to ROS2D.NavigationArrow (per-pose arrow)
     *   * strokeSize (optional) - forwarded to ROS2D.NavigationArrow
     *   * strokeColor (optional) - forwarded to ROS2D.NavigationArrow
     *   * fillColor (optional) - forwarded to ROS2D.NavigationArrow
     *   * subscribe (optional, default true) - when false, the client does not
     *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
     *       instead. For render-only consumers that own the subscription
     *       elsewhere (tfClient still applies in this mode).
     */
    constructor(options: any);
    topicName: any;
    rootObject: any;
    _arrowOptions: {
        size: any;
        strokeSize: any;
        strokeColor: any;
        fillColor: any;
    };
    tfClient: any;
    node: SceneNode;
    container: createjs.Container;
    rosTopic: {
        name: any;
        messageType: any;
        subscribe: (cb: any) => void;
        unsubscribe: () => void;
    } | import("roslib").Topic<unknown>;
    /**
     * Render a single geometry_msgs/PoseArray message: rebuild the arrow set
     * (lazily wrapping the managed container in a SceneNode when a tfClient is
     * set), then emit 'change'. This is the sole render path — the subscribe
     * callback simply forwards to it — so render-only consumers (subscribe:false)
     * can feed messages from their own transport and still get SceneNode TF.
     */
    processMessage(message: any): void;
    /**
     * @private
     * Rebuild the arrow set from a PoseArray message.
     */
    private _render;
    /**
     * @private
     * Drop every child arrow from the managed container.
     */
    private _clearContainer;
    /**
     * Detach from the topic and drop the managed container from the rootObject.
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { SceneNode } from '../visualization/SceneNode';
import * as createjs from 'createjs-module';

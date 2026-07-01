/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */
export class OccupancyGridClient extends EventEmitter<string | symbol, any> {
    /**
     * A map that listens to a given occupancy grid topic.
     *
     * When a tfClient is supplied the grid is wrapped in a ROS2D.SceneNode
     * keyed on the message's header.frame_id. This lets multi-robot
     * deployments publish maps in per-robot frames (e.g. /robot_0/map) and
     * have them overlay correctly via TF. Without tfClient, the grid is
     * attached directly to rootObject as in v1.
     *
     * Emits the following events:
     *   * 'change' - there was an update or change in the map
     *
     * @constructor
     * @param options - object with following keys:
     *   * ros - the ROSLIB.Ros connection handle
     *   * topic (optional) - the map topic to listen to
     *   * rootObject (optional) - the root object to add this marker to
     *   * continuous (optional) - if the map should be continuously loaded (e.g., for SLAM)
     *   * tfClient (optional) - ROSLIB.TFClient or ROSLIB.ROS2TFClient
     *   * colorizer (optional) - forwarded to ROS2D.OccupancyGrid; set to
     *       'costmap' (or a custom function) to render nav2 costmap topics
     *       such as /local_costmap/costmap with an inflation gradient
     *       instead of grayscale.
     *   * subscribe (optional, default true) - when false, the client does not
     *       create or subscribe a ROSLIB.Topic; feed it via processMessage()
     *       instead. For render-only consumers that own the subscription
     *       elsewhere (tfClient + colorizer still apply in this mode).
     */
    constructor(options: any);
    continuous: any;
    rootObject: any;
    tfClient: any;
    colorizer: any;
    node: SceneNode;
    lastMessage: any;
    disposed: boolean;
    currentGrid: createjs.Shape;
    rosTopic: import("roslib").Topic<unknown>;
    /**
     * Render a single nav_msgs/OccupancyGrid message: build + swap the grid Shape
     * (under the TF SceneNode when a tfClient is set) and emit 'change' so
     * consumers can re-fit. In the default (non-continuous) subscribe mode the
     * topic auto-unsubscribes after the first message; that teardown is guarded on
     * rosTopic so render-only consumers (subscribe:false) — which have no topic and
     * feed messages via their own transport — do not dereference null. This is the
     * sole render path; the subscribe callback simply forwards to it.
     */
    processMessage(message: any): void;
    /**
     * Build a grid Shape from a message + the current colorizer and swap it into
     * the scene (under the TF SceneNode when a tfClient is set, otherwise directly
     * under rootObject), preserving child order. Caches the message on
     * `this.lastMessage` so setColorizer() can re-render later without a new
     * subscription. Does NOT emit 'change' itself — the caller decides whether a
     * re-fit is warranted (the subscribe path emits; setColorizer does not).
     * @private
     */
    private _renderGrid;
    /**
     * Re-render the current map with a new colorizer WITHOUT re-subscribing to the
     * topic. Intended for theme switches: the cached last message is re-colorized
     * and the grid Shape swapped in place; the ROS topic subscription is left
     * untouched, so it cannot trigger subscribe/unsubscribe churn on the bridge.
     * Does NOT emit 'change' — a recolor keeps the same map dimensions, so the
     * view is preserved (no re-fit); the Viewer's createjs Ticker repaints the
     * swapped grid on the next frame. If no message has arrived yet the colorizer
     * is stored and applied to the next one. After the client has been torn down
     * via unsubscribe() this is a no-op (it will not resurrect a detached grid /
     * TF SceneNode).
     * @param colorizer - 'map' | 'costmap' | function(value) -> [r, g, b, a]
     */
    setColorizer(colorizer: any): void;
    /**
     * Detach from the map topic and drop any SceneNode wrap. Terminal: marks the
     * client disposed so a later setColorizer() cannot re-render / resurrect the
     * grid. (The internal non-continuous auto-unsubscribe calls rosTopic.unsubscribe
     * directly, NOT this method, so recolor-after-first-message still works.)
     */
    unsubscribe(): void;
}
import EventEmitter from 'eventemitter3';
import { SceneNode } from '../visualization/SceneNode';
import * as createjs from 'createjs-module';

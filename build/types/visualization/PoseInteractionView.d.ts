/**
 * @fileOverview
 * Click-and-drag interaction for picking a 2D pose on the map (the
 * web equivalent of rviz2's "2D Goal Pose" tool). On stagemousedown
 * the click position becomes the (x, y) anchor; on drag the user
 * traces out the desired heading; on release the resulting
 * `{ x, y, yaw }` triple is delivered to `onCommit`.
 *
 * The view owns its own NavigationArrow preview: it is added to the
 * Viewer's scene on first drag past the threshold, hidden on releases
 * shorter than the threshold, and removed on destroy(). Y-axis
 * negation and rotation sign conversions to match the library
 * convention happen here so callers get clean ROS world frame
 * coordinates and a yaw in radians (CCW from +X).
 *
 * Lifecycle:
 *   * construct → enabled by default unless `enabled: false`
 *   * enable() / disable() → toggle event listeners; the preview is
 *       hidden when disabled but the instance can be re-enabled
 *   * destroy() → remove preview from the scene and stop listening
 *       permanently
 */
export class PoseInteractionView {
    /**
     * @constructor
     * @param options - object with following keys:
     *   * viewer - the ROS2D.Viewer to attach to (required)
     *   * arrowSize (optional) - preview arrow length in ROS meters (default 1.5)
     *   * arrowFillColor (optional) - createjs color for the fill (default '#ef4444')
     *   * arrowStrokeColor (optional) - createjs color for the outline (default '#7f1d1d')
     *   * arrowStrokeSize (optional) - outline width in ROS meters (default 0.05)
     *   * arrowAlpha (optional) - alpha applied to the preview (default 0.95)
     *   * dragThresholdPx (optional) - releases under this many pixels of drag
     *       commit `yaw === undefined` (default 10)
     *   * enabled (optional) - if false, listeners are not attached on
     *       construction; call enable() later (default true)
     *   * onCommit (optional) - function({ x, y, yaw }) called on every
     *       release. `yaw` is in radians (CCW from +X); `undefined` when
     *       the drag distance was below `dragThresholdPx` (i.e. a tap).
     */
    constructor(options: any);
    viewer: any;
    arrowSize: any;
    arrowFillColor: any;
    arrowStrokeColor: any;
    arrowStrokeSize: any;
    arrowAlpha: any;
    dragThresholdPx: any;
    onCommit: any;
    _enabled: boolean;
    _destroyed: boolean;
    _dragStart: any;
    _arrow: NavigationArrow;
    _handlers: {
        down: (event: any) => void;
        move: (event: any) => void;
        up: (event: any) => void;
    };
    /**
     * Lazily create and attach the preview arrow to the scene. Stays
     * hidden until the first drag-past-threshold; once created it is
     * re-used for subsequent drags so we avoid rebuilding the Graphics
     * each time the user starts a new pose.
     */
    _ensureArrow(): NavigationArrow;
    _removeArrow(): void;
    /**
     * Attach the stage event listeners. Idempotent and a no-op once the
     * instance has been destroyed.
     */
    enable(): void;
    /**
     * Detach the stage event listeners and abort any in-progress drag.
     * The preview is hidden but kept around so a subsequent enable()
     * does not have to rebuild it. Idempotent.
     */
    disable(): void;
    /**
     * Permanently tear down: detach listeners, remove the preview from
     * the scene. Subsequent enable()/disable()/destroy() calls are
     * no-ops.
     */
    destroy(): void;
}
import { NavigationArrow } from '../models/NavigationArrow';

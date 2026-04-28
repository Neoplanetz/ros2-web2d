/**
 * @fileOverview
 * Draws a closed (or open) polyline from a list of {x, y} vertices.
 * Used by ROS2D.PolygonStampedClient to render footprints, obstacle
 * regions, and similar 2D outlines from geometry_msgs/Polygon.
 *
 * The shape is read-only — for an editable polygon (drag vertices,
 * insert points) use ROS2D.PolygonMarker instead.
 */
export class PolygonShape extends createjs.Shape {
    /**
     * @constructor
     * @param options - object with following keys:
     *   * strokeSize (optional) - outline width in meters (default 0.03)
     *   * strokeColor (optional) - createjs color for the outline
     *       (default red)
     *   * fillColor (optional) - createjs color for the fill, or null /
     *       undefined for no fill (default null)
     *   * closed (optional) - draw the closing segment back to the first
     *       vertex (default true). Set false to render a polyline.
     *   * negateY (optional) - negate Y when drawing directly in canvas
     *       coordinates (default true). Set false when the shape is
     *       wrapped in a ROS2D.SceneNode that already applies the TF Y
     *       handling.
     */
    constructor(options: any);
    strokeSize: any;
    strokeColor: any;
    fillColor: any;
    closed: boolean;
    negateY: boolean;
    /**
     * Redraw the polygon from the given vertex list.
     *
     * @param points - array of objects with numeric x and y fields. A z
     *   field is ignored (this is a 2D shape). Empty or missing input
     *   clears the graphics.
     */
    setPolygon(points: any): void;
    /**
     * @private
     * @param point - candidate {x, y} vertex
     * @returns {boolean} true when both coordinates are finite numbers
     */
    private _isValidPoint;
}
import * as createjs from 'createjs-module';

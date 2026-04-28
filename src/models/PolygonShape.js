/**
 * @fileOverview
 * Draws a closed (or open) polyline from a list of {x, y} vertices.
 * Used by ROS2D.PolygonStampedClient to render footprints, obstacle
 * regions, and similar 2D outlines from geometry_msgs/Polygon.
 *
 * The shape is read-only — for an editable polygon (drag vertices,
 * insert points) use ROS2D.PolygonMarker instead.
 */

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
ROS2D.PolygonShape = function(options) {
  // Parent init first; transpiled ES6 class requires super() before `this`.
  createjs.Shape.call(this);
  options = options || {};
  this.strokeSize = (typeof options.strokeSize === 'number') ? options.strokeSize : 0.03;
  this.strokeColor = options.strokeColor || createjs.Graphics.getRGB(255, 0, 0);
  this.fillColor = (options.fillColor === undefined) ? null : options.fillColor;
  this.closed = options.closed !== false;
  this.negateY = options.negateY !== false;

  this.graphics = new createjs.Graphics();
};

/**
 * Redraw the polygon from the given vertex list.
 *
 * @param points - array of objects with numeric x and y fields. A z
 *   field is ignored (this is a 2D shape). Empty or missing input
 *   clears the graphics.
 */
ROS2D.PolygonShape.prototype.setPolygon = function(points) {
  this.graphics.clear();

  if (!points || points.length < 2) {
    return;
  }

  var first = points[0];
  if (!this._isValidPoint(first)) {
    return;
  }

  if (this.fillColor) {
    this.graphics.beginFill(this.fillColor);
  }
  if (this.strokeSize > 0) {
    this.graphics.setStrokeStyle(this.strokeSize);
    this.graphics.beginStroke(this.strokeColor);
  }

  this.graphics.moveTo(first.x, this.negateY ? -first.y : first.y);
  for (var i = 1; i < points.length; i++) {
    var p = points[i];
    if (!this._isValidPoint(p)) {
      continue;
    }
    this.graphics.lineTo(p.x, this.negateY ? -p.y : p.y);
  }
  if (this.closed) {
    this.graphics.closePath();
  }

  if (this.strokeSize > 0) {
    this.graphics.endStroke();
  }
  if (this.fillColor) {
    this.graphics.endFill();
  }
};

/**
 * @private
 * @param point - candidate {x, y} vertex
 * @returns {boolean} true when both coordinates are finite numbers
 */
ROS2D.PolygonShape.prototype._isValidPoint = function(point) {
  return point &&
    typeof point.x === 'number' && isFinite(point.x) &&
    typeof point.y === 'number' && isFinite(point.y);
};

ROS2D.PolygonShape.prototype.__proto__ = createjs.Shape.prototype;

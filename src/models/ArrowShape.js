/**
 * @fileOverview
 * @author Bart van Vliet - bart@dobots.nl
 */

/**
 * An arrow with line and triangular head, based on the navigation arrow.
 * Aims to the left at 0 rotation, as would be expected.
 *
 * Two rendering modes:
 *  - **Legacy** (only `size` provided): a stroked line shaft plus a
 *    filled triangular head. Preserved for backward compatibility.
 *  - **Extended** (any of `shaftLength`, `shaftWidth`, `headLength`,
 *    `headWidth` provided): a single filled 7-vertex polygon with an
 *    explicit shaft thickness. Matches the RViz arrow appearance and
 *    the visualization_msgs/Marker scale.x / scale.y / scale.z
 *    convention (shaft length / shaft diameter / head length).
 *
 * @constructor
 * @param {Object} options
 * @param {Number} [options.size=10] - Total length; only used in legacy
 *     mode (and as a fallback when only some extended dims are given).
 * @param {Number} [options.shaftLength] - m, shaft length along arrow.
 * @param {Number} [options.shaftWidth] - m, shaft thickness perpendicular
 *     to length. Triggers extended mode when set.
 * @param {Number} [options.headLength] - m, head triangle length along
 *     arrow. Triggers extended mode when set.
 * @param {Number} [options.headWidth] - m, head triangle base width.
 *     Triggers extended mode when set; defaults to `shaftWidth * 2`.
 * @param {Number} [options.strokeSize=3] - Outline thickness; pass 0 to
 *     opt out of stroke entirely (fill-only arrow).
 * @param {String} [options.strokeColor] - The createjs color for the stroke
 * @param {String} [options.fillColor] - The createjs color for the fill
 * @param {Bool} [options.pulse] - If the marker should "pulse" over time
 */
ROS2D.ArrowShape = function(options) {
	// Parent init first; transpiled ES6 class requires super() before `this`.
	createjs.Shape.call(this);
	var that = this;
	options = options || {};
	var size = options.size || 10;
	// Explicit undefined check so callers can opt out of stroke entirely
	// with strokeSize: 0. The earlier `|| 3` fallback overrode the
	// caller's 0, which (under the parent scene's px-per-meter scale)
	// rendered as a giant outline that swallowed the filled head — the
	// classic symptom from Marker case 0 ARROW (which always passes
	// strokeSize: 0 to get a fill-only arrow).
	var strokeSize = (options.strokeSize !== undefined) ? options.strokeSize : 3;
	var strokeColor = options.strokeColor || createjs.Graphics.getRGB(0, 0, 0);
	var fillColor = options.fillColor || createjs.Graphics.getRGB(255, 0, 0);
	var pulse = options.pulse;

	var hasExplicitDims =
		options.shaftLength !== undefined ||
		options.shaftWidth !== undefined ||
		options.headLength !== undefined ||
		options.headWidth !== undefined;

	var graphics = new createjs.Graphics();

	if (hasExplicitDims) {
		// Extended mode — filled 7-vertex polygon with explicit shaft
		// thickness. Vertices traced counter-clockwise from the
		// bottom-left of the shaft so the standard fill rule closes
		// the outline cleanly.
		var extShaftLength = (typeof options.shaftLength === 'number') ? options.shaftLength : (size * 2 / 3);
		var extShaftWidth  = (typeof options.shaftWidth  === 'number') ? options.shaftWidth  : (size * 0.08);
		var extHeadLength  = (typeof options.headLength  === 'number') ? options.headLength  : (size / 3);
		var extHeadWidth   = (typeof options.headWidth   === 'number') ? options.headWidth   : (extShaftWidth * 2);

		if (strokeSize > 0) {
			graphics.setStrokeStyle(strokeSize);
			graphics.beginStroke(strokeColor);
		}
		graphics.beginFill(fillColor);
		graphics.moveTo(0, -extShaftWidth / 2);
		graphics.lineTo(extShaftLength, -extShaftWidth / 2);
		graphics.lineTo(extShaftLength, -extHeadWidth / 2);
		graphics.lineTo(extShaftLength + extHeadLength, 0);
		graphics.lineTo(extShaftLength, extHeadWidth / 2);
		graphics.lineTo(extShaftLength, extShaftWidth / 2);
		graphics.lineTo(0, extShaftWidth / 2);
		graphics.closePath();
		graphics.endFill();
		if (strokeSize > 0) {
			graphics.endStroke();
		}
	} else {
		// Legacy mode — line shaft + filled head triangle. Preserved so
		// that callers using only the `size` option get byte-for-byte
		// identical rendering with v1.6.x.
		var headLen = size / 3.0;
		var headWidth = headLen * 2.0 / 3.0;

		if (strokeSize > 0) {
			graphics.setStrokeStyle(strokeSize);
			graphics.beginStroke(strokeColor);
			graphics.moveTo(0, 0);
			graphics.lineTo(size-headLen, 0);
		}

		graphics.beginFill(fillColor);
		graphics.moveTo(size, 0);
		graphics.lineTo(size-headLen, headWidth / 2.0);
		graphics.lineTo(size-headLen, -headWidth / 2.0);
		graphics.closePath();
		graphics.endFill();
		if (strokeSize > 0) {
			graphics.endStroke();
		}
	}

	// create the shape (parent ctor already invoked at top)
	this.graphics = graphics;

	// check if we are pulsing
	if (pulse) {
		// have the model "pulse"
		var growCount = 0;
		var growing = true;
		createjs.Ticker.addEventListener('tick', function() {
			if (growing) {
				that.scaleX *= 1.035;
				that.scaleY *= 1.035;
				growing = (++growCount < 10);
			} else {
				that.scaleX /= 1.035;
				that.scaleY /= 1.035;
				growing = (--growCount < 0);
			}
		});
	}
};
ROS2D.ArrowShape.prototype.__proto__ = createjs.Shape.prototype;

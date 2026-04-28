/**
 * @fileOverview
 * @author Bart van Vliet - bart@dobots.nl
 */

/**
 * An arrow with line and triangular head, based on the navigation arrow.
 * Aims to the left at 0 rotation, as would be expected.
 *
 * @constructor
 * @param {Object} options
 * @param {Int} [options.size] - The size of the marker
 * @param {Int} [options.strokeSize] - The size of the outline
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

	// draw the arrow
	var graphics = new createjs.Graphics();

	var headLen = size / 3.0;
	var headWidth = headLen * 2.0 / 3.0;

	// When strokeSize is 0, skip the stroke commands entirely so the
	// shaft line disappears (no zero-width hairline) and only the filled
	// head triangle remains — matches RViz "no stroke" rendering and
	// matches the NavigationArrow pattern.
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

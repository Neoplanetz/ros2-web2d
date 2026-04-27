/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * An OccupancyGrid converts a nav_msgs/OccupancyGrid message into a
 * createjs Bitmap. A colorizer maps each cell value (-1 for unknown,
 * 0..100 for cost) to an [r, g, b, a] tuple; built-in presets cover
 * the classic grayscale map rendering and a costmap gradient that
 * encodes inflation cost as color and cell alpha so a costmap overlays
 * naturally on top of a base /map.
 *
 * Costmap preset palette:
 *   * value 0 (free)     -> fully transparent (overlays show base map)
 *   * value -1 (unknown) -> faint gray (preserves debug signal so a
 *                            misbehaving publisher does not silently
 *                            paint a blank canvas)
 *   * value 1..99        -> continuous blue -> cyan -> yellow -> red
 *                            gradient with alpha growing from 80..160
 *   * value 100 (lethal) -> pure red at alpha 180 (stands above the
 *                            inflation gradient so lethal cells pop)
 *
 * @constructor
 * @param options - object with following keys:
 *   * message - the nav_msgs/OccupancyGrid message
 *   * colorizer (optional) - preset name ('map' default, 'costmap') or
 *       a function (value) => [r, g, b, a] (each 0..255). Custom
 *       functions receive the raw data value (-1 or 0..100) and
 *       return the pixel color to render. Validated once before the
 *       render loop; throws if the function returns something other
 *       than an array of four finite numbers.
 */
ROS2D.OccupancyGrid = function(options) {
  options = options || {};
  var message = options.message;

  var colorizerOption = options.colorizer;

  function writeMapPixel(image, index, value) {
    var channel = 127;
    if (value === 100) {
      channel = 0;
    } else if (value === 0) {
      channel = 255;
    }
    image[index] = channel;
    image[index + 1] = channel;
    image[index + 2] = channel;
    image[index + 3] = 255;
  }

  function writeCostmapPixel(image, index, value) {
    if (value === 0) {
      image[index] = 0;
      image[index + 1] = 0;
      image[index + 2] = 0;
      image[index + 3] = 0;
      return;
    }
    if (value < 0) {
      // Unknown (-1) and any out-of-spec negative: faint gray so the
      // cell is visible during debugging without dominating the view.
      image[index] = 127;
      image[index + 1] = 127;
      image[index + 2] = 127;
      image[index + 3] = 50;
      return;
    }
    if (value >= 100) {
      image[index] = 255;
      image[index + 1] = 0;
      image[index + 2] = 0;
      image[index + 3] = 180;
      return;
    }

    // 3-zone rainbow gradient over value 1..99 so that high-cost cells
    // (e.g. nav2 INSCRIBED_INFLATED_OBSTACLE = 99) approach the lethal
    // red continuously instead of jumping through unrelated hues.
    var t = value / 99;
    var red = 0;
    var green = 0;
    var blue = 0;
    if (t < 1 / 3) {
      // blue -> cyan
      green = Math.round(255 * t * 3);
      blue = 255;
    } else if (t < 2 / 3) {
      // cyan -> yellow
      var tMid = (t - 1 / 3) * 3;
      red = Math.round(255 * tMid);
      green = 255;
      blue = Math.round(255 * (1 - tMid));
    } else {
      // yellow -> red
      var tHi = (t - 2 / 3) * 3;
      red = 255;
      green = Math.round(255 * (1 - tHi));
    }

    image[index] = red;
    image[index + 1] = green;
    image[index + 2] = blue;
    // Cap gradient alpha at 160 so the lethal alpha (180) is visibly
    // higher and lethal cells do not blur into the inflation band.
    image[index + 3] = Math.round(80 + t * 80);
  }

  // Pick the per-pixel writer once: built-in presets write into the
  // ImageData buffer directly (no per-pixel allocation), while a custom
  // colorizer function still returns an [r, g, b, a] array per the
  // public API contract and we copy that into the buffer.
  var writePixel;
  if (typeof colorizerOption === 'function') {
    // Validate the contract once up-front. A typo'd colorizer that
    // returns undefined or the wrong shape would otherwise silently
    // produce a blank canvas; failing fast here saves users hours.
    var probe = colorizerOption(0);
    if (!probe || probe.length !== 4 ||
        typeof probe[0] !== 'number' || !isFinite(probe[0]) ||
        typeof probe[1] !== 'number' || !isFinite(probe[1]) ||
        typeof probe[2] !== 'number' || !isFinite(probe[2]) ||
        typeof probe[3] !== 'number' || !isFinite(probe[3])) {
      throw new Error(
        'ROS2D.OccupancyGrid: custom colorizer must return ' +
        '[r, g, b, a] of four finite numbers (0..255). Got: ' +
        JSON.stringify(probe)
      );
    }
    writePixel = function(image, index, value) {
      var rgba = colorizerOption(value);
      image[index]     = rgba[0];
      image[index + 1] = rgba[1];
      image[index + 2] = rgba[2];
      image[index + 3] = rgba[3];
    };
  } else if (colorizerOption === 'costmap') {
    writePixel = writeCostmapPixel;
  } else {
    writePixel = writeMapPixel;
  }

  // internal drawing canvas
  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d');

  // set the size
  canvas.width = message.info.width;
  canvas.height = message.info.height;

  var imageData = context.createImageData(canvas.width, canvas.height);
  for (var row = 0; row < canvas.height; row++) {
    for (var col = 0; col < canvas.width; col++) {
      var mapI = col + ((canvas.height - row - 1) * canvas.width);
      var data = message.data[mapI];
      var i = (col + (row * canvas.width)) * 4;
      writePixel(imageData.data, i, data);
    }
  }
  context.putImageData(imageData, 0, 0);

  // create the bitmap
  createjs.Bitmap.call(this, canvas);

  this.width = canvas.width;
  this.height = canvas.height;

  // save the metadata we need
  this.pose = {
    position : message.info.origin.position,
    orientation : message.info.origin.orientation
  };

  // change Y direction
  this.y = -this.height * message.info.resolution;

  // scale the image
  this.scaleX = message.info.resolution;
  this.scaleY = message.info.resolution;
  this.width *= this.scaleX;
  this.height *= this.scaleY;

  // set the pose
  this.x += this.pose.position.x;
  this.y -= this.pose.position.y;
};
ROS2D.OccupancyGrid.prototype.__proto__ = createjs.Bitmap.prototype;

/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * An OccupancyGrid converts a nav_msgs/OccupancyGrid message into a
 * createjs Bitmap. A colorizer maps each cell value (-1 for unknown,
 * 0..100 for cost) to an [r, g, b, a] tuple; built-in presets cover
 * the classic grayscale map rendering and an rviz-style costmap
 * gradient that encodes inflation cost as color and cell alpha so a
 * costmap overlays naturally on top of a base /map.
 *
 * @constructor
 * @param options - object with following keys:
 *   * message - the nav_msgs/OccupancyGrid message
 *   * colorizer (optional) - preset name ('map' default, 'costmap') or
 *       a function (value) => [r, g, b, a] (each 0..255). Custom
 *       functions receive the raw data value (-1 or 0..100) and
 *       return the pixel color to render.
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
    if (value < 0 || value === 0) {
      image[index] = 0;
      image[index + 1] = 0;
      image[index + 2] = 0;
      image[index + 3] = 0;
      return;
    }
    if (value >= 100) {
      image[index] = 255;
      image[index + 1] = 0;
      image[index + 2] = 0;
      image[index + 3] = 180;
      return;
    }
    if (value === 99) {
      image[index] = 255;
      image[index + 1] = 128;
      image[index + 2] = 255;
      image[index + 3] = 180;
      return;
    }

    var t = value / 98;
    var red = 0;
    var green = 255;
    var blue = 255;
    if (t < 0.5) {
      green = Math.round(255 * (t * 2));
    } else {
      var tHi = (t - 0.5) * 2;
      red = Math.round(255 * tHi);
      blue = Math.round(255 * (1 - tHi));
    }

    image[index] = red;
    image[index + 1] = green;
    image[index + 2] = blue;
    image[index + 3] = Math.round(80 + t * 100);
  }

  // Pick the per-pixel writer once: built-in presets write into the
  // ImageData buffer directly (no per-pixel allocation), while a custom
  // colorizer function still returns an [r, g, b, a] array per the
  // public API contract and we copy that into the buffer.
  var writePixel;
  if (typeof colorizerOption === 'function') {
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

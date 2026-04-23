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

  // Preset colorizers. Defined inline so the ES5→ES6 class transpiler
  // doesn't try to lift them into the class body as static fields.
  var PRESETS = {
    map: function(value) {
      if (value === 100) { return [0, 0, 0, 255]; }
      if (value === 0) { return [255, 255, 255, 255]; }
      return [127, 127, 127, 255];
    },
    costmap: function(value) {
      if (value < 0 || value === 0) { return [0, 0, 0, 0]; }
      if (value >= 100) { return [255, 0, 0, 180]; }
      if (value === 99) { return [255, 128, 255, 180]; }
      var t = value / 98;
      var r, g, b;
      if (t < 0.5) {
        var tLow = t * 2;
        r = 0;
        g = Math.round(255 * tLow);
        b = 255;
      } else {
        var tHi = (t - 0.5) * 2;
        r = Math.round(255 * tHi);
        g = 255;
        b = Math.round(255 * (1 - tHi));
      }
      var alpha = Math.round(80 + t * 100);
      return [r, g, b, alpha];
    }
  };

  var colorizerOption = options.colorizer;
  var colorizer;
  if (typeof colorizerOption === 'function') {
    colorizer = colorizerOption;
  } else if (typeof colorizerOption === 'string' && PRESETS[colorizerOption]) {
    colorizer = PRESETS[colorizerOption];
  } else {
    colorizer = PRESETS.map;
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
      var rgba = colorizer(data);
      var i = (col + (row * canvas.width)) * 4;
      imageData.data[i]     = rgba[0];
      imageData.data[i + 1] = rgba[1];
      imageData.data[i + 2] = rgba[2];
      imageData.data[i + 3] = rgba[3];
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

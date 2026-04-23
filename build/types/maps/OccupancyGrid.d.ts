/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */
export class OccupancyGrid extends createjs.Bitmap {
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
    constructor(options: any);
    width: number;
    height: number;
    pose: {
        position: any;
        orientation: any;
    };
    scaleX: any;
    scaleY: any;
}
import * as createjs from 'createjs-module';

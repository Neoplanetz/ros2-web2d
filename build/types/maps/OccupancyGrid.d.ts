/**
 * @fileOverview
 * @author Russell Toris - rctoris@wpi.edu
 */
export class OccupancyGrid extends createjs.Bitmap {
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

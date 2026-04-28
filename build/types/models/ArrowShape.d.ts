/**
 * @fileOverview
 * @author Bart van Vliet - bart@dobots.nl
 */
export class ArrowShape extends createjs.Shape {
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
    constructor(options: {
        size?: number;
        shaftLength?: number;
        shaftWidth?: number;
        headLength?: number;
        headWidth?: number;
        strokeSize?: number;
        strokeColor?: string;
        fillColor?: string;
        pulse?: Bool;
    });
}
import * as createjs from 'createjs-module';

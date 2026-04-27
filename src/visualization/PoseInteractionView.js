/**
 * @fileOverview
 * Click-and-drag interaction for picking a 2D pose on the map (the
 * web equivalent of rviz2's "2D Goal Pose" tool). On stagemousedown
 * the click position becomes the (x, y) anchor; on drag the user
 * traces out the desired heading; on release the resulting
 * `{ x, y, yaw }` triple is delivered to `onCommit`.
 *
 * The view owns its own NavigationArrow preview: it is added to the
 * Viewer's scene on first drag past the threshold, hidden on releases
 * shorter than the threshold, and removed on destroy(). Y-axis
 * negation and rotation sign conversions to match the library
 * convention happen here so callers get clean ROS world frame
 * coordinates and a yaw in radians (CCW from +X).
 *
 * Lifecycle:
 *   * construct → enabled by default unless `enabled: false`
 *   * enable() / disable() → toggle event listeners; the preview is
 *       hidden when disabled but the instance can be re-enabled
 *   * destroy() → remove preview from the scene and stop listening
 *       permanently
 */

/**
 * @constructor
 * @param options - object with following keys:
 *   * viewer - the ROS2D.Viewer to attach to (required)
 *   * arrowSize (optional) - preview arrow length in ROS meters (default 1.5)
 *   * arrowFillColor (optional) - createjs color for the fill (default '#ef4444')
 *   * arrowStrokeColor (optional) - createjs color for the outline (default '#7f1d1d')
 *   * arrowStrokeSize (optional) - outline width in ROS meters (default 0.05)
 *   * arrowAlpha (optional) - alpha applied to the preview (default 0.95)
 *   * dragThresholdPx (optional) - releases under this many pixels of drag
 *       commit `yaw === undefined` (default 10)
 *   * enabled (optional) - if false, listeners are not attached on
 *       construction; call enable() later (default true)
 *   * onCommit (optional) - function({ x, y, yaw }) called on every
 *       release. `yaw` is in radians (CCW from +X); `undefined` when
 *       the drag distance was below `dragThresholdPx` (i.e. a tap).
 */
ROS2D.PoseInteractionView = function(options) {
  options = options || {};
  if (!options.viewer) {
    throw new Error('ROS2D.PoseInteractionView: options.viewer is required');
  }
  this.viewer = options.viewer;

  this.arrowSize = (typeof options.arrowSize === 'number') ? options.arrowSize : 1.5;
  this.arrowFillColor = options.arrowFillColor || '#ef4444';
  this.arrowStrokeColor = options.arrowStrokeColor || '#7f1d1d';
  this.arrowStrokeSize = (typeof options.arrowStrokeSize === 'number') ? options.arrowStrokeSize : 0.05;
  this.arrowAlpha = (typeof options.arrowAlpha === 'number') ? options.arrowAlpha : 0.95;
  this.dragThresholdPx = (typeof options.dragThresholdPx === 'number') ? options.dragThresholdPx : 10;
  this.onCommit = (typeof options.onCommit === 'function') ? options.onCommit : null;

  this._enabled = false;
  this._destroyed = false;
  this._dragStart = null;
  this._arrow = null;
  this._handlers = null;

  if (options.enabled !== false) {
    this.enable();
  }
};

/**
 * Lazily create and attach the preview arrow to the scene. Stays
 * hidden until the first drag-past-threshold; once created it is
 * re-used for subsequent drags so we avoid rebuilding the Graphics
 * each time the user starts a new pose.
 */
ROS2D.PoseInteractionView.prototype._ensureArrow = function() {
  if (this._arrow) {
    return this._arrow;
  }
  var arrow = new ROS2D.NavigationArrow({
    size: this.arrowSize,
    strokeSize: this.arrowStrokeSize,
    strokeColor: this.arrowStrokeColor,
    fillColor: this.arrowFillColor,
    pulse: false
  });
  // NavigationArrow centers its 7-point polygon on the local origin so
  // that rotation pivots around the visual center. For a goal-pose
  // pick we want the *tail* anchored at the click point, so shift the
  // registration point left by half-size: the body now extends outward
  // from the click in the drag direction.
  arrow.regX = -this.arrowSize / 2;
  arrow.alpha = this.arrowAlpha;
  arrow.visible = false;
  this.viewer.scene.addChild(arrow);
  this._arrow = arrow;
  return arrow;
};

ROS2D.PoseInteractionView.prototype._removeArrow = function() {
  if (!this._arrow) {
    return;
  }
  this.viewer.scene.removeChild(this._arrow);
  this._arrow = null;
};

/**
 * Attach the stage event listeners. Idempotent and a no-op once the
 * instance has been destroyed.
 */
ROS2D.PoseInteractionView.prototype.enable = function() {
  if (this._destroyed || this._enabled) {
    return;
  }
  this._enabled = true;

  var that = this;
  var scene = this.viewer.scene;

  this._handlers = {
    down: function(event) {
      // Left button only; shift modifier is reserved for pan.
      if (event && event.nativeEvent) {
        var button = event.nativeEvent.button;
        if ((typeof button === 'number' && button !== 0) || event.nativeEvent.shiftKey) {
          return;
        }
      }
      var world = scene.globalToRos(event.stageX, event.stageY);
      that._dragStart = {
        px: { x: event.stageX, y: event.stageY },
        world: { x: world.x, y: world.y },
        pointerID: (event && event.pointerID !== undefined) ? event.pointerID : null
      };
    },
    move: function(event) {
      if (!that._dragStart) {
        return;
      }
      var pointerID = (event && event.pointerID !== undefined) ? event.pointerID : null;
      if (that._dragStart.pointerID !== null && pointerID !== null && pointerID !== that._dragStart.pointerID) {
        return;
      }
      var pdx = event.stageX - that._dragStart.px.x;
      var pdy = event.stageY - that._dragStart.px.y;
      var pixDist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pixDist < that.dragThresholdPx) {
        if (that._arrow && that._arrow.visible) {
          that._arrow.visible = false;
          scene.update();
        }
        return;
      }
      var arrow = that._ensureArrow();
      var curWorld = scene.globalToRos(event.stageX, event.stageY);
      var worldYaw = Math.atan2(
        curWorld.y - that._dragStart.world.y,
        curWorld.x - that._dragStart.world.x
      );
      // Place arrow tail at the world start; library Y-down convention
      // flips the y coordinate, and canvas rotation is clockwise in
      // degrees so the world yaw (CCW radians) gets negated.
      arrow.x = that._dragStart.world.x;
      arrow.y = -that._dragStart.world.y;
      arrow.rotation = (-worldYaw * 180) / Math.PI;
      arrow.visible = true;
      scene.update();
    },
    up: function(event) {
      if (!that._dragStart) {
        return;
      }
      var pointerID = (event && event.pointerID !== undefined) ? event.pointerID : null;
      if (that._dragStart.pointerID !== null && pointerID !== null && pointerID !== that._dragStart.pointerID) {
        return;
      }
      var pdx = event.stageX - that._dragStart.px.x;
      var pdy = event.stageY - that._dragStart.px.y;
      var pixDist = Math.sqrt(pdx * pdx + pdy * pdy);
      var commit = {
        x: that._dragStart.world.x,
        y: that._dragStart.world.y,
        yaw: undefined
      };
      if (pixDist >= that.dragThresholdPx) {
        var curWorld = scene.globalToRos(event.stageX, event.stageY);
        commit.yaw = Math.atan2(
          curWorld.y - that._dragStart.world.y,
          curWorld.x - that._dragStart.world.x
        );
      }
      // Hide the preview before firing onCommit so consumer code that
      // mutates the scene (e.g. dropping a real marker) sees a clean
      // state instead of stale arrow pixels.
      if (that._arrow && that._arrow.visible) {
        that._arrow.visible = false;
        scene.update();
      }
      that._dragStart = null;
      if (that.onCommit) {
        that.onCommit(commit);
      }
    }
  };

  scene.addEventListener('stagemousedown', this._handlers.down);
  scene.addEventListener('stagemousemove', this._handlers.move);
  scene.addEventListener('stagemouseup', this._handlers.up);
};

/**
 * Detach the stage event listeners and abort any in-progress drag.
 * The preview is hidden but kept around so a subsequent enable()
 * does not have to rebuild it. Idempotent.
 */
ROS2D.PoseInteractionView.prototype.disable = function() {
  if (!this._enabled) {
    return;
  }
  this._enabled = false;
  var scene = this.viewer.scene;
  if (this._handlers) {
    scene.removeEventListener('stagemousedown', this._handlers.down);
    scene.removeEventListener('stagemousemove', this._handlers.move);
    scene.removeEventListener('stagemouseup', this._handlers.up);
    this._handlers = null;
  }
  if (this._arrow && this._arrow.visible) {
    this._arrow.visible = false;
    scene.update();
  }
  this._dragStart = null;
};

/**
 * Permanently tear down: detach listeners, remove the preview from
 * the scene. Subsequent enable()/disable()/destroy() calls are
 * no-ops.
 */
ROS2D.PoseInteractionView.prototype.destroy = function() {
  if (this._destroyed) {
    return;
  }
  this.disable();
  this._removeArrow();
  this._destroyed = true;
};

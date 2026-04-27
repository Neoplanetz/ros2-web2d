import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal createjs stage that records mouse handlers and child adds.
// PoseInteractionView never calls update() result, so update() can be a no-op.
function makeFakeScene() {
  const handlers = {
    stagemousedown: [],
    stagemousemove: [],
    stagemouseup: [],
  };
  const children = [];
  return {
    children,
    handlers,
    updates: 0,
    addEventListener(type, fn) { (handlers[type] ?? (handlers[type] = [])).push(fn); },
    removeEventListener(type, fn) {
      const arr = handlers[type] ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    addChild(c) { children.push(c); },
    removeChild(c) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
    },
    update() { this.updates += 1; },
    // Identity world transform so stageX/Y == ROS x/y. Tests then exercise
    // the YAW-sign / Y-flip / arrow placement logic without confusing
    // it with a non-trivial viewport transform.
    globalToRos(x, y) { return { x, y }; },
  };
}

function dispatch(scene, type, payload) {
  for (const fn of scene.handlers[type] ?? []) fn(payload);
}

function evt(stageX, stageY, opts = {}) {
  return {
    stageX,
    stageY,
    nativeEvent: { button: opts.button ?? 0, shiftKey: !!opts.shiftKey },
  };
}

// Stub NavigationArrow before loading the module under test. We don't
// care about the arrow's graphics here — only that the view sets x/y/
// rotation/visible/regX/alpha correctly on each drag tick.
globalThis.createjs = {
  Stage: function FakeStage() {},
  Shape: function FakeShape() {},
  Graphics: { getRGB() { return '#000'; } },
};

globalThis.ROS2D = globalThis.ROS2D ?? {};
globalThis.ROS2D.NavigationArrow = function FakeNavigationArrow(opts) {
  this.opts = opts;
  this.x = 0;
  this.y = 0;
  this.rotation = 0;
  this.regX = 0;
  this.alpha = 1;
  this.visible = true;
};

await import('../../src/visualization/PoseInteractionView.js');
const PoseInteractionView = globalThis.ROS2D.PoseInteractionView;

describe('ROS2D.PoseInteractionView', () => {
  let scene;
  let viewer;
  beforeEach(() => {
    scene = makeFakeScene();
    viewer = { scene };
  });

  it('throws when constructed without a viewer', () => {
    expect(() => new PoseInteractionView({})).toThrow(/viewer/);
  });

  it('attaches stage listeners on construction by default', () => {
    new PoseInteractionView({ viewer });
    expect(scene.handlers.stagemousedown).toHaveLength(1);
    expect(scene.handlers.stagemousemove).toHaveLength(1);
    expect(scene.handlers.stagemouseup).toHaveLength(1);
  });

  it('does not attach listeners when enabled:false', () => {
    new PoseInteractionView({ viewer, enabled: false });
    expect(scene.handlers.stagemousedown).toHaveLength(0);
  });

  it('a tap (no drag) commits with yaw=undefined and no arrow added', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit });
    dispatch(scene, 'stagemousedown', evt(2, 3));
    dispatch(scene, 'stagemouseup', evt(2, 3));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toEqual({ x: 2, y: 3, yaw: undefined });
    // The preview is created lazily on first move; a pure tap never moves.
    expect(scene.children).toHaveLength(0);
  });

  it('a tiny drag below dragThresholdPx still commits with yaw=undefined', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit, dragThresholdPx: 10 });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemousemove', evt(3, 4)); // dist=5, < 10
    dispatch(scene, 'stagemouseup', evt(3, 4));
    expect(onCommit).toHaveBeenCalledWith({ x: 0, y: 0, yaw: undefined });
  });

  it('a drag above dragThresholdPx commits with computed yaw (CCW radians)', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit, dragThresholdPx: 10 });
    // start at world (0,0), drag 20 units along +X → yaw = atan2(0, 20) = 0
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemouseup', evt(20, 0));
    const commit = onCommit.mock.calls[0][0];
    expect(commit.x).toBe(0);
    expect(commit.y).toBe(0);
    expect(commit.yaw).toBeCloseTo(0, 5);
  });

  it('drag along +Y world axis produces yaw = +pi/2', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemouseup', evt(0, 20));
    expect(onCommit.mock.calls[0][0].yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('preview arrow appears with Y-flipped position and CW-degree rotation', () => {
    new PoseInteractionView({ viewer });
    // Start at world (5, 7), drag toward +X by 20 units to clear threshold
    dispatch(scene, 'stagemousedown', evt(5, 7));
    dispatch(scene, 'stagemousemove', evt(25, 7));
    expect(scene.children).toHaveLength(1);
    const arrow = scene.children[0];
    // Arrow positioned at world start, with library Y-down convention
    expect(arrow.x).toBe(5);
    expect(arrow.y).toBe(-7);
    // Drag toward +X world: world yaw = 0, canvas rotation = -0 → 0
    expect(arrow.rotation).toBeCloseTo(0, 5);
    // regX shifted so the tail (not the center) anchors at the click point
    expect(arrow.regX).toBeCloseTo(-1.5 / 2, 5); // default arrowSize=1.5
    expect(arrow.alpha).toBeCloseTo(0.95, 5);
    expect(arrow.visible).toBe(true);
  });

  it('preview rotation negates world yaw to match canvas Y-down', () => {
    new PoseInteractionView({ viewer });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    // Drag to (0, 20): world yaw = +pi/2 → canvas rotation = -90 deg
    dispatch(scene, 'stagemousemove', evt(0, 20));
    const arrow = scene.children[0];
    expect(arrow.rotation).toBeCloseTo(-90, 5);
  });

  it('preview is hidden again when drag falls back below threshold', () => {
    new PoseInteractionView({ viewer, dragThresholdPx: 10 });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemousemove', evt(20, 0)); // visible
    const arrow = scene.children[0];
    expect(arrow.visible).toBe(true);
    dispatch(scene, 'stagemousemove', evt(2, 0)); // below threshold again
    expect(arrow.visible).toBe(false);
  });

  it('shift-click is ignored (reserved for pan)', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit });
    dispatch(scene, 'stagemousedown', evt(0, 0, { shiftKey: true }));
    dispatch(scene, 'stagemouseup', evt(0, 0));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('right-click and middle-click are ignored', () => {
    const onCommit = vi.fn();
    new PoseInteractionView({ viewer, onCommit });
    dispatch(scene, 'stagemousedown', evt(0, 0, { button: 2 }));
    dispatch(scene, 'stagemouseup', evt(0, 0));
    dispatch(scene, 'stagemousedown', evt(0, 0, { button: 1 }));
    dispatch(scene, 'stagemouseup', evt(0, 0));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('disable() detaches listeners and a re-enable() rewires fresh ones', () => {
    const onCommit = vi.fn();
    const view = new PoseInteractionView({ viewer, onCommit });
    view.disable();
    expect(scene.handlers.stagemousedown).toHaveLength(0);
    // Mid-disable mouse traffic is dropped.
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemouseup', evt(0, 0));
    expect(onCommit).not.toHaveBeenCalled();
    view.enable();
    expect(scene.handlers.stagemousedown).toHaveLength(1);
    dispatch(scene, 'stagemousedown', evt(1, 1));
    dispatch(scene, 'stagemouseup', evt(1, 1));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('destroy() removes the preview from the scene and stops listening', () => {
    const view = new PoseInteractionView({ viewer });
    // Force a drag so the preview gets created.
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemousemove', evt(20, 0));
    expect(scene.children).toHaveLength(1);
    view.destroy();
    expect(scene.children).toHaveLength(0);
    expect(scene.handlers.stagemousedown).toHaveLength(0);
    // Re-enable after destroy is a no-op.
    view.enable();
    expect(scene.handlers.stagemousedown).toHaveLength(0);
  });

  it('two instances on the same scene operate independently', () => {
    const a = vi.fn();
    const b = vi.fn();
    new PoseInteractionView({ viewer, onCommit: a });
    new PoseInteractionView({ viewer, onCommit: b });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemouseup', evt(0, 0));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('honors arrowSize / arrowFillColor / arrowStrokeColor / arrowAlpha overrides', () => {
    new PoseInteractionView({
      viewer,
      arrowSize: 2.5,
      arrowFillColor: '#00ff00',
      arrowStrokeColor: '#003300',
      arrowStrokeSize: 0.1,
      arrowAlpha: 0.5,
    });
    dispatch(scene, 'stagemousedown', evt(0, 0));
    dispatch(scene, 'stagemousemove', evt(20, 0));
    const arrow = scene.children[0];
    expect(arrow.opts.size).toBe(2.5);
    expect(arrow.opts.fillColor).toBe('#00ff00');
    expect(arrow.opts.strokeColor).toBe('#003300');
    expect(arrow.opts.strokeSize).toBe(0.1);
    expect(arrow.alpha).toBeCloseTo(0.5, 5);
    expect(arrow.regX).toBeCloseTo(-2.5 / 2, 5);
  });
});

import { describe, it, expect } from 'vitest';

function FakeShape() {}
FakeShape.prototype.scaleX = 1;
FakeShape.prototype.scaleY = 1;

function FakeGraphics() {
  this.commands = [];
  this.strokeWidths = [];
  this.fills = [];
}
FakeGraphics.getRGB = function(r, g, b) { return 'rgb(' + r + ',' + g + ',' + b + ')'; };
FakeGraphics.prototype.setStrokeStyle = function(thickness) {
  this.commands.push('setStrokeStyle');
  this.strokeWidths.push(thickness);
  return this;
};
FakeGraphics.prototype.beginStroke = function(color) {
  this.commands.push('beginStroke');
  this.strokeColor = color;
  return this;
};
FakeGraphics.prototype.endStroke = function() { this.commands.push('endStroke'); return this; };
FakeGraphics.prototype.beginFill = function(color) {
  this.commands.push('beginFill');
  this.fills.push(color);
  return this;
};
FakeGraphics.prototype.endFill = function() { this.commands.push('endFill'); return this; };
FakeGraphics.prototype.moveTo = function(x, y) {
  this.commands.push('moveTo');
  this.moveTos = this.moveTos || [];
  this.moveTos.push({ x: x, y: y });
  return this;
};
FakeGraphics.prototype.lineTo = function(x, y) {
  this.commands.push('lineTo');
  this.lineTos = this.lineTos || [];
  this.lineTos.push({ x: x, y: y });
  return this;
};
FakeGraphics.prototype.closePath = function() { this.commands.push('closePath'); return this; };

globalThis.createjs = {
  Shape: FakeShape,
  Graphics: FakeGraphics,
  Ticker: { framerate: 30, addEventListener() {} },
};
globalThis.ROS2D = globalThis.ROS2D ?? {};
await import('../../src/models/ArrowShape.js');
const ArrowShape = globalThis.ROS2D.ArrowShape;

describe('ROS2D.ArrowShape', () => {
  it('uses default strokeSize=3 when option is omitted', () => {
    const a = new ArrowShape();
    expect(a.graphics.strokeWidths).toEqual([3]);
    expect(a.graphics.commands).toContain('setStrokeStyle');
    expect(a.graphics.commands).toContain('beginStroke');
    expect(a.graphics.commands).toContain('endStroke');
  });

  it('honors a positive strokeSize override', () => {
    const a = new ArrowShape({ strokeSize: 0.05 });
    expect(a.graphics.strokeWidths).toEqual([0.05]);
  });

  it('honors strokeSize: 0 (the bug Fix 2 addresses)', () => {
    // The pre-fix code applied `|| 3` and rendered a giant outline; the
    // fix uses `!== undefined ? options.strokeSize : 3` so an explicit
    // 0 reaches the graphics layer.
    const a = new ArrowShape({ strokeSize: 0 });
    // No stroke commands should be emitted at all — fill-only arrow
    expect(a.graphics.commands).not.toContain('setStrokeStyle');
    expect(a.graphics.commands).not.toContain('beginStroke');
    expect(a.graphics.commands).not.toContain('endStroke');
    // The filled triangular head must still be present so the arrow is visible
    expect(a.graphics.commands).toContain('beginFill');
    expect(a.graphics.commands).toContain('endFill');
    expect(a.graphics.commands).toContain('closePath');
  });

  it('still renders the filled head when strokeSize is omitted', () => {
    const a = new ArrowShape({ fillColor: '#00ff00' });
    expect(a.graphics.fills).toEqual(['#00ff00']);
  });

  describe('extended mode (explicit dimensions)', () => {
    it('triggers when shaftLength is provided', () => {
      const a = new ArrowShape({ shaftLength: 3, shaftWidth: 0.5, headLength: 0.5, headWidth: 1, strokeSize: 0 });
      // Extended mode emits a 7-vertex polygon (1 moveTo + 6 lineTo + closePath)
      const lineTos = a.graphics.commands.filter((c) => c === 'lineTo').length;
      expect(lineTos).toBe(6);
      expect(a.graphics.commands).toContain('closePath');
      expect(a.graphics.commands).toContain('beginFill');
    });

    it('lays out the 7 vertices counter-clockwise around the arrow outline', () => {
      // shaftLength=3, shaftWidth=0.5, headLength=0.5, headWidth=1
      // Tail width edge → shaft top → shaft-head joint top → tip → joint bot → shaft bot → tail bot.
      const a = new ArrowShape({ shaftLength: 3, shaftWidth: 0.5, headLength: 0.5, headWidth: 1, strokeSize: 0 });
      expect(a.graphics.moveTos).toEqual([{ x: 0, y: -0.25 }]);
      expect(a.graphics.lineTos).toEqual([
        { x: 3, y: -0.25 },                  // shaft top-right
        { x: 3, y: -0.5 },                   // head base top (headWidth/2 = 0.5)
        { x: 3.5, y: 0 },                    // tip
        { x: 3, y: 0.5 },                    // head base bottom
        { x: 3, y: 0.25 },                   // shaft bottom-right
        { x: 0, y: 0.25 },                   // tail bottom
      ]);
    });

    it('headWidth defaults to shaftWidth * 2 when omitted', () => {
      const a = new ArrowShape({ shaftLength: 2, shaftWidth: 0.3, headLength: 0.5, strokeSize: 0 });
      // tip at x=2.5, head base at x=2 with y=±headWidth/2 = ±0.3
      const headBaseTop = a.graphics.lineTos[1];
      expect(headBaseTop).toEqual({ x: 2, y: -0.3 });
    });

    it('triggers extended mode for any explicit dim (shaftWidth alone)', () => {
      const a = new ArrowShape({ shaftWidth: 0.2, strokeSize: 0 });
      expect(a.graphics.commands.filter((c) => c === 'lineTo').length).toBe(6);
    });

    it('extended mode also honors strokeSize: 0 (fill-only)', () => {
      const a = new ArrowShape({ shaftLength: 3, shaftWidth: 0.5, headLength: 0.5, headWidth: 1, strokeSize: 0 });
      expect(a.graphics.commands).not.toContain('setStrokeStyle');
      expect(a.graphics.commands).not.toContain('beginStroke');
    });

    it('extended mode renders a stroked outline when strokeSize > 0', () => {
      const a = new ArrowShape({ shaftLength: 3, shaftWidth: 0.5, headLength: 0.5, headWidth: 1, strokeSize: 0.05 });
      expect(a.graphics.commands).toContain('setStrokeStyle');
      expect(a.graphics.commands).toContain('beginStroke');
      expect(a.graphics.commands).toContain('endStroke');
      expect(a.graphics.strokeWidths).toEqual([0.05]);
    });
  });

  it('garbage strokeSize (NaN, negative) silently skips stroke instead of crashing', () => {
    // The defensive `if (strokeSize > 0)` skip means non-positive
    // strokeSize (NaN, 0, negative) all produce a fill-only arrow
    // rather than emitting bad graphics commands. Callers that want
    // the default should omit the option.
    const a = new ArrowShape({ strokeSize: NaN });
    expect(a.graphics.commands).not.toContain('setStrokeStyle');
    const b = new ArrowShape({ strokeSize: -1 });
    expect(b.graphics.commands).not.toContain('setStrokeStyle');
  });
});

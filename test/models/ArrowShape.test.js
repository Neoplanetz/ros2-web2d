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
FakeGraphics.prototype.moveTo = function() { this.commands.push('moveTo'); return this; };
FakeGraphics.prototype.lineTo = function() { this.commands.push('lineTo'); return this; };
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

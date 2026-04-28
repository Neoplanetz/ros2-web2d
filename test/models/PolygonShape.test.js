import { describe, it, expect, beforeEach } from 'vitest';

function FakeShape() {}
FakeShape.prototype.scaleX = 1;
FakeShape.prototype.scaleY = 1;

function FakeGraphics() {
  this.commands = [];
  this.lineTos = [];
  this.moveTos = [];
}
FakeGraphics.getRGB = function(r, g, b) { return 'rgb(' + r + ',' + g + ',' + b + ')'; };
FakeGraphics.prototype.clear = function() {
  this.commands = [];
  this.lineTos = [];
  this.moveTos = [];
  return this;
};
FakeGraphics.prototype.beginFill = function(color) {
  this.commands.push('beginFill');
  this.fillColor = color;
  return this;
};
FakeGraphics.prototype.endFill = function() {
  this.commands.push('endFill');
  return this;
};
FakeGraphics.prototype.setStrokeStyle = function(size) {
  this.commands.push('setStrokeStyle');
  this.strokeSize = size;
  return this;
};
FakeGraphics.prototype.beginStroke = function(color) {
  this.commands.push('beginStroke');
  this.strokeColor = color;
  return this;
};
FakeGraphics.prototype.endStroke = function() {
  this.commands.push('endStroke');
  return this;
};
FakeGraphics.prototype.moveTo = function(x, y) {
  this.commands.push('moveTo');
  this.moveTos.push({ x, y });
  return this;
};
FakeGraphics.prototype.lineTo = function(x, y) {
  this.commands.push('lineTo');
  this.lineTos.push({ x, y });
  return this;
};
FakeGraphics.prototype.closePath = function() {
  this.commands.push('closePath');
  return this;
};

globalThis.createjs = {
  Shape: FakeShape,
  Graphics: FakeGraphics,
};
globalThis.ROS2D = globalThis.ROS2D ?? {};
await import('../../src/models/PolygonShape.js');
const PolygonShape = globalThis.ROS2D.PolygonShape;

const SQUARE = [
  { x: 0.3, y: 0.25 },
  { x: 0.3, y: -0.25 },
  { x: -0.3, y: -0.25 },
  { x: -0.3, y: 0.25 },
];

describe('ROS2D.PolygonShape', () => {
  let shape;

  it('constructs with sane defaults', () => {
    shape = new PolygonShape();
    expect(shape.strokeSize).toBe(0.03);
    expect(shape.strokeColor).toBeTruthy();
    expect(shape.fillColor).toBeNull();
    expect(shape.closed).toBe(true);
    expect(shape.negateY).toBe(true);
  });

  it('honors option overrides including null fillColor', () => {
    shape = new PolygonShape({
      strokeSize: 0.1,
      strokeColor: '#abcdef',
      fillColor: 'rgba(1,2,3,0.5)',
      closed: false,
      negateY: false,
    });
    expect(shape.strokeSize).toBe(0.1);
    expect(shape.strokeColor).toBe('#abcdef');
    expect(shape.fillColor).toBe('rgba(1,2,3,0.5)');
    expect(shape.closed).toBe(false);
    expect(shape.negateY).toBe(false);
  });

  describe('setPolygon()', () => {
    beforeEach(() => { shape = new PolygonShape(); });

    it('renders a closed stroked polygon with negateY by default', () => {
      shape.setPolygon(SQUARE);
      const g = shape.graphics;
      // First vertex via moveTo (Y negated)
      expect(g.moveTos).toEqual([{ x: 0.3, y: -0.25 }]);
      // Remaining 3 vertices via lineTo (Y negated)
      expect(g.lineTos).toEqual([
        { x: 0.3, y: 0.25 },
        { x: -0.3, y: 0.25 },
        { x: -0.3, y: -0.25 },
      ]);
      expect(g.commands).toContain('closePath');
      expect(g.commands).toContain('beginStroke');
      expect(g.commands).toContain('endStroke');
      expect(g.commands).not.toContain('beginFill');
    });

    it('skips closePath when closed:false', () => {
      shape = new PolygonShape({ closed: false });
      shape.setPolygon(SQUARE);
      expect(shape.graphics.commands).not.toContain('closePath');
    });

    it('emits beginFill / endFill only when fillColor is set', () => {
      shape = new PolygonShape({ fillColor: 'rgba(255,0,0,0.2)' });
      shape.setPolygon(SQUARE);
      expect(shape.graphics.commands).toContain('beginFill');
      expect(shape.graphics.commands).toContain('endFill');
    });

    it('preserves world Y when negateY:false (TF-aware path)', () => {
      shape = new PolygonShape({ negateY: false });
      shape.setPolygon(SQUARE);
      expect(shape.graphics.moveTos).toEqual([{ x: 0.3, y: 0.25 }]);
      expect(shape.graphics.lineTos[0]).toEqual({ x: 0.3, y: -0.25 });
    });

    it('clears prior graphics on each call (no overdraw)', () => {
      shape.setPolygon(SQUARE);
      const firstMoves = shape.graphics.moveTos.length;
      const firstLines = shape.graphics.lineTos.length;
      shape.setPolygon(SQUARE);
      // After clear+redraw the counts should match the last draw, not accumulate
      expect(shape.graphics.moveTos.length).toBe(firstMoves);
      expect(shape.graphics.lineTos.length).toBe(firstLines);
    });

    it('clears graphics for empty / single-point input', () => {
      shape.setPolygon(SQUARE);
      expect(shape.graphics.moveTos.length).toBe(1);
      shape.setPolygon([]);
      expect(shape.graphics.moveTos.length).toBe(0);
      shape.setPolygon([{ x: 0, y: 0 }]);
      expect(shape.graphics.moveTos.length).toBe(0);
      shape.setPolygon(null);
      expect(shape.graphics.moveTos.length).toBe(0);
    });

    it('skips intermediate points with non-finite coordinates', () => {
      shape.setPolygon([
        { x: 0.5, y: 0.5 },
        { x: NaN, y: 1 },          // skipped
        { x: 2, y: Infinity },     // skipped
        { x: 3, y: 3 },
      ]);
      expect(shape.graphics.moveTos).toEqual([{ x: 0.5, y: -0.5 }]);
      expect(shape.graphics.lineTos).toEqual([{ x: 3, y: -3 }]);
    });

    it('returns silently when the first point is invalid', () => {
      shape.setPolygon([{ x: NaN, y: 0 }, { x: 1, y: 1 }]);
      expect(shape.graphics.moveTos.length).toBe(0);
      expect(shape.graphics.lineTos.length).toBe(0);
    });

    it('skips stroke commands when strokeSize is 0 (fill-only polygon)', () => {
      shape = new PolygonShape({ strokeSize: 0, fillColor: '#00ff00' });
      shape.setPolygon(SQUARE);
      expect(shape.graphics.commands).not.toContain('beginStroke');
      expect(shape.graphics.commands).not.toContain('endStroke');
      expect(shape.graphics.commands).toContain('beginFill');
    });
  });
});

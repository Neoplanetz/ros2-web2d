import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// JSDOM's canvas stubs do not implement getContext/createImageData, so
// OccupancyGrid's rasterizer can't actually paint pixels under vitest.
// We shim document.createElement('canvas') to return a minimal fake
// that captures putImageData calls, so we can inspect the colorizer
// output on a per-cell basis without running real canvas code.
function installCanvasStub() {
  const original = document.createElement.bind(document);
  const stub = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName !== 'canvas') { return original(tagName); }
    const pixels = { data: null };
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          createImageData(width, height) {
            return { data: new Uint8ClampedArray(width * height * 4), width, height };
          },
          putImageData(imageData) {
            pixels.data = imageData.data;
          },
        };
      },
      __pixels: pixels,
    };
  });
  return () => stub.mockRestore();
}

globalThis.createjs = {
  Bitmap: function FakeBitmap(_canvas) { this.__canvas = _canvas; },
};

globalThis.ROS2D = globalThis.ROS2D ?? {};
await import('../../src/maps/OccupancyGrid.js');
const OccupancyGrid = globalThis.ROS2D.OccupancyGrid;

function gridMessage(data) {
  return {
    info: {
      width: data.length,
      height: 1,
      resolution: 1,
      origin: { position: { x: 0, y: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    },
    data,
  };
}

function pixelAt(grid, col) {
  const idx = col * 4;
  const px = grid.__canvas.__pixels.data;
  return [px[idx], px[idx + 1], px[idx + 2], px[idx + 3]];
}

describe('ROS2D.OccupancyGrid colorizer', () => {
  let restore;
  beforeEach(() => { restore = installCanvasStub(); });
  afterEach(() => { restore(); });

  it('default "map" preset paints free white, occupied black, unknown mid-gray', () => {
    const grid = new OccupancyGrid({ message: gridMessage([0, 100, -1, 50]) });
    expect(pixelAt(grid, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(grid, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(grid, 2)).toEqual([127, 127, 127, 255]);
    expect(pixelAt(grid, 3)).toEqual([127, 127, 127, 255]); // intermediate
  });

  it('"costmap" preset renders free transparent, unknown faint gray, lethal red', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, -1, 100]),
      colorizer: 'costmap',
    });
    // free (0) is fully transparent so the costmap overlay reveals the base map underneath
    expect(pixelAt(grid, 0)[3]).toBe(0);
    // unknown (-1) renders as a faint gray so debug signal is preserved (Issue 2 fix)
    const unknown = pixelAt(grid, 1);
    expect(unknown[0]).toBe(127);
    expect(unknown[1]).toBe(127);
    expect(unknown[2]).toBe(127);
    expect(unknown[3]).toBeGreaterThan(0);
    expect(unknown[3]).toBeLessThan(80); // faint, not dominant
    // lethal (100) is bright red with high alpha
    const lethal = pixelAt(grid, 2);
    expect(lethal[0]).toBe(255);
    expect(lethal[1]).toBe(0);
    expect(lethal[2]).toBe(0);
    expect(lethal[3]).toBe(180);
  });

  it('"costmap" inflation gradient is continuous through value=99 with no hue jump', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([20, 60, 99]),
      colorizer: 'costmap',
    });
    const low = pixelAt(grid, 0);
    const mid = pixelAt(grid, 1);
    const inscribed = pixelAt(grid, 2);
    // Alpha grows monotonically with cost (Issue 6: gradient capped < 180 lethal)
    expect(low[3]).toBeGreaterThan(0);
    expect(mid[3]).toBeGreaterThan(low[3]);
    expect(inscribed[3]).toBeGreaterThan(mid[3]);
    expect(inscribed[3]).toBeLessThanOrEqual(160);
    // value=99 reaches the red end of the gradient (no pink carve-out, Issue 1 fix)
    expect(inscribed[0]).toBe(255);
    expect(inscribed[1]).toBe(0);
    expect(inscribed[2]).toBe(0);
  });

  it('"costmap" lethal cells stand above the inflation band via alpha', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([99, 100]),
      colorizer: 'costmap',
    });
    const inscribed = pixelAt(grid, 0);
    const lethal = pixelAt(grid, 1);
    // Same hue (red) but lethal has noticeably higher alpha
    expect(inscribed[0]).toBe(255);
    expect(lethal[0]).toBe(255);
    expect(lethal[3]).toBeGreaterThan(inscribed[3]);
  });

  it('accepts a custom colorizer function', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, 50, 100]),
      colorizer: (value) => [value * 2, 0, 0, 255],
    });
    expect(pixelAt(grid, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(grid, 1)).toEqual([100, 0, 0, 255]);
    expect(pixelAt(grid, 2)).toEqual([200, 0, 0, 255]);
  });

  it('throws when a custom colorizer returns undefined', () => {
    expect(() => new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: () => undefined,
    })).toThrow(/custom colorizer must return/);
  });

  it('throws when a custom colorizer returns the wrong tuple length', () => {
    expect(() => new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: () => [255, 0, 0],
    })).toThrow(/custom colorizer must return/);
  });

  it('throws when a custom colorizer returns non-finite numbers', () => {
    expect(() => new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: () => [255, NaN, 0, 255],
    })).toThrow(/custom colorizer must return/);
  });

  it('throws when a custom colorizer returns non-numeric values', () => {
    expect(() => new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: () => ['ff', 0, 0, 255],
    })).toThrow(/custom colorizer must return/);
  });

  it('falls back to map preset on unknown colorizer string', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: 'nonexistent-preset',
    });
    expect(pixelAt(grid, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(grid, 1)).toEqual([0, 0, 0, 255]);
  });
});

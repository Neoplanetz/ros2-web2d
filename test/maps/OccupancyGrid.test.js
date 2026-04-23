import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('default "map" preset paints free white, occupied black, unknown mid-gray', () => {
    const grid = new OccupancyGrid({ message: gridMessage([0, 100, -1, 50]) });
    expect(pixelAt(grid, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(grid, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(grid, 2)).toEqual([127, 127, 127, 255]);
    expect(pixelAt(grid, 3)).toEqual([127, 127, 127, 255]); // intermediate
    restore();
  });

  it('"costmap" preset renders free/unknown transparent and lethal red', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, -1, 100]),
      colorizer: 'costmap',
    });
    expect(pixelAt(grid, 0)[3]).toBe(0); // free transparent
    expect(pixelAt(grid, 1)[3]).toBe(0); // unknown transparent
    const lethal = pixelAt(grid, 2);
    expect(lethal[0]).toBe(255); // red channel
    expect(lethal[3]).toBeGreaterThan(0); // visible
    restore();
  });

  it('"costmap" inflation values produce visible gradient pixels with growing alpha', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([20, 60, 99]),
      colorizer: 'costmap',
    });
    const low = pixelAt(grid, 0);
    const mid = pixelAt(grid, 1);
    const inscribed = pixelAt(grid, 2);
    // Each band should render a visibly non-zero pixel
    expect(low[3]).toBeGreaterThan(0);
    expect(mid[3]).toBeGreaterThan(low[3]); // alpha grows with cost
    // Inscribed gets the dedicated pink treatment (255, 128, 255)
    expect(inscribed[0]).toBe(255);
    expect(inscribed[1]).toBe(128);
    expect(inscribed[2]).toBe(255);
    restore();
  });

  it('accepts a custom colorizer function', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, 50, 100]),
      colorizer: (value) => [value * 2, 0, 0, 255],
    });
    expect(pixelAt(grid, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(grid, 1)).toEqual([100, 0, 0, 255]);
    expect(pixelAt(grid, 2)).toEqual([200, 0, 0, 255]);
    restore();
  });

  it('falls back to map preset on unknown colorizer string', () => {
    const grid = new OccupancyGrid({
      message: gridMessage([0, 100]),
      colorizer: 'nonexistent-preset',
    });
    expect(pixelAt(grid, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(grid, 1)).toEqual([0, 0, 0, 255]);
    restore();
  });
});

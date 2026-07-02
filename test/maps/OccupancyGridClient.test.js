import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRoslib } from '../fakes/fakeRoslib.js';
import EventEmitter from 'eventemitter3';

const fake = createFakeRoslib();

vi.mock('roslib', () => fake.ROSLIB);
vi.mock('createjs-module', () => ({
  default: {
    Container: class {},
    Shape: class {},
    Bitmap: class {},
    Graphics: class {
      static getRGB() { return '#000000'; }
      setStrokeStyle() { return this; }
      beginStroke() { return this; }
      beginFill() { return this; }
      moveTo() { return this; }
      lineTo() { return this; }
      endFill() { return this; }
      endStroke() { return this; }
    },
    Stage: class {
      globalToRos() {}
      rosToGlobal() {}
      rosQuaternionToGlobalTheta() {}
    },
  },
  Container: class {},
  Shape: class {},
  Bitmap: class {},
  Graphics: class {
    static getRGB() { return '#000000'; }
    setStrokeStyle() { return this; }
    beginStroke() { return this; }
    beginFill() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    endFill() { return this; }
    endStroke() { return this; }
  },
}));

// Set up globals the source scripts rely on (they use bare globals, not require()).
globalThis.ROSLIB = fake.ROSLIB;

// Minimal createjs mock with all classes referenced by OccupancyGrid, Grid, and OccupancyGridClient.
class FakeGraphics {
  static getRGB() { return '#000000'; }
  setStrokeStyle() { return this; }
  beginStroke() { return this; }
  beginFill() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  endFill() { return this; }
  endStroke() { return this; }
}

class FakeBitmap {
  constructor(_canvas) {
    this.x = 0;
    this.y = 0;
    this.scaleX = 1;
    this.scaleY = 1;
  }
}

class FakeShape {
  constructor(_graphics) {}
}

function FakeContainer() {
  this.children = [];
  this.x = 0; this.y = 0; this.rotation = 0; this.visible = true;
}
FakeContainer.prototype.addChild = function(c) { this.children.push(c); return this; };
FakeContainer.prototype.getChildIndex = function(c) { return this.children.indexOf(c); };
FakeContainer.prototype.removeChild = function(c) {
  const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
};
FakeContainer.prototype.addChildAt = function(c, i) { this.children.splice(i, 0, c); };

globalThis.createjs = {
  Graphics: FakeGraphics,
  Bitmap: FakeBitmap,
  Shape: FakeShape,
  Container: FakeContainer,
};

globalThis.EventEmitter = EventEmitter;

// Stub a minimal ROS2D global the source attaches itself to.
globalThis.ROS2D = globalThis.ROS2D ?? {};

// Pre-populate ROS2D.Grid and ROS2D.OccupancyGrid so OccupancyGridClient can
// construct them. These are defined in separate source files that we don't
// import here.
globalThis.ROS2D.Grid = function FakeGrid(_options) {};
globalThis.ROS2D.Grid.prototype.__proto__ = FakeShape.prototype;

globalThis.ROS2D.OccupancyGrid = function FakeOccupancyGrid(options) {
  this.x = 0;
  this.y = 0;
  this.scaleX = 1;
  this.scaleY = 1;
  this.colorizer = options.colorizer;
  const msg = options.message;
  if (msg && msg.info) {
    this.width = msg.info.width * msg.info.resolution;
    this.height = msg.info.height * msg.info.resolution;
    this.pose = {
      position: msg.info.origin.position,
      orientation: msg.info.origin.orientation,
    };
  }
};
globalThis.ROS2D.OccupancyGrid.prototype.__proto__ = FakeBitmap.prototype;

globalThis.ROS2D.quaternionToGlobalTheta = function() { return 0; };
globalThis.ROSLIB.Pose = function(options) {
  this.position = { x: options.position.x, y: options.position.y, z: options.position.z };
  this.orientation = {
    x: options.orientation.x, y: options.orientation.y,
    z: options.orientation.z, w: options.orientation.w
  };
};
globalThis.ROSLIB.Pose.prototype.applyTransform = function(tf) {
  this.position = {
    x: this.position.x + tf.translation.x,
    y: this.position.y + tf.translation.y,
    z: this.position.z + tf.translation.z,
  };
};

await import('../../src/util/topicHelper.js');
await import('../../src/visualization/SceneNode.js');
await import('../../src/maps/OccupancyGridClient.js');

describe('OccupancyGridClient (baseline, v1 API)', () => {
  beforeEach(() => {
    fake.topics.length = 0;
  });

  it('subscribes to the configured topic with messageType nav_msgs/OccupancyGrid', () => {
    const rootObject = { addChild: vi.fn(), getChildIndex: () => -1, removeChild: vi.fn() };
    new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject,
      topic: '/map',
    });
    const topic = fake.topics[fake.topics.length - 1];
    expect(topic.name).toBe('/map');
    expect(topic.messageType).toBe('nav_msgs/OccupancyGrid');
  });

  it('forwards ROSLIB.Topic subscribe options', () => {
    const rootObject = { addChild: vi.fn(), getChildIndex: () => -1, removeChild: vi.fn() };
    new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject,
      throttle_rate: 100,
      queue_length: 5,
      compression: 'cbor',
      reconnect_on_close: false,
    });
    const topic = fake.topics[fake.topics.length - 1];
    // messageType must not be clobberable by a user-supplied option
    expect(topic.messageType).toBe('nav_msgs/OccupancyGrid');
    expect(topic.subscribeOptions.throttle_rate).toBe(100);
    expect(topic.subscribeOptions.queue_length).toBe(5);
    expect(topic.subscribeOptions.compression).toBe('cbor');
    expect(topic.opts.reconnect_on_close).toBe(false);
  });

  it('emits "change" after a message arrives', () => {
    const rootObject = {
      addChild: vi.fn(),
      getChildIndex: () => 0,
      removeChild: vi.fn(),
      addChildAt: vi.fn(),
    };
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject,
      topic: '/map',
      continuous: true,
    });
    const onChange = vi.fn();
    client.on('change', onChange);
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({ info: { width: 10, height: 10, resolution: 0.1, origin: { position: { x: 0, y: 0 }, orientation: {} } }, data: new Array(100).fill(0) });
    expect(onChange).toHaveBeenCalledOnce();
  });

  function fakeMapMsg(frame) {
    return {
      header: { frame_id: frame },
      info: {
        width: 10, height: 10, resolution: 0.1,
        origin: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      data: new Array(100).fill(0),
    };
  }

  it('with tfClient: map message creates a SceneNode wrap at the map frame', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf, continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg('robot_0/map'));
    expect(client.node).toBeInstanceOf(globalThis.ROS2D.SceneNode);
    expect(client.node.frame_id).toBe('robot_0/map');
    expect(tf.__subscriberCount('robot_0/map')).toBe(1);
  });

  it('with tfClient: unsubscribe detaches from TF', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf, continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg('robot_0/map'));
    client.unsubscribe();
    expect(tf.__subscriberCount('robot_0/map')).toBe(0);
  });

  it('forwards the colorizer option to each OccupancyGrid it constructs', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root,
      colorizer: 'costmap', continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg('map'));
    expect(client.currentGrid.colorizer).toBe('costmap');

    // custom function also forwards
    const customFn = (value) => [value, 0, 0, 255];
    const client2 = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(),
      colorizer: customFn, continuous: true,
    });
    const topic2 = fake.topics[fake.topics.length - 1];
    topic2.__emit(fakeMapMsg('map'));
    expect(client2.currentGrid.colorizer).toBe(customFn);
  });

  it('without tfClient: behavior unchanged (no node)', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg('map'));
    expect(client.node).toBeFalsy();
  });

  it('non-continuous (default) subscribe mode unsubscribes after the first message', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root,
    });
    const topic = fake.topics[fake.topics.length - 1];
    expect(topic._subs).toHaveLength(1);
    topic.__emit(fakeMapMsg('map'));
    expect(topic._subs).toHaveLength(0);
  });
});

describe('OccupancyGridClient.setColorizer (in-place recolor, no re-subscribe)', () => {
  beforeEach(() => {
    fake.topics.length = 0;
  });

  function fakeMapMsg() {
    return {
      header: { frame_id: 'map' },
      info: {
        width: 10, height: 10, resolution: 0.1,
        origin: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      data: new Array(100).fill(0),
    };
  }

  it('re-renders the current grid with the new colorizer in place, without a new subscription or a re-fit', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, colorizer: 'map', continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg());
    expect(client.currentGrid.colorizer).toBe('map');
    const topicsBefore = fake.topics.length;

    const onChange = vi.fn();
    client.on('change', onChange);
    // Guard the core contract directly: the existing topic is neither
    // re-subscribed nor unsubscribed by a recolor.
    const subSpy = vi.spyOn(topic, 'subscribe');
    const unsubSpy = vi.spyOn(topic, 'unsubscribe');
    const customFn = (value) => [value, 0, 0, 255];
    client.setColorizer(customFn);

    expect(client.colorizer).toBe(customFn);
    // A fresh grid was built from the cached message with the new colorizer.
    expect(client.currentGrid.colorizer).toBe(customFn);
    // setColorizer must NOT emit 'change' — a recolor keeps the same map
    // dimensions, so consumers must not re-fit / reset the view (the Viewer's
    // Ticker repaints the swapped grid on the next frame).
    expect(onChange).not.toHaveBeenCalled();
    // The ROS topic subscription is untouched — no new Topic constructed AND
    // no subscribe/unsubscribe on the existing topic.
    expect(fake.topics.length).toBe(topicsBefore);
    expect(subSpy).not.toHaveBeenCalled();
    expect(unsubSpy).not.toHaveBeenCalled();
  });

  it('is a no-op after unsubscribe() — does not resurrect a detached TF SceneNode', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf, continuous: true,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg()); // frame_id 'map'
    expect(client.node).toBeInstanceOf(globalThis.ROS2D.SceneNode);
    expect(tf.__subscriberCount('map')).toBe(1);

    client.unsubscribe(); // consumer teardown → disposed, node dropped
    expect(client.node).toBeNull();
    expect(tf.__subscriberCount('map')).toBe(0);

    // A late theme/colorizer change after teardown must NOT re-create the
    // SceneNode or re-subscribe to TF.
    client.setColorizer((value) => [value, 0, 0, 255]);
    expect(client.node).toBeNull();
    expect(tf.__subscriberCount('map')).toBe(0);
  });

  it('stores the colorizer for the next message when called before any message arrives', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, colorizer: 'map', continuous: true,
    });
    const customFn = (value) => [0, value, 0, 255];
    // No message yet → must not throw, just stores the colorizer.
    client.setColorizer(customFn);
    expect(client.colorizer).toBe(customFn);
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit(fakeMapMsg());
    expect(client.currentGrid.colorizer).toBe(customFn);
  });
});

describe('OccupancyGridClient (subscribe:false / feed mode)', () => {
  beforeEach(() => {
    fake.topics.length = 0;
  });

  function fakeMapMsg(frame) {
    return {
      header: { frame_id: frame },
      info: {
        width: 10, height: 10, resolution: 0.1,
        origin: {
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      data: new Array(100).fill(0),
    };
  }

  it('does not create a ROSLIB.Topic and sets rosTopic to null', () => {
    const root = new FakeContainer();
    const topicsBefore = fake.topics.length;
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    expect(fake.topics.length).toBe(topicsBefore);
    expect(client.rosTopic).toBeNull();
  });

  it('processMessage renders the grid, caches lastMessage, and emits change without a topic', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, colorizer: 'costmap', subscribe: false,
    });
    const onChange = vi.fn();
    client.on('change', onChange);
    const msg = fakeMapMsg('map');
    // The non-continuous auto-unsubscribe must be null-guarded: with no topic
    // this would otherwise throw on this.rosTopic.unsubscribe().
    expect(() => client.processMessage(msg)).not.toThrow();
    expect(client.lastMessage).toBe(msg);
    expect(client.currentGrid.colorizer).toBe('costmap');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe() does not throw when rosTopic is null', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    client.processMessage(fakeMapMsg('map'));
    expect(() => client.unsubscribe()).not.toThrow();
  });

  it('subscribe:false + tfClient: processMessage wraps the grid in a SceneNode', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf, subscribe: false,
    });
    expect(client.rosTopic).toBeNull();
    client.processMessage(fakeMapMsg('robot_0/map'));
    expect(client.node).toBeInstanceOf(globalThis.ROS2D.SceneNode);
    expect(client.node.frame_id).toBe('robot_0/map');
    expect(tf.__subscriberCount('robot_0/map')).toBe(1);
  });

  it('unsubscribe() before any processMessage() is a no-op-safe', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    expect(() => client.unsubscribe()).not.toThrow();
  });

  it('subscribe:false: repeated processMessage swaps the grid without leaking children', () => {
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.OccupancyGridClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    const childCountAfterCtor = root.children.length;
    client.processMessage(fakeMapMsg('map'));
    const firstGrid = client.currentGrid;
    client.processMessage(fakeMapMsg('map'));
    expect(client.currentGrid).not.toBe(firstGrid);
    expect(root.children).not.toContain(firstGrid);
    expect(root.children.length).toBe(childCountAfterCtor);
  });
});

// ─── shared subscription pool (P3): latched-map late-join replay ──────────
// The motivating case for late-join replay. A non-continuous grid delivers the
// map once then auto-unsubscribes, leaving the pooled subscription draining
// (grace window) with the map retained. A grid that joins afterwards would,
// without replay, never render — rosbridge would re-latch only to a NEW
// subscription, but the pool holds a single shared one. Replay hands the
// retained map to the newcomer, so the pooled grid behaves as if it held its
// own latched subscription.
describe('OccupancyGridClient + shared subscription pool (P3)', () => {
  beforeEach(() => {
    fake.topics.length = 0;
    vi.useFakeTimers();
    globalThis.ROS2D.setTopicPoolGraceMs(5000);
  });
  afterEach(() => { vi.useRealTimers(); });

  function poolMapMsg() {
    return {
      header: { frame_id: 'map' },
      info: {
        width: 4, height: 4, resolution: 0.5,
        origin: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      },
      data: new Array(16).fill(0),
    };
  }

  it('two continuous grids on one topic with pool:true share ONE subscription', () => {
    const ros = new fake.ROSLIB.Ros();
    new globalThis.ROS2D.OccupancyGridClient({ ros, rootObject: new FakeContainer(), topic: '/map', continuous: true, pool: true });
    new globalThis.ROS2D.OccupancyGridClient({ ros, rootObject: new FakeContainer(), topic: '/map', continuous: true, pool: true });
    expect(fake.topics.length).toBe(1);
  });

  it('a late-joining grid renders the latched map via pool replay', () => {
    const ros = new fake.ROSLIB.Ros();
    const c1 = new globalThis.ROS2D.OccupancyGridClient({ ros, rootObject: new FakeContainer(), topic: '/map', pool: true });
    const msg = poolMapMsg();
    fake.topics[0].__emit(msg);          // c1 renders, then auto-unsubscribes (non-continuous)
    expect(c1.lastMessage).toBe(msg);
    // c2 joins after the one-shot delivery, while the subscription is draining.
    const c2 = new globalThis.ROS2D.OccupancyGridClient({ ros, rootObject: new FakeContainer(), topic: '/map', pool: true });
    expect(c2.lastMessage).toBe(msg);    // replay delivered the retained map
    expect(fake.topics.length).toBe(1);  // the draining subscription was reused, not rebuilt
  });

  it('subscribe:false grid never touches the pool even with pool:true', () => {
    const ros = new fake.ROSLIB.Ros();
    const c = new globalThis.ROS2D.OccupancyGridClient({ ros, rootObject: new FakeContainer(), topic: '/map', subscribe: false, pool: true });
    expect(fake.topics.length).toBe(0);
    expect(c.rosTopic).toBeNull();
  });
});

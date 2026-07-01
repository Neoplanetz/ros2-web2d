import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRoslib } from '../fakes/fakeRoslib.js';
import EventEmitter from 'eventemitter3';

const fake = createFakeRoslib();

function FakeShape() {}
FakeShape.prototype.scaleX = 1;
FakeShape.prototype.scaleY = 1;
function FakeContainer() { this.children = []; }
FakeContainer.prototype.addChild = function(c) { this.children.push(c); };
FakeContainer.prototype.removeChild = function(c) {
  const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
};

globalThis.createjs = {
  Shape: FakeShape, Container: FakeContainer,
  Graphics: class { static getRGB() { return '#000'; } },
  Stage: class {}, Bitmap: class {},
  Ticker: { framerate: 30, addEventListener() {} },
};
globalThis.ROSLIB = fake.ROSLIB;
globalThis.EventEmitter = EventEmitter;
globalThis.ROS2D = globalThis.ROS2D ?? {};
globalThis.ROS2D.quaternionToGlobalTheta = function() { return 0; };

// Stub NavigationArrow so we can inspect x/y/rotation assignments.
globalThis.ROS2D.NavigationArrow = function FakeArrow(opts) {
  this.opts = opts;
  this.x = 0; this.y = 0; this.rotation = 0; this.visible = true;
};
globalThis.ROS2D.NavigationArrow.prototype.__proto__ = FakeShape.prototype;

// SceneNode uses ROSLIB.Pose; stub it.
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
await import('../../src/clients/PoseStampedClient.js');
const PoseStampedClient = globalThis.ROS2D.PoseStampedClient;

beforeEach(() => { fake.topics.length = 0; });

describe('ROS2D.PoseStampedClient', () => {
  it('subscribes to /pose as geometry_msgs/PoseStamped by default', () => {
    const c = new PoseStampedClient({ ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer() });
    const topic = fake.topics[fake.topics.length - 1];
    expect(topic.name).toBe('/pose');
    expect(topic.messageType).toBe('geometry_msgs/PoseStamped');
    // Arrow starts hidden until first message.
    expect(c.arrow.visible).toBe(false);
  });

  it('forwards ROSLIB.Topic subscribe options', () => {
    new PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(),
      throttle_rate: 100, queue_length: 5,
      compression: 'cbor', reconnect_on_close: false,
    });
    const topic = fake.topics[fake.topics.length - 1];
    // messageType must not be clobberable by a user-supplied option
    expect(topic.messageType).toBe('geometry_msgs/PoseStamped');
    expect(topic.subscribeOptions.throttle_rate).toBe(100);
    expect(topic.subscribeOptions.queue_length).toBe(5);
    expect(topic.subscribeOptions.compression).toBe('cbor');
    expect(topic.opts.reconnect_on_close).toBe(false);
  });

  it('maps pose.position.x/y (Y negated) and rotation from quaternion', () => {
    const root = new FakeContainer();
    const c = new PoseStampedClient({ ros: new fake.ROSLIB.Ros(), rootObject: root });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({ pose: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
    expect(c.arrow.x).toBe(1);
    expect(c.arrow.y).toBe(-2);
    expect(c.arrow.rotation).toBe(0);
    expect(c.arrow.visible).toBe(true);
  });

  it('ignores malformed messages without a pose.position', () => {
    const c = new PoseStampedClient({ ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer() });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({}); // no pose
    expect(c.arrow.visible).toBe(false);
  });

  it('emits change on each valid message', () => {
    const c = new PoseStampedClient({ ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer() });
    const onChange = vi.fn();
    c.on('change', onChange);
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({ pose: { position: { x: 0, y: 0 } } });
    topic.__emit({ pose: { position: { x: 1, y: 0 } } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe detaches from topic and removes arrow', () => {
    const root = new FakeContainer();
    const c = new PoseStampedClient({ ros: new fake.ROSLIB.Ros(), rootObject: root });
    const topic = fake.topics[fake.topics.length - 1];
    c.unsubscribe();
    expect(topic._subs).toHaveLength(0);
    expect(root.children).not.toContain(c.arrow);
  });

  it('with tfClient: first message creates SceneNode wrapping the marker', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const client = new globalThis.ROS2D.PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf,
    });
    expect(client.node).toBeFalsy();
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({
      header: { frame_id: 'map' },
      pose: {
        position: { x: 1, y: 2, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(client.node).toBeInstanceOf(globalThis.ROS2D.SceneNode);
    expect(client.node.frame_id).toBe('map');
    expect(client.node.pose.position.x).toBe(1);
    expect(client.node.pose.position.y).toBe(2);
    expect(client.marker.x).toBe(0);
    expect(client.marker.y).toBe(0);
    expect(client.marker.visible).toBe(true);
  });

  it('with tfClient: subsequent messages call setPose, not recreate', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const client = new globalThis.ROS2D.PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(), tfClient: tf,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({
      header: { frame_id: 'map' },
      pose: { position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    const firstNode = client.node;
    topic.__emit({
      header: { frame_id: 'map' },
      pose: { position: { x: 5, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    expect(client.node).toBe(firstNode);
    expect(client.node.pose.position.x).toBe(5);
  });

  it('with tfClient: frame change triggers setFrame', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const client = new globalThis.ROS2D.PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(), tfClient: tf,
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({
      header: { frame_id: 'map' },
      pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    topic.__emit({
      header: { frame_id: 'robot_0/map' },
      pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    expect(client.node.frame_id).toBe('robot_0/map');
    expect(tf.__subscriberCount('map')).toBe(0);
    expect(tf.__subscriberCount('robot_0/map')).toBe(1);
  });

  it('without tfClient: marker x/y set directly (unchanged)', () => {
    const client = new globalThis.ROS2D.PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(),
    });
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({
      header: { frame_id: 'map' },
      pose: { position: { x: 7, y: 3, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    expect(client.marker.x).toBe(7);
    expect(client.marker.y).toBe(-3);
    expect(client.node).toBeFalsy();
  });

  // ─── subscribe:false (render-only / feed mode) ────────────────────────
  // When subscribe:false is set the client must NOT create a ROSLIB.Topic,
  // but must still render messages fed via processMessage() — the same
  // canonical mapping (and SceneNode TF) the subscribe path uses.

  it('subscribe:false does not create a ROSLIB.Topic and sets rosTopic to null', () => {
    const topicsBefore = fake.topics.length;
    const c = new PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: new FakeContainer(), subscribe: false,
    });
    expect(fake.topics.length).toBe(topicsBefore);
    expect(c.rosTopic).toBeNull();
  });

  it('subscribe:false: processMessage renders identically to the subscribe path and emits change', () => {
    const root = new FakeContainer();
    const c = new PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    const onChange = vi.fn();
    c.on('change', onChange);
    c.processMessage({ pose: { position: { x: 1, y: 2, z: 3 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
    expect(c.arrow.x).toBe(1);
    expect(c.arrow.y).toBe(-2);
    expect(c.arrow.rotation).toBe(0);
    expect(c.arrow.visible).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('subscribe:false: unsubscribe() does not throw when rosTopic is null', () => {
    const root = new FakeContainer();
    const c = new PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, subscribe: false,
    });
    c.processMessage({ pose: { position: { x: 1, y: 2 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } });
    expect(() => c.unsubscribe()).not.toThrow();
    expect(root.children).not.toContain(c.marker);
  });

  it('subscribe:false + tfClient: processMessage still wraps the marker in a SceneNode', () => {
    const tf = new fake.FakeTFClient({ fixedFrame: 'map' });
    const root = new FakeContainer();
    const c = new PoseStampedClient({
      ros: new fake.ROSLIB.Ros(), rootObject: root, tfClient: tf, subscribe: false,
    });
    expect(c.rosTopic).toBeNull();
    c.processMessage({
      header: { frame_id: 'map' },
      pose: { position: { x: 1, y: 2, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    });
    expect(c.node).toBeInstanceOf(globalThis.ROS2D.SceneNode);
    expect(c.node.frame_id).toBe('map');
    expect(c.marker.visible).toBe(true);
  });
});

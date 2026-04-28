import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeRoslib } from '../fakes/fakeRoslib.js';
import EventEmitter from 'eventemitter3';

const fake = createFakeRoslib();

function FakeShape() {}
FakeShape.prototype.scaleX = 1;
FakeShape.prototype.scaleY = 1;

function FakeGraphics() { this.commands = []; }
FakeGraphics.getRGB = function() { return '#ff0000'; };
FakeGraphics.prototype.clear = function() { return this; };
FakeGraphics.prototype.beginFill = function() { return this; };
FakeGraphics.prototype.endFill = function() { return this; };
FakeGraphics.prototype.setStrokeStyle = function() { return this; };
FakeGraphics.prototype.beginStroke = function() { return this; };
FakeGraphics.prototype.endStroke = function() { return this; };
FakeGraphics.prototype.moveTo = function() { return this; };
FakeGraphics.prototype.lineTo = function() { return this; };
FakeGraphics.prototype.closePath = function() { return this; };

function FakeContainer() {
  this.children = [];
  this.x = 0; this.y = 0; this.rotation = 0;
}
FakeContainer.prototype.addChild = function(c) { this.children.push(c); return this; };
FakeContainer.prototype.removeChild = function(c) {
  const i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
};

globalThis.createjs = {
  Shape: FakeShape,
  Graphics: FakeGraphics,
  Container: FakeContainer,
  Stage: class {},
  Bitmap: class {},
};
globalThis.ROSLIB = fake.ROSLIB;
globalThis.EventEmitter = EventEmitter;
globalThis.ROS2D = globalThis.ROS2D ?? {};
globalThis.ROS2D.quaternionToGlobalTheta = function() { return 0; };

// SceneNode uses ROSLIB.Pose; stub with the same shape other client tests use.
globalThis.ROSLIB.Pose = function(options) {
  this.position = {
    x: options.position.x, y: options.position.y, z: options.position.z,
  };
  this.orientation = {
    x: options.orientation.x, y: options.orientation.y,
    z: options.orientation.z, w: options.orientation.w,
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
await import('../../src/models/PolygonShape.js');
await import('../../src/clients/PolygonStampedClient.js');
const PolygonStampedClient = globalThis.ROS2D.PolygonStampedClient;

function polygonMsg(frame) {
  return {
    header: { frame_id: frame },
    polygon: {
      points: [
        { x: 0.3, y: 0.25, z: 0 },
        { x: 0.3, y: -0.25, z: 0 },
        { x: -0.3, y: -0.25, z: 0 },
        { x: -0.3, y: 0.25, z: 0 },
      ],
    },
  };
}

beforeEach(() => {
  fake.topics.length = 0;
});

describe('ROS2D.PolygonStampedClient', () => {
  it('subscribes to default topic /local_costmap/published_footprint', () => {
    new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: new FakeContainer(),
    });
    const topic = fake.topics[fake.topics.length - 1];
    expect(topic.name).toBe('/local_costmap/published_footprint');
    expect(topic.messageType).toBe('geometry_msgs/PolygonStamped');
  });

  it('honors a custom topic name', () => {
    new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: new FakeContainer(),
      topic: '/global_costmap/published_footprint',
    });
    const topic = fake.topics[fake.topics.length - 1];
    expect(topic.name).toBe('/global_costmap/published_footprint');
  });

  it('forwards ROSLIB.Topic subscribe options', () => {
    new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: new FakeContainer(),
      throttle_rate: 100, queue_length: 5,
      compression: 'cbor', reconnect_on_close: false,
    });
    const topic = fake.topics[fake.topics.length - 1];
    // messageType must not be clobberable by a user-supplied option
    expect(topic.messageType).toBe('geometry_msgs/PolygonStamped');
    expect(topic.subscribeOptions.throttle_rate).toBe(100);
    expect(topic.subscribeOptions.queue_length).toBe(5);
    expect(topic.subscribeOptions.compression).toBe('cbor');
    expect(topic.opts.reconnect_on_close).toBe(false);
  });

  it('attaches the polygon shape to rootObject when no tfClient', () => {
    const root = new FakeContainer();
    const c = new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: root,
    });
    expect(root.children).toContain(c.polygonShape);
  });

  it('routes incoming message points into polygonShape.setPolygon', () => {
    const root = new FakeContainer();
    const c = new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: root,
    });
    const setSpy = vi.spyOn(c.polygonShape, 'setPolygon');
    const topic = fake.topics[fake.topics.length - 1];
    const msg = polygonMsg('base_link');
    topic.__emit(msg);
    expect(setSpy).toHaveBeenCalledWith(msg.polygon.points);
  });

  it('ignores messages with no polygon or no points field', () => {
    const c = new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: new FakeContainer(),
    });
    const setSpy = vi.spyOn(c.polygonShape, 'setPolygon');
    const topic = fake.topics[fake.topics.length - 1];
    topic.__emit({ header: { frame_id: 'base_link' } });
    topic.__emit({ header: { frame_id: 'base_link' }, polygon: {} });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('emits "change" after applying a polygon', () => {
    const c = new PolygonStampedClient({
      ros: new fake.ROSLIB.Ros(),
      rootObject: new FakeContainer(),
    });
    const onChange = vi.fn();
    c.on('change', onChange);
    fake.topics[fake.topics.length - 1].__emit(polygonMsg('base_link'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  describe('tfClient mode', () => {
    let tfClient;
    beforeEach(() => { tfClient = new fake.FakeTFClient({ fixedFrame: 'map' }); });

    it('does NOT add the shape to rootObject directly when tfClient is supplied', () => {
      const root = new FakeContainer();
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: root,
        tfClient,
      });
      expect(root.children).not.toContain(c.polygonShape);
    });

    it('wraps the shape in a SceneNode keyed on the message frame on first message', () => {
      const root = new FakeContainer();
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: root,
        tfClient,
      });
      fake.topics[fake.topics.length - 1].__emit(polygonMsg('robot_0/base_link'));
      expect(c.node).not.toBeNull();
      expect(c.node.frame_id).toBe('robot_0/base_link');
      expect(root.children).toContain(c.node);
    });

    it('reuses the SceneNode and only retargets when the frame changes', () => {
      const root = new FakeContainer();
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: root,
        tfClient,
      });
      const topic = fake.topics[fake.topics.length - 1];
      topic.__emit(polygonMsg('robot_0/base_link'));
      const firstNode = c.node;
      topic.__emit(polygonMsg('robot_0/base_link')); // same frame
      expect(c.node).toBe(firstNode);
      expect(root.children.filter((ch) => ch === firstNode)).toHaveLength(1);
      topic.__emit(polygonMsg('robot_1/base_link')); // different frame
      expect(c.node).toBe(firstNode); // same node, retargeted
      expect(c.node.frame_id).toBe('robot_1/base_link');
    });

    it('drops messages that have no header.frame_id (would orphan the node)', () => {
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: new FakeContainer(),
        tfClient,
      });
      const setSpy = vi.spyOn(c.polygonShape, 'setPolygon');
      fake.topics[fake.topics.length - 1].__emit({
        header: {},
        polygon: { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }] },
      });
      expect(c.node).toBeNull();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('passes negateY:false to the shape so SceneNode owns the Y handling', () => {
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: new FakeContainer(),
        tfClient,
      });
      expect(c.polygonShape.negateY).toBe(false);
    });
  });

  describe('unsubscribe()', () => {
    it('detaches the shape from rootObject in non-tfClient mode', () => {
      const root = new FakeContainer();
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: root,
      });
      expect(root.children).toContain(c.polygonShape);
      c.unsubscribe();
      expect(root.children).not.toContain(c.polygonShape);
    });

    it('detaches the SceneNode and tears down its TF subscription in tfClient mode', () => {
      const root = new FakeContainer();
      const tfClient = new fake.FakeTFClient({ fixedFrame: 'map' });
      const c = new PolygonStampedClient({
        ros: new fake.ROSLIB.Ros(),
        rootObject: root,
        tfClient,
      });
      fake.topics[fake.topics.length - 1].__emit(polygonMsg('robot_0/base_link'));
      const node = c.node;
      expect(root.children).toContain(node);
      c.unsubscribe();
      expect(root.children).not.toContain(node);
      expect(c.node).toBeNull();
      expect(tfClient.__subscriberCount('robot_0/base_link')).toBe(0);
    });
  });
});

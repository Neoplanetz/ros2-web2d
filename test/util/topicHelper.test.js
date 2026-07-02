import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeRoslib } from '../fakes/fakeRoslib.js';

const fake = createFakeRoslib();
globalThis.ROSLIB = fake.ROSLIB;
globalThis.ROS2D = globalThis.ROS2D ?? {};

await import('../../src/util/topicHelper.js');
const ROS2D = globalThis.ROS2D;

beforeEach(() => {
  fake.topics.length = 0;
  // Grace is module-level global state; reset to the documented default so a
  // test that changes it cannot leak into the next one.
  if (ROS2D.setTopicPoolGraceMs) { ROS2D.setTopicPoolGraceMs(5000); }
});

// ─── Backward compatibility: no pool requested ────────────────────────────
describe('ROS2D._makeTopic — backward compatibility (no pool)', () => {
  it('returns a distinct ROSLIB.Topic per call when pool is not requested', () => {
    const ros = new fake.ROSLIB.Ros();
    const a = ROS2D._makeTopic(ros, '/t', 'std_msgs/String', {});
    const b = ROS2D._makeTopic(ros, '/t', 'std_msgs/String', {});
    expect(fake.topics.length).toBe(2);
    expect(a).not.toBe(b);
  });

  it('forwards wire options onto the constructed topic (unchanged)', () => {
    const ros = new fake.ROSLIB.Ros();
    const t = ROS2D._makeTopic(ros, '/t', 'std_msgs/String', { throttle_rate: 100, compression: 'cbor' });
    t.subscribe(() => {});
    expect(t.subscribeOptions.throttle_rate).toBe(100);
    expect(t.subscribeOptions.compression).toBe('cbor');
  });

  it('unsubscribe on a non-pooled topic tears the real subscription down immediately', () => {
    const ros = new fake.ROSLIB.Ros();
    const t = ROS2D._makeTopic(ros, '/t', 'std_msgs/String', {});
    t.subscribe(() => {});
    expect(t._subs).toHaveLength(1);
    t.unsubscribe();
    expect(t._subs).toHaveLength(0);
  });
});

// ─── Shared pool: dedup + fan-out + key granularity ───────────────────────
describe('ROS2D._makeTopic — shared pool (pool:true) dedup', () => {
  it('two consumers on the same (topic,type,opts) share ONE ROSLIB.Topic', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/pose', 'geometry_msgs/PoseStamped', { pool: true }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/pose', 'geometry_msgs/PoseStamped', { pool: true }).subscribe(() => {});
    expect(fake.topics.length).toBe(1);
  });

  it('each pooled consumer receives every message', () => {
    const ros = new fake.ROSLIB.Ros();
    const cbA = vi.fn(); const cbB = vi.fn();
    ROS2D._makeTopic(ros, '/pose', 'T', { pool: true }).subscribe(cbA);
    ROS2D._makeTopic(ros, '/pose', 'T', { pool: true }).subscribe(cbB);
    fake.topics[0].__emit({ n: 1 });
    expect(cbA).toHaveBeenCalledWith({ n: 1 });
    expect(cbB).toHaveBeenCalledWith({ n: 1 });
  });

  it('the pooled real topic carries the forwarded wire options', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/pose', 'T', { pool: true, throttle_rate: 100, compression: 'cbor' }).subscribe(() => {});
    expect(fake.topics[0].subscribeOptions.throttle_rate).toBe(100);
    expect(fake.topics[0].subscribeOptions.compression).toBe('cbor');
  });

  it('different topic name → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/b', 'T', { pool: true }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('different messageType → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T1', { pool: true }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/a', 'T2', { pool: true }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('different wire opts (throttle_rate) → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, throttle_rate: 100 }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, throttle_rate: 200 }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('different compression → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, compression: 'none' }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, compression: 'cbor' }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('different ros connection → separate pools (never shared across connections)', () => {
    const ros1 = new fake.ROSLIB.Ros();
    const ros2 = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros1, '/a', 'T', { pool: true }).subscribe(() => {});
    ROS2D._makeTopic(ros2, '/a', 'T', { pool: true }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });
});

// ─── Refcount teardown + deferred-unsubscribe churn safety ────────────────
describe('ROS2D._makeTopic — shared pool teardown + churn safety', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the real subscription live while any consumer remains', () => {
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(() => {});
    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(() => {});
    const real = fake.topics[0];
    h1.unsubscribe();
    expect(real._subs).toHaveLength(1); // one consumer left → still subscribed
    h2.unsubscribe();
    expect(real._subs).toHaveLength(1); // last gone but teardown deferred
  });

  it('defers the real unsubscribe by the grace window, then tears down', () => {
    const ros = new fake.ROSLIB.Ros();
    const h = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h.subscribe(() => {});
    const real = fake.topics[0];
    h.unsubscribe();
    expect(real._subs).toHaveLength(1);
    vi.advanceTimersByTime(4999);
    expect(real._subs).toHaveLength(1); // still within grace
    vi.advanceTimersByTime(1);
    expect(real._subs).toHaveLength(0); // grace elapsed → torn down
  });

  it('grace of 0 tears down immediately on the last release', () => {
    ROS2D.setTopicPoolGraceMs(0);
    const ros = new fake.ROSLIB.Ros();
    const h = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h.subscribe(() => {});
    const real = fake.topics[0];
    h.unsubscribe();
    expect(real._subs).toHaveLength(0);
  });

  it('re-acquiring within the grace window reuses the live topic (cancels teardown)', () => {
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(() => {});
    const real = fake.topics[0];
    h1.unsubscribe();             // schedules teardown at t=5000
    vi.advanceTimersByTime(3000); // partway through grace
    const cb = vi.fn();
    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(cb);
    expect(fake.topics.length).toBe(1); // reused, no new topic
    vi.advanceTimersByTime(5000);       // past the original teardown time
    expect(real._subs).toHaveLength(1); // teardown was cancelled → still live
    real.__emit({ x: 1 });
    expect(cb).toHaveBeenCalledWith({ x: 1 });
  });

  it('a re-acquire then release restarts the grace window (stale timer cannot tear down early)', () => {
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(() => {});
    const real = fake.topics[0];
    h1.unsubscribe();             // schedules teardown T1 at t=5000
    vi.advanceTimersByTime(3000); // t=3000
    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(() => {}); // cancels T1
    h2.unsubscribe();             // t=3000, schedules fresh T2 at t=8000
    vi.advanceTimersByTime(2500); // t=5500 — past T1's original fire time
    expect(real._subs).toHaveLength(1); // T1 was cancelled, so still live
    vi.advanceTimersByTime(2500); // t=8000 — T2 fires
    expect(real._subs).toHaveLength(0);
  });

  it('after full teardown a fresh acquire builds a NEW underlying topic', () => {
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(() => {});
    h1.unsubscribe();
    vi.advanceTimersByTime(5000); // full teardown
    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });
});

// ─── Late-join replay (latched-topic transparency) ────────────────────────
describe('ROS2D._makeTopic — shared pool late-join replay', () => {
  it('replays the retained last message to a consumer that joins a live topic', () => {
    const ros = new fake.ROSLIB.Ros();
    const cbA = vi.fn();
    ROS2D._makeTopic(ros, '/map', 'nav_msgs/OccupancyGrid', { pool: true }).subscribe(cbA);
    fake.topics[0].__emit({ map: 1 });
    const cbB = vi.fn();
    ROS2D._makeTopic(ros, '/map', 'nav_msgs/OccupancyGrid', { pool: true }).subscribe(cbB);
    expect(cbB).toHaveBeenCalledWith({ map: 1 }); // late joiner gets the latched msg
    expect(cbA).toHaveBeenCalledTimes(1);         // A not re-delivered by B joining
  });

  it('does not replay to the first consumer (nothing retained yet)', () => {
    const ros = new fake.ROSLIB.Ros();
    const cb = vi.fn();
    ROS2D._makeTopic(ros, '/map', 'T', { pool: true }).subscribe(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not replay a stale message across a full teardown', () => {
    vi.useFakeTimers();
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/map', 'T', { pool: true }); h1.subscribe(() => {});
    fake.topics[0].__emit({ map: 1 });
    h1.unsubscribe();
    vi.advanceTimersByTime(5000); // teardown drops the retained message
    const cb = vi.fn();
    ROS2D._makeTopic(ros, '/map', 'T', { pool: true }).subscribe(cb); // fresh entry
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── Consumer isolation ───────────────────────────────────────────────────
describe('ROS2D._makeTopic — shared pool consumer isolation', () => {
  it('one consumer throwing does not starve the others', () => {
    const ros = new fake.ROSLIB.Ros();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ROS2D._makeTopic(ros, '/t', 'T', { pool: true }).subscribe(() => { throw new Error('boom'); });
    const good = vi.fn();
    ROS2D._makeTopic(ros, '/t', 'T', { pool: true }).subscribe(good);
    fake.topics[0].__emit({ n: 1 });
    expect(good).toHaveBeenCalledWith({ n: 1 });
    errSpy.mockRestore();
  });

  it('unsubscribing one consumer leaves the others subscribed and receiving', () => {
    const ros = new fake.ROSLIB.Ros();
    const cbA = vi.fn(); const cbB = vi.fn();
    const hA = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); hA.subscribe(cbA);
    const hB = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); hB.subscribe(cbB);
    hA.unsubscribe();
    fake.topics[0].__emit({ n: 1 });
    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).toHaveBeenCalledWith({ n: 1 });
  });

  it('calling unsubscribe twice on a handle is safe', () => {
    const ros = new fake.ROSLIB.Ros();
    const h = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h.subscribe(() => {});
    h.unsubscribe();
    expect(() => h.unsubscribe()).not.toThrow();
  });
});

// ─── v1.11.1: teardown identity under double-unsubscribe ───────────────────
// A handle can have unsubscribe() called more than once (e.g. a non-continuous
// OccupancyGridClient auto-unsubscribes on the first message, then a later
// user teardown calls unsubscribe() again). A second unsubscribe while the
// entry is already draining must NOT schedule a second, un-cancellable grace
// timer, and a stale timer must never evict a rebuilt same-key entry.
describe('ROS2D._makeTopic — shared pool teardown identity (double-unsubscribe)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('double unsubscribe + re-acquire keeps dedup intact and does not leak the topic', () => {
    const ros = new fake.ROSLIB.Ros();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(() => {});
    const real1 = fake.topics[0];
    h1.unsubscribe();               // schedule teardown (T1)
    vi.advanceTimersByTime(2000);
    h1.unsubscribe();               // second unsubscribe while draining — must stay safe
    vi.advanceTimersByTime(3000);   // t=5000 → real1 torn down
    expect(real1._subs).toHaveLength(0);

    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(() => {});
    const real2 = fake.topics[1];
    vi.advanceTimersByTime(5000);   // any stale timer must NOT evict h2's live entry

    // dedup intact: a further acquire on the same key reuses h2's entry (no 3rd topic)
    const h3 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h3.subscribe(() => {});
    expect(fake.topics.length).toBe(2);

    // no leak: once every consumer leaves, real2 tears down after grace
    h2.unsubscribe(); h3.unsubscribe();
    vi.advanceTimersByTime(5000);
    expect(real2._subs).toHaveLength(0);
  });

  it('a second unsubscribe while draining does not reschedule the teardown timer', () => {
    const ros = new fake.ROSLIB.Ros();
    const h = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h.subscribe(() => {});
    const real = fake.topics[0];
    h.unsubscribe();                // teardown at t=5000
    vi.advanceTimersByTime(1000);
    h.unsubscribe();                // must NOT push teardown out to t=6000
    vi.advanceTimersByTime(4000);   // t=5000 → original teardown fires
    expect(real._subs).toHaveLength(0);
  });
});

// ─── v1.11.1: consumer identity is per-subscribe, not per-callback ─────────
describe('ROS2D._makeTopic — shared pool consumer identity (shared callback)', () => {
  it('two handles using the SAME callback are independent', () => {
    const ros = new fake.ROSLIB.Ros();
    const shared = vi.fn();
    const h1 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h1.subscribe(shared);
    const h2 = ROS2D._makeTopic(ros, '/t', 'T', { pool: true }); h2.subscribe(shared);
    h1.unsubscribe();               // must not detach h2's subscription
    fake.topics[0].__emit({ n: 1 });
    expect(shared).toHaveBeenCalledTimes(1); // h2 still receives
    expect(shared).toHaveBeenCalledWith({ n: 1 });
  });
});

// ─── v1.11.1: coverage gaps flagged by review ──────────────────────────────
describe('ROS2D._makeTopic — shared pool key granularity + mid-dispatch (coverage)', () => {
  it('different queue_length → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, queue_length: 1 }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, queue_length: 10 }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('different reconnect_on_close → separate underlying topics', () => {
    const ros = new fake.ROSLIB.Ros();
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, reconnect_on_close: true }).subscribe(() => {});
    ROS2D._makeTopic(ros, '/a', 'T', { pool: true, reconnect_on_close: false }).subscribe(() => {});
    expect(fake.topics.length).toBe(2);
  });

  it('a consumer unsubscribing during dispatch does not starve its siblings', () => {
    const ros = new fake.ROSLIB.Ros();
    const got = [];
    const hA = ROS2D._makeTopic(ros, '/t', 'T', { pool: true });
    const hB = ROS2D._makeTopic(ros, '/t', 'T', { pool: true });
    hA.subscribe(() => { got.push('A'); hA.unsubscribe(); }); // self-detach mid-dispatch
    hB.subscribe(() => { got.push('B'); });
    fake.topics[0].__emit({ n: 1 });
    expect(got).toContain('A');
    expect(got).toContain('B');
  });
});

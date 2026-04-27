/**
 * @fileOverview
 * Internal helper for constructing a ROSLIB.Topic with the standard
 * (ros, name, messageType) trio plus the optional Topic options every
 * subscribe-only Client wants to forward to ROSLIB.
 *
 * Forwarded keys (rosbridge subscribe op payload + connection):
 *   - throttle_rate     : ms between delivered messages
 *   - queue_length      : bridge-side subscriber queue length
 *   - compression       : 'none' | 'cbor' | 'cbor-raw' | 'png'
 *   - reconnect_on_close: auto-resubscribe after disconnect
 *
 * Intentionally NOT forwarded (advertise-only at the rosbridge protocol
 * level, no-op for subscribers): `queue_size`, `latch`. They were
 * forwarded in v1.4.1/v1.4.2 by mistake; removed in v1.4.3.
 *
 * Lives in its own file (not in Ros2D.js) so the helper attaches
 * directly to the ROS2D global instead of being shadowed by the
 * `var ROS2D = ROS2D || {...}` declaration at the top of Ros2D.js.
 *
 * undefined values are passed through so ROSLIB.Topic's own
 * destructure defaults still apply when the caller did not opt in.
 */
ROS2D._makeTopic = function(ros, name, messageType, options) {
  options = options || {};
  return new ROSLIB.Topic({
    ros: ros,
    name: name,
    messageType: messageType,
    throttle_rate: options.throttle_rate,
    queue_length: options.queue_length,
    compression: options.compression,
    reconnect_on_close: options.reconnect_on_close
  });
};

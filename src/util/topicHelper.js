/**
 * @fileOverview
 * Internal helper for constructing a ROSLIB.Topic with the standard
 * (ros, name, messageType) trio plus the optional Topic options every
 * Client wants to forward to ROSLIB (throttle_rate, queue_size,
 * queue_length, compression, latch, reconnect_on_close). Centralizing
 * the list of forwarded keys here means adding a new one (e.g. a
 * future qos field) is a one-file change instead of touching every
 * client.
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
    queue_size: options.queue_size,
    queue_length: options.queue_length,
    compression: options.compression,
    latch: options.latch,
    reconnect_on_close: options.reconnect_on_close
  });
};

export function _makeTopic(ros: any, name: any, messageType: any, options: any): {
    name: any;
    messageType: any;
    subscribe: (cb: any) => void;
    unsubscribe: () => void;
} | ROSLIB.Topic<unknown>;
export function setTopicPoolGraceMs(ms: number): void;
import * as ROSLIB from 'roslib';

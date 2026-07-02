import { createRequire } from 'node:module';

// plugin that transpiles output into commonjs format
import commonjs from '@rollup/plugin-commonjs';
// plugin that transpiles es6 to es5 for legacy platforms
import buble from '@rollup/plugin-buble';
// plugin that shows output file info
import filesize from 'rollup-plugin-filesize';
/// plugin that resolves node module imports
import { nodeResolve } from '@rollup/plugin-node-resolve';
// plugin that minifies and obfuscates code
import terser from '@rollup/plugin-terser';

const pkg = createRequire(import.meta.url)('./package.json');
const input = 'src-esm/index.js';

const browserGlobals = {
  roslib: 'ROSLIB',
  createjs: 'createjs',
};

const moduleGlobals = {
  roslib: 'ROSLIB',
  createjs: 'createjs',
};

const outputFiles = {
  commonModule: pkg.main,
  esModule: pkg.module,
  browserGlobalMinified: './build/ros2d.min.js',
};

export default [
  // build main as ES5 in CommonJS format for compatibility
  {
    input,
    output: {
      name: 'ROS2D',
      file: outputFiles.commonModule,
      format: 'cjs',
      globals: {
        ...moduleGlobals,
      }
    },
    external: [
      ...Object.keys(moduleGlobals)
    ],
    plugins: [
      nodeResolve({ browser: true }),
      commonjs(),
      buble(),
      filesize(),
    ],
  },
  // build module as ES5 in ES module format for modern tooling
  {
    input,
    output: {
      name: 'ROS2D',
      file: outputFiles.esModule,
      format: 'es',
      globals: {
        ...moduleGlobals,
      }
    },
    external: [
      ...Object.keys(moduleGlobals)
    ],
    plugins: [
      nodeResolve({ browser: true }),
      commonjs(),
      buble(),
      filesize(),
    ],
  },
  // build browser as IIFE module for script tag inclusion, minified
  // Usage:
  // <script src="../build/ros2d.min.js"></script>
  {
    input,
    output: {
      name: 'ROS2D',
      file: outputFiles.browserGlobalMinified,
      format: 'iife',
      globals: {
        ...browserGlobals,
      },
    },
    external: [
      ...Object.keys(browserGlobals),
    ],
    plugins: [
      nodeResolve({ browser: true }),
      commonjs(),
      filesize(),
      terser(),
    ],
  },
];

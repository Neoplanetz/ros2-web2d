import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// examples/src/lib/ros2dHelpers.js imports from 'ros2-web2d', which Node
// resolves via the root package's self-reference at runtime. Vite's test
// transformer does not always walk up to the root package.json (the
// examples/ package.json is reached first), so point the bare specifier
// at the root build explicitly. test/examples/ros2dHelpers.test.js then
// mocks the module anyway, but the alias makes the static import
// resolvable during file transformation.
const ros2WebRoot = fileURLToPath(new URL('./build/ros2d.esm.js', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'ros2-web2d': ros2WebRoot,
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['test/**/*.test.js'],
  },
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Release consistency guard: src/Ros2D.js exposes the library version as
// ROS2D.REVISION, and it must be bumped together with package.json "version".
// It silently drifted (stuck at 1.8.1 through the 1.9.0 / 1.10.0 releases), so
// this text-level check pins the two together to catch a missed bump.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('release version consistency', () => {
  it('src/Ros2D.js REVISION matches package.json version', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const ros2d = readFileSync(join(root, 'src/Ros2D.js'), 'utf8');
    const match = ros2d.match(/REVISION\s*:\s*'([^']+)'/);
    expect(match, 'REVISION literal not found in src/Ros2D.js').toBeTruthy();
    expect(match[1]).toBe(pkg.version);
  });
});

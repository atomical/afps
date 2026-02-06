import { describe, expect, it } from 'vitest';
import { sanitizeCollider, sanitizeColliders } from '../../src/world/collision';

describe('collision collider sanitization', () => {
  it('normalizes collider values and clamps optional fields', () => {
    const collider = sanitizeCollider({
      id: 4.9,
      minX: Number.NaN,
      minY: -2,
      minZ: 0,
      maxX: 3,
      maxY: 2,
      maxZ: 5,
      surfaceType: 999,
      tags: -7
    });

    expect(collider).toEqual({
      id: 4,
      minX: 0,
      minY: -2,
      minZ: 0,
      maxX: 3,
      maxY: 2,
      maxZ: 5,
      surfaceType: 255,
      tags: 0
    });
  });

  it('rejects invalid collider bounds', () => {
    expect(
      sanitizeCollider({
        id: 1,
        minX: 1,
        minY: 0,
        minZ: 0,
        maxX: 1,
        maxY: 2,
        maxZ: 3
      })
    ).toBeNull();
  });

  it('sanitizes collider arrays by filtering invalid entries and sorting by id', () => {
    expect(sanitizeColliders(undefined)).toEqual([]);
    expect(sanitizeColliders([])).toEqual([]);

    const colliders = sanitizeColliders([
      { id: 9, minX: 3, minY: 0, minZ: 0, maxX: 4, maxY: 1, maxZ: 2, surfaceType: 2.9 },
      { id: 2, minX: -2, minY: -1, minZ: 0, maxX: -1, maxY: 1, maxZ: 2, surfaceType: Number.NaN },
      { id: 5, minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 1 }
    ]);

    expect(colliders).toEqual([
      { id: 2, minX: -2, minY: -1, minZ: 0, maxX: -1, maxY: 1, maxZ: 2, surfaceType: 0, tags: 0 },
      { id: 9, minX: 3, minY: 0, minZ: 0, maxX: 4, maxY: 1, maxZ: 2, surfaceType: 2, tags: 0 }
    ]);
  });
});

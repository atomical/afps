import { describe, expect, it } from 'vitest';
import { ShaderLib } from 'three';

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

describe('shader snapshots', () => {
  it('keeps toon shader sources stable', () => {
    const toon = ShaderLib.toon;
    const summary = {
      vertexHash: hashString(toon.vertexShader ?? ''),
      fragmentHash: hashString(toon.fragmentShader ?? ''),
      vertexLength: toon.vertexShader?.length ?? 0,
      fragmentLength: toon.fragmentShader?.length ?? 0
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "fragmentHash": "c3688ad1",
        "fragmentLength": 1786,
        "vertexHash": "1f011c7d",
        "vertexLength": 1075,
      }
    `);
  });
});

export interface AabbCollider {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  surfaceType?: number;
  tags?: number;
}

const toNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const sanitizeCollider = (input: AabbCollider): AabbCollider | null => {
  const minX = toNumber(input.minX);
  const minY = toNumber(input.minY);
  const minZ = toNumber(input.minZ);
  const maxX = toNumber(input.maxX);
  const maxY = toNumber(input.maxY);
  const maxZ = toNumber(input.maxZ);
  if (!(minX < maxX && minY < maxY && minZ < maxZ)) {
    return null;
  }
  const id = Number.isFinite(input.id) ? Math.floor(input.id) : 0;
  const surfaceType = Number.isFinite(input.surfaceType) ? Math.max(0, Math.min(255, Math.floor(input.surfaceType!))) : 0;
  const tags = Number.isFinite(input.tags) ? Math.max(0, Math.floor(input.tags!)) : 0;
  return { id, minX, minY, minZ, maxX, maxY, maxZ, surfaceType, tags };
};

export const sanitizeColliders = (colliders: readonly AabbCollider[] | null | undefined): AabbCollider[] => {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    return [];
  }
  const sanitized: AabbCollider[] = [];
  for (const collider of colliders) {
    const next = sanitizeCollider(collider);
    if (next) {
      sanitized.push(next);
    }
  }
  sanitized.sort((a, b) => a.id - b.id);
  return sanitized;
};

#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from pathlib import Path


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise
    except Exception as exc:  # pragma: no cover - diagnostic path
        raise RuntimeError(f"failed to read {path}: {exc}") from exc


def is_on_grid(value: float, grid: float, epsilon: float = 1e-6) -> bool:
    return math.isfinite(value) and abs(value / grid - round(value / grid)) <= epsilon


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    map_path = root / "client/public/assets/environments/cc0/kenney_city_kit_suburban_20/map.json"
    glb_root = root / "client/public/assets/environments/cc0/kenney_city_kit_suburban_20/glb"
    config_path = root / "shared/sim/config.json"

    errors: list[str] = []

    if not map_path.exists():
        print(f"[error] map.json not found: {map_path}", file=sys.stderr)
        return 1
    if not glb_root.exists():
        print(f"[error] GLB root not found: {glb_root}", file=sys.stderr)
        return 1

    data = load_json(map_path)
    placements = data.get("placements")
    if not isinstance(placements, list):
        print("[error] map.json placements must be an array", file=sys.stderr)
        return 1

    config = load_json(config_path)
    half_size = config.get("arenaHalfSize")
    if not isinstance(half_size, (int, float)):
        half_size = 50.0

    for idx, placement in enumerate(placements):
        if not isinstance(placement, dict):
            errors.append(f"placement[{idx}] is not an object")
            continue
        file_name = placement.get("file")
        position = placement.get("position")
        rotation = placement.get("rotation")
        scale = placement.get("scale")
        if not isinstance(file_name, str) or not file_name:
            errors.append(f"placement[{idx}] missing file")
            continue
        asset_path = glb_root / file_name
        if not asset_path.exists():
            errors.append(f"placement[{idx}] missing GLB {file_name}")
        if not (isinstance(position, list) and len(position) == 3):
            errors.append(f"placement[{idx}] invalid position")
            continue
        try:
            x, y, z = (float(position[0]), float(position[1]), float(position[2]))
        except Exception:
            errors.append(f"placement[{idx}] non-numeric position {position}")
            continue
        if rotation is not None:
            if not (isinstance(rotation, list) and len(rotation) == 3):
                errors.append(f"placement[{idx}] invalid rotation")
            else:
                try:
                    rx, ry, rz = (float(rotation[0]), float(rotation[1]), float(rotation[2]))
                    if not (math.isfinite(rx) and math.isfinite(ry) and math.isfinite(rz)):
                        errors.append(f"placement[{idx}] non-finite rotation {rotation}")
                except Exception:
                    errors.append(f"placement[{idx}] non-numeric rotation {rotation}")
        if scale is not None:
            if not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
                errors.append(f"placement[{idx}] invalid scale {scale}")
        if abs(x) > half_size or abs(z) > half_size:
            errors.append(f"placement[{idx}] {file_name} outside arenaHalfSize ({x}, {z})")
        if file_name.startswith("roads/road-"):
            if not is_on_grid(x, 4.0) or not is_on_grid(z, 4.0) or abs(y) > 1e-6:
                errors.append(f"placement[{idx}] road off grid {file_name} @ {x},{y},{z}")

    if errors:
        print("[error] Suburban map validation failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("[ok] Suburban map validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

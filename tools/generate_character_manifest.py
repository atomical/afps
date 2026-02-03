#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable


DEFAULT_HAND_BONE = "RightHand"
DEFAULT_WEAPON_OFFSET = {
    "position": [0.04, 0.02, -0.02],
    "rotation": [0.0, 1.57, 0.0],
    "scale": 1.0,
}

PLACEHOLDER_IDS = [
    ("placeholder-a", "Placeholder Alpha"),
    ("placeholder-b", "Placeholder Bravo"),
    ("placeholder-c", "Placeholder Charlie"),
    ("placeholder-d", "Placeholder Delta"),
]


def gather_files(root: Path, exts: Iterable[str]) -> list[Path]:
    results: list[Path] = []
    exts_lower = {ext.lower() for ext in exts}
    if not root.exists():
        return results
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part.lower() == "source" for part in path.parts):
            continue
        if path.suffix.lower() not in exts_lower:
            continue
        results.append(path)
    return sorted(results)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "-", value.lower())
    return slug.strip("-_")


def titleize(value: str) -> str:
    words = re.split(r"[-_]+", value)
    return " ".join(word.capitalize() for word in words if word)


def to_public_url(path: Path, public_root: Path) -> str:
    rel = path.relative_to(public_root).as_posix()
    return f"/{rel}"


def resolve_previews(previews_dir: Path) -> dict[str, Path]:
    preview_map: dict[str, Path] = {}
    for path in gather_files(previews_dir, [".png", ".jpg", ".jpeg", ".svg"]):
        preview_map[path.stem] = path
    return preview_map


def resolve_skins(asset_root: Path) -> list[Path]:
    skins_dir = asset_root / "skins"
    if skins_dir.exists():
        return gather_files(skins_dir, [".png", ".jpg", ".jpeg"])
    candidates = gather_files(asset_root, [".png", ".jpg", ".jpeg"])
    filtered: list[Path] = []
    for path in candidates:
        if "previews" in path.parts:
            continue
        if "models" in path.parts or "animations" in path.parts:
            continue
        filtered.append(path)
    return filtered


def resolve_models(asset_root: Path) -> list[Path]:
    models_dir = asset_root / "models"
    if models_dir.exists():
        return gather_files(models_dir, [".glb", ".gltf", ".fbx"])
    candidates = gather_files(asset_root, [".glb", ".gltf", ".fbx"])
    filtered: list[Path] = []
    for path in candidates:
        if "previews" in path.parts or "skins" in path.parts:
            continue
        if path.name == "manifest.json":
            continue
        filtered.append(path)
    return filtered


def build_entries(
    skins: list[Path],
    model: Path | None,
    previews: dict[str, Path],
    public_root: Path,
) -> list[dict]:
    entries: list[dict] = []
    used_ids: set[str] = set()

    for skin in skins:
        stem = skin.stem
        base_id = slugify(stem) or f"skin-{len(entries) + 1}"
        entry_id = base_id
        suffix = 2
        while entry_id in used_ids:
            entry_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(entry_id)

        preview_path = previews.get(stem)
        entry = {
            "id": entry_id,
            "displayName": titleize(stem) or entry_id,
            "skinUrl": to_public_url(skin, public_root),
            "handBone": DEFAULT_HAND_BONE,
            "weaponOffset": DEFAULT_WEAPON_OFFSET,
        }
        if model:
            entry["modelUrl"] = to_public_url(model, public_root)
        if preview_path:
            entry["previewUrl"] = to_public_url(preview_path, public_root)
        else:
            entry["previewUrl"] = to_public_url(skin, public_root)
        entries.append(entry)

    return entries


def build_placeholder_entries(previews: dict[str, Path], public_root: Path) -> list[dict]:
    entries: list[dict] = []
    for placeholder_id, label in PLACEHOLDER_IDS:
        entry = {
            "id": placeholder_id,
            "displayName": label,
            "handBone": DEFAULT_HAND_BONE,
            "weaponOffset": DEFAULT_WEAPON_OFFSET,
        }
        preview = previews.get(placeholder_id)
        if preview:
            entry["previewUrl"] = to_public_url(preview, public_root)
        entries.append(entry)
    return entries


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    asset_root = root / "client/public/assets/characters/kenney_animated_characters_1"
    manifest_path = asset_root / "manifest.json"
    public_root = root / "client/public"

    if not asset_root.exists():
        print(f"[error] asset root not found: {asset_root}", file=sys.stderr)
        return 1

    previews = resolve_previews(asset_root / "previews")
    models = resolve_models(asset_root)
    skins = resolve_skins(asset_root)

    model = models[0] if models else None
    if models[1:]:
        print(f"[warn] multiple model files found; using {model.name}")

    if skins:
        entries = build_entries(skins, model, previews, public_root)
    else:
        entries = build_placeholder_entries(previews, public_root)

    if not entries:
        print("[error] no entries generated", file=sys.stderr)
        return 1

    manifest = {
        "defaultId": entries[0]["id"],
        "entries": entries,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[ok] wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""CSV backbone loading and version metadata."""

from __future__ import annotations

from pathlib import Path
from typing import ClassVar, List

from doe_expert_engine.engine.recommender import BACKBONE_PATH, load_rules
from doe_expert_engine.models.schemas import DesignRule


class BackboneLoader:
    """Load recommendation rules from the active CSV backbone."""

    _knowledge_dir: ClassVar[Path] = BACKBONE_PATH.parent
    _active_path: ClassVar[Path] = BACKBONE_PATH
    _rules: ClassVar[List[DesignRule]] = load_rules(BACKBONE_PATH)

    @classmethod
    def rules(cls) -> List[DesignRule]:
        return list(cls._rules)

    @classmethod
    def rule_source(cls) -> str:
        return cls._active_path.name

    @classmethod
    def backbone_version(cls) -> str:
        return _version_from_filename(cls._active_path.name)

    @classmethod
    def reload(cls, backbone_filename: str) -> List[DesignRule]:
        next_path = Path(backbone_filename)
        if not next_path.is_absolute():
            next_path = cls._knowledge_dir / next_path
        cls._rules = load_rules(next_path)
        cls._active_path = next_path
        return cls.rules()


def _version_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    prefix = "backbone_"
    if not stem.startswith(prefix):
        return stem

    version = stem[len(prefix) :]
    if version.startswith("v") and version[1:].isdigit():
        return f"{version}.0"
    return version

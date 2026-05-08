"""Small, testable scientific guardrails for GlycoQuant UI/provenance logic.

The frontend owns most presentation logic, but these pure helpers keep the same
truth rules testable in Python: demo/proxy datasets must not become biological
claims, placeholder channels must not be interpreted as real markers, and score
language remains explicitly unvalidated until controls and replicate metadata
exist.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

InterpretationLevel = Literal[
    "technical_demo",
    "marker_quantification",
    "phenotype_comparison",
    "validated_biological_inference",
]

CORE_MARKERS = ("nuclear", "wga_proxy", "actin", "yap", "focal_adhesion")
REQUIRED_METADATA = ("condition", "biologicalReplicate", "technicalReplicate")
PERTURBATION_METADATA = ("perturbation", "substrateStiffness", "mechanicalStimulation")


def is_real_marker(config: Mapping[str, Any], marker: str) -> bool:
    """Return whether a marker is declared as real, never inferred from a label."""

    real_markers = config.get("realMarkers")
    if isinstance(real_markers, Mapping) and marker in real_markers:
        return bool(real_markers[marker])

    channels = config.get("channels")
    if isinstance(channels, Mapping):
        item = channels.get(marker)
        if isinstance(item, Mapping) and "real" in item:
            return bool(item["real"])

    channel_mapping = config.get("channelMapping")
    if isinstance(channel_mapping, Mapping):
        item = channel_mapping.get(marker)
        if isinstance(item, Mapping):
            return not bool(item.get("placeholder", True))

    return False


def biological_interpretation_allowed(config: Mapping[str, Any]) -> bool:
    return bool(config.get("biologicalInterpretationAllowed", False))


def placeholder_label(marker: str, config: Mapping[str, Any]) -> str:
    if marker == "yap" and not is_real_marker(config, marker):
        return "YAP/TAZ placeholder module - not computed from real YAP/TAZ staining."
    if marker == "focal_adhesion" and not is_real_marker(config, marker):
        return "Focal adhesion placeholder module - not computed from real adhesion staining."
    return "real marker" if is_real_marker(config, marker) else "placeholder module"


def demo_disclaimer(config: Mapping[str, Any]) -> str:
    if config.get("datasetType") == "technical_demo":
        return (
            "Technical demo only. Do not interpret as glycocalyx-mechanotransduction biology."
        )
    return ""


def placeholder_modules_excluded_by_default(config: Mapping[str, Any]) -> bool:
    placeholder_modules = config.get("placeholderModules")
    if isinstance(placeholder_modules, Mapping):
        return not bool(placeholder_modules.get("includeByDefault", False))
    return True


def has_condition_metadata(config: Mapping[str, Any]) -> bool:
    metadata = config.get("metadataAvailable") or config.get("conditionMetadataSchema") or {}
    if not isinstance(metadata, Mapping):
        return False
    return all(bool(metadata.get(key, False)) for key in REQUIRED_METADATA) and any(
        bool(metadata.get(key, False)) for key in PERTURBATION_METADATA
    )


def has_validated_controls(config: Mapping[str, Any]) -> bool:
    controls = config.get("validationControls")
    if isinstance(controls, Mapping):
        values = list(controls.values())
        return bool(values) and all(value == "validated" for value in values)

    required_controls = config.get("requiredControls")
    provided = config.get("providedControls")
    if not isinstance(required_controls, Mapping) or not isinstance(provided, Mapping):
        return False

    required = {
        control
        for group in required_controls.values()
        if isinstance(group, Sequence) and not isinstance(group, (str, bytes))
        for control in group
    }
    validated = {name for name, status in provided.items() if status == "validated"}
    return bool(required) and required.issubset(validated)


def get_interpretation_level(config: Mapping[str, Any]) -> InterpretationLevel:
    if config.get("datasetType") == "technical_demo" or not biological_interpretation_allowed(
        config
    ):
        return "technical_demo"

    if not all(is_real_marker(config, marker) for marker in CORE_MARKERS):
        return "marker_quantification"

    if not has_condition_metadata(config):
        return "marker_quantification"

    if has_validated_controls(config):
        return "validated_biological_inference"

    return "phenotype_comparison"


def score_validation_warning(config: Mapping[str, Any]) -> str:
    if has_validated_controls(config):
        return ""
    return (
        "Mechanophenotype prototype score is not biologically validated until benchmarked "
        "against positive and negative controls."
    )


def field_relative_zscore_warning(config: Mapping[str, Any]) -> str:
    if has_condition_metadata(config):
        return ""
    return "Field-relative z-scores should not be interpreted as treatment effects."


def analysis_ready_count(cells: Sequence[Mapping[str, Any]]) -> int:
    """Count cells without blocking QC flags."""

    ready = 0
    for cell in cells:
        blocking = cell.get("blockingFlags") or cell.get("blocking_flags") or []
        if not blocking:
            ready += 1
    return ready


def methods_export_text(config: Mapping[str, Any]) -> str:
    markers = "\n".join(
        f"- {marker}: real={is_real_marker(config, marker)}; {placeholder_label(marker, config)}"
        for marker in CORE_MARKERS
    )
    warnings = [
        demo_disclaimer(config),
        "WGA reports lectin-accessible GlcNAc/sialic-acid-rich glycoconjugates, not complete glycocalyx composition or thickness.",
        score_validation_warning(config),
        field_relative_zscore_warning(config),
    ]
    return "\n".join(
        [
            "# GlycoQuant Methods Export",
            "## Dataset provenance",
            f"- dataset type: {config.get('datasetType', 'unknown')}",
            f"- biological interpretation allowed: {biological_interpretation_allowed(config)}",
            "## Channel mapping and marker truth",
            markers,
            "## Warnings",
            *(f"- {warning}" for warning in warnings if warning),
        ]
    )

from __future__ import annotations

import json
from pathlib import Path

from glycoquant.scientific_guardrails import (
    analysis_ready_count,
    demo_disclaimer,
    field_relative_zscore_warning,
    get_interpretation_level,
    is_real_marker,
    methods_export_text,
    placeholder_label,
    placeholder_modules_excluded_by_default,
    score_validation_warning,
)


ROOT = Path(__file__).resolve().parents[1]


def load_config(name: str) -> dict:
    return json.loads((ROOT / "configs" / name).read_text(encoding="utf-8"))


def test_fake_yap_channel_cannot_be_interpreted_as_real_yap() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert not is_real_marker(config, "yap")
    assert "not computed from real YAP/TAZ staining" in placeholder_label("yap", config)


def test_fake_paxillin_channel_cannot_produce_real_fa_maturity_label() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert not is_real_marker(config, "focal_adhesion")
    assert "not computed from real adhesion staining" in placeholder_label(
        "focal_adhesion", config
    )


def test_demo_dataset_always_shows_disclaimer() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert get_interpretation_level(config) == "technical_demo"
    assert "Technical demo only" in demo_disclaimer(config)


def test_mechanophenotype_score_warns_without_validation_controls() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert "not biologically validated" in score_validation_warning(config)


def test_placeholder_modules_are_excluded_by_default() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert placeholder_modules_excluded_by_default(config)
    assert config["scoreWeights"]["yap_nc_ratio"] == 0
    assert config["scoreWeights"]["focal_adhesion_maturity"] == 0


def test_field_relative_zscore_warning_without_condition_metadata() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    assert "Field-relative z-scores" in field_relative_zscore_warning(config)


def test_qc_flags_exclude_cells_from_analysis_ready_count() -> None:
    cells = [
        {"cell_id": 1, "blockingFlags": []},
        {"cell_id": 2, "blockingFlags": ["edge-truncated cell"]},
        {"cell_id": 3, "blockingFlags": ["saturated WGA channel"]},
    ]
    assert analysis_ready_count(cells) == 1


def test_methods_export_includes_provenance_and_placeholder_warnings() -> None:
    config = load_config("demo_bbbc022_proxy.example.json")
    report = methods_export_text(config)
    assert "Dataset provenance" in report
    assert "technical_demo" in report
    assert "YAP/TAZ placeholder module" in report
    assert "not complete glycocalyx composition or thickness" in report


def test_target_assay_full_interpretation_requires_markers_metadata_and_controls() -> None:
    config = load_config("target_phd_assay.example.json")
    config["biologicalInterpretationAllowed"] = True
    config["realMarkers"] = {
        "nuclear": True,
        "wga_proxy": True,
        "actin": True,
        "yap": True,
        "focal_adhesion": True,
    }
    config["metadataAvailable"] = {
        "condition": True,
        "perturbation": True,
        "substrateStiffness": True,
        "mechanicalStimulation": False,
        "biologicalReplicate": True,
        "technicalReplicate": True,
    }
    config["validationControls"] = {
        "stiff substrate": "validated",
        "soft substrate": "validated",
        "ROCK inhibitor": "validated",
        "neuraminidase": "validated",
    }
    assert get_interpretation_level(config) == "validated_biological_inference"

    config["validationControls"]["ROCK inhibitor"] = "provided"
    assert get_interpretation_level(config) == "phenotype_comparison"

    config["realMarkers"]["yap"] = False
    assert get_interpretation_level(config) == "marker_quantification"

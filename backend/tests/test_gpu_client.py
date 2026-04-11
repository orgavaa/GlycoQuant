"""Unit tests for the GPU provider abstraction."""
from __future__ import annotations

import io

import numpy as np
import pytest

from backend.app import gpu_client
from backend.app.schemas import JobResult


def _minimal_job_result() -> dict:
    """Smallest valid JobResult dict for round-trip testing."""
    return {
        "image_hash": "dead",
        "cell_count": 3,
        "features_df_json": "[]",
        "segmentation_figure_json": "{}",
        "radial_profile_figure_json": "{}",
        "correlation_figure_json": "{}",
        "hero_metrics": {
            "cell_count": 3.0,
            "mean_yap_nc": None,
            "mean_fa_count": None,
            "mean_actin_coherence": None,
            "mean_glycocalyx_ratio": None,
        },
        "has_deep_features": False,
    }


def test_get_provider_defaults_to_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GLYCOQUANT_GPU_PROVIDER", raising=False)
    assert gpu_client.get_provider() == "local"


def test_get_provider_honours_modal(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "modal")
    assert gpu_client.get_provider() == "modal"


def test_get_provider_typo_falls_back_to_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GLYCOQUANT_GPU_PROVIDER", "modal-typo")
    assert gpu_client.get_provider() == "local"


def test_serialize_channels_round_trip() -> None:
    channels = {
        "dapi": np.arange(16, dtype=np.float32).reshape(4, 4),
        "actin": np.ones((4, 4), dtype=np.float32),
    }
    blob = gpu_client._serialize_channels(channels)
    assert isinstance(blob, bytes)
    with np.load(io.BytesIO(blob)) as npz:
        assert set(npz.files) == {"dapi", "actin"}
        np.testing.assert_array_equal(npz["dapi"], channels["dapi"])
        np.testing.assert_array_equal(npz["actin"], channels["actin"])


def test_run_pipeline_remote_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    class FakeFunction:
        def remote(self, payload: bytes, cell_diameter: int, include_deep: bool) -> dict:
            captured["payload"] = payload
            captured["cell_diameter"] = cell_diameter
            captured["include_deep"] = include_deep
            return _minimal_job_result()

    monkeypatch.setattr(gpu_client, "_REMOTE_FUNCTION", None)
    monkeypatch.setattr(gpu_client, "_lookup_modal_function", lambda: FakeFunction())

    channels = {"dapi": np.zeros((8, 8), dtype=np.float32)}
    result = gpu_client.run_pipeline_remote(
        channels=channels, cell_diameter=80, include_deep_features=False
    )

    assert isinstance(result, JobResult)
    assert result.cell_count == 3
    assert captured["cell_diameter"] == 80
    assert captured["include_deep"] is False
    # Payload is a valid NPZ containing our input channel
    with np.load(io.BytesIO(captured["payload"])) as npz:
        assert "dapi" in npz.files


def test_run_pipeline_remote_wraps_remote_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class ExplodingFunction:
        def remote(self, *args: object, **kwargs: object) -> dict:
            raise ConnectionError("simulated network failure")

    monkeypatch.setattr(gpu_client, "_REMOTE_FUNCTION", None)
    monkeypatch.setattr(gpu_client, "_lookup_modal_function", lambda: ExplodingFunction())

    with pytest.raises(RuntimeError, match="Modal call failed"):
        gpu_client.run_pipeline_remote(
            channels={"dapi": np.zeros((4, 4), dtype=np.float32)},
            cell_diameter=80,
            include_deep_features=False,
        )


def test_run_pipeline_remote_rejects_non_dict(monkeypatch: pytest.MonkeyPatch) -> None:
    class BadShape:
        def remote(self, *args: object, **kwargs: object) -> list:
            return [1, 2, 3]

    monkeypatch.setattr(gpu_client, "_REMOTE_FUNCTION", None)
    monkeypatch.setattr(gpu_client, "_lookup_modal_function", lambda: BadShape())

    with pytest.raises(RuntimeError, match="unexpected type"):
        gpu_client.run_pipeline_remote(
            channels={"dapi": np.zeros((4, 4), dtype=np.float32)},
            cell_diameter=80,
            include_deep_features=False,
        )

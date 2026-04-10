"""Image I/O for GlycoQuant.

Streamlit-free, reusable by notebooks, scripts, and the Tab 1 app. Handles
multi-channel TIFF / PNG loading, channel splitting, downsampling for
display, and content-hashing for cache keys.
"""

from glycoquant.io.image_io import (
    downsample_for_display,
    hash_image_bytes,
    load_multichannel_image,
    split_into_channels,
)

__all__ = [
    "downsample_for_display",
    "hash_image_bytes",
    "load_multichannel_image",
    "split_into_channels",
]

# config.py — GeoMind ML Configuration
# All shared settings live here. Import this in all other modules.

import os

# ─── Paths ───────────────────────────────────────────────────────────────────
from dataclasses import dataclass
from typing import Tuple


# ─── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_DIR = os.path.join(BASE_DIR, "models")

SYNTHETIC_DATA_PATH = os.path.join(DATA_DIR, "synthetic_data.csv")
FEEDBACK_DATA_PATH  = os.path.join(DATA_DIR, "feedback_data.csv")
CLASSIFIER_PATH     = os.path.join(MODEL_DIR, "classifier.pkl")
VECTORIZER_PATH     = os.path.join(MODEL_DIR, "vectorizer.pkl")
PROTOTYPE_PATH      = os.path.join(MODEL_DIR, "prototypes.pkl")


# ─── Config Objects ──────────────────────────────────────────────────────────

@dataclass
class TfidfConfig:
    ngram_range: Tuple[int, int] = (1, 2)
    max_features: int = 10000
    sublinear_tf: bool = True
    min_df: int = 1


@dataclass
class ModelConfig:
    categories: Tuple[str, ...] = ("grocery", "pharmacy", "clothing", "general")
    fallback_category: str = "general"
    confidence_threshold: float = 0.60
    # Logistic Regression params
    max_iter: int = 1000
    C: float = 5.0


@dataclass
class SimilarityConfig:
    prototypes_per_class: int = 25
    similarity_threshold: float = 0.35


# ─── Shared Instances ────────────────────────────────────────────────────────
# We keep the constants for backward compatibility while others migrate
TF_CONFIG = TfidfConfig()
MODEL_CONFIG = ModelConfig()
SIM_CONFIG = SimilarityConfig()

CATEGORIES = MODEL_CONFIG.categories
FALLBACK_CATEGORY = MODEL_CONFIG.fallback_category
CONFIDENCE_THRESHOLD = MODEL_CONFIG.confidence_threshold
SIMILARITY_THRESHOLD = SIM_CONFIG.similarity_threshold

# ─── FastAPI ─────────────────────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 5001

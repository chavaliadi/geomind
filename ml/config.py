# config.py — GeoMind ML Configuration
# All shared settings live here. Import this in all other modules.

import os

# ─── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_DIR = os.path.join(BASE_DIR, "models")

SYNTHETIC_DATA_PATH = os.path.join(DATA_DIR, "synthetic_data.csv")
FEEDBACK_DATA_PATH  = os.path.join(DATA_DIR, "feedback_data.csv")
CLASSIFIER_PATH     = os.path.join(MODEL_DIR, "classifier.pkl")
VECTORIZER_PATH     = os.path.join(MODEL_DIR, "vectorizer.pkl")
PROTOTYPE_PATH      = os.path.join(MODEL_DIR, "prototypes.pkl")

# ─── Label Taxonomy ──────────────────────────────────────────────────────────
# These MUST match your PostGIS `places` table category values exactly.
CATEGORIES = ["grocery", "pharmacy", "clothing", "general"]
FALLBACK_CATEGORY = "general"

# ─── Confidence Thresholds ───────────────────────────────────────────────────
# Tuned after running evaluate.py on actual model output:
#   p25=0.653, p50=0.787, mean=0.740, min=0.283
# Setting threshold at 0.60 → ~75%+ of all predictions pass without fallback
CONFIDENCE_THRESHOLD = 0.60       # Below this → cosine similarity fallback
SIMILARITY_THRESHOLD = 0.35       # Below this → return FALLBACK_CATEGORY

# ─── TF-IDF Settings ─────────────────────────────────────────────────────────
TFIDF_NGRAM_RANGE = (1, 2)        # Unigrams + bigrams
TFIDF_MAX_FEATURES = 10000        # Top 10k features
TFIDF_SUBLINEAR_TF = True         # Log-scale TF (better for varied text lengths)

# ─── Cosine Similarity Fallback ──────────────────────────────────────────────
# Number of prototype examples to store per category for similarity fallback
PROTOTYPES_PER_CLASS = 25

# ─── FastAPI ─────────────────────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 5000

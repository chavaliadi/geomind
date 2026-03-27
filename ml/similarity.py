# similarity.py — Cosine Similarity Fallback for GeoMind
# Used when Logistic Regression confidence < CONFIDENCE_THRESHOLD.
# Compares input against a small prototype bank (25 examples/class).

import os
import joblib
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer

from config import (
    CATEGORIES,
    FALLBACK_CATEGORY,
    SIM_CONFIG,
    PROTOTYPE_PATH,
)
from preprocessing import clean_text


def build_prototype_bank(df, vectorizer: TfidfVectorizer) -> dict:
    """
    Build a dictionary mapping each category → TF-IDF matrix of prototype examples.
    Selects up to PROTOTYPES_PER_CLASS representative examples per category.
    Saves to PROTOTYPE_PATH.
    """
    prototypes = {}
    for cat in CATEGORIES:
        cat_texts = df[df["category"] == cat]["text"].tolist()
        # Take up to prototypes_per_class examples (middle of dataset = most representative)
        sample = cat_texts[:SIM_CONFIG.prototypes_per_class]
        cleaned = [clean_text(t) for t in sample]
        prototypes[cat] = vectorizer.transform(cleaned)

    os.makedirs(os.path.dirname(PROTOTYPE_PATH), exist_ok=True)
    joblib.dump(prototypes, PROTOTYPE_PATH)
    print(f"✅ Prototype bank saved → {PROTOTYPE_PATH}")
    for cat, mat in prototypes.items():
        print(f"   {cat}: {mat.shape[0]} prototypes")
    return prototypes


def load_prototype_bank() -> dict:
    """Load a previously saved prototype bank."""
    if not os.path.exists(PROTOTYPE_PATH):
        raise FileNotFoundError(
            f"Prototype bank not found at {PROTOTYPE_PATH}. Run train.py first."
        )
    return joblib.load(PROTOTYPE_PATH)


def predict_with_similarity(
    text: str,
    vectorizer: TfidfVectorizer,
    prototypes: dict,
) -> tuple[str, float]:
    """
    Predict category using cosine similarity against prototype bank.

    Returns:
        (category, max_similarity_score)
        Falls back to FALLBACK_CATEGORY if max similarity < SIMILARITY_THRESHOLD.
    """
    cleaned = clean_text(text)
    if not cleaned:
        return FALLBACK_CATEGORY, 0.0

    vec = vectorizer.transform([cleaned])

    best_category = FALLBACK_CATEGORY
    best_score = 0.0

    for cat, proto_matrix in prototypes.items():
        sims = cosine_similarity(vec, proto_matrix)
        max_sim = float(np.max(sims))
        if max_sim > best_score:
            best_score = max_sim
            best_category = cat

    if best_score < SIM_CONFIG.similarity_threshold:
        return FALLBACK_CATEGORY, best_score

    return best_category, best_score


if __name__ == "__main__":
    # Quick test — requires train.py to have been run first
    from config import VECTORIZER_PATH

    vectorizer = joblib.load(VECTORIZER_PATH)
    prototypes = load_prototype_bank()

    tests = [
        "buy some fruits and vegetables",
        "need to collect my prescription",
        "looking for a nice kurti",
        "just have to step out and do some things",
        "milk leke aana hai",
    ]
    print("\n=== Similarity Fallback Predictions ===\n")
    for t in tests:
        cat, score = predict_with_similarity(t, vectorizer, prototypes)
        print(f"  '{t}' → {cat} (similarity: {score:.3f})")

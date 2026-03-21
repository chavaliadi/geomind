# train.py — GeoMind ML Training Script
# Run this file to train and export the classifier.
# Output: models/classifier.pkl, models/vectorizer.pkl, models/prototypes.pkl

import os
import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from config import (
    SYNTHETIC_DATA_PATH,
    FEEDBACK_DATA_PATH,
    CLASSIFIER_PATH,
    VECTORIZER_PATH,
    MODEL_DIR,
    TFIDF_NGRAM_RANGE,
    TFIDF_MAX_FEATURES,
    TFIDF_SUBLINEAR_TF,
    CATEGORIES,
)
from preprocessing import clean_text
from similarity import build_prototype_bank


def load_data() -> pd.DataFrame:
    """Load synthetic + feedback data, clean and merge."""
    df = pd.read_csv(SYNTHETIC_DATA_PATH)
    print(f"📦 Synthetic data: {len(df)} rows")

    # Merge feedback data if it has content
    if os.path.exists(FEEDBACK_DATA_PATH):
        feedback = pd.read_csv(FEEDBACK_DATA_PATH)
        feedback = feedback.dropna(subset=["text", "category"])
        if len(feedback) > 0:
            df = pd.concat([df, feedback], ignore_index=True)
            print(f"📦 Feedback data merged: +{len(feedback)} rows")

    # Filter to known categories only
    df = df[df["category"].isin(CATEGORIES)].copy()

    # Clean text
    df["clean_text"] = df["text"].apply(clean_text)

    # Drop rows where cleaning produced empty result
    df = df[df["clean_text"].str.strip() != ""].copy()

    print(f"✅ Total training samples: {len(df)}")
    print(f"\nCategory breakdown:")
    print(df["category"].value_counts().to_string())
    return df


def train(df: pd.DataFrame):
    """Train TF-IDF + Logistic Regression and export models."""
    X = df["clean_text"].tolist()
    y = df["category"].tolist()

    # 80/20 train-test split (stratified to preserve class ratios)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"\n🔀 Split: {len(X_train)} train / {len(X_test)} test")

    # TF-IDF Vectorizer
    vectorizer = TfidfVectorizer(
        ngram_range=TFIDF_NGRAM_RANGE,
        max_features=TFIDF_MAX_FEATURES,
        sublinear_tf=TFIDF_SUBLINEAR_TF,
        min_df=1,
    )

    # Logistic Regression — best baseline for sparse TF-IDF multi-class
    classifier = LogisticRegression(
        max_iter=1000,
        C=5.0,             # Regularization: higher C = less regularization
        solver="lbfgs",
        multi_class="multinomial",
        random_state=42,
    )

    # Fit vectorizer and transform
    print("\n🔧 Fitting TF-IDF vectorizer...")
    X_train_vec = vectorizer.fit_transform(X_train)

    print("🧠 Training Logistic Regression...")
    classifier.fit(X_train_vec, y_train)

    # Save models
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(vectorizer,  VECTORIZER_PATH)
    joblib.dump(classifier,  CLASSIFIER_PATH)
    print(f"\n💾 Models saved:")
    print(f"   → {VECTORIZER_PATH}")
    print(f"   → {CLASSIFIER_PATH}")

    # Build prototype bank for cosine fallback
    print("\n📐 Building cosine similarity prototype bank...")
    build_prototype_bank(df, vectorizer)

    return vectorizer, classifier, X_test, y_test


if __name__ == "__main__":
    print("=" * 50)
    print("   GeoMind ML — Training Pipeline")
    print("=" * 50)

    df = load_data()
    vectorizer, classifier, X_test, y_test = train(df)

    print("\n✅ Training complete. Run evaluate.py to see metrics.")

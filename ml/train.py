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
    TF_CONFIG,
    MODEL_CONFIG,
    CATEGORIES,
)
from preprocessing import clean_text
from similarity import build_prototype_bank


def _load_and_merge_feedback(df: pd.DataFrame) -> pd.DataFrame:
    """Helper to merge feedback data if it exists and is valid."""
    if not os.path.exists(FEEDBACK_DATA_PATH):
        return df

    feedback = pd.read_csv(FEEDBACK_DATA_PATH)
    
    # Map 'corrected' to 'category' if needed
    if "corrected" in feedback.columns:
        feedback = feedback.rename(columns={"corrected": "category"})
        
    # Validation
    is_valid = "category" in feedback.columns and "text" in feedback.columns
    if not is_valid:
        return df

    feedback = feedback.dropna(subset=["text", "category"])
    if feedback.empty:
        return df

    print(f"📦 Feedback data merged: +{len(feedback)} rows")
    return pd.concat([df, feedback], ignore_index=True)


def load_data() -> pd.DataFrame:
    """Load synthetic + feedback data, clean and filter."""
    df = pd.read_csv(SYNTHETIC_DATA_PATH)
    print(f"📦 Synthetic data: {len(df)} rows")

    df = _load_and_merge_feedback(df)

    # Filter to known categories
    df = df[df["category"].isin(CATEGORIES)].copy()

    # Clean text (remove empty results)
    df["clean_text"] = df["text"].apply(clean_text)
    df = df[df["clean_text"].str.strip() != ""].copy()

    print(f"✅ Total training samples: {len(df)}")
    print(f"\nCategory breakdown:\n{df['category'].value_counts().to_string()}")
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
        ngram_range=TF_CONFIG.ngram_range,
        max_features=TF_CONFIG.max_features,
        sublinear_tf=TF_CONFIG.sublinear_tf,
        min_df=TF_CONFIG.min_df,
    )

    # Logistic Regression — best baseline for sparse TF-IDF multi-class
    classifier = LogisticRegression(
        max_iter=MODEL_CONFIG.max_iter,
        C=MODEL_CONFIG.C,             # Regularization: higher C = less regularization
        solver="lbfgs",
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

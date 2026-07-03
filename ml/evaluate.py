# evaluate.py — GeoMind ML Evaluation Script
# Run AFTER train.py. Prints F1 scores, confusion matrix, and confidence distribution.
# Use these numbers to decide final confidence thresholds for config.py.

import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    accuracy_score,
    precision_recall_fscore_support,
)

from config import (
    SYNTHETIC_DATA_PATH,
    FEEDBACK_DATA_PATH,
    CLASSIFIER_PATH,
    VECTORIZER_PATH,
    CATEGORIES,
    MODEL_CONFIG,
    SIM_CONFIG,
)
from preprocessing import clean_text


def load_eval_data() -> tuple[list, list]:
    """Load and prepare data. Uses same seed as train.py → same test split."""
    df = pd.read_csv(SYNTHETIC_DATA_PATH)

    if __import__("os").path.exists(FEEDBACK_DATA_PATH):
        feedback = pd.read_csv(FEEDBACK_DATA_PATH)
        if "corrected" in feedback.columns:
            feedback = feedback.rename(columns={"corrected": "category"})
        if "category" in feedback.columns and "text" in feedback.columns:
            feedback = feedback.dropna(subset=["text", "category"])
            if len(feedback) > 0:
                df = pd.concat([df, feedback], ignore_index=True)

    df = df[df["category"].isin(CATEGORIES)].copy()
    df["clean_text"] = df["text"].apply(clean_text)
    df = df[df["clean_text"].str.strip() != ""].copy()

    X = df["clean_text"].tolist()
    y = df["category"].tolist()

    # Reproduce same 80/20 split as train.py
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    return X_test, y_test


def print_confidence_distribution(classifier, X_test_vec):
    """Print confidence percentile distribution — crucial for setting thresholds."""
    probs = classifier.predict_proba(X_test_vec)
    max_confs = np.max(probs, axis=1)

    print("\n📊 Confidence Distribution (max confidence per prediction):")
    for p in [10, 25, 50, 65, 75, 90, 95, 100]:
        val = np.percentile(max_confs, p)
        print(f"   p{p:3d}: {val:.3f}")

    print(f"\n   Mean confidence : {np.mean(max_confs):.3f}")
    print(f"   Median confidence: {np.median(max_confs):.3f}")
    print(f"   Min confidence   : {np.min(max_confs):.3f}")
    print(f"   Max confidence   : {np.max(max_confs):.3f}")
    print()
    print("   ⚙️  Use these values to tune CONFIDENCE_THRESHOLD in config.py")


def print_confusion_matrix(y_true, y_pred):
    """Print a readable confusion matrix."""
    cm = confusion_matrix(y_true, y_pred, labels=CATEGORIES)
    print("\n🧮 Confusion Matrix (rows=actual, cols=predicted):")
    header = f"{'':12}" + "".join(f"{c:12}" for c in CATEGORIES)
    print(f"   {header}")
    for i, cat in enumerate(CATEGORIES):
        row = "".join(f"{cm[i][j]:12}" for j in range(len(CATEGORIES)))
        print(f"   {cat:12}{row}")


def write_markdown_report(acc, y_true, y_pred, test_sentences, classifier, vectorizer):
    """Write a clean, professional markdown evaluation report to ml directory."""
    report_path = os.path.join(os.path.dirname(SYNTHETIC_DATA_PATH), "..", "evaluation_report.md")
    report_path = os.path.abspath(report_path)
    
    # Calculate macro metrics
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="macro")
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(y_true, y_pred, average="weighted")
    
    # Calculate per-class metrics
    class_p, class_r, class_f1, class_sup = precision_recall_fscore_support(
        y_true, y_pred, labels=CATEGORIES
    )
    
    # Calculate confusion matrix
    cm = confusion_matrix(y_true, y_pred, labels=CATEGORIES)
    
    md_content = f"""# 📊 GeoMind ML Model Evaluation Report

*Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}*

This report documents the performance metrics of the baseline **TF-IDF + Logistic Regression** text categorizer model.

---

## 🎯 Model Summary

| Metric | Score | Percentage |
| :--- | :---: | :---: |
| **Accuracy** | `{acc:.4f}` | **{acc * 100:.2f}%** |
| **Precision (Macro)** | `{precision:.4f}` | **{precision * 100:.2f}%** |
| **Recall (Macro)** | `{recall:.4f}` | **{recall * 100:.2f}%** |
| **F1-Score (Macro)** | `{f1:.4f}` | **{f1 * 100:.2f}%** |

---

## 📈 Classification Report (Per-class)

| Category | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
"""
    for i, cat in enumerate(CATEGORIES):
        md_content += f"| **{cat}** | `{class_p[i]:.4f}` | `{class_r[i]:.4f}` | `{class_f1[i]:.4f}` | `{class_sup[i]}` |\n"
        
    md_content += f"""| **Macro Average** | `{precision:.4f}` | `{recall:.4f}` | `{f1:.4f}` | `{len(y_true)}` |
| **Weighted Average** | `{weighted_p:.4f}` | `{weighted_r:.4f}` | `{weighted_f1:.4f}` | `{len(y_true)}` |

---

## 🧮 Confusion Matrix

| Actual \\ Predicted | """ + " | ".join(f"**{c}**" for c in CATEGORIES) + " |\n"
    md_content += "| :--- | " + " | ".join(":---:" for _ in CATEGORIES) + " |\n"
    for i, cat in enumerate(CATEGORIES):
        row_str = " | ".join(str(cm[i][j]) for j in range(len(CATEGORIES)))
        md_content += f"| **{cat}** | {row_str} |\n"

    md_content += """
---

## 🔍 Spot-Check Validation Examples

Here is how the model handles standard and edge-case inputs (Hinglish/Ambiguous):

| Input Phrase | Cleaned Tokens | Predicted Category | Confidence | Status |
| :--- | :--- | :--- | :---: | :---: |
"""
    for s in test_sentences:
        cleaned = clean_text(s)
        vec = vectorizer.transform([cleaned])
        pred = classifier.predict(vec)[0]
        conf = float(max(classifier.predict_proba(vec)[0]))
        flag = "✅ Match" if conf >= 0.60 else "⚠️ Fallback"
        md_content += f"| *\"{s}\"* | `{cleaned}` | **{pred}** | `{conf:.3f}` | {flag} |\n"

    md_content += "\n"
    
    with open(report_path, "w") as f:
        f.write(md_content)
    print(f"\n📝 Markdown report exported successfully to: {report_path}")


if __name__ == "__main__":
    print("=" * 50)
    print("   GeoMind ML — Evaluation Report")
    print("=" * 50)

    # Load model
    vectorizer = joblib.load(VECTORIZER_PATH)
    classifier = joblib.load(CLASSIFIER_PATH)
    print(f"\n📂 Loaded model from {CLASSIFIER_PATH}")

    # Load test set
    X_test, y_test = load_eval_data()
    print(f"📋 Test samples: {len(X_test)}")

    # Vectorize
    X_test_vec = vectorizer.transform(X_test)

    # Predict
    y_pred = classifier.predict(X_test_vec)

    # ── Accuracy ──────────────────────────────────────────────
    acc = accuracy_score(y_test, y_pred)
    print(f"\n🎯 Accuracy: {acc:.4f} ({acc*100:.1f}%)")

    # ── Per-class F1 ──────────────────────────────────────────
    print("\n📈 Classification Report:")
    print(classification_report(y_test, y_pred, labels=CATEGORIES, target_names=CATEGORIES, digits=3))

    # ── Confusion Matrix ──────────────────────────────────────
    print_confusion_matrix(y_test, y_pred)

    # ── Confidence Distribution ───────────────────────────────
    print_confidence_distribution(classifier, X_test_vec)

    # ── Manual spot-check ─────────────────────────────────────
    print("\n🔍 Spot-Check Predictions:")
    test_sentences = [
        "buy milk and eggs from the store",
        "need to pick up my prescription from the chemist",
        "looking for a nice kurta for the festival",
        "step out and run some errands",
        "get vegetables and fruits",
        "collect tablets from pharmacy",
        "buy new jeans and shoes",
        "milk leke aana hai",          # Hinglish
        "I need something but not sure what",
    ]
    for s in test_sentences:
        cleaned = clean_text(s)
        vec = vectorizer.transform([cleaned])
        pred = classifier.predict(vec)[0]
        conf = float(max(classifier.predict_proba(vec)[0]))
        flag = "✅" if conf >= 0.65 else "⚠️ (fallback)"
        print(f"   {flag} '{s}'")
        print(f"       → {pred} ({conf:.3f})")

    # Generate markdown evaluation report
    write_markdown_report(acc, y_test, y_pred, test_sentences, classifier, vectorizer)

# 📊 GeoMind ML Model Evaluation Report

*Generated on: 2026-07-03 23:26:53*

This report documents the performance metrics of the baseline **TF-IDF + Logistic Regression** text categorizer model.

---

## 🎯 Model Summary

| Metric | Score | Percentage |
| :--- | :---: | :---: |
| **Accuracy** | `0.9024` | **90.24%** |
| **Precision (Macro)** | `0.9226` | **92.26%** |
| **Recall (Macro)** | `0.8979` | **89.79%** |
| **F1-Score (Macro)** | `0.9059` | **90.59%** |

---

## 📈 Classification Report (Per-class)

| Category | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
| **grocery** | `0.8293` | `0.9444` | `0.8831` | `36` |
| **pharmacy** | `0.8611` | `0.9394` | `0.8986` | `33` |
| **clothing** | `1.0000` | `0.8800` | `0.9362` | `25` |
| **general** | `1.0000` | `0.8276` | `0.9057` | `29` |
| **Macro Average** | `0.9226` | `0.8979` | `0.9059` | `123` |
| **Weighted Average** | `0.9128` | `0.9024` | `0.9034` | `123` |

---

## 🧮 Confusion Matrix

| Actual \ Predicted | **grocery** | **pharmacy** | **clothing** | **general** |
| :--- | :---: | :---: | :---: | :---: |
| **grocery** | 34 | 2 | 0 | 0 |
| **pharmacy** | 2 | 31 | 0 | 0 |
| **clothing** | 2 | 1 | 22 | 0 |
| **general** | 3 | 2 | 0 | 24 |

---

## 🔍 Spot-Check Validation Examples

Here is how the model handles standard and edge-case inputs (Hinglish/Ambiguous):

| Input Phrase | Cleaned Tokens | Predicted Category | Confidence | Status |
| :--- | :--- | :--- | :---: | :---: |
| *"buy milk and eggs from the store"* | `buy milk eggs store` | **grocery** | `0.928` | ✅ Match |
| *"need to pick up my prescription from the chemist"* | `need pick prescription chemist` | **pharmacy** | `0.921` | ✅ Match |
| *"looking for a nice kurta for the festival"* | `looking nice kurta festival` | **clothing** | `0.790` | ✅ Match |
| *"step out and run some errands"* | `step run errands` | **general** | `0.872` | ✅ Match |
| *"get vegetables and fruits"* | `get vegetables fruits` | **grocery** | `0.969` | ✅ Match |
| *"collect tablets from pharmacy"* | `collect tablets pharmacy` | **pharmacy** | `0.972` | ✅ Match |
| *"buy new jeans and shoes"* | `buy new jeans shoes` | **clothing** | `0.931` | ✅ Match |
| *"milk leke aana hai"* | `milk leke aana hai` | **grocery** | `0.857` | ✅ Match |
| *"I need something but not sure what"* | `need something but not sure` | **general** | `0.877` | ✅ Match |


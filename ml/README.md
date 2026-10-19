# 🧠 GeoMind ML Service

FastAPI-powered NLP microservice for task classification, urgency scoring, and prototype similarity fallback.

## Architecture

- **Classifier:** TF-IDF unigrams + bigrams paired with Logistic Regression (L2 regularization, `C=5.0`, `solver='lbfgs'`).
- **Confidence Fallback:** When model confidence is $< 0.60$, the service falls back to cosine similarity against 25 centroid prototype vectors per class (`models/prototypes.pkl`).
- **Urgency Scorer:** Tiered keyword matching (Critical: `0.45`, High: `0.30`, Mild: `0.15`) with time-decay increments.
- **Feedback Collection:** User corrections are accepted via `POST /feedback` and appended to `data/feedback_data.csv`.

> **Note on Model Retraining:** Retraining is strictly a manual, offline step. Client corrections collect in `data/feedback_data.csv`, but no automated background worker, queue, or cron schedule triggers retraining. To incorporate new feedback rows into the pickled model binaries, an operator must run `python train.py` manually.

## Setup & Training

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run offline training & export models to models/
python3 train.py

# Evaluate test set metrics
python3 evaluate.py

# Boot the FastAPI service on :5001
python3 app.py
```

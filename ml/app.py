import logging
import joblib
import pandas as pd
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    CONFIDENCE_THRESHOLD,
    CLASSIFIER_PATH,
    VECTORIZER_PATH,
    PROTOTYPE_PATH,
    FEEDBACK_DATA_PATH,
)
from preprocessing import clean_text
from similarity import predict_with_similarity

# ─── Logging Setup ───────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ─── Global Variables ────────────────────────────────────────────────────────
classifier = None
vectorizer = None
prototypes = None
MODELS_LOADED = False

# ─── Lifespan Context Manager ────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Setup
    global classifier, vectorizer, prototypes, MODELS_LOADED
    try:
        classifier = joblib.load(CLASSIFIER_PATH)
        vectorizer = joblib.load(VECTORIZER_PATH)
        prototypes = joblib.load(PROTOTYPE_PATH)
            
        MODELS_LOADED = True
        logger.info("✅ ML Models successfully loaded into memory.")
    except Exception as e:
        logger.error(f"❌ Failed to load ML models: {e}")
        MODELS_LOADED = False
        
    yield
    # Teardown (if any)
    logger.info("Shutting down ML Service.")

# ─── App Initialization ──────────────────────────────────────────────────────
app = FastAPI(title="Geomind ML Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ─────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    text: str

class FeedbackRequest(BaseModel):
    text: str
    predicted: str
    corrected: str

# ─── Endpoints ───────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": MODELS_LOADED
    }

@app.post("/predict")
def predict(request: PredictRequest):
    if not MODELS_LOADED:
        raise HTTPException(status_code=503, detail="ML Models are not currently loaded.")
    
    cleaned = clean_text(request.text)
    if not cleaned:
        # Fallback to 'general' if input is empty or just noise
        return {"category": "general", "confidence": 0.0, "used_fallback": True}
        
    X_vec = vectorizer.transform([cleaned])
    
    # Get probabilities
    probs = classifier.predict_proba(X_vec)[0]
    max_prob = max(probs)
    
    predicted_idx = probs.argmax()
    predicted_category = classifier.classes_[predicted_idx]
    
    used_fallback = False
    
    if max_prob < CONFIDENCE_THRESHOLD:
        logger.info(f"Confidence {max_prob:.2f} < {CONFIDENCE_THRESHOLD} for '{request.text}'. Triggering fallback.")
        predicted_category, sim_score = predict_with_similarity(request.text, vectorizer, prototypes)
        used_fallback = True
        # For the response, we return the similarity score as the 'confidence' when falling back
        max_prob = sim_score
        
    logger.info(f"Prediction: '{request.text}' → {predicted_category} (conf: {max_prob:.3f}, fallback: {used_fallback})")
    
    return {
        "category": predicted_category,
        "confidence": float(max_prob),
        "used_fallback": used_fallback
    }

@app.post("/feedback")
def feedback(request: FeedbackRequest):
    try:
        # Ensure file exists, if not create with headers
        file_exists = os.path.isfile(FEEDBACK_DATA_PATH)
        
        # Create a tiny dataframe
        df = pd.DataFrame([{
            "text": request.text,
            "predicted": request.predicted,
            "corrected": request.corrected
        }])
        
        # Append to CSV
        df.to_csv(FEEDBACK_DATA_PATH, mode='a', header=not file_exists, index=False)
        
        logger.info(f"Feedback saved: '{request.text}' corrected from '{request.predicted}' to '{request.corrected}'")
        return {"status": "success", "message": "Feedback recorded."}
    except Exception as e:
        logger.error(f"Failed to save feedback: {e}")
        raise HTTPException(status_code=500, detail="Could not save feedback.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=API_HOST, port=API_PORT, reload=True)

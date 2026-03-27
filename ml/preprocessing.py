# preprocessing.py — GeoMind Text Cleaning Pipeline

import re
import ssl
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

# macOS SSL fix — needed for NLTK corpus downloads
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

# Download required NLTK resources (only on first run)
for resource in ["stopwords", "wordnet", "omw-1.4"]:
    try:
        nltk.data.find(f"corpora/{resource}")
    except LookupError:
        nltk.download(resource, quiet=True)

_lemmatizer = WordNetLemmatizer()
# Load stopwords but KEEP negations — they can change meaning
_KEEP_WORDS = {"not", "no", "nor", "but", "near", "nearby"}
_STOP_WORDS = stopwords.words("english")
_STOP_WORDS = set(w for w in _STOP_WORDS if w not in _KEEP_WORDS)


def _normalize_text(text: str) -> str:
    """Lowercase and strip URLs, punctuation, and digits."""
    text = text.lower()
    # Remove URLs
    text = re.sub(r"http\S+|www\S+", "", text)
    # Remove punctuation and digits, keep spaces
    return re.sub(r"[^a-z\s]", " ", text)


def _tokenize_and_filter(text: str) -> list[str]:
    """Split into tokens and remove stopwords/short noise."""
    tokens = text.split()
    # Filter stopwords (keeping negations) and removing single-char noise
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


def _lemmatize_tokens(tokens: list[str]) -> list[str]:
    """Apply dual-pass lemmatization (verb then noun)."""
    # Verb form first for action words, then noun
    tokens = [_lemmatizer.lemmatize(t, pos="v") for t in tokens]
    return [_lemmatizer.lemmatize(t, pos="n") for t in tokens]


def clean_text(text: str) -> str:
    """
    Full NLP preprocessing pipeline.
    Steps: normalize → tokenize → filter → lemmatize → join
    """
    if not isinstance(text, str) or not text.strip():
        return ""

    text = _normalize_text(text)
    tokens = _tokenize_and_filter(text)
    tokens = _lemmatize_tokens(tokens)

    return " ".join(tokens)


if __name__ == "__main__":
    # Quick sanity check
    test_cases = [
        "I need to buy vegetables and some milk from the grocery store!",
        "pick up medicine tablets from pharmacy ASAP",
        "buy a new shirt and formal trousers",
        "I need to step out for a bit and handle something",
        "milk leke aana hai",  # Hinglish — TF-IDF still catches 'milk'
        "",
        "get something",
    ]
    print("=== Preprocessing Sanity Check ===\n")
    for t in test_cases:
        print(f"  IN : {t!r}")
        print(f"  OUT: {clean_text(t)!r}")
        print()

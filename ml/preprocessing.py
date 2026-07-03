# preprocessing.py — GeoMind Text Cleaning Pipeline

import os
import re

try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.stem import WordNetLemmatizer
except Exception:  # pragma: no cover - fallback for minimal runtimes
    nltk = None
    stopwords = None
    WordNetLemmatizer = None

_KEEP_WORDS = {"not", "no", "nor", "but", "near", "nearby"}
_FALLBACK_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "i",
    "in", "is", "it", "my", "of", "on", "or", "some", "the", "to", "with",
    "want", "need", "needs", "going", "go", "get", "pick", "up",
}


def _resource_available(resource: str) -> bool:
    if not nltk:
        return False
    try:
        nltk.data.find(f"corpora/{resource}")
        return True
    except LookupError:
        if os.getenv("GEOMIND_ALLOW_NLTK_DOWNLOADS") == "1":
            try:
                nltk.download(resource, quiet=True)
                nltk.data.find(f"corpora/{resource}")
                return True
            except Exception:
                return False
        return False


_HAS_STOPWORDS = _resource_available("stopwords")
_HAS_WORDNET = _resource_available("wordnet") and _resource_available("omw-1.4")

if _HAS_STOPWORDS:
    _STOP_WORDS = set(w for w in stopwords.words("english") if w not in _KEEP_WORDS)
else:
    _STOP_WORDS = set(w for w in _FALLBACK_STOP_WORDS if w not in _KEEP_WORDS)

_LEMMATIZER = WordNetLemmatizer() if WordNetLemmatizer and _HAS_WORDNET else None


def _normalize_text(text: str) -> str:
    """Lowercase and strip URLs, punctuation, and digits."""
    text = text.lower()
    text = re.sub(r"http\S+|www\S+", "", text)
    return re.sub(r"[^a-z\s]", " ", text)


def _tokenize_and_filter(text: str) -> list[str]:
    """Split into tokens and remove stopwords/short noise."""
    tokens = text.split()
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]


def _lemmatize_tokens(tokens: list[str]) -> list[str]:
    """Apply lemmatization when WordNet is available; otherwise return tokens."""
    if not _LEMMATIZER:
        return tokens
    tokens = [_LEMMATIZER.lemmatize(t, pos="v") for t in tokens]
    return [_LEMMATIZER.lemmatize(t, pos="n") for t in tokens]


def clean_text(text: str) -> str:
    """
    Full NLP preprocessing pipeline.
    Steps: normalize → tokenize → filter → optional lemmatize → join.
    """
    if not isinstance(text, str) or not text.strip():
        return ""

    text = _normalize_text(text)
    tokens = _tokenize_and_filter(text)
    tokens = _lemmatize_tokens(tokens)

    return " ".join(tokens)


if __name__ == "__main__":
    test_cases = [
        "I need to buy vegetables and some milk from the grocery store!",
        "pick up medicine tablets from pharmacy ASAP",
        "buy a new shirt and formal trousers",
        "I need to step out for a bit and handle something",
        "milk leke aana hai",
        "",
        "get something",
    ]
    print("=== Preprocessing Sanity Check ===\n")
    for t in test_cases:
        print(f"  IN : {t!r}")
        print(f"  OUT: {clean_text(t)!r}")
        print()

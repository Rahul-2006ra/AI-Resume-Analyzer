import os
import re
import json
import string
from flask import Flask, request, jsonify
from flask_cors import CORS
import PyPDF2
import io

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ─── NLP Helpers ────────────────────────────────────────────────────────────

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need", "dare",
    "ought", "used", "i", "you", "he", "she", "it", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "its", "our", "their",
    "this", "that", "these", "those", "what", "which", "who", "whom",
    "when", "where", "why", "how", "all", "each", "every", "both", "few",
    "more", "most", "other", "some", "such", "no", "not", "only", "same",
    "so", "than", "too", "very", "just", "as", "also", "into", "through",
    "during", "before", "after", "above", "below", "between", "out", "off",
    "over", "under", "again", "then", "once", "s", "t", "re", "ll", "ve",
    "about", "up", "any", "if"
}

POWER_WORDS = [
    "achieved", "improved", "developed", "managed", "led", "created",
    "designed", "built", "delivered", "increased", "reduced", "optimized",
    "streamlined", "implemented", "collaborated", "mentored", "launched",
    "drove", "spearheaded", "transformed", "scaled", "automated", "analyzed",
    "coordinated", "established", "executed", "generated", "initiated",
    "planned", "resolved", "supervised", "trained", "upgraded", "maintained"
]

WEAK_PHRASES = [
    "responsible for", "duties included", "worked on", "helped with",
    "assisted in", "tasked with", "involved in", "was part of",
    "participated in", "familiar with"
]


def clean_text(text: str) -> str:
    """Lowercase, remove punctuation/extra whitespace."""
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\w\s]', ' ', text)
    return text.strip()


def tokenize(text: str) -> list[str]:
    words = clean_text(text).split()
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def extract_keywords(text: str, top_n: int = 40) -> list[str]:
    """Return most frequent non-stopword tokens."""
    tokens = tokenize(text)
    freq: dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1
    sorted_kw = sorted(freq, key=lambda k: freq[k], reverse=True)
    return sorted_kw[:top_n]


def extract_bigrams(text: str) -> set[str]:
    tokens = tokenize(text)
    return {f"{tokens[i]} {tokens[i+1]}" for i in range(len(tokens) - 1)}


def extract_pdf_text(file_bytes: bytes) -> str:
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            pages.append(t)
    return "\n".join(pages)


# ─── Analysis Engine ─────────────────────────────────────────────────────────

def calculate_ats_score(resume_text: str, jd_text: str) -> dict:
    resume_tokens = set(tokenize(resume_text))
    jd_tokens = set(tokenize(jd_text))
    jd_keywords = extract_keywords(jd_text, top_n=50)

    # Keyword overlap score (50 pts)
    matched = [kw for kw in jd_keywords if kw in resume_tokens]
    missing = [kw for kw in jd_keywords if kw not in resume_tokens]
    kw_score = min(50, int((len(matched) / max(len(jd_keywords), 1)) * 50))

    # Bigram phrase match score (20 pts)
    resume_bigrams = extract_bigrams(resume_text)
    jd_bigrams = extract_bigrams(jd_text)
    bigram_overlap = resume_bigrams & jd_bigrams
    bigram_score = min(20, int((len(bigram_overlap) / max(len(jd_bigrams), 1)) * 20))

    # Power-word score (15 pts)
    resume_lower = resume_text.lower()
    power_found = [w for w in POWER_WORDS if w in resume_lower]
    power_score = min(15, len(power_found) * 2)

    # Length & formatting score (15 pts)
    word_count = len(resume_text.split())
    length_score = 15 if 300 <= word_count <= 900 else (
        10 if word_count < 300 else 8
    )

    total = kw_score + bigram_score + power_score + length_score

    return {
        "total": total,
        "breakdown": {
            "keyword_match": kw_score,
            "phrase_match": bigram_score,
            "action_verbs": power_score,
            "length_format": length_score
        },
        "matched_keywords": matched[:20],
        "missing_keywords": missing[:20],
        "power_words_found": power_found,
        "word_count": word_count
    }


def detect_strengths(resume_text: str, ats: dict) -> list[str]:
    strengths = []
    lower = resume_text.lower()

    if ats["word_count"] >= 300:
        strengths.append("Resume has adequate length and detail.")
    if len(ats["power_words_found"]) >= 4:
        strengths.append(f"Strong action verbs used: {', '.join(ats['power_words_found'][:5])}.")
    if len(ats["matched_keywords"]) >= 10:
        strengths.append(f"Good keyword alignment — {len(ats['matched_keywords'])} JD keywords present.")
    if re.search(r'\d+%|\d+x|\$[\d,]+', resume_text):
        strengths.append("Quantified achievements detected (numbers/percentages/dollar amounts).")
    if any(s in lower for s in ["bachelor", "master", "phd", "mba", "degree", "university", "college"]):
        strengths.append("Education credentials clearly mentioned.")
    if any(s in lower for s in ["github", "linkedin", "portfolio", "website"]):
        strengths.append("Online presence / portfolio links included.")
    if ats["breakdown"]["phrase_match"] >= 10:
        strengths.append("Multi-word technical phrases align well with the job description.")

    return strengths if strengths else ["Resume contains relevant professional experience."]


def detect_weaknesses(resume_text: str, ats: dict) -> list[str]:
    weaknesses = []
    lower = resume_text.lower()

    if ats["word_count"] < 300:
        weaknesses.append("Resume is too short — aim for 400–700 words for best ATS performance.")
    if ats["word_count"] > 900:
        weaknesses.append("Resume may be too long — consider trimming to 1–2 pages.")
    if len(ats["missing_keywords"]) > 10:
        weaknesses.append(f"Missing {len(ats['missing_keywords'])} important JD keywords.")
    if len(ats["power_words_found"]) < 3:
        weaknesses.append("Lacks strong action verbs — replace passive phrases with dynamic verbs.")

    for phrase in WEAK_PHRASES:
        if phrase in lower:
            weaknesses.append(f'Weak phrasing detected: "{phrase}" — rewrite with a results-oriented verb.')
            break

    if not re.search(r'\d+%|\d+x|\$[\d,]+|\d+ (users|clients|projects|teams)', resume_text):
        weaknesses.append("No quantified achievements — add metrics to demonstrate impact.")
    if ats["breakdown"]["keyword_match"] < 20:
        weaknesses.append("Low keyword density compared to the job description.")

    return weaknesses if weaknesses else ["Minor improvements could boost ATS score further."]


def generate_improved_summary(resume_text: str, jd_text: str, ats: dict) -> str:
    # Extract name-like token (first capitalized words)
    name_match = re.search(r'^([A-Z][a-z]+ [A-Z][a-z]+)', resume_text.strip())
    name = name_match.group(1) if name_match else "The candidate"

    # Detect role from JD
    role_patterns = [
        r'(senior|junior|lead|principal)?\s*(software engineer|developer|data scientist|'
        r'product manager|devops engineer|ml engineer|backend developer|frontend developer|'
        r'full.?stack developer|data analyst|cloud architect|designer)',
    ]
    role = "professional"
    for pattern in role_patterns:
        m = re.search(pattern, jd_text.lower())
        if m:
            role = m.group(0).strip()
            break

    # Top skills from matched keywords
    top_skills = ats["matched_keywords"][:6]
    skills_str = ", ".join(top_skills) if top_skills else "various technical skills"

    # Top missing to suggest
    top_missing = ats["missing_keywords"][:4]
    missing_str = ", ".join(top_missing) if top_missing else ""

    summary = (
        f"{name} is a results-driven {role} with a proven track record of delivering "
        f"high-impact solutions. Demonstrates expertise in {skills_str}, with a strong "
        f"focus on scalable, efficient, and maintainable systems. Known for collaborating "
        f"cross-functionally, leading initiatives from conception to delivery, and continuously "
        f"optimizing performance metrics."
    )

    if missing_str:
        summary += (
            f" Actively expanding proficiency in {missing_str} to align with evolving "
            f"industry demands and organizational goals."
        )

    summary += (
        " Passionate about solving complex problems with clean, pragmatic solutions "
        "and committed to continuous professional growth."
    )

    return summary


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "AI Resume Analyzer API running"})


@app.route("/upload_resume", methods=["POST"])
def upload_resume():
    if "resume" not in request.files:
        return jsonify({"error": "No file uploaded. Field name must be 'resume'."}), 400

    file = request.files["resume"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are accepted."}), 400

    try:
        file_bytes = file.read()
        text = extract_pdf_text(file_bytes)

        if not text.strip():
            return jsonify({"error": "Could not extract text from PDF. Ensure it is not a scanned image."}), 422

        # Save temporarily
        save_path = os.path.join(UPLOAD_FOLDER, "latest_resume.txt")
        with open(save_path, "w", encoding="utf-8") as f:
            f.write(text)

        return jsonify({
            "success": True,
            "message": "Resume uploaded and text extracted successfully.",
            "word_count": len(text.split()),
            "preview": text[:500] + ("..." if len(text) > 500 else "")
        })

    except Exception as e:
        return jsonify({"error": f"Failed to process PDF: {str(e)}"}), 500


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}
    jd_text = data.get("job_description", "").strip()

    if not jd_text:
        return jsonify({"error": "Job description is required."}), 400

    resume_path = os.path.join(UPLOAD_FOLDER, "latest_resume.txt")
    if not os.path.exists(resume_path):
        return jsonify({"error": "No resume found. Please upload a resume first."}), 400

    with open(resume_path, "r", encoding="utf-8") as f:
        resume_text = f.read()

    try:
        ats = calculate_ats_score(resume_text, jd_text)
        strengths = detect_strengths(resume_text, ats)
        weaknesses = detect_weaknesses(resume_text, ats)
        improved_summary = generate_improved_summary(resume_text, jd_text, ats)

        return jsonify({
            "success": True,
            "ats_score": ats["total"],
            "score_breakdown": ats["breakdown"],
            "matched_keywords": ats["matched_keywords"],
            "missing_keywords": ats["missing_keywords"],
            "power_words_found": ats["power_words_found"],
            "word_count": ats["word_count"],
            "strengths": strengths,
            "weaknesses": weaknesses,
            "improved_summary": improved_summary,
            "resume_preview": resume_text[:800]
        })

    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)

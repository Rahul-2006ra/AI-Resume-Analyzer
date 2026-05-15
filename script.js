/* ═══════════════════════════════════════════════════
   ResumeIQ — Frontend Logic
   ═══════════════════════════════════════════════════ */

const API_BASE = "http://localhost:5000";

// ── DOM refs ──────────────────────────────────────────────────────────────
const resumeInput   = document.getElementById("resumeInput");
const dropZone      = document.getElementById("dropZone");
const filePreview   = document.getElementById("filePreview");
const fileName      = document.getElementById("fileName");
const fileSize      = document.getElementById("fileSize");
const removeFile    = document.getElementById("removeFile");
const uploadBtn     = document.getElementById("uploadBtn");
const uploadBtnText = document.getElementById("uploadBtnText");
const uploadSpinner = document.getElementById("uploadSpinner");
const uploadSuccess = document.getElementById("uploadSuccess");
const uploadError   = document.getElementById("uploadError");

const jdInput       = document.getElementById("jdInput");
const jdWordCount   = document.getElementById("jdWordCount");
const analyzeBtn    = document.getElementById("analyzeBtn");
const analyzeBtnText= document.getElementById("analyzeBtnText");
const analyzeSpinner= document.getElementById("analyzeSpinner");
const analyzeError  = document.getElementById("analyzeError");

const resultsEmpty   = document.getElementById("resultsEmpty");
const resultsContent = document.getElementById("resultsContent");

const scoreNumber    = document.getElementById("scoreNumber");
const scoreBadge     = document.getElementById("scoreBadge");
const scoreBarFill   = document.getElementById("scoreBarFill");
const breakdownGrid  = document.getElementById("breakdownGrid");
const matchedTags    = document.getElementById("matchedTags");
const missingTags    = document.getElementById("missingTags");
const strengthsList  = document.getElementById("strengthsList");
const weaknessesList = document.getElementById("weaknessesList");
const summaryText    = document.getElementById("summaryText");
const copyBtn        = document.getElementById("copyBtn");
const downloadBtn    = document.getElementById("downloadBtn");

// ── State ─────────────────────────────────────────────────────────────────
let selectedFile   = null;
let resumeUploaded = false;
let lastAnalysis   = null;

// ── File Selection ─────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function setFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf") {
    showError(uploadError, "Only PDF files are accepted.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showError(uploadError, "File too large — maximum size is 5 MB.");
    return;
  }
  hideError(uploadError);
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  dropZone.hidden  = true;
  filePreview.hidden = false;
  uploadBtn.disabled = false;
  resumeUploaded = false;
  uploadSuccess.hidden = true;
  analyzeBtn.disabled = true;
}

resumeInput.addEventListener("change", () => {
  if (resumeInput.files[0]) setFile(resumeInput.files[0]);
});

removeFile.addEventListener("click", () => {
  selectedFile = null;
  resumeInput.value = "";
  dropZone.hidden  = false;
  filePreview.hidden = true;
  uploadBtn.disabled = true;
  resumeUploaded = false;
  uploadSuccess.hidden = true;
  analyzeBtn.disabled = true;
  hideError(uploadError);
});

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});
dropZone.addEventListener("click", () => resumeInput.click());

// ── JD word counter ───────────────────────────────────────────────────────

jdInput.addEventListener("input", () => {
  const words = jdInput.value.trim().split(/\s+/).filter(Boolean).length;
  jdWordCount.textContent = `${words} word${words !== 1 ? "s" : ""}`;
  analyzeBtn.disabled = !(resumeUploaded && jdInput.value.trim().length > 20);
});

// ── Helpers ───────────────────────────────────────────────────────────────

function showError(el, msg) {
  el.textContent = "⚠ " + msg;
  el.hidden = false;
}
function hideError(el) { el.hidden = true; }

function setLoading(btn, textEl, spinner, loading) {
  btn.disabled = loading;
  textEl.hidden = loading;
  spinner.hidden = !loading;
}

// ── Upload ────────────────────────────────────────────────────────────────

uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  setLoading(uploadBtn, uploadBtnText, uploadSpinner, true);
  hideError(uploadError);
  uploadSuccess.hidden = true;

  const formData = new FormData();
  formData.append("resume", selectedFile);

  try {
    const resp = await fetch(`${API_BASE}/upload_resume`, {
      method: "POST",
      body: formData
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      showError(uploadError, data.error || "Upload failed.");
    } else {
      uploadSuccess.hidden = false;
      resumeUploaded = true;
      analyzeBtn.disabled = !(jdInput.value.trim().length > 20);
    }
  } catch (err) {
    showError(uploadError, "Cannot reach the server. Is Flask running on port 5000?");
  } finally {
    setLoading(uploadBtn, uploadBtnText, uploadSpinner, false);
    uploadBtn.disabled = resumeUploaded; // lock after success
  }
});

// ── Analyze ───────────────────────────────────────────────────────────────

analyzeBtn.addEventListener("click", async () => {
  const jd = jdInput.value.trim();
  if (!jd || !resumeUploaded) return;

  setLoading(analyzeBtn, analyzeBtnText, analyzeSpinner, true);
  hideError(analyzeError);

  try {
    const resp = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_description: jd })
    });
    const data = await resp.json();

    if (!resp.ok || data.error) {
      showError(analyzeError, data.error || "Analysis failed.");
    } else {
      lastAnalysis = data;
      renderResults(data);
      // Scroll results into view on mobile
      if (window.innerWidth < 900) {
        document.getElementById("resultsPanel").scrollIntoView({ behavior: "smooth" });
      }
    }
  } catch (err) {
    showError(analyzeError, "Cannot reach the server. Is Flask running on port 5000?");
  } finally {
    setLoading(analyzeBtn, analyzeBtnText, analyzeSpinner, false);
    analyzeBtn.disabled = false;
  }
});

// ── Render Results ────────────────────────────────────────────────────────

function renderResults(data) {
  resultsEmpty.hidden  = true;
  resultsContent.hidden = false;

  // ATS Score
  const score = data.ats_score;
  animateCounter(scoreNumber, 0, score, 1000);
  setTimeout(() => {
    scoreBarFill.style.width = score + "%";
  }, 50);

  // Score badge colour
  scoreBadge.className = "score-badge " + scoreClass(score);

  // Breakdown
  breakdownGrid.innerHTML = "";
  const breakdown = data.score_breakdown;
  const bdItems = [
    { label: "Keyword Match",  val: breakdown.keyword_match,  max: 50 },
    { label: "Phrase Match",   val: breakdown.phrase_match,   max: 20 },
    { label: "Action Verbs",   val: breakdown.action_verbs,   max: 15 },
    { label: "Length / Format",val: breakdown.length_format,  max: 15 },
  ];

  bdItems.forEach(item => {
    const pct = Math.round((item.val / item.max) * 100);
    const el = document.createElement("div");
    el.className = "breakdown-item";
    el.innerHTML = `
      <div class="bd-label">${item.label}</div>
      <div class="bd-bar-track">
        <div class="bd-bar-fill" style="width:0%" data-pct="${pct}"></div>
      </div>
      <div class="bd-score">${item.val}<small style="font-size:12px;color:var(--text-muted)">/${item.max}</small></div>
    `;
    breakdownGrid.appendChild(el);
  });

  // Animate breakdown bars after paint
  requestAnimationFrame(() => {
    document.querySelectorAll(".bd-bar-fill").forEach(bar => {
      bar.style.width = bar.dataset.pct + "%";
    });
  });

  // Keywords
  matchedTags.innerHTML = "";
  missingTags.innerHTML = "";

  data.matched_keywords.forEach(kw => {
    const tag = document.createElement("span");
    tag.className = "tag matched";
    tag.textContent = kw;
    matchedTags.appendChild(tag);
  });

  if (data.matched_keywords.length === 0) {
    matchedTags.innerHTML = '<span style="color:var(--text-muted);font-size:13px">No matches found</span>';
  }

  data.missing_keywords.forEach(kw => {
    const tag = document.createElement("span");
    tag.className = "tag missing";
    tag.textContent = kw;
    missingTags.appendChild(tag);
  });

  if (data.missing_keywords.length === 0) {
    missingTags.innerHTML = '<span style="color:var(--green);font-size:13px">No missing keywords 🎉</span>';
  }

  // Strengths & weaknesses
  strengthsList.innerHTML = "";
  weaknessesList.innerHTML = "";

  data.strengths.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  data.weaknesses.forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    weaknessesList.appendChild(li);
  });

  // Improved summary
  summaryText.textContent = data.improved_summary;

  // Stagger card animations
  document.querySelectorAll(".result-card").forEach((card, i) => {
    card.style.animationDelay = `${i * 80}ms`;
  });
}

// ── Copy summary ──────────────────────────────────────────────────────────

copyBtn.addEventListener("click", () => {
  if (!lastAnalysis) return;
  navigator.clipboard.writeText(lastAnalysis.improved_summary).then(() => {
    copyBtn.classList.add("copied");
    copyBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
        <path d="M4 10L8 14L16 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Copied!
    `;
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
          <rect x="7" y="7" width="10" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M13 7V5C13 3.89543 12.1046 3 11 3H5C3.89543 3 3 3.89543 3 5V13C3 14.1046 3.89543 15 5 15H7" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Copy
      `;
    }, 2000);
  });
});

// ── Download ──────────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", () => {
  if (!lastAnalysis) return;

  const score = lastAnalysis.ats_score;
  const matched = lastAnalysis.matched_keywords.join(", ");
  const missing = lastAnalysis.missing_keywords.join(", ");
  const strengths = lastAnalysis.strengths.map((s, i) => `  ${i+1}. ${s}`).join("\n");
  const weaknesses = lastAnalysis.weaknesses.map((w, i) => `  ${i+1}. ${w}`).join("\n");

  const content = [
    "═══════════════════════════════════════════════",
    "   ResumeIQ — Analysis Report",
    "═══════════════════════════════════════════════",
    "",
    `ATS SCORE: ${score}/100`,
    "",
    "SCORE BREAKDOWN:",
    `  Keyword Match:   ${lastAnalysis.score_breakdown.keyword_match}/50`,
    `  Phrase Match:    ${lastAnalysis.score_breakdown.phrase_match}/20`,
    `  Action Verbs:    ${lastAnalysis.score_breakdown.action_verbs}/15`,
    `  Length/Format:   ${lastAnalysis.score_breakdown.length_format}/15`,
    "",
    "MATCHED KEYWORDS:",
    `  ${matched || "None"}`,
    "",
    "MISSING KEYWORDS:",
    `  ${missing || "None"}`,
    "",
    "STRENGTHS:",
    strengths,
    "",
    "WEAK POINTS:",
    weaknesses,
    "",
    "═══════════════════════════════════════════════",
    "   AI-REWRITTEN PROFESSIONAL SUMMARY",
    "═══════════════════════════════════════════════",
    "",
    lastAnalysis.improved_summary,
    "",
    "─────────────────────────────────────────────",
    "Generated by ResumeIQ  |  resumeiq.local",
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "resumeiq_analysis.txt";
  a.click();
  URL.revokeObjectURL(url);
});

// ── Utilities ─────────────────────────────────────────────────────────────

function scoreClass(score) {
  if (score < 40) return "poor";
  if (score < 60) return "fair";
  if (score < 80) return "good";
  return "great";
}

function animateCounter(el, from, to, duration) {
  const start = performance.now();
  function step(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

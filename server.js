require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

if (!GEMINI_API_KEY) {
  console.warn(
    "⚠️  GEMINI_API_KEY is not set. Add it to a .env file before running in production."
  );
}

app.use(cors());
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(__dirname, "public")));

function buildPrompt(language, code, execResult) {
  let execBlock = "No local execution was performed for this language.";
  if (execResult) {
    execBlock = execResult.crashed
      ? `The code was actually executed and THREW this real error:\nName: ${execResult.name}\nMessage: ${execResult.message}\nStack: ${execResult.stack}`
      : "The code was actually executed and it ran WITHOUT throwing any error.";
  }

  return `You are an error-analysis engine embedded inside a code editor. Analyze the following ${language} code like a linter/compiler would, using the execution result as ground truth when provided.

CODE:
\`\`\`${language}
${code}
\`\`\`

EXECUTION RESULT:
${execBlock}

Respond with ONLY a raw JSON object (no markdown fences, no commentary) matching exactly this shape:
{
  "hasError": true or false,
  "severity": "syntax" | "runtime" | "logic" | "none",
  "title": "short error name, or 'No Errors Detected'",
  "meaning": "1-2 sentence plain-English explanation of what is wrong (or confirmation the code is fine)",
  "fix": "concrete, specific instruction on how to fix it",
  "example": "a short corrected code snippet demonstrating the fix"
}

If the execution result shows a real thrown error, your title/meaning must match that real error. If there was no crash, only report an error if there is a genuine bug (e.g. logic error, likely runtime failure on other inputs); otherwise hasError should be false.`;
}

app.post("/api/analyze", async (req, res) => {
  try {
    const { language, code, execResult } = req.body;

    if (!code || typeof code !== "string" || code.trim() === "") {
      return res.status(400).json({ error: "code is required" });
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });
    }

    const prompt = buildPrompt(language || "unknown", code, execResult || null);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return res.status(502).json({ error: "Upstream AI request failed" });
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("\n");

    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error("Failed to parse model output:", text);
      return res.status(502).json({ error: "AI returned an unparseable response" });
    }

    return res.json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`ErroFind AI server running at http://localhost:${PORT}`);
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { language, code, execResult } = req.body || {};

    if (!code || typeof code !== "string" || code.trim() === "") {
      res.status(400).json({ error: "code is required" });
      return;
    }
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set in Vercel environment variables");
      res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });
      return;
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
      res.status(502).json({ error: "Upstream AI request failed" });
      return;
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
      res.status(502).json({ error: "AI returned an unparseable response" });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};

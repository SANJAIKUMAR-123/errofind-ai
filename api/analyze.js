const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

function buildPrompt(language, code, execResult) {
    let executionResult = "No local execution was performed for this language.";

    if (execResult) {
        if (execResult.crashed) {
            executionResult = `
The code was executed in a browser sandbox and produced this real error:

Error Name: ${execResult.name}
Error Message: ${execResult.message}
Stack:
${execResult.stack || "No stack trace available"}
`;
        } else {
            executionResult = `
The JavaScript code was executed successfully and did not throw an error.
`;
        }
    }

    return `
You are ErroFind AI, an expert programming error analysis assistant.

Analyze the following ${language} code.

Your job is to identify:
1. Syntax errors
2. Runtime errors
3. Logic errors
4. Potential problems
5. How to fix the problem
6. A corrected example

IMPORTANT:
- If a real execution error is provided, use it as the primary source of truth.
- Do not invent an error if the code is valid.
- If there is no error, clearly say that no error was detected.
- Keep explanations beginner-friendly.
- Return ONLY valid JSON.
- Do not use Markdown.
- Do not wrap the JSON inside code fences.

PROGRAMMING LANGUAGE:
${language}

CODE:
${code}

EXECUTION RESULT:
${executionResult}

Return exactly this JSON structure:

{
  "hasError": true,
  "severity": "syntax",
  "title": "Short error name",
  "meaning": "Simple explanation of the error.",
  "fix": "Specific instructions to fix the problem.",
  "example": "Corrected code example."
}

Allowed severity values:

"syntax"
"runtime"
"logic"
"none"

If there is no error:

{
  "hasError": false,
  "severity": "none",
  "title": "No Errors Detected",
  "meaning": "The code appears to be valid.",
  "fix": "No fix is required.",
  "example": "Original or improved code."
}
`;
}

function extractJson(text) {
    if (!text) {
        throw new Error("Empty response from Gemini");
    }

    let cleaned = text.trim();

    cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned);
}

module.exports = async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({
            error: "Method not allowed"
        });
        return;
    }

    try {
        if (!GEMINI_API_KEY) {
            console.error("GEMINI_API_KEY is missing");

            return res.status(500).json({
                error: "GEMINI_API_KEY is not configured on the server."
            });
        }

        const body = req.body || {};

        const language = body.language || "Unknown";
        const code = body.code;
        const execResult = body.execResult || null;

        if (!code || typeof code !== "string") {
            return res.status(400).json({
                error: "Code is required."
            });
        }

        if (code.trim().length === 0) {
            return res.status(400).json({
                error: "Please provide some code."
            });
        }

        if (code.length > 100000) {
            return res.status(413).json({
                error: "Code is too large. Please keep it below 100,000 characters."
            });
        }

        const prompt = buildPrompt(
            language,
            code,
            execResult
        );

        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

        const response = await fetch(url, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY
            },

            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],

                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 1200,
                    responseMimeType: "application/json"
                }
            })
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error(
                "Gemini API error:",
                response.status,
                responseText
            );

            let message = "Gemini API request failed.";

            try {
                const errorData = JSON.parse(responseText);

                message =
                    errorData?.error?.message ||
                    message;
            } catch {
                // Keep default message
            }

            return res.status(502).json({
                error: message
            });
        }

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            console.error(
                "Gemini returned invalid JSON response:",
                responseText
            );

            return res.status(502).json({
                error: "Invalid response received from Gemini."
            });
        }

        const generatedText =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        if (!generatedText) {
            console.error(
                "Gemini response did not contain generated text:",
                JSON.stringify(data)
            );

            return res.status(502).json({
                error: "Gemini returned an empty response."
            });
        }

        let result;

        try {
            result = extractJson(generatedText);
        } catch (error) {
            console.error(
                "Could not parse Gemini JSON:",
                generatedText
            );

            return res.status(502).json({
                error: "AI returned an invalid analysis format."
            });
        }

        result = {
            hasError: Boolean(result.hasError),

            severity:
                ["syntax", "runtime", "logic", "none"]
                    .includes(result.severity)
                    ? result.severity
                    : "none",

            title:
                typeof result.title === "string"
                    ? result.title
                    : "Analysis Result",

            meaning:
                typeof result.meaning === "string"
                    ? result.meaning
                    : "No explanation was provided.",

            fix:
                typeof result.fix === "string"
                    ? result.fix
                    : "No specific fix was provided.",

            example:
                typeof result.example === "string"
                    ? result.example
                    : code
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error(
            "Server error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error. Please try again."
        });
    }
};

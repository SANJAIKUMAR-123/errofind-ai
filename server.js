require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT =
    process.env.PORT || 3000;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

const MODEL =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";


app.use(cors());

app.use(
    express.json({
        limit: "200kb"
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


function buildPrompt(
    language,
    code,
    execResult
) {

    let executionResult =
        "No local execution was performed for this language.";

    if (execResult) {

        if (execResult.crashed) {

            executionResult = `
The code was executed and produced this real error:

Name:
${execResult.name}

Message:
${execResult.message}

Stack:
${execResult.stack || ""}
`;

        } else {

            executionResult = `
The JavaScript code was executed successfully.
No error was thrown.
`;
        }
    }


    return `
You are ErroFind AI.

Analyze this ${language} program.

CODE:
${code}

EXECUTION RESULT:
${executionResult}

Return ONLY valid JSON.

Use exactly:

{
  "hasError": true,
  "severity": "syntax",
  "title": "Short error name",
  "meaning": "Simple explanation.",
  "fix": "Specific fix.",
  "example": "Corrected code."
}

Allowed severity:

syntax
runtime
logic
none

If there is no error, use:

{
  "hasError": false,
  "severity": "none",
  "title": "No Errors Detected",
  "meaning": "The code appears valid.",
  "fix": "No fix is required.",
  "example": "Example code."
}
`;
}


function extractJson(text) {

    let cleaned =
        text.trim();

    cleaned =
        cleaned
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();


    const start =
        cleaned.indexOf("{");

    const end =
        cleaned.lastIndexOf("}");


    if (
        start !== -1 &&
        end !== -1
    ) {

        cleaned =
            cleaned.substring(
                start,
                end + 1
            );
    }


    return JSON.parse(cleaned);
}


app.post(
    "/api/analyze",
    async (req, res) => {

        try {

            if (!GEMINI_API_KEY) {

                return res.status(500).json({
                    error:
                        "GEMINI_API_KEY is missing from .env"
                });
            }


            const {
                language,
                code,
                execResult
            } = req.body || {};


            if (
                !code ||
                typeof code !== "string" ||
                code.trim() === ""
            ) {

                return res.status(400).json({
                    error:
                        "Code is required."
                });
            }


            const prompt =
                buildPrompt(
                    language || "Unknown",
                    code,
                    execResult || null
                );


            const url =
                `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;


            const response =
                await fetch(
                    url,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            "x-goog-api-key":
                                GEMINI_API_KEY
                        },

                        body:
                            JSON.stringify({

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
                                    responseMimeType:
                                        "application/json"
                                }
                            })
                    }
                );


            const responseText =
                await response.text();


            if (!response.ok) {

                console.error(
                    "Gemini error:",
                    responseText
                );

                return res.status(502).json({
                    error:
                        "Gemini API request failed."
                });
            }


            const data =
                JSON.parse(
                    responseText
                );


            const text =
                data
                    ?.candidates?.[0]
                    ?.content?.parts
                    ?.map(
                        part =>
                            part.text || ""
                    )
                    .join("")
                    .trim();


            if (!text) {

                return res.status(502).json({
                    error:
                        "Gemini returned an empty response."
                });
            }


            const result =
                extractJson(text);


            return res.json(result);


        } catch (error) {

            console.error(
                "Server error:",
                error
            );

            return res.status(500).json({
                error:
                    "Internal server error."
            });
        }
    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `ErroFind AI running at http://localhost:${PORT}`
        );

    }
);

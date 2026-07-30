# ErroFind AI

Paste real code, get a real AI-driven diagnosis — no static `errorDatabase` lookup.

## What changed from the original ErroFind

| Before | Now |
|---|---|
| User pastes error *text*, app string-matches it against a hardcoded `errorDatabase` object | User pastes actual **code**; for JavaScript it's *executed* in a sandboxed Web Worker to catch the real thrown error |
| Only errors already listed in `errors.js` could be recognized | Claude analyzes the code + real execution result and explains *any* error, seen before or not |
| Explanations were fixed, canned text | Explanations, fixes, and corrected examples are generated fresh per request |
| Everything ran client-side, `errors.js` shipped to the browser | A small Express backend proxies the AI call so your API key never reaches the browser |

## How it works

1. You paste code and pick a language.
2. If the language is JavaScript, `public/script.js` runs your code inside a sandboxed `Worker` with a 3-second timeout, so it actually catches real `TypeError`, `ReferenceError`, `SyntaxError`, infinite loops, etc. — the same way a runtime would.
3. The code (plus the real captured error, if any) is sent to `POST /api/analyze` on your server.
4. `server.js` builds a prompt and calls the Gemini API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) using your `GEMINI_API_KEY`, asking for a structured JSON diagnosis.
5. The JSON (`title`, `severity`, `meaning`, `fix`, `example`) is sent back and rendered in the same card UI as before.

Other languages (Python, Java, C, C++) can't be safely executed in a browser, so their code is sent straight to Claude for analysis — it reads the code the way a human reviewer or linter would.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and paste your free key from https://aistudio.google.com/apikey
npm start
```

Visit `http://localhost:3000`.

## Deploying

This is a normal Node/Express app — deploy it anywhere that supports Node (Render, Railway, Fly.io, a VPS, etc.). Just make sure:

- `ANTHROPIC_API_KEY` is set as an environment variable on the host (never commit `.env`)
- The platform runs `npm install && npm start`

## Notes / things to harden before production

- **Rate limiting**: add something like `express-rate-limit` on `/api/analyze` — the Gemini free tier has per-minute/per-day request caps, and this stops one user from burning through them.
- **Input size limits**: the server already caps request bodies at 200kb; you may want to also cap pasted code length in the frontend.
- **Sandboxing beyond JS**: if you later want to *actually run* Python/Java/C/C++ (not just have the AI read it), that requires a real server-side sandbox (e.g. Docker containers, Judge0, Piston) — running untrusted code needs process isolation, which a browser Worker can't provide for non-JS languages.
- **Model choice**: `GEMINI_MODEL` defaults to `gemini-2.5-flash`, a free-tier model. Check [Google's pricing page](https://ai.google.dev/pricing) for which models currently have a free tier, since Google periodically changes this per model.
- **Free tier limits**: the free tier is rate-limited (requests per minute/day), not unlimited. If you hit `429` errors under real traffic, either add backoff/retry logic or move to a paid tier.

## File structure

```
errofind-deploy/
├── server.js          # Express server + /api/analyze proxy to Claude
├── package.json
├── .env.example
└── public/
    ├── index.html
    ├── style.css
    ├── script.js       # sandboxed JS execution + calls /api/analyze
    └── images/
```

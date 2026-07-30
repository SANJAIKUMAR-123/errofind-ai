let currentResult = null;
let searches = 0;
let history = []; // { code, language, title } — in-memory only, resets on reload

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("searchCount").textContent = searches;
    loadHistory();

    document.getElementById("clearHistoryBtn").addEventListener("click", () => {
        history = [];
        searches = 0;
        document.getElementById("searchCount").textContent = searches;
        loadHistory();
    });

    document.getElementById("themeBtn").addEventListener("click", () => {
        document.body.classList.toggle("dark");
    });
});

/* ---------- Sandboxed execution for JavaScript ---------- */

function runJSInWorker(code) {
    return new Promise((resolve) => {
        const workerSrc = `
            self.onmessage = function(e){
                try {
                    const fn = new Function(e.data);
                    fn();
                    self.postMessage({ crashed:false });
                } catch(err) {
                    self.postMessage({
                        crashed:true,
                        name: err.name,
                        message: err.message,
                        stack: (err.stack||"").split("\\n").slice(0,3).join("\\n")
                    });
                }
            };
        `;
        const blob = new Blob([workerSrc], { type: "application/javascript" });
        const worker = new Worker(URL.createObjectURL(blob));

        const timeout = setTimeout(() => {
            worker.terminate();
            resolve({
                crashed: true,
                name: "TimeoutError",
                message: "Execution took too long (possible infinite loop).",
                stack: "",
            });
        }, 3000);

        worker.onmessage = (e) => {
            clearTimeout(timeout);
            worker.terminate();
            resolve(e.data);
        };
        worker.onerror = (e) => {
            clearTimeout(timeout);
            worker.terminate();
            resolve({ crashed: true, name: "Error", message: e.message, stack: "" });
        };
        worker.postMessage(code);
    });
}

/* ---------- History ---------- */

function saveHistory(entry) {
    history.unshift(entry);
    if (history.length > 5) history = history.slice(0, 5);
    loadHistory();
}

function loadHistory() {
    const box = document.getElementById("history-box");
    if (!box) return;

    if (history.length === 0) {
        box.innerHTML = "No analyses yet";
        return;
    }

    box.innerHTML = history
        .map(
            (item, i) => `
        <div class="history-item" onclick="reuseSearch(${i})">
            <strong>${item.title}</strong> — ${item.language}
        </div>
    `
        )
        .join("");
}

function reuseSearch(index) {
    const item = history[index];
    if (!item) return;
    document.getElementById("val").value = item.code;
    document.getElementById("language").value = item.language;
    analyze();
}

/* ---------- AI analysis ---------- */

async function analyze() {
    const code = document.getElementById("val").value;
    const language = document.getElementById("language").value;
    const result = document.getElementById("ans");
    const btn = document.getElementById("analyzeBtn");
    const btnLabel = document.getElementById("btnLabel");

    if (code.trim() === "") {
        result.innerHTML = "<p>⚠️ Please paste some code.</p>";
        return;
    }
    if (language === "") {
        result.innerHTML = "<p>⚠️ Please select a programming language.</p>";
        return;
    }

    btn.disabled = true;
    btnLabel.innerHTML = `<span class="spinner"></span> Analyzing...`;
    result.innerHTML = "";

    try {
        let execResult = null;
        if (language === "JavaScript") {
            execResult = await runJSInWorker(code);
        }

        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language, code, execResult }),
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || "Analysis request failed");
        }

        const parsed = await response.json();
        currentResult = parsed;

        let execHtml = "";
        if (execResult && execResult.crashed) {
            execHtml = `<div class="error-box">${execResult.name}: ${execResult.message}</div>
            <p class="note">↑ Real error captured by executing your code in a sandboxed worker.</p>`;
        }

        result.innerHTML = `
            <div class="error-card">
                <h2>${parsed.title}</h2>
                <span class="severity sev-${parsed.severity}">${parsed.severity}</span>
                ${execHtml}
                <h3>What is the Error?</h3>
                <p>${parsed.meaning}</p>
                <h3>How to Fix It?</h3>
                <p>${parsed.fix}</p>
                <button onclick="copyFix()">Copy Fix</button>
                <button onclick="downloadReport()">Download Report</button>
                <h3>Example Program</h3>
                <pre>${parsed.example}</pre>
            </div>
        `;

        searches++;
        document.getElementById("searchCount").textContent = searches;
        saveHistory({ code, language, title: parsed.title });
    } catch (err) {
        result.innerHTML = `<p>⚠️ ${err.message}</p>`;
    } finally {
        btn.disabled = false;
        btnLabel.textContent = "Analyze with AI";
    }
}

function copyFix() {
    if (!currentResult) return;
    navigator.clipboard.writeText(currentResult.fix);
    alert("Fix copied successfully!");
}

function downloadReport() {
    if (!currentResult) return;

    const report = `
ERROFIND AI REPORT
====================

Error:
${currentResult.title}

Severity: ${currentResult.severity}

Meaning:
${currentResult.meaning}

Fix:
${currentResult.fix}

Example:
${currentResult.example}

Generated by ErroFind AI
`;

    const blob = new Blob([report], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = currentResult.title.replace(/\s+/g, "_") + ".txt";
    link.click();
}

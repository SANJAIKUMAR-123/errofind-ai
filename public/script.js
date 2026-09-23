let currentResult = null;
let searches = 0;
let history = [];

document.addEventListener("DOMContentLoaded", () => {

    const searchCount = document.getElementById("searchCount");

    if (searchCount) {
        searchCount.textContent = searches;
    }

    loadHistory();

    const clearHistoryBtn =
        document.getElementById("clearHistoryBtn");

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener("click", () => {
            history = [];
            searches = 0;

            if (searchCount) {
                searchCount.textContent = searches;
            }

            loadHistory();
        });
    }

    const themeBtn =
        document.getElementById("themeBtn");

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark");
        });
    }
});


/* =========================================================
   JAVASCRIPT SANDBOX
========================================================= */

function runJSInWorker(code) {

    return new Promise((resolve) => {

        const workerSource = `
            self.onmessage = function(event) {

                try {

                    const fn = new Function(event.data);

                    fn();

                    self.postMessage({
                        crashed: false
                    });

                } catch (error) {

                    self.postMessage({
                        crashed: true,
                        name: error.name || "Error",
                        message: error.message || "Unknown error",
                        stack: error.stack || ""
                    });

                }

            };
        `;

        const blob =
            new Blob(
                [workerSource],
                {
                    type: "application/javascript"
                }
            );

        const worker =
            new Worker(
                URL.createObjectURL(blob)
            );

        const timeout =
            setTimeout(() => {

                worker.terminate();

                resolve({
                    crashed: true,
                    name: "TimeoutError",
                    message:
                        "Execution took too long. Possible infinite loop.",
                    stack: ""
                });

            }, 3000);

        worker.onmessage = (event) => {

            clearTimeout(timeout);

            worker.terminate();

            resolve(event.data);
        };

        worker.onerror = (event) => {

            clearTimeout(timeout);

            worker.terminate();

            resolve({
                crashed: true,
                name: "WorkerError",
                message:
                    event.message ||
                    "JavaScript execution failed.",
                stack: ""
            });
        };

        worker.postMessage(code);
    });
}


/* =========================================================
   HISTORY
========================================================= */

function saveHistory(entry) {

    history.unshift(entry);

    if (history.length > 5) {
        history =
            history.slice(0, 5);
    }

    loadHistory();
}


function loadHistory() {

    const box =
        document.getElementById("history-box");

    if (!box) {
        return;
    }

    if (history.length === 0) {

        box.innerHTML =
            "No analyses yet";

        return;
    }

    box.innerHTML =
        history
            .map((item, index) => {

                const title =
                    escapeHtml(
                        item.title
                    );

                const language =
                    escapeHtml(
                        item.language
                    );

                return `
                    <div
                        class="history-item"
                        onclick="reuseSearch(${index})"
                    >
                        <strong>${title}</strong>
                        — ${language}
                    </div>
                `;
            })
            .join("");
}


function reuseSearch(index) {

    const item =
        history[index];

    if (!item) {
        return;
    }

    const codeBox =
        document.getElementById("val");

    const languageBox =
        document.getElementById("language");

    if (codeBox) {
        codeBox.value =
            item.code;
    }

    if (languageBox) {
        languageBox.value =
            item.language;
    }

    analyze();
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

    if (value === null ||
        value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   AI ANALYSIS
========================================================= */

async function analyze() {

    const codeBox =
        document.getElementById("val");

    const languageBox =
        document.getElementById("language");

    const result =
        document.getElementById("ans");

    const btn =
        document.getElementById("analyzeBtn");

    const btnLabel =
        document.getElementById("btnLabel");


    if (!codeBox ||
        !languageBox ||
        !result) {

        console.error(
            "Required UI elements are missing."
        );

        return;
    }


    const code =
        codeBox.value;

    const language =
        languageBox.value;


    if (code.trim() === "") {

        result.innerHTML =
            "<p>⚠️ Please paste some code.</p>";

        return;
    }


    if (language === "") {

        result.innerHTML =
            "<p>⚠️ Please select a programming language.</p>";

        return;
    }


    if (code.length > 100000) {

        result.innerHTML =
            "<p>⚠️ Code is too large. Please keep it below 100,000 characters.</p>";

        return;
    }


    if (btn) {
        btn.disabled = true;
    }

    if (btnLabel) {

        btnLabel.innerHTML =
            `<span class="spinner"></span> Analyzing...`;
    }

    result.innerHTML =
        "<p>Analyzing your code...</p>";


    try {

        let execResult = null;


        /*
         * Only JavaScript is executed locally.
         * Python, Java, C and C++ are analyzed by AI.
         */

        if (language === "JavaScript") {

            execResult =
                await runJSInWorker(code);
        }


        const response =
            await fetch(
                "/api/analyze",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            language,
                            code,
                            execResult
                        })
                }
            );


        let responseData = null;

        try {

            responseData =
                await response.json();

        } catch {

            responseData = {};
        }


        if (!response.ok) {

            throw new Error(
                responseData.error ||
                `Server error (${response.status})`
            );
        }


        if (!responseData ||
            typeof responseData !== "object") {

            throw new Error(
                "Invalid response received from server."
            );
        }


        currentResult =
            responseData;


        let executionHtml = "";


        if (
            execResult &&
            execResult.crashed
        ) {

            executionHtml = `
                <div class="error-box">
                    <strong>
                        ${escapeHtml(execResult.name)}
                    </strong>
                    :
                    ${escapeHtml(execResult.message)}
                </div>

                <p class="note">
                    Real error captured by the JavaScript sandbox.
                </p>
            `;
        }


        const title =
            escapeHtml(
                responseData.title
            );

        const severity =
            escapeHtml(
                responseData.severity
            );

        const meaning =
            escapeHtml(
                responseData.meaning
            );

        const fix =
            escapeHtml(
                responseData.fix
            );

        const example =
            escapeHtml(
                responseData.example
            );


        result.innerHTML = `
            <div class="error-card">

                <h2>
                    ${title}
                </h2>

                <span
                    class="severity sev-${severity}"
                >
                    ${severity}
                </span>

                ${executionHtml}

                <h3>
                    What is the Error?
                </h3>

                <p>
                    ${meaning}
                </p>

                <h3>
                    How to Fix It?
                </h3>

                <p>
                    ${fix}
                </p>

                <button
                    onclick="copyFix()"
                >
                    Copy Fix
                </button>

                <button
                    onclick="downloadReport()"
                >
                    Download Report
                </button>

                <h3>
                    Example Program
                </h3>

                <pre>${example}</pre>

            </div>
        `;


        searches++;


        const searchCount =
            document.getElementById(
                "searchCount"
            );

        if (searchCount) {
            searchCount.textContent =
                searches;
        }


        saveHistory({
            code,
            language,
            title:
                responseData.title ||
                "Analysis"
        });


    } catch (error) {

        console.error(
            "Analysis failed:",
            error
        );

        result.innerHTML = `
            <div class="error-box">
                ⚠️
                ${escapeHtml(
                    error.message ||
                    "Something went wrong."
                )}
            </div>
        `;

    } finally {

        if (btn) {
            btn.disabled = false;
        }

        if (btnLabel) {
            btnLabel.textContent =
                "Analyze with AI";
        }
    }
}


/* =========================================================
   COPY FIX
========================================================= */

async function copyFix() {

    if (!currentResult) {
        return;
    }

    try {

        await navigator.clipboard.writeText(
            currentResult.fix || ""
        );

        alert(
            "Fix copied successfully!"
        );

    } catch (error) {

        console.error(
            error
        );

        alert(
            "Unable to copy the fix."
        );
    }
}


/* =========================================================
   DOWNLOAD REPORT
========================================================= */

function downloadReport() {

    if (!currentResult) {
        return;
    }


    const report = `
ERROFIND AI REPORT
==============================

Error:
${currentResult.title || "Unknown"}

Severity:
${currentResult.severity || "none"}

Meaning:
${currentResult.meaning || ""}

Fix:
${currentResult.fix || ""}

Example:
${currentResult.example || ""}

Generated by ErroFind AI
`;


    const blob =
        new Blob(
            [report],
            {
                type: "text/plain;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href = url;

    link.download =
        `${sanitizeFilename(
            currentResult.title ||
            "errofind-report"
        )}.txt`;


    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}


function sanitizeFilename(name) {

    return String(name)
        .replace(/[<>:"/\\|?*]+/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 80);
}

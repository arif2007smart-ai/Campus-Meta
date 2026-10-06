const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "llama3.2:3b";

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function isDateTimeQuestion(message) {
  const text = message.toLowerCase();
  return /(current date|current time|date and time|today's date|what time is it|what is the time|what is the date|what date is it|date today|time now|now time|current datetime)/.test(text);
}

function getCurrentDateTime() {
  return new Date().toLocaleString("en-IN", {
    dateStyle: "full",
    timeStyle: "medium"
  });
}

function getSystemPrompt(message) {
  const text = message || "";
  if (/[\u0B80-\u0BFF]/.test(text)) {
    return "You are a helpful assistant. Reply in natural Tamil written in Tamil script. Answer clearly, briefly, and accurately in Tamil. Support coding and general questions.";
  }

  if (/\b(?:enna|epdi|eppadi|yean|yen|eppo|enga|idhu|ithu|adhu|athu|irukka|irukku|iruku|aagum|aachu|sollu|sollunga|venum|illa|illai|theriyuma|pannunga|pannu|panradhu|panrathu|romba|konjam|enakku|unakku|thanneer|sapadu|vanakkam|nandri|apdi|sari)\b/i.test(text)) {
    return "You are a helpful assistant. Reply in natural conversational Tanglish using English letters only, with Tamil-style phrasing. Keep it concise and accurate.";
  }

  return "You are a helpful assistant. Answer clearly, directly, and correctly in English. For coding questions, explain simply and accurately. Keep answers concise but helpful.";
}

app.get("/api/health", async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      throw new Error("Ollama tags endpoint unavailable.");
    }

    const data = await response.json();
    const modelAvailable = Array.isArray(data.models) &&
      data.models.some(model => model.name === OLLAMA_MODEL);

    res.json({
      success: true,
      ollamaAvailable: true,
      llmConfigured: modelAvailable
    });
  } catch (error) {
    res.json({
      success: true,
      ollamaAvailable: false,
      llmConfigured: false
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        error: "Request body must be a JSON object."
      });
    }

    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Please enter a message."
      });
    }

    if (isDateTimeQuestion(message)) {
      return res.json({
        success: true,
        answer: `The current system date and time is: ${getCurrentDateTime()}`
      });
    }

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          {
            role: "system",
            content: getSystemPrompt(message)
          },
          { role: "user", content: message }
        ],
        stream: false
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw Object.assign(new Error(`Ollama request failed (${response.status}): ${errorText || response.statusText}`), {
        status: 502
      });
    }

    const data = await response.json();
    const answer = data?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      throw Object.assign(new Error("Ollama returned an empty response."), {
        status: 502
      });
    }

    return res.json({
      success: true,
      answer: answer.trim()
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    const userMessage = status === 503
      ? `Ollama could not find ${OLLAMA_MODEL}. Run "ollama serve" and then "ollama pull ${OLLAMA_MODEL}" if needed.`
      : "Could not get a response from local Ollama. Make sure Ollama is running and try again.";

    console.error("Chat error:", error.message);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: userMessage,
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`CampusMate AI running at http://localhost:${PORT}`);
  console.log(`Using local Ollama model: ${OLLAMA_MODEL}`);
});


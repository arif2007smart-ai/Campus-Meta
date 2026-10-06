const chat = document.getElementById("chat");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const stopButton = document.getElementById("stopButton");
const status = document.getElementById("status");
const statusLabel = document.getElementById("statusLabel");

const activeRequests = new Map();
let requestId = 0;
let ollamaAvailable = false;
let modelAvailable = false;

function addMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user-row" : ""}`;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "bot-avatar";
    avatar.textContent = "AI";
    row.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = `message ${role === "user" ? "user-message" : "bot-message"}`;

  if (role === "assistant") {
    const label = document.createElement("strong");
    label.textContent = "CampusMate AI";
    bubble.appendChild(label);
  }

  const text = document.createElement("div");
  text.textContent = content;
  bubble.appendChild(text);
  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function addTyping(id) {
  const row = document.createElement("div");
  row.className = "message-row";
  row.id = `typing-${id}`;

  const avatar = document.createElement("div");
  avatar.className = "bot-avatar";
  avatar.textContent = "AI";

  const bubble = document.createElement("div");
  bubble.className = "message bot-message typing";
  bubble.textContent = "Thinking...";

  row.appendChild(avatar);
  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function removeTyping(id) {
  const typing = document.getElementById(`typing-${id}`);
  if (typing) typing.remove();
}

function setStatus(label, state) {
  statusLabel.textContent = label;
  status.dataset.state = state;
}

function updateRequestStatus() {
  if (activeRequests.size) {
    setStatus("AI thinking...", "checking");
  } else if (modelAvailable) {
    setStatus("AI online", "online");
  } else if (ollamaAvailable) {
    setStatus("Model not found", "unavailable");
  } else {
    setStatus("Ollama offline", "offline");
  }

  stopButton.disabled = activeRequests.size === 0;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (!response.ok || data.success !== true) {
      throw new Error(data.error || "Health check failed");
    }

    ollamaAvailable = data.ollamaAvailable === true;
    modelAvailable = data.llmConfigured === true;
  } catch (error) {
    ollamaAvailable = false;
    modelAvailable = false;
  }

  updateRequestStatus();
}

async function sendMessage(message, id, controller) {
  addTyping(id);
  activeRequests.set(id, controller);
  updateRequestStatus();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok || data.success !== true) {
      throw new Error(data.error || "Request failed.");
    }

    if (typeof data.answer !== "string" || !data.answer.trim()) {
      throw new Error("The AI returned an empty response.");
    }

    addMessage("assistant", data.answer.trim());
    modelAvailable = true;
  } catch (error) {
    if (!controller.signal.aborted) {
      addMessage("assistant", error.message || "Something went wrong.");
    }

    if (error instanceof TypeError) {
      ollamaAvailable = false;
      modelAvailable = false;
    }
  } finally {
    removeTyping(id);
    activeRequests.delete(id);
    updateRequestStatus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  input.style.height = "auto";

  const id = ++requestId;
  const controller = new AbortController();
  sendMessage(message, id, controller);
});

stopButton.addEventListener("click", () => {
  for (const [id, controller] of activeRequests) {
    controller.abort();
    removeTyping(id);
  }

  activeRequests.clear();
  updateRequestStatus();
  input.focus();
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
});

checkHealth();
input.focus();

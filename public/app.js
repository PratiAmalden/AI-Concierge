const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const conversation = document.querySelector("#conversation");
const notice = document.querySelector("#notice");
const sendButton = form.querySelector("button[type='submit']");

let history = [];

// Add a safely rendered message and an optional link to human support.
function addMessage(role, content, handoff = false) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Concierge";

  const paragraph = document.createElement("p");
  paragraph.textContent = content;
  article.append(label, paragraph);

  if (handoff) {
    const link = document.createElement("a");
    link.className = "handoff-link";
    link.href = "https://codeyourfuture.io/";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Contact CodeYourFuture";
    article.append(link);
  }

  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
  return article;
}

// Show immediate feedback while the model is generating its reply.
function addTypingIndicator() {
  const article = document.createElement("article");
  article.className = "message assistant-message typing-message";

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = "Concierge";

  const status = document.createElement("p");
  status.className = "typing-status";
  status.setAttribute("role", "status");
  status.textContent = "Thinking";

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    dots.append(document.createElement("span"));
  }

  status.append(dots);
  article.append(label, status);
  conversation.append(article);
  conversation.scrollTop = conversation.scrollHeight;
  return article;
}

// Send one user turn, update the visible transcript, and keep only recent history.
async function sendMessage(message) {
  const trimmed = message.trim();
  if (trimmed.length === 0) return;

  input.value = "";
  notice.textContent = "";
  sendButton.disabled = true;
  input.disabled = true;
  const userMessage = addMessage("user", trimmed);
  const typingIndicator = addTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ message: trimmed, history: { messages: history } }),
    });
    let finalData;
    try {
      finalData = await response.json();
    } catch {
      throw new Error("The concierge returned an invalid response. Please try again.");
    }
    if (!response.ok) {
      throw new Error(finalData.error ?? "The message could not be sent.");
    }

    typingIndicator.remove();
    userMessage.querySelector("p").textContent = finalData.safeUserMessage;
    addMessage("assistant", finalData.result.reply, finalData.result.handoff);
    history = [
      ...history,
      { role: "user", content: finalData.safeUserMessage },
      { role: "assistant", content: finalData.result.reply },
    ].slice(-12);

    if (finalData.piiRedacted) {
      notice.textContent = "We removed contact or identifying details before processing your message.";
    }
  } catch (error) {
    typingIndicator.remove();
    addMessage(
      "assistant",
      error instanceof Error && error.message !== "Failed to fetch"
        ? error.message
        : "I can't connect to the concierge right now. Please visit the CodeYourFuture website or Signposts for support.",
      error instanceof Error && error.message === "Failed to fetch",
    );
  } finally {
    sendButton.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

// Stop the browser's normal form submission and send the current message instead.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage(input.value);
});

// Enter sends the message.
// Shift+Enter inserts a new line.
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
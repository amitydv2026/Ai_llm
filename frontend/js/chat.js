/**
 * chat.js — Core chat logic for My_LLM.
 *
 * Handles:
 * - Loading conversation list into sidebar
 * - Sending messages (streaming + non-streaming)
 * - Displaying messages with markdown rendering
 * - Image generation mode
 * - Conversation management (create, rename, delete)
 */

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let activeConversationId = null;
let isGenerating         = false;
let imageMode            = false;
let streamController     = null;

const LAST_CONV_KEY = "my_llm_last_conv"; // localStorage key

// ─────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────

const sidebar           = document.getElementById("sidebar");
const sidebarOverlay    = document.getElementById("sidebarOverlay");
const convList          = document.getElementById("convList");
const messagesEl        = document.getElementById("messages");
const chatInput         = document.getElementById("chatInput");
const sendBtn           = document.getElementById("sendBtn");
const stopBtn           = document.getElementById("stopBtn");
const chatTitleEl       = document.getElementById("chatTitle");
const btnNewChat        = document.getElementById("btnNewChat");
const btnToggleSidebar  = document.getElementById("btnToggleSidebar");
const userNameEl        = document.getElementById("userName");
const userEmailEl       = document.getElementById("userEmail");
const userAvatarEl      = document.getElementById("userAvatar");
const btnLogout         = document.getElementById("btnLogout");
const btnToggleImage    = document.getElementById("btnToggleImage");
const modeBadge         = document.getElementById("modeBadge");
const emptyState        = document.getElementById("emptyState");

// ─────────────────────────────────────────────
// Initialise
// ─────────────────────────────────────────────

async function initChat() {
  requireAuth();

  // Populate user info
  const user = getUser();
  if (user) {
    userNameEl.textContent  = user.name  || "User";
    userEmailEl.textContent = user.email || "";
    userAvatarEl.textContent = (user.name || "U")[0].toUpperCase();
  }

  // Load conversations
  await loadConversations();

  // Restore last active conversation after refresh
  const lastConvId = localStorage.getItem(LAST_CONV_KEY);
  if (lastConvId) {
    // Find it in the sidebar list to get its title
    const item = document.querySelector(`.conv-item[data-id="${lastConvId}"]`);
    if (item) {
      const title = item.querySelector(".conv-item-title")?.textContent || "Chat";
      await openConversation(lastConvId, title);
    }
  }

  // Auto-resize textarea
  chatInput.addEventListener("input", () => autoResize(chatInput));

  // Send on Enter (Shift+Enter = new line)
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Send button click
  sendBtn.addEventListener("click", handleSend);

  // Initial send button state
  chatInput.addEventListener("input", updateSendBtn);

  // Sidebar toggle
  btnToggleSidebar.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  // New chat
  btnNewChat.addEventListener("click", createNewConversation);

  // Logout
  btnLogout.addEventListener("click", handleLogout);

  // Image mode toggle (checkbox)
  btnToggleImage.addEventListener("change", toggleImageMode);

  // Stop generation
  stopBtn.addEventListener("click", stopGeneration);

  // Suggestion chips
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chatInput.value = chip.dataset.prompt || chip.textContent.trim();
      autoResize(chatInput);
      updateSendBtn();
      chatInput.focus();
    });
  });

  // Close context menu on outside click
  document.addEventListener("click", () => {
    document.querySelectorAll(".context-menu").forEach((m) => m.remove());
  });
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────

function toggleSidebar() {
  if (window.innerWidth <= 640) {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("visible");
  } else {
    sidebar.classList.toggle("collapsed");
  }
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("visible");
}

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────

async function loadConversations() {
  try {
    const data = await Conversations.list();
    renderConversationList(data.conversations || []);
  } catch (err) {
    console.error("Failed to load conversations:", err);
  }
}

function renderConversationList(conversations) {
  convList.innerHTML = "";

  if (!conversations.length) {
    convList.innerHTML = `
      <div style="padding: 1rem 0.75rem; color: var(--text-muted); font-size: 0.8rem;">
        No conversations yet. Start one!
      </div>`;
    return;
  }

  // Group by relative date
  const groups = {};
  conversations.forEach((conv) => {
    const group = getRelativeGroup(conv.updated_at);
    if (!groups[group]) groups[group] = [];
    groups[group].push(conv);
  });

  Object.entries(groups).forEach(([groupName, convs]) => {
    const label = createElement("div", {
      className: "conv-group-label",
      textContent: groupName,
    });
    convList.appendChild(label);

    convs.forEach((conv) => {
      const item = buildConvItem(conv);
      convList.appendChild(item);
    });
  });
}

function buildConvItem(conv) {
  const item = createElement("div", {
    className: `conv-item${conv.id === activeConversationId ? " active" : ""}`,
    "data-id": conv.id,
  });

  item.innerHTML = `
    <span class="conv-item-icon">💬</span>
    <span class="conv-item-title" title="${escapeHtml(conv.title)}">${escapeHtml(conv.title)}</span>
    <div class="conv-item-actions">
      <button class="conv-action-btn rename-btn" title="Rename">✏️</button>
      <button class="conv-action-btn delete-btn danger" title="Delete">🗑️</button>
    </div>`;

  item.addEventListener("click", (e) => {
    if (e.target.closest(".conv-action-btn")) return;
    openConversation(conv.id, conv.title);
    if (window.innerWidth <= 640) closeSidebar();
  });

  item.querySelector(".rename-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    startRename(item, conv);
  });

  item.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDelete(conv);
  });

  return item;
}

async function createNewConversation() {
  try {
    const conv = await Conversations.create("New Chat");
    activeConversationId = conv.id;
    await loadConversations();
    showEmptyState();
    chatTitleEl.textContent = conv.title;
    if (window.innerWidth <= 640) closeSidebar();
    chatInput.focus();
  } catch (err) {
    showToast("Failed to create conversation", "error");
  }
}

async function openConversation(id, title) {
  activeConversationId = id;
  chatTitleEl.textContent = title;
  messagesEl.innerHTML = "";
  showEmptyState(false);

  // Remember across refreshes
  localStorage.setItem(LAST_CONV_KEY, id);

  // Mark active in sidebar
  document.querySelectorAll(".conv-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });

  try {
    const data = await Messages.list(id);
    const msgs = data.messages || [];

    if (msgs.length === 0) {
      showEmptyState(true);
    } else {
      msgs.forEach((msg) => appendMessage(msg.role, msg.content, false));
      scrollToBottom(messagesEl, false);
    }
  } catch (err) {
    console.error("Failed to load messages:", err.message, err.status);
    showToast(`Failed to load messages: ${err.message}`, "error", 6000);
  }
}

// ─── Rename ─────────────────────────────────

function startRename(item, conv) {
  const titleEl = item.querySelector(".conv-item-title");
  const original = conv.title;

  const input = createElement("input", {
    className: "conv-rename-input",
    value: original,
    type: "text",
  });

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  async function commitRename() {
    const newTitle = input.value.trim();
    if (!newTitle || newTitle === original) {
      input.replaceWith(titleEl);
      return;
    }
    try {
      await Conversations.rename(conv.id, newTitle);
      titleEl.textContent = newTitle;
      input.replaceWith(titleEl);
      if (conv.id === activeConversationId) {
        chatTitleEl.textContent = newTitle;
      }
    } catch {
      showToast("Rename failed", "error");
      input.replaceWith(titleEl);
    }
  }

  input.addEventListener("blur", commitRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") input.replaceWith(titleEl);
  });
}

// ─── Delete ─────────────────────────────────

function confirmDelete(conv) {
  // Simple confirm dialog — could be replaced with a custom modal
  if (!confirm(`Delete "${conv.title}"? This cannot be undone.`)) return;
  deleteConversation(conv.id);
}

async function deleteConversation(id) {
  try {
    await Conversations.delete(id);
    if (id === activeConversationId) {
      activeConversationId = null;
      messagesEl.innerHTML = "";
      chatTitleEl.textContent = "My_LLM";
      showEmptyState(true);
      localStorage.removeItem(LAST_CONV_KEY);
    }
    await loadConversations();
    showToast("Conversation deleted", "success");
  } catch (err) {
    console.error("Delete error:", err);
    console.error("Delete error status:", err.status);
    console.error("Delete error message:", err.message);
    showToast(`Delete failed: ${err.message}`, "error", 6000);
  }
}

// ─────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────

function showEmptyState(show = true) {
  emptyState.style.display = show ? "flex" : "none";
}

function appendMessage(role, content, animate = true) {
  showEmptyState(false);

  const isUser = role === "user";
  const isImage = content.startsWith("__IMAGE__:");

  const msg = createElement("div", {
    className: `message ${role}`,
  });

  const avatar = createElement("div", {
    className: "message-avatar",
    textContent: isUser ? (getUser()?.name?.[0] || "U").toUpperCase() : "🤖",
  });

  const body = createElement("div", { className: "message-body" });

  const contentEl = createElement("div", { className: "message-content" });

  if (isImage) {
    // Parse stored JSON payload
    const rawPayload = content.replace("__IMAGE__:", "");
    let imageUrl = rawPayload;
    let revisedPrompt = "";
    let originalPrompt = "";

    try {
      const parsed = JSON.parse(rawPayload);
      imageUrl     = parsed.url      || rawPayload;
      revisedPrompt = parsed.revised || "";
      originalPrompt = parsed.prompt || "";
    } catch { /* legacy format — just a plain URL */ }

    // Header
    contentEl.innerHTML = `<p style="margin-bottom:0.5rem;font-weight:500;">🖼️ Generated Image</p>`;

    // Loading state
    const loadingWrap = createElement("div", { className: "image-loading-wrap" });
    loadingWrap.innerHTML = `
      <div class="image-skeleton"></div>
      <p class="image-loading-text">⏳ Please wait, your image is loading…</p>`;
    contentEl.appendChild(loadingWrap);

    // Image element
    const img = createElement("img", {
      src: imageUrl,
      className: "generated-image",
      alt: originalPrompt || "Generated image",
    });

    img.style.display = "none"; // hidden until loaded

    img.addEventListener("load", () => {
      loadingWrap.remove();
      img.style.display = "block";
      // Add action bar after image loads
      contentEl.appendChild(buildImageActions(imageUrl, originalPrompt || "generated-image"));
    });

    img.addEventListener("error", () => {
      loadingWrap.innerHTML = `<p class="image-loading-text" style="color:var(--danger)">⚠️ Image failed to load. Try generating again.</p>`;
    });

    contentEl.appendChild(img);

    // Revised prompt caption
    if (revisedPrompt) {
      const caption = createElement("p", {
        className: "image-caption",
        textContent: `Prompt: ${revisedPrompt}`,
      });
      contentEl.appendChild(caption);
    }
  } else if (isUser) {
    contentEl.textContent = content;
  } else {
    contentEl.innerHTML = renderMarkdown(content);
  }

  body.appendChild(contentEl);

  // Action buttons (copy, regenerate for assistant)
  if (!isUser && !isImage) {
    const actions = createElement("div", { className: "message-actions" });

    const copyBtn = createElement("button", {
      className: "message-action-btn",
      innerHTML: "📋 Copy",
    });
    copyBtn.addEventListener("click", () => copyToClipboard(content));
    actions.appendChild(copyBtn);

    const regenBtn = createElement("button", {
      className: "message-action-btn",
      innerHTML: "🔄 Regenerate",
    });
    regenBtn.addEventListener("click", () => regenerateLastResponse());
    actions.appendChild(regenBtn);

    body.appendChild(actions);
  }

  msg.appendChild(avatar);
  msg.appendChild(body);
  messagesEl.appendChild(msg);

  if (animate) scrollToBottom(messagesEl);

  return { contentEl };
}

function appendTypingIndicator() {
  const msg = createElement("div", { className: "message assistant" });

  const avatar = createElement("div", {
    className: "message-avatar",
    textContent: "🤖",
  });

  const body = createElement("div", { className: "message-body" });
  const typing = createElement("div", {
    className: "typing-indicator",
    innerHTML: `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>`,
  });

  body.appendChild(typing);
  msg.appendChild(avatar);
  msg.appendChild(body);
  msg.id = "typingIndicator";
  messagesEl.appendChild(msg);
  scrollToBottom(messagesEl);
  return msg;
}

function removeTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

// ─────────────────────────────────────────────
// Send
// ─────────────────────────────────────────────

function updateSendBtn() {
  sendBtn.disabled = !chatInput.value.trim() || isGenerating;
}

async function handleSend() {
  const text = chatInput.value.trim();
  if (!text || isGenerating) return;

  // Need an active conversation
  if (!activeConversationId) {
    try {
      const conv = await Conversations.create("New Chat");
      activeConversationId = conv.id;
      await loadConversations();
      chatTitleEl.textContent = conv.title;
    } catch {
      showToast("Failed to create conversation", "error");
      return;
    }
  }

  // Clear input
  chatInput.value = "";
  autoResize(chatInput);
  updateSendBtn();

  // Display user message immediately on screen
  appendMessage("user", text);

  if (imageMode) {
    await handleImageGeneration(text);
  } else {
    await handleStreamingMessage(text);
  }
}

// ─── Streaming Message ───────────────────────

async function handleStreamingMessage(text) {
  setGenerating(true);

  const typingMsg = appendTypingIndicator();

  streamController = new AbortController();

  try {
    const response = await Messages.sendStream(activeConversationId, text);

    if (!response.ok) {
      // Read the error body to show a real message
      let errDetail = `Server error ${response.status}`;
      try {
        const errData = await response.json();
        errDetail = errData.detail || errDetail;
      } catch { /* ignore */ }
      throw new Error(errDetail);
    }

    removeTypingIndicator();

    // Create an empty assistant message bubble
    const { contentEl } = appendMessage("assistant", "", false);
    contentEl.innerHTML = "";
    let fullText = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.done) break;
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) {
            fullText += parsed.chunk;
            contentEl.innerHTML = renderMarkdown(fullText);
            scrollToBottom(messagesEl, false);
          }
        } catch (parseErr) {
          // If it's a real error (not a JSON parse fail), rethrow
          if (parseErr.message !== "Unexpected token" && jsonStr.length > 0) {
            throw parseErr;
          }
        }
      }
    }

    // Refresh conversation list (title may have changed)
    await loadConversations();

  } catch (err) {
    removeTypingIndicator();
    if (err.name !== "AbortError") {
      console.error("Streaming error:", err);
      showToast(`Error: ${err.message}`, "error", 5000);
    }
  } finally {
    setGenerating(false);
    streamController = null;
  }
}

// ─── Image Generation ────────────────────────

async function handleImageGeneration(prompt) {
  setGenerating(true);
  appendTypingIndicator();

  try {
    // Save user message to DB (bubble already shown by handleSend)
    await _saveUserMessageToDB(prompt);

    const data = await AI.image(prompt);
    removeTypingIndicator();

    // Build the image payload stored as JSON in DB
    const imagePayload = JSON.stringify({
      type: "image",
      url: data.image_url,
      prompt: prompt,
      revised: data.revised_prompt || "",
    });

    // Save image assistant message to DB — survives refresh
    await Messages.saveImage(activeConversationId, imagePayload);

    // Render on screen
    appendMessage("assistant", `__IMAGE__:${imagePayload}`);

    await loadConversations();
  } catch (err) {
    removeTypingIndicator();
    showToast("Image generation failed. Please try again.", "error");
    console.error(err);
  } finally {
    setGenerating(false);
  }
}

async function _saveUserMessageToDB(content) {
  try {
    await Messages.saveUser(activeConversationId, content);
  } catch {
    // Non-fatal — message still shows on screen
  }
}

// ─── Regenerate ──────────────────────────────

async function regenerateLastResponse() {
  if (!activeConversationId || isGenerating) return;

  try {
    const data = await Messages.list(activeConversationId);
    const msgs = data.messages || [];

    // Find the last user message
    let lastUserMsg = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserMsg = msgs[i].content;
        break;
      }
    }

    if (!lastUserMsg) return;

    // Remove last assistant bubble from UI
    const msgEls = messagesEl.querySelectorAll(".message.assistant");
    if (msgEls.length) msgEls[msgEls.length - 1].remove();

    await handleStreamingMessage(lastUserMsg);
  } catch (err) {
    showToast("Regeneration failed", "error");
  }
}

// ─── Stop Generation ─────────────────────────

function stopGeneration() {
  if (streamController) {
    streamController.abort();
  }
  setGenerating(false);
  removeTypingIndicator();
}

function setGenerating(loading) {
  isGenerating = loading;
  sendBtn.disabled = loading;
  stopBtn.classList.toggle("visible", loading);
  updateSendBtn();
}

// ─────────────────────────────────────────────
// Image Mode
// ─────────────────────────────────────────────

function toggleImageMode() {
  imageMode = btnToggleImage.checked;
  modeBadge.className = `mode-badge ${imageMode ? "image-mode" : "text-mode"}`;
  modeBadge.textContent = imageMode ? "🖼 Image" : "💬 Text";
  chatInput.placeholder = imageMode
    ? "Describe an image to generate…"
    : "Ask anything…";
}

// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

async function handleLogout() {
  try {
    await Auth.logout();
  } catch { /* ignore */ }
  clearAuth();
  window.location.href = "login.html";
}

// ─────────────────────────────────────────────
// Image action bar (download + copy URL)
// ─────────────────────────────────────────────

function buildImageActions(imageUrl, filename) {
  const bar = createElement("div", { className: "image-action-bar" });

  // Download button — fetch as blob so browser saves it locally
  const dlBtn = createElement("button", {
    className: "message-action-btn",
    innerHTML: "⬇️ Download",
  });

  dlBtn.addEventListener("click", async () => {
    dlBtn.textContent = "Downloading…";
    dlBtn.disabled = true;
    try {
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${filename.slice(0, 40).replace(/\s+/g, "_") || "my_llm_image"}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      dlBtn.innerHTML = "✅ Downloaded";
      setTimeout(() => { dlBtn.innerHTML = "⬇️ Download"; dlBtn.disabled = false; }, 2500);
    } catch {
      dlBtn.innerHTML = "⚠️ Failed";
      dlBtn.disabled = false;
    }
  });

  bar.appendChild(dlBtn);
  return bar;
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * ui.js — UI helpers: markdown rendering, formatting, DOM utilities.
 */

// ─────────────────────────────────────────────
// Simple Markdown → HTML renderer
// (No external library dependency)
// ─────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return "";

  // Escape HTML first (security)
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```lang\ncode\n```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${langClass}>${code.trimEnd()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headings (### ## #)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

  // Horizontal rule
  html = html.replace(/^---+$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^[-*] /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => `<li>${line.replace(/^\d+\. /, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Line breaks (double newline → paragraph)
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>(<(?:h[1-6]|ul|ol|pre|hr))/g, "$1");
  html = html.replace(/(<\/(?:h[1-6]|ul|ol|pre|hr)>)<\/p>/g, "$1");

  // Single newline → <br> (only outside block elements)
  html = html.replace(/(?<!>)\n(?!<)/g, "<br>");

  return html;
}

// ─────────────────────────────────────────────
// DOM Helpers
// ─────────────────────────────────────────────

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === "className") el.className = val;
    else if (key === "innerHTML") el.innerHTML = val;
    else if (key === "textContent") el.textContent = val;
    else el.setAttribute(key, val);
  });
  children.forEach((child) => {
    if (typeof child === "string") el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  });
  return el;
}

// ─────────────────────────────────────────────
// Toast notifications
// ─────────────────────────────────────────────

let toastContainer = null;

function showToast(message, type = "info", duration = 3000) {
  if (!toastContainer) {
    toastContainer = createElement("div", {
      className: "toast-container",
      style:
        "position:fixed;bottom:1.5rem;right:1.5rem;display:flex;flex-direction:column;gap:0.5rem;z-index:9999;",
    });
    document.body.appendChild(toastContainer);
  }

  const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
  const colors = {
    info:    "var(--bg-secondary)",
    success: "#14532d",
    error:   "#450a0a",
    warning: "#451a03",
  };

  const toast = createElement("div", {
    style: `
      background: ${colors[type]};
      border: 1px solid var(--border-light);
      color: var(--text-primary);
      padding: 0.65rem 1rem;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      animation: fadeSlideIn 0.2s ease;
      max-width: 320px;
    `,
    innerHTML: `<span>${icons[type]}</span><span>${message}</span>`,
  });

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─────────────────────────────────────────────
// Copy to clipboard
// ─────────────────────────────────────────────

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "success", 2000);
  } catch {
    // Fallback
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("Copied to clipboard", "success", 2000);
  }
}

// ─────────────────────────────────────────────
// Auto-resize textarea
// ─────────────────────────────────────────────

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
}

// ─────────────────────────────────────────────
// Scroll to bottom
// ─────────────────────────────────────────────

function scrollToBottom(container, smooth = true) {
  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? "smooth" : "instant",
  });
}

// ─────────────────────────────────────────────
// Message metadata: location + India time
// ─────────────────────────────────────────────

// Cache location so we only fetch once per session
let _cachedLocation = null;
let _locationFetching = false;
let _locationCallbacks = [];

async function getUserLocation() {
  if (_cachedLocation !== null) return _cachedLocation;
  if (_locationFetching) {
    return new Promise((resolve) => _locationCallbacks.push(resolve));
  }

  _locationFetching = true;

  // Try multiple free APIs in order until one works
  const apis = [
    async () => {
      const r = await fetch("https://ipwho.is/");
      const d = await r.json();
      if (d.success && d.city) return `📍 ${d.city}, ${d.region}`;
      return null;
    },
    async () => {
      const r = await fetch("https://freeipapi.com/api/json");
      const d = await r.json();
      if (d.cityName && d.regionName) return `📍 ${d.cityName}, ${d.regionName}`;
      return null;
    },
    async () => {
      const r = await fetch("https://get.geojs.io/v1/ip/geo.json");
      const d = await r.json();
      if (d.city && d.region) return `📍 ${d.city}, ${d.region}`;
      return null;
    },
  ];

  for (const api of apis) {
    try {
      const result = await api();
      if (result) {
        _cachedLocation = result;
        break;
      }
    } catch { /* try next */ }
  }

  if (!_cachedLocation) _cachedLocation = "📍 Location unavailable";

  _locationFetching = false;
  _locationCallbacks.forEach(cb => cb(_cachedLocation));
  _locationCallbacks = [];
  return _cachedLocation;
}

// Pre-fetch location on page load so it's ready when first message arrives
getUserLocation();

function getIndiaTime(timestamp = null) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildMessageMeta(timestamp = null) {
  const meta = createElement("div", { className: "message-meta" });

  const locationEl = createElement("span", {
    className: "message-meta-device",
    textContent: _cachedLocation || "📍 Locating…",
  });

  const time = createElement("span", {
    className: "message-meta-time",
    textContent: getIndiaTime(timestamp),
  });

  meta.appendChild(locationEl);
  meta.appendChild(time);

  // If location not ready yet, update it once it arrives
  if (!_cachedLocation) {
    getUserLocation().then(loc => {
      locationEl.textContent = loc;
    });
  }

  return meta;
}

// ─────────────────────────────────────────────
// Format relative date (for sidebar groups)
// ─────────────────────────────────────────────

function getRelativeGroup(dateStr) {
  const date  = new Date(dateStr);
  const now   = new Date();
  const diff  = now - date;
  const day   = 86400000;

  if (diff < day)               return "Today";
  if (diff < 2 * day)           return "Yesterday";
  if (diff < 7 * day)           return "This Week";
  if (diff < 30 * day)          return "This Month";
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

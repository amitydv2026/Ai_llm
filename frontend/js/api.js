/**
 * api.js — Centralised API client for My_LLM frontend.
 *
 * API_BASE auto-detects environment:
 *   - Production (GitHub Pages) → Render backend URL
 *   - Local dev (Live Server port 5500) → localhost:8000
 */

const IS_PROD = window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost";

const API_BASE = IS_PROD
  ? "https://ai-llm-tcsk.onrender.com"   // ← replace with your actual Render URL after deploy
  : "http://127.0.0.1:8000";
async function request(method, path, body = null, stream = false) {
  const token = localStorage.getItem("my_llm_token");

  const headers = {};
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);

  // Return the raw response for streaming endpoints
  if (stream) return response;

  // 204 No Content — nothing to parse, just check ok
  if (response.status === 204) {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return null;
  }

  // Parse JSON
  let data;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = { detail: await response.text() };
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return data;
}

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

const Auth = {
  signup: (name, email, password) =>
    request("POST", "/auth/signup", { name, email, password }),

  login: (email, password) =>
    request("POST", "/auth/login", { email, password }),

  logout: () => request("POST", "/auth/logout"),

  me: () => request("GET", "/auth/me"),
};

// ─────────────────────────────────────────────
// Conversations
// ─────────────────────────────────────────────

const Conversations = {
  list: () => request("GET", "/conversations"),

  create: (title = "New Chat") =>
    request("POST", "/conversations", { title }),

  get: (id) => request("GET", `/conversations/${id}`),

  rename: (id, title) => request("PATCH", `/conversations/${id}`, { title }),

  delete: (id) => request("DELETE", `/conversations/${id}`),
};

// ─────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────

const Messages = {
  list: (conversationId) =>
    request("GET", `/conversations/${conversationId}/messages`),

  send: (conversationId, content) =>
    request("POST", `/conversations/${conversationId}/messages`, { content }),

  saveUser: (conversationId, content) =>
    request("POST", `/conversations/${conversationId}/messages/save-user`, { content }),

  saveImage: (conversationId, imagePayload) =>
    request("POST", `/conversations/${conversationId}/messages/image`, { content: imagePayload }),

  sendStream: (conversationId, content) =>
    request(
      "POST",
      `/conversations/${conversationId}/messages/stream`,
      { content },
      true
    ),
};

// ─────────────────────────────────────────────
// AI
// ─────────────────────────────────────────────

const AI = {
  generate: (prompt) => request("POST", "/ai/generate", { prompt }),

  image: (prompt) => request("POST", "/ai/image", { prompt }),
};

/**
 * admin.js — My_LLM Admin Panel Logic
 */

const API_BASE = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
  ? "http://127.0.0.1:8000"
  : "https://ai-llm-tcsk.onrender.com";

// ── Auth guard ──────────────────────────────
const adminToken = localStorage.getItem("admin_token");
if (!adminToken) {
  window.location.href = "login.html";
}

// ── API helper ──────────────────────────────
async function adminRequest(method, path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("admin_token");
    window.location.href = "login.html";
    return;
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── State ───────────────────────────────────
let allUsers = [];
let currentPage = "dashboard";

// ── Navigation ──────────────────────────────
document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const page = item.dataset.page;
    navigateTo(page);
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelector(`[data-page="${page}"]`).classList.add("active");
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");

  const titles = { dashboard: "Dashboard", users: "All Users", activity: "Live Activity" };
  document.getElementById("pageTitle").textContent = titles[page];

  if (page === "dashboard") loadDashboard();
  if (page === "users") loadUsers();
  if (page === "activity") loadActivity();
}

// ── Refresh ──────────────────────────────────
document.getElementById("btnRefresh").addEventListener("click", () => navigateTo(currentPage));

// ── Logout ───────────────────────────────────
document.getElementById("btnLogout").addEventListener("click", () => {
  localStorage.removeItem("admin_token");
  window.location.href = "login.html";
});

// ── Helpers ─────────────────────────────────
function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function truncate(s, n = 120) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ── Dashboard ────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, usersData] = await Promise.all([
      adminRequest("GET", "/admin/stats"),
      adminRequest("GET", "/admin/users"),
    ]);

    document.getElementById("stat-users").textContent = stats.total_users;
    document.getElementById("stat-new").textContent   = stats.new_users_today;
    document.getElementById("stat-convs").textContent = stats.total_conversations;
    document.getElementById("stat-msgs").textContent  = stats.total_messages;
    document.getElementById("stat-imgs").textContent  = stats.total_images;

    allUsers = usersData.users || [];
    renderDashUsers(allUsers.slice(0, 10));
  } catch (err) {
    console.error(err);
  }
}

function renderDashUsers(users) {
  const tbody = document.getElementById("dash-users-body");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">No users found</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escHtml(u.name)}</td>
      <td>${escHtml(u.email)}</td>
      <td>${u.conversation_count ?? 0}</td>
      <td>${fmtDate(u.last_active)}</td>
      <td>${fmtDate(u.created_at)}</td>
    </tr>`).join("");
}

// ── Users ────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById("users-body");
  tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading…</td></tr>`;

  try {
    const data = await adminRequest("GET", "/admin/users");
    allUsers = data.users || [];
    renderUsersTable(allUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Failed to load users</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById("users-body");
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No users found</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escHtml(u.name)}</strong></td>
      <td>${escHtml(u.email)}</td>
      <td>${u.conversation_count ?? 0}</td>
      <td>${fmtDate(u.last_active)}</td>
      <td>${fmtDate(u.created_at)}</td>
      <td>
        <button class="btn-sm btn-view" onclick="openUserModal('${u.id}')">👁 View</button>
        <button class="btn-sm btn-del" onclick="deleteUser('${u.id}', '${escHtml(u.name)}')">🗑 Delete</button>
      </td>
    </tr>`).join("");
}

// Search
document.getElementById("userSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allUsers.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
  renderUsersTable(filtered);
});

// ── User Detail Modal ────────────────────────
async function openUserModal(userId) {
  const overlay = document.getElementById("modalOverlay");
  const body = document.getElementById("modalBody");
  const title = document.getElementById("modalUserName");

  overlay.classList.add("open");
  body.innerHTML = "<p style='color:var(--muted)'>Loading…</p>";

  try {
    const data = await adminRequest("GET", `/admin/users/${userId}`);
    const u = data.profile;
    title.textContent = u.name;

    const convRows = (data.conversations || []).map(c => `
      <div class="conv-row">
        <span class="conv-title" title="${escHtml(c.title)}">${escHtml(c.title)}</span>
        <span class="conv-date">${fmtDate(c.updated_at)}</span>
        <button class="btn-sm btn-msgs" onclick="openMsgsModal('${c.id}', '${escHtml(c.title)}')">
          💬 Messages
        </button>
      </div>`).join("") || "<p style='color:var(--muted);font-size:.85rem'>No conversations yet</p>";

    body.innerHTML = `
      <div class="info-grid">
        <div class="info-item"><label>Name</label><span>${escHtml(u.name)}</span></div>
        <div class="info-item"><label>Email</label><span>${escHtml(u.email)}</span></div>
        <div class="info-item"><label>User ID</label><span style="font-family:var(--mono);font-size:.75rem">${u.id}</span></div>
        <div class="info-item"><label>Joined</label><span>${fmtDate(u.created_at)}</span></div>
        <div class="info-item"><label>Conversations</label><span>${data.conversations?.length ?? 0}</span></div>
      </div>
      <div class="section-title" style="margin-top:1rem">Conversations</div>
      ${convRows}`;
  } catch (err) {
    body.innerHTML = `<p style='color:var(--danger)'>Failed to load user details</p>`;
  }
}

document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("modalOverlay").classList.remove("open");
});
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

// ── Messages Modal ───────────────────────────
async function openMsgsModal(convId, convTitle) {
  const overlay = document.getElementById("msgsModalOverlay");
  const body = document.getElementById("msgsModalBody");
  document.getElementById("msgsModalTitle").textContent = convTitle;

  overlay.classList.add("open");
  body.innerHTML = "<p style='color:var(--muted)'>Loading messages…</p>";

  try {
    const data = await adminRequest("GET", `/admin/conversations/${convId}/messages`);
    const msgs = data.messages || [];

    if (!msgs.length) {
      body.innerHTML = "<p style='color:var(--muted);font-size:.85rem'>No messages in this conversation</p>";
      return;
    }

    body.innerHTML = msgs.map(m => {
      const isImage = m.content.startsWith("__IMAGE__:");
      let displayContent = m.content;
      if (isImage) {
        try {
          const p = JSON.parse(m.content.replace("__IMAGE__:", ""));
          displayContent = `🖼️ [Generated Image] Prompt: ${p.prompt || ""}`;
        } catch { displayContent = "🖼️ [Generated Image]"; }
      }
      return `
        <div class="msg-bubble">
          <div class="msg-role ${m.role}">${m.role === "user" ? "👤 User" : "🤖 Assistant"}</div>
          <div class="msg-text">${escHtml(truncate(displayContent, 600))}</div>
          <div class="msg-time">${fmtDate(m.created_at)}</div>
        </div>`;
    }).join("");
  } catch (err) {
    body.innerHTML = `<p style='color:var(--danger)'>Failed to load messages</p>`;
  }
}

document.getElementById("msgsModalClose").addEventListener("click", () => {
  document.getElementById("msgsModalOverlay").classList.remove("open");
});
document.getElementById("msgsModalOverlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
});

// ── Delete User ──────────────────────────────
async function deleteUser(userId, name) {
  if (!confirm(`⚠️ Permanently delete user "${name}" and ALL their data?\n\nThis cannot be undone.`)) return;
  try {
    await adminRequest("DELETE", `/admin/users/${userId}`);
    allUsers = allUsers.filter(u => u.id !== userId);
    renderUsersTable(allUsers);
    renderDashUsers(allUsers.slice(0, 10));
    alert(`User "${name}" deleted successfully.`);
  } catch (err) {
    alert(`Failed to delete user: ${err.message}`);
  }
}

// ── Activity ─────────────────────────────────
async function loadActivity() {
  const list = document.getElementById("activity-list");
  list.innerHTML = "<div class='loading-cell'>Loading…</div>";

  try {
    const data = await adminRequest("GET", "/admin/activity");
    const items = data.activity || [];

    if (!items.length) {
      list.innerHTML = "<div class='loading-cell'>No activity yet</div>";
      return;
    }

    list.innerHTML = items.map(item => {
      const user = item.conversations?.profiles;
      const userName  = user?.name  || "Unknown";
      const userEmail = user?.email || "";
      const convTitle = item.conversations?.title || "Unknown conversation";
      const isImage = item.content.startsWith("__IMAGE__:");
      let content = item.content;
      if (isImage) {
        try { content = "🖼️ [Image] " + JSON.parse(content.replace("__IMAGE__:", "")).prompt; }
        catch { content = "🖼️ [Generated Image]"; }
      }
      const badge = item.role === "user"
        ? `<span class="badge badge-user">User</span>`
        : isImage
          ? `<span class="badge badge-img">Image</span>`
          : `<span class="badge badge-ai">AI</span>`;

      return `
        <div class="activity-item">
          <div class="activity-meta">
            <span class="activity-user">👤 ${escHtml(userName)} &lt;${escHtml(userEmail)}&gt; ${badge}</span>
            <span class="activity-time">${fmtDate(item.created_at)}</span>
          </div>
          <div class="activity-conv">💬 ${escHtml(convTitle)}</div>
          <div class="activity-content">${escHtml(truncate(content, 200))}</div>
        </div>`;
    }).join("");

  } catch (err) {
    list.innerHTML = `<div class='loading-cell' style='color:var(--danger)'>Failed to load activity</div>`;
  }
}

// ── Boot ─────────────────────────────────────
loadDashboard();

/**
 * auth.js — Handles login, signup, and auth state management.
 */

const TOKEN_KEY  = "my_llm_token";
const USER_KEY   = "my_llm_user";

// ─────────────────────────────────────────────
// Auth State
// ─────────────────────────────────────────────

function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!getToken();
}

// ─────────────────────────────────────────────
// Page Guard
// ─────────────────────────────────────────────

/**
 * Redirect to login if not authenticated.
 * Call this on protected pages (index.html).
 */
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = "login.html";
  }
}

/**
 * Redirect away from auth pages if already logged in.
 * Call this on login.html / signup.html.
 */
function redirectIfLoggedIn() {
  if (isLoggedIn()) {
    window.location.href = "index.html";
  }
}

// ─────────────────────────────────────────────
// Login Form Handler
// ─────────────────────────────────────────────

function initLoginPage() {
  redirectIfLoggedIn();

  const form       = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passInput  = document.getElementById("password");
  const submitBtn  = document.getElementById("submitBtn");
  const alertEl    = document.getElementById("alertMsg");
  const spinner    = document.getElementById("spinner");

  function showAlert(msg, type = "error") {
    alertEl.textContent = msg;
    alertEl.className = `alert alert-${type} visible`;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.classList.toggle("visible", loading);
    submitBtn.querySelector(".btn-text").textContent = loading
      ? "Signing in…"
      : "Sign In";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.className = "alert";

    const email    = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) {
      showAlert("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const data = await Auth.login(email, password);
      saveAuth(data.access_token, data.user);
      window.location.href = "index.html";
    } catch (err) {
      showAlert(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  });
}

// ─────────────────────────────────────────────
// Signup Form Handler
// ─────────────────────────────────────────────

function initSignupPage() {
  redirectIfLoggedIn();

  const form          = document.getElementById("signupForm");
  const nameInput     = document.getElementById("name");
  const emailInput    = document.getElementById("email");
  const passInput     = document.getElementById("password");
  const confirmInput  = document.getElementById("confirmPassword");
  const submitBtn     = document.getElementById("submitBtn");
  const alertEl       = document.getElementById("alertMsg");
  const spinner       = document.getElementById("spinner");

  function showAlert(msg, type = "error") {
    alertEl.textContent = msg;
    alertEl.className = `alert alert-${type} visible`;
  }

  function showFieldError(fieldId, msg) {
    const errEl = document.getElementById(`${fieldId}Error`);
    const input  = document.getElementById(fieldId);
    if (errEl) { errEl.textContent = msg; errEl.classList.add("visible"); }
    if (input)  input.classList.add("error");
  }

  function clearErrors() {
    document.querySelectorAll(".field-error").forEach(el => {
      el.classList.remove("visible");
    });
    document.querySelectorAll(".form-input").forEach(el => {
      el.classList.remove("error");
    });
    alertEl.className = "alert";
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.classList.toggle("visible", loading);
    submitBtn.querySelector(".btn-text").textContent = loading
      ? "Creating account…"
      : "Create Account";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const name     = nameInput.value.trim();
    const email    = emailInput.value.trim();
    const password = passInput.value;
    const confirm  = confirmInput.value;

    let valid = true;

    if (!name || name.length < 2) {
      showFieldError("name", "Name must be at least 2 characters");
      valid = false;
    }
    if (!email) {
      showFieldError("email", "Email is required");
      valid = false;
    } else if (/getemail|tempmail|mailinator|guerrillamail|throwam|yopmail|sharklasers|trashmail|maildrop|fakeinbox|spamgourmet/i.test(email)) {
      showFieldError("email", "Please use a real email address (Gmail, Outlook, etc.)");
      valid = false;
    }
    if (!password || password.length < 8) {
      showFieldError("password", "Password must be at least 8 characters");
      valid = false;
    }
    if (password !== confirm) {
      showFieldError("confirmPassword", "Passwords do not match");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const data = await Auth.signup(name, email, password);

      // If Supabase has email confirmation OFF, we get a token immediately
      if (data.access_token) {
        saveAuth(data.access_token, data.user);
        window.location.href = "index.html";
        return;
      }

      // Email confirmation is ON — show message and redirect to login
      showAlert(
        data.message || "Account created! Check your email to confirm, then sign in.",
        "success"
      );
      setTimeout(() => { window.location.href = "login.html"; }, 3000);
    } catch (err) {
      showAlert(err.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  });
}

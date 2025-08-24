// ---------- Constants & Cache Keys ----------
const AUTH_CACHE_KEY = "auth_cache";
const AUTH_CACHE_MINUTES = 60; // 1 hour
const THEME_CACHE_KEY = "theme_mode"; // 'dark' | 'light'
const TOKEN_KEY = "auth_token";

// ---------- State (Results Cache) ----------
let lastResultsPeople = [];

// ---------- Token Helpers ----------
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ---------- Auth Cache Helpers ----------
function setAuthCache() {
  const expires = Date.now() + AUTH_CACHE_MINUTES * 60 * 1000;
  localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ expires }));
}
function clearAuthCache() { localStorage.removeItem(AUTH_CACHE_KEY); }
function isAuthCached() {
  const cache = localStorage.getItem(AUTH_CACHE_KEY);
  if (!cache) return false;
  try {
    const { expires } = JSON.parse(cache);
    return Date.now() < expires;
  } catch { return false; }
}

// ---------- Theme Helpers (Persistent) ----------
function applyThemeClass(mode) {
  if (mode === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
}

function getThemeCache() { return localStorage.getItem(THEME_CACHE_KEY); }
function setThemeCache(mode) { localStorage.setItem(THEME_CACHE_KEY, mode); }

async function setTheme(mode) {
  setThemeCache(mode);
  applyThemeClass(mode);
  if (window.darkMode && window.darkMode.set) {
    try { await window.darkMode.set(mode); } catch {}
  }
}

async function initializeTheme() {
  const stored = getThemeCache();
  if (stored === "dark" || stored === "light") {
    applyThemeClass(stored); // apply immediately (class)
    if (window.darkMode && window.darkMode.set) {
      window.darkMode.set(stored); // sync nativeTheme
    }
  } else {
    // No stored theme: determine system (if available) and store it
    let systemIsDark = false;
    try {
      if (window.darkMode && window.darkMode.system) {
        systemIsDark = await window.darkMode.system();
      } else {
        // Fallback: match prefers-color-scheme
        systemIsDark = window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
    } catch {}
    const inferred = systemIsDark ? "dark" : "light";
    setThemeCache(inferred);
    applyThemeClass(inferred);
  }
}

async function toggleTheme() {
  // Instead of relying on native toggle (which can desync with cache),
  // we flip our stored preference explicitly.
  const current = getThemeCache() || (document.body.classList.contains("dark") ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  await setTheme(next);
}

// Backwards-compatible bridge function (used by existing code)
async function toggleThemeElectronBridge() {
  await toggleTheme();
  const themeIndicator = document.getElementById("theme-source");
  if (themeIndicator) {
    themeIndicator.textContent = document.body.classList.contains("dark") ? "Dark" : "Light";
  }
}

// ---------- Results Rendering ----------
function renderResults(container, html, cls) {
  if (!container) return;
  container.innerHTML = `<div class="${cls || ""}">${html}</div>`;
}

function renderResultsList(container, title, people) {
  if (!container) return;
  const listItems = people.map((p) => {
    const name = p.name || "(No name)";
    const email = p.email ? ` - ${p.email}` : "";
    const phone = p.phone ? ` <span>(${p.phone})</span>` : "";
    const fatherEmail = p.father_email
      ? `<br><small>Father Email: ${p.father_email}${p.father_phone ? " (" + p.father_phone + ")" : ""}</small>`
      : "";
    const motherEmail = p.mother_email
      ? `<br><small>Mother Email: ${p.mother_email}${p.mother_phone ? " (" + p.mother_phone + ")" : ""}</small>`
      : "";
    return `<li>
        <strong>${name}</strong>${email}${phone}
        ${fatherEmail}${motherEmail}
      </li>`;
  }).join("");
  container.innerHTML = `
    <h3>${title}</h3>
    <ul>${listItems}</ul>
  `;
}

// ---------- Birthday Fetch ----------
async function fetchBirthdays(dateValue, container) {
  lastResultsPeople = [];
  if (!dateValue) { renderResults(container, "Please select a date.", "error"); return; }
  if (!isAuthCached() || !getToken()) {
    renderResults(container, "You are not authenticated. Please login again.", "error");
    return;
  }

  let param = dateValue;
  if (dateValue.length === 10 && dateValue[4] === "-" && dateValue[7] === "-") {
    param = dateValue.slice(5);
  }

  renderResults(container, "Loading...", "loading");
  try {
    const res = await fetch(`http://localhost:8000/filter?date=${param}`, {
      method: "GET",
      headers: { Authorization: "Bearer " + getToken() },
    });
    const data = await res.json();
    if (!res.ok) {
      renderResults(container, data.error || "Request failed", "error");
      return;
    }
    if (data.count === 0) {
      renderResults(container, "No birthdays found for this date.", "empty");
      return;
    }
    lastResultsPeople = Array.isArray(data.people) ? data.people : [];
    renderResultsList(
      container,
      `${data.count} birthday(s) on ${data.date || data.month_day}`,
      data.people
    );
  } catch (e) {
    console.error("Fetch error:", e);
    renderResults(container, "Network error while fetching data.", "error");
  }
}

// ---------- Initialization ----------
document.addEventListener("DOMContentLoaded", () => {
  const authContainer = document.getElementById("auth-container");
  const mainContainer = document.getElementById("main-container");
  const loginBtn = document.getElementById("login-btn");
  const userInput = document.getElementById("user-input");
  const passInput = document.getElementById("pass-input");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");
  const toggleDarkModeBtn = document.getElementById("toggle-dark-mode");

  const findBtn = document.getElementById("find-btn");
  const birthdayInput = document.getElementById("birthday");
  const resultsContainer = document.getElementById("results-container");
  const clearBtn = document.getElementById("clear-results-btn");
  const sendBtn = document.getElementById("send-btn");

  // Initialize theme persistence
  initializeTheme();

  function updateActionButtonsVisibility() {
    const hasResultItem = resultsContainer && !!resultsContainer.querySelector("li");
    const displayValue = hasResultItem ? "" : "none";
    if (sendBtn) sendBtn.style.display = displayValue;
    if (clearBtn) clearBtn.style.display = displayValue;
  }

  if (sendBtn) sendBtn.style.display = "none";
  if (clearBtn) clearBtn.style.display = "none";

  if (resultsContainer) {
    const observer = new MutationObserver(updateActionButtonsVisibility);
    observer.observe(resultsContainer, { childList: true, subtree: true });
  }

  if (isAuthCached() && getToken() && authContainer && mainContainer) {
    authContainer.style.display = "none";
    mainContainer.style.display = "";
  }

  // ---------- Login ----------
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      if (!userInput || !passInput || !loginError) return;
      const user = userInput.value.trim();
      const password = passInput.value;
      loginError.style.display = "none";
      loginError.textContent = "";
      try {
        const res = await fetch("http://localhost:8000/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user, password }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.token) setToken(data.token);
          setAuthCache();
          if (authContainer) authContainer.style.display = "none";
          if (mainContainer) mainContainer.style.display = "";
        } else {
          loginError.textContent = data.error || "Login failed";
            loginError.style.display = "block";
        }
      } catch {
        loginError.textContent = "Could not connect to server";
        loginError.style.display = "block";
      }
    });
  }

  // ---------- Logout ----------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const token = getToken();
      try {
        await fetch("http://localhost:8000/logout", {
          method: "POST",
          headers: token ? { Authorization: "Bearer " + token } : {},
        });
      } catch {}
      clearToken();
      clearAuthCache();
      lastResultsPeople = [];
      if (mainContainer) mainContainer.style.display = "none";
      if (authContainer) authContainer.style.display = "flex";
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";
      if (resultsContainer) resultsContainer.innerHTML = "";
      updateActionButtonsVisibility();
    });
  }

  // ---------- Theme Toggle ----------
  if (toggleDarkModeBtn) {
    toggleDarkModeBtn.addEventListener("click", toggleThemeElectronBridge);
  }

  // ---------- Find Birthdays ----------
  if (findBtn && birthdayInput) {
    function runFind() {
      if (!birthdayInput) return;
      fetchBirthdays(birthdayInput.value, resultsContainer)
        .then(updateActionButtonsVisibility);
    }
    findBtn.addEventListener("click", runFind);
    birthdayInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runFind();
    });
  }

  // ---------- External Links ----------
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const url = link.getAttribute("href");
      if (!url) return;
      if (window.electron && window.electron.openExternal) {
        const result = await window.electron.openExternal(url);
        if (!result || result.ok !== true) {
          try { window.open(url, "_blank", "noopener"); } catch {}
        }
      } else {
        try { window.open(url, "_blank", "noopener"); } catch {}
      }
    });
  });

  // ---------- Clear Results ----------
  if (clearBtn && resultsContainer) {
    clearBtn.addEventListener("click", () => {
      resultsContainer.innerHTML = "";
      lastResultsPeople = [];
      updateActionButtonsVisibility();
    });
  }

  // ---------- Send Message ----------
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (sendBtn.classList.contains("loading")) return;
      if (!lastResultsPeople || lastResultsPeople.length === 0) {
        alert("No results to send. Please find birthdays first.");
        return;
      }

      const p = lastResultsPeople[0] || {};
      const payload = {
        name: p.name || "",
        recipient: p.email || "",
        recipient_phone: p.phone || "",
        father_email: p.father_email || "",
        father_phone: p.father_phone || "",
        mother_email: p.mother_email || "",
        mother_phone: p.mother_phone || "",
      };

      sendBtn.classList.add("loading");
      sendBtn.disabled = true;
      sendBtn.setAttribute("aria-busy", "true");
      sendBtn.setAttribute("aria-disabled", "true");

      try {
        const res = await fetch("http://localhost:8000/send_card", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify(payload),
        });
        let data;
        try { data = await res.json(); } catch { data = { error: "Invalid JSON response" }; }
        if (!res.ok) {
          alert("Send failed");
          console.error("Send error detail:", data);
          return;
        }
        alert("Send succeeded");
      } catch (err) {
        console.error("Network/send error:", err);
        alert("Network error while sending message.");
      } finally {
        sendBtn.classList.remove("loading");
        sendBtn.disabled = false;
        sendBtn.removeAttribute("aria-busy");
        sendBtn.removeAttribute("aria-disabled");
      }
    });
  }

  updateActionButtonsVisibility();
});
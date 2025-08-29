// ---------- Constants & Cache Keys ----------
const AUTH_CACHE_KEY = "auth_cache";
const AUTH_CACHE_MINUTES = 60; // 1 hour
const THEME_CACHE_KEY = "theme_mode"; // 'dark' | 'light'
const TOKEN_KEY = "auth_token";
const API_URL = "http://localhost:8000";

// ---------- State (Results Cache) ----------
let lastResultsPeople = [];

// ---------- Token Helpers ----------
function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- Auth Cache Helpers ----------
function setAuthCache() {
  const expires = Date.now() + AUTH_CACHE_MINUTES * 60 * 1000;
  localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({ expires }));
}
function clearAuthCache() {
  localStorage.removeItem(AUTH_CACHE_KEY);
}
function isAuthCached() {
  const cache = localStorage.getItem(AUTH_CACHE_KEY);
  if (!cache) return false;
  try {
    const { expires } = JSON.parse(cache);
    return Date.now() < expires;
  } catch {
    return false;
  }
}

// ---------- Theme Helpers (Persistent) ----------
function applyThemeClass(mode) {
  if (mode === "dark") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
}

function getThemeCache() {
  return localStorage.getItem(THEME_CACHE_KEY);
}
function setThemeCache(mode) {
  localStorage.setItem(THEME_CACHE_KEY, mode);
}

async function setTheme(mode) {
  setThemeCache(mode);
  applyThemeClass(mode);
  if (window.darkMode && window.darkMode.set) {
    try {
      await window.darkMode.set(mode);
    } catch {}
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
        systemIsDark =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
    } catch {}
    const inferred = systemIsDark ? "dark" : "light";
    setThemeCache(inferred);
    applyThemeClass(inferred);
  }
}

async function toggleTheme() {
  // Flip stored preference explicitly.
  const current =
    getThemeCache() ||
    (document.body.classList.contains("dark") ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  await setTheme(next);
}

// Backwards-compatible bridge function (used by existing code)
async function toggleThemeElectronBridge() {
  await toggleTheme();
  const themeIndicator = document.getElementById("theme-source");
  if (themeIndicator) {
    themeIndicator.textContent = document.body.classList.contains("dark")
      ? "Dark"
      : "Light";
  }
}

// ---------- Results Rendering ----------
function renderResults(container, html, cls) {
  if (!container) return;
  container.innerHTML = `<div class="${cls || ""}">${html}</div>`;
}

function renderResultsList(container, title, people) {
  if (!container) return;
  const rows = people
    .map((p) => {
      const safe = (v) => (v ? escapeHtml(String(v)) : "–");
      const joinPair = (email, phone) => {
        if (email && phone)
          return `${escapeHtml(email)}<br><small>${escapeHtml(phone)}</small>`;
        if (email) return escapeHtml(email);
        if (phone) return `<small>${escapeHtml(phone)}</small>`;
        return "–";
      };
      return `<tr>
        <td>${safe(p.name)}</td>
        <td>${safe(p.email)}</td>
        <td>${safe(p.phone)}</td>
        <td>${joinPair(p.father_email, p.father_phone)}</td>
        <td>${joinPair(p.mother_email, p.mother_phone)}</td>
      </tr>`;
    })
    .join("");

  container.innerHTML = `
    <h3>${title}</h3>
    <div class="results-table-wrapper">
      <table class="results-table" role="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Father</th>
            <th scope="col">Mother</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Utility to escape HTML
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Birthday Fetch ----------
async function fetchBirthdays(dateValue, container) {
  lastResultsPeople = [];
  if (!dateValue) {
    renderResults(container, "Please select a date.", "error");
    return;
  }
  if (!isAuthCached() || !getToken()) {
    renderResults(
      container,
      "You are not authenticated. Please login again.",
      "error",
    );
    return;
  }

  let param = dateValue;
  if (dateValue.length === 10 && dateValue[4] === "-" && dateValue[7] === "-") {
    param = dateValue.slice(5);
  }

  renderResults(container, "Loading...", "loading");
  try {
    const res = await fetch(`${API_URL}/filter?date=${param}`, {
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
      data.people,
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
  const lockBtn = document.getElementById("lock-btn");
  const toggleDarkModeBtn = document.getElementById("toggle-dark-mode");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadInput = document.getElementById("upload-input");
  const uploadTrigger = document.getElementById("upload-trigger");
  const uploadFileLabel = document.getElementById("upload-file-label");
  const uploadStatus = document.getElementById("upload-status");

  const findBtn = document.getElementById("find-btn");
  const birthdayInput = document.getElementById("birthday");
  const resultsContainer = document.getElementById("results-container");
  const clearBtn = document.getElementById("clear-results-btn");
  const sendBtn = document.getElementById("send-btn");

  // Initialize theme persistence
  initializeTheme();

  function updateActionButtonsVisibility() {
    const hasRow =
      resultsContainer && !!resultsContainer.querySelector("tbody tr");
    const displayValue = hasRow ? "" : "none";
    if (sendBtn) sendBtn.style.display = displayValue;
    if (clearBtn) clearBtn.style.display = displayValue;
  }

  if (sendBtn) sendBtn.style.display = "none";
  if (clearBtn) clearBtn.style.display = "none";
  if (uploadBtn) uploadBtn.style.display = "none"; // hide upload until auth
  if (lockBtn) lockBtn.style.display = "none"; // hide change-password until auth

  if (resultsContainer) {
    const observer = new MutationObserver(updateActionButtonsVisibility);
    observer.observe(resultsContainer, { childList: true, subtree: true });
  }

  if (isAuthCached() && getToken() && authContainer && mainContainer) {
    authContainer.style.display = "none";
    mainContainer.style.display = "";
    if (uploadBtn) uploadBtn.style.display = "";
    if (lockBtn) lockBtn.style.display = "";
  } else if (isAuthCached() && getToken()) {
    // For pages without mainContainer (e.g., upload_excel.html)
    if (uploadBtn) uploadBtn.style.display = "";
    if (lockBtn) lockBtn.style.display = "";
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
        const res = await fetch(`${API_URL}/login`, {
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
    if (uploadBtn) uploadBtn.style.display = "";
    if (lockBtn) lockBtn.style.display = "";
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
        await fetch(`${API_URL}/logout`, {
          method: "POST",
          headers: token ? { Authorization: "Bearer " + token } : {},
        });
      } catch {}
      clearToken();
      clearAuthCache();
      lastResultsPeople = [];
      // If we're on a page without the mainContainer (e.g. upload page), redirect to home
      if (!mainContainer) {
        // Avoid redirect loop if already on home
        const path = window.location.pathname || "";
        if (!/index\.html?$/.test(path)) {
          window.location.href = "../index.html";
        }
      }
      if (mainContainer) mainContainer.style.display = "none";
      if (authContainer) authContainer.style.display = "flex";
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";
      if (resultsContainer) resultsContainer.innerHTML = "";
      updateActionButtonsVisibility();
  if (uploadBtn) uploadBtn.style.display = "none";
  if (lockBtn) lockBtn.style.display = "none";
    });
  }

  // ---------- Theme Toggle ----------
  if (toggleDarkModeBtn) {
    toggleDarkModeBtn.addEventListener("click", toggleThemeElectronBridge);
  }

  // ---------- Change Password Modal ----------
  const pwModal = document.getElementById("pw-modal");
  const pwForm = document.getElementById("pw-form");
  const pwOld = document.getElementById("pw-old");
  const pwNew = document.getElementById("pw-new");
  const pwError = document.getElementById("pw-error");
  const pwCancel = document.getElementById("pw-cancel");

  function openPwModal() {
    if (!pwModal) return;
    pwModal.style.display = "flex";
    setTimeout(() => pwOld && pwOld.focus(), 30);
  }
  function closePwModal() {
    if (!pwModal) return;
    pwModal.classList.add("closing");
    setTimeout(() => {
      pwModal.style.display = "none";
      pwModal.classList.remove("closing");
      if (pwForm) pwForm.reset();
      if (pwError) pwError.textContent = "";
    }, 210);
  }
  if (lockBtn) {
    lockBtn.addEventListener("click", () => {
      if (!isAuthCached() || !getToken()) {
        alert("Login required to change password");
        return;
      }
      openPwModal();
    });
  }
  if (pwCancel) pwCancel.addEventListener("click", closePwModal);
  if (pwModal) {
    pwModal.addEventListener("click", (e) => {
      if (e.target === pwModal) closePwModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pwModal.style.display === "flex") closePwModal();
    });
  }
  if (pwForm) {
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!pwOld || !pwNew) return;
      const old_password = pwOld.value;
      const new_password = pwNew.value;
      if (pwError) { pwError.textContent = ""; }
      const token = getToken();
      if (!token) { if (pwError) pwError.textContent = "Not authenticated"; return; }
      try {
        const res = await fetch(`${API_URL}/change_password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ old_password, new_password })
        });
        const data = await res.json();
        if (!res.ok) {
          if (pwError) pwError.textContent = data.error || "Update failed";
          return;
        }
        // On success, force logout so user reauthenticates with new password
        alert("Password updated. Please login again.");
        closePwModal();
        clearToken();
        clearAuthCache();
        if (mainContainer) mainContainer.style.display = "none";
        if (authContainer) authContainer.style.display = "flex";
      } catch (err) {
        console.error("Password change error", err);
        if (pwError) pwError.textContent = "Network error";
      }
    });
  }

  // ---------- Upload (placeholder) ----------
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
      if (uploadInput.files && uploadInput.files[0]) {
        const file = uploadInput.files[0];
        console.log("Selected file:", file.name, file.type, file.size);
      }
    });
  }

  // Full upload component logic
  if (uploadTrigger && uploadInput) {
    uploadTrigger.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => {
      if (!uploadInput.files || !uploadInput.files[0]) {
        if (uploadFileLabel) uploadFileLabel.textContent = "No file selected";
        return;
      }
      const file = uploadInput.files[0];
      if (uploadFileLabel) uploadFileLabel.textContent = file.name;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        if (uploadStatus) {
          uploadStatus.style.color = "#c0392b";
          uploadStatus.textContent = "Only .csv files are allowed";
        }
        return;
      }
      if (!isAuthCached() || !getToken()) {
        if (uploadStatus) {
          uploadStatus.style.color = "#c0392b";
          uploadStatus.textContent = "Login required";
        }
        return;
      }
      const formData = new FormData();
      formData.append("file", file, file.name);
      if (uploadStatus) {
        uploadStatus.style.color = "";
        uploadStatus.textContent = "Uploading...";
      }
      fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: "Bearer " + getToken() },
        body: formData,
      })
        .then(async (res) => {
          let data;
          try { data = await res.json(); } catch { data = {}; }
          if (res.ok) {
            if (uploadStatus) {
              uploadStatus.style.color = "#1e7e34";
              uploadStatus.textContent = "Upload successful";
            }
          } else {
            if (uploadStatus) {
              uploadStatus.style.color = "#c0392b";
              uploadStatus.textContent = data.error || "Upload failed";
            }
          }
        })
        .catch((err) => {
          console.error("Upload error", err);
          if (uploadStatus) {
            uploadStatus.style.color = "#c0392b";
            uploadStatus.textContent = "Network error";
          }
        });
    });
  }

  // ---------- Find Birthdays ----------
  if (findBtn && birthdayInput) {
    function runFind() {
      if (!birthdayInput) return;
      fetchBirthdays(birthdayInput.value, resultsContainer).then(
        updateActionButtonsVisibility,
      );
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
          try {
            window.open(url, "_blank", "noopener");
          } catch {}
        }
      } else {
        try {
          window.open(url, "_blank", "noopener");
        } catch {}
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
        const res = await fetch(`${API_URL}/send_card`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + getToken(),
          },
          body: JSON.stringify(payload),
        });
        let data;
        try {
          data = await res.json();
        } catch {
          data = { error: "Invalid JSON response" };
        }
        if (!res.ok) {
          alert("Send failed");
          console.error("Send error detail:", data);
          return;
        }
        // TODO: add all the mobile numbers and emails to the payload
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
// ---------- Constants & Cache Keys ----------
const AUTH_CACHE_KEY = "auth_cache";
const AUTH_CACHE_MINUTES = 60; // 1 hour
const THEME_CACHE_KEY = "theme_mode"; // 'dark' | 'light'
const TOKEN_KEY = "auth_token";
// const API_URL = "https://birthday-messenger.onrender.com";
const DEFAULT_API_BASE = "https://birthday-messenger.vercel.app";
const REMOTE_API_BASE = "https://birthday-messenger.vercel.app";
const resolveApiBase = () => {
  const stored = localStorage.getItem("api_base");
  if (stored) return stored.replace(/\/+$/, "");
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("api");
  if (fromQuery) return fromQuery.replace(/\/+$/, "");
  if (window.location && window.location.protocol === "file:") {
    return DEFAULT_API_BASE;
  }
  return REMOTE_API_BASE;
};
const API_URL = resolveApiBase();

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
      // Determine a single parent email (prefer explicit parent email, otherwise father then mother).
      const parentEmail = p.parent_email || null; // only using explicit parent_email from backend
      const parentEmailHtml = parentEmail ? escapeHtml(parentEmail) : "–";
      // Extract birth year from record. Backend sends 'birthday' in YYYY-MM-DD. Fallback to 'dob'.
      let year = "";
      const dobSource = p.birthday || p.dob || p.DOB || p.date_of_birth;
      if (dobSource) {
        const s = String(dobSource).trim();
        let m = s.match(/^(\d{4})[-/]/); // leading year pattern
        if (!m) m = s.match(/(\d{4})$/); // trailing year
        if (m) year = m[1];
      }
      return `<tr>
        <td>${safe(p.name)}</td>
        <td>${safe(p.email)}</td>
        <td>${safe(p.phone)}</td>
        <td>${parentEmailHtml}</td>
        <td>${year ? safe(year) : "–"}</td>
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
            <th scope="col">Parent Email</th>
            <th scope="col">Year</th>
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
  const uploadInput = document.getElementById("upload-input");

  const HOD_EMAIL = "hod.cse.srmtrichy@gmail.com";
  const getAuth = () => {
    if (!window.firebase || !window.FIREBASE_CONFIG) return null;
    if (!firebase.apps.length) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    return firebase.auth();
  };
  const auth = getAuth();
  const isHodUser = (user) => !!user && user.email === HOD_EMAIL;

  // Initialize theme persistence
  initializeTheme();

  if (lockBtn) lockBtn.style.display = "none"; // hide change-password until auth

  const setUiAuthed = (authed) => {
    if (authContainer && mainContainer) {
      authContainer.style.display = authed ? "none" : "flex";
      mainContainer.style.display = authed ? "" : "none";
    }
    if (lockBtn) lockBtn.style.display = authed ? "" : "none";
  };

  // Initialize UI state
  setUiAuthed(false);

  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (isHodUser(user)) {
        setUiAuthed(true);
        if (window.reloadUploadFiles) window.reloadUploadFiles();
      } else {
        if (user) {
          auth.signOut();
          if (loginError) {
            loginError.textContent = "Access restricted to HOD.";
            loginError.style.display = "block";
          }
        }
        setUiAuthed(false);
      }
    });
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
        if (!auth) throw new Error("Firebase Auth not initialized");
        const cred = await auth.signInWithEmailAndPassword(user, password);
        if (!isHodUser(cred.user)) {
          await auth.signOut();
          loginError.textContent = "Access restricted to HOD.";
          loginError.style.display = "block";
          return;
        }
        loginError.textContent = "";
        loginError.style.display = "none";
      } catch (err) {
        loginError.textContent = err && err.message ? err.message : "Login failed";
        loginError.style.display = "block";
      }
    });
  }

  // ---------- Logout ----------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      lastResultsPeople = [];
      if (auth) {
        try { await auth.signOut(); } catch {}
      }
      // If we're on a page without the mainContainer (e.g. upload page), redirect to home
      if (!mainContainer) {
        // Avoid redirect loop if already on home
        const path = window.location.pathname || "";
        if (!/index\.html?$/.test(path)) {
          window.location.href = "../index.html";
        }
      }
      setUiAuthed(false);
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";
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
      const user = auth ? auth.currentUser : null;
      if (!isHodUser(user)) {
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
      const user = auth ? auth.currentUser : null;
      if (!isHodUser(user)) { if (pwError) pwError.textContent = "Not authenticated"; return; }
      try {
        const credential = firebase.auth.EmailAuthProvider.credential(
          user.email,
          old_password,
        );
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(new_password);
        alert("Password updated successfully.");
        closePwModal();
      } catch (err) {
        console.error("Password change error", err);
        if (pwError) pwError.textContent = err && err.message ? err.message : "Update failed";
      }
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

});

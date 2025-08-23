// ---------- Constants & Cache Keys ----------
const AUTH_CACHE_KEY = "auth_cache";
const AUTH_CACHE_MINUTES = 60; // 1 hour
const THEME_CACHE_KEY = "theme_mode"; // 'dark' | 'light'
const TOKEN_KEY = "auth_token";

// ---------- State (Results Cache) ----------
// ADDED: Keeps the raw people objects from the last successful /filter call
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

// ---------- Theme Helpers ----------
function applyThemeClass(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
}
function getThemeCache() {
  return localStorage.getItem(THEME_CACHE_KEY);
}
function setThemeCache(mode) {
  localStorage.setItem(THEME_CACHE_KEY, mode);
}

async function toggleThemeElectronBridge() {
  if (!window.darkMode || !window.darkMode.toggle) {
    const isDark = !document.body.classList.contains("dark");
    applyThemeClass(isDark ? "dark" : "light");
    setThemeCache(isDark ? "dark" : "light");
    return;
  }
  const isDarkMode = await window.darkMode.toggle();
  const mode = isDarkMode ? "dark" : "light";
  setThemeCache(mode);
  applyThemeClass(mode);
  const themeIndicator = document.getElementById("theme-source");
  if (themeIndicator) {
    themeIndicator.textContent = isDarkMode ? "Dark" : "Light";
  }
}

// ---------- Results Rendering ----------
function renderResults(container, html, cls) {
  if (!container) return;
  container.innerHTML = `<div class="${cls || ""}">${html}</div>`;
}

function renderResultsList(container, title, people) {
  if (!container) return;
  const listItems = people
    .map((p) => {
      const name = p.name || "(No name)";
      const email = p.email ? ` - ${p.email}` : "";
      const phone = p.phone ? ` <span>(${p.phone})</span>` : "";

      // Add father and mother email info if present
      const fatherEmail = p.father_email ? `<br><small>Father Email: ${p.father_email} (${p.father_phone})</small>` : "";
      const motherEmail = p.mother_email ? `<br><small>Mother Email: ${p.mother_email} (${p.mother_phone})</small>` : "";

      return `<li>
        <strong>${name}</strong>${email}${phone}
        ${fatherEmail}${motherEmail}
      </li>`;
    })
    .join("");
  container.innerHTML = `
    <h3>${title}</h3>
    <ul>${listItems}</ul>
  `;
}

// ---------- Birthday Fetch ----------
async function fetchBirthdays(dateValue, container) {
  // Reset cached people before new fetch attempt
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

  // Convert YYYY-MM-DD -> MM-DD
  let param = dateValue;
  if (dateValue.length === 10 && dateValue[4] === "-" && dateValue[7] === "-") {
    param = dateValue.slice(5);
  }

  renderResults(container, "Loading...", "loading");
  try {
    const res = await fetch(`http://localhost:8000/filter?date=${param}`, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + getToken(),
      },
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

    // Store full people objects (including father/mother contacts)
    lastResultsPeople = Array.isArray(data.people) ? data.people : [];

    renderResultsList(
      container,
      `${data.count} birthday(s) on ${data.date || data.month_day}`,
      data.people,
    );
  } catch {
    renderResults(container, "Network error while fetching data.", "error");
  }
}

// ---------- Initialization ----------
document.addEventListener("DOMContentLoaded", () => {
  // Core elements
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

  // Helper: Show/hide send & clear buttons based on presence of results
  function updateActionButtonsVisibility() {
    const hasResultItem =
      resultsContainer && !!resultsContainer.querySelector("li");
    const displayValue = hasResultItem ? "" : "none";
    if (sendBtn) sendBtn.style.display = displayValue;
    if (clearBtn) clearBtn.style.display = displayValue;
  }

  // Initially hide buttons (no results yet)
  if (sendBtn) sendBtn.style.display = "none";
  if (clearBtn) clearBtn.style.display = "none";

  // Observe results container for changes to auto-toggle visibility
  if (resultsContainer) {
    const observer = new MutationObserver(updateActionButtonsVisibility);
    observer.observe(resultsContainer, { childList: true, subtree: true });
  }

  // Apply cached theme early
  const cachedTheme = getThemeCache();
  if (cachedTheme) applyThemeClass(cachedTheme);

  // Show main if auth cache + token
  if (isAuthCached() && getToken() && authContainer && mainContainer) {
    authContainer.style.display = "none";
    mainContainer.style.display = "";
  }

  // --------- Login ----------
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

  // --------- Logout ----------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const token = getToken();
      try {
        await fetch("http://localhost:8000/logout", {
          method: "POST",
          headers: token ? { Authorization: "Bearer " + token } : {},
        });
      } catch {
        // ignore network errors on logout
      }
      clearToken();
      clearAuthCache();
      lastResultsPeople = []; // ADDED reset
      if (mainContainer) mainContainer.style.display = "none";
      if (authContainer) authContainer.style.display = "flex";
      if (userInput) userInput.value = "";
      if (passInput) passInput.value = "";
      if (resultsContainer) resultsContainer.innerHTML = "";
      updateActionButtonsVisibility();
    });
  }

  // --------- Theme Toggle ----------
  if (toggleDarkModeBtn) {
    toggleDarkModeBtn.addEventListener("click", toggleThemeElectronBridge);
  }

  // --------- Find Birthdays ----------
  if (findBtn && birthdayInput) {
    findBtn.addEventListener("click", () => {
      fetchBirthdays(birthdayInput.value, resultsContainer).then(
        updateActionButtonsVisibility,
      );
    });
    birthdayInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        fetchBirthdays(birthdayInput.value, resultsContainer).then(
          updateActionButtonsVisibility,
        );
      }
    });
  }

  // --------- External Links ----------
  document.querySelectorAll('a[target="_blank"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.getAttribute("href");
      if (url && window.electron && window.electron.openExternal) {
        window.electron.openExternal(url);
      }
    });
  });

  // --------- Clear Results ---------
  if (clearBtn && resultsContainer) {
    clearBtn.addEventListener("click", () => {
      resultsContainer.innerHTML = "";
      lastResultsPeople = []; // ADDED reset
      updateActionButtonsVisibility();
    });
  }

  // --------- Send Message ---------
  if (sendBtn) {
    sendBtn.addEventListener("click", () => {
      if (!lastResultsPeople || lastResultsPeople.length === 0) {
        alert("No results to send. Please find birthdays first.");
        return;
      }

      // Construct payload including parent contact details
      const payload = lastResultsPeople.map((p) => ({
        name: p.name || "",
        recipient: p.email || "",
        recipient_phone: p.phone || "",
        father_email: p.father_email || "",
        father_phone: p.father_phone || "",
        mother_email: p.mother_email || "",
        mother_phone: p.mother_phone || "",
      }));

      // Send Card
      fetch("http://localhost:8000/send_card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + getToken(),
        },
        body: JSON.stringify(payload[0]),
      })
        .then((res) => res.json())
        .then((data) => {
          alert(JSON.stringify(data))
        })
        .catch(() => {
          alert("Network error while sending message.");
        });
    });
  }

  // Final initial visibility sync
  updateActionButtonsVisibility();
});

document.addEventListener('DOMContentLoaded', () => {
  const authContainer = document.getElementById('auth-container');
  const mainContainer = document.getElementById('main-container');
  const loginBtn = document.getElementById('login-btn');
  const userInput = document.getElementById('user-input');
  const passInput = document.getElementById('pass-input');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  loginBtn.addEventListener('click', async () => {
    const user = userInput.value.trim();
    const password = passInput.value;
    loginError.style.display = 'none';

    try {
      const res = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user, password })
      });
      const data = await res.json();
      if (res.ok) {
        authContainer.style.display = 'none';
        mainContainer.style.display = '';
      } else {
        loginError.textContent = data.error || 'Login failed';
        loginError.style.display = 'block';
      }
    } catch (err) {
      loginError.textContent = 'Could not connect to server';
      loginError.style.display = 'block';
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('http://localhost:5000/logout', {
        method: 'POST',
        credentials: 'include'
      });
      mainContainer.style.display = 'none';
      authContainer.style.display = 'flex';
      userInput.value = '';
      passInput.value = '';
    });
  }
});

document.getElementById('toggle-dark-mode').addEventListener('click', async () => {
  const isDarkMode = await window.darkMode.toggle()
  document.getElementById('theme-source').innerHTML = isDarkMode ? 'Dark' : 'Light'
})

document.getElementById('reset-to-system').addEventListener('click', async () => {
  await window.darkMode.system()
  document.getElementById('theme-source').innerHTML = 'System'
})

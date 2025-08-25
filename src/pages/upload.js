document.addEventListener("DOMContentLoaded", () => {
  // Auth helper function
  function hasAuth() {
    const token = localStorage.getItem("auth_token");
    const cache = localStorage.getItem("auth_cache");
    if (!token || !cache) return false;
    try {
      const { expires } = JSON.parse(cache);
      return Date.now() < expires;
    } catch {
      return false;
    }
  }

  // Generic file upload handler
  function setupFileUpload(year) {
    const selectBtn = document.getElementById(`select-${year}-year`);
    const uploadBtn = document.getElementById(`upload-${year}-year`);
    const input = document.getElementById(`${year}-year-input`);
    const label = document.getElementById(`${year}-year-label`);
    const statusEl = document.getElementById(`${year}-year-status`);

    if (!selectBtn || !uploadBtn || !input || !label || !statusEl) return;

    // Check auth on page load
    if (!hasAuth()) {
      statusEl.style.color = "#ef4444";
      statusEl.textContent = "🔒 Login required to upload";
    }

    // File selection
    selectBtn.addEventListener("click", () => input.click());

    // File change handler
    input.addEventListener("change", () => {
      if (!input.files || !input.files[0]) {
        label.textContent = "No file selected";
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = "0.6";
        statusEl.textContent = "";
        return;
      }

      const file = input.files[0];
      label.textContent = `📄 ${file.name}`;
      
      const lower = file.name.toLowerCase();
      const valid = lower.endsWith(".xlsx");
      
      if (!valid) {
        statusEl.style.color = "#ef4444";
        statusEl.textContent = "❌ Only .xlsx files allowed";
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = "0.6";
      } else {
        statusEl.textContent = "";
        const isAuthed = hasAuth();
        uploadBtn.disabled = !isAuthed;
        uploadBtn.style.opacity = isAuthed ? "1" : "0.6";
        if (isAuthed) {
          statusEl.style.color = "#10b981";
          statusEl.textContent = "✅ Ready to upload";
        }
      }
    });

    // Upload handler
    uploadBtn.addEventListener("click", () => {
      if (!input.files || !input.files[0]) return;
      
      if (!hasAuth()) {
        statusEl.style.color = "#ef4444";
        statusEl.textContent = "🔒 Login required";
        return;
      }

      const file = input.files[0];
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("year", year); // Add year information
      
      statusEl.style.color = "#3b82f6";
      statusEl.textContent = "🚀 Uploading...";
      uploadBtn.disabled = true;
      uploadBtn.style.opacity = "0.6";
      selectBtn.disabled = true;
      selectBtn.style.opacity = "0.6";

      fetch("http://localhost:8000/upload_excel", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("auth_token"),
        },
        body: fd,
      })
        .then(async (res) => {
          let data;
          try {
            data = await res.json();
          } catch {
            data = {};
          }
          
          if (res.ok) {
            statusEl.style.color = "#10b981";
            statusEl.textContent = `🎉 ${year.charAt(0).toUpperCase() + year.slice(1)} year upload successful!`;
            // Clear the file input after successful upload
            input.value = "";
            label.textContent = "No file selected";
          } else {
            statusEl.style.color = "#ef4444";
            statusEl.textContent = `❌ ${data.error || 'Upload failed'}`;
          }
        })
        .catch((err) => {
          console.error(err);
          statusEl.style.color = "#ef4444";
          statusEl.textContent = "🌐 Network error - please try again";
        })
        .finally(() => {
          selectBtn.disabled = false;
          selectBtn.style.opacity = "1";
          const isAuthed = hasAuth();
          const hasFile = input.files && input.files[0];
          uploadBtn.disabled = !isAuthed || !hasFile;
          uploadBtn.style.opacity = (!isAuthed || !hasFile) ? "0.6" : "1";
        });
    });
  }

  // Setup all four year uploads
  setupFileUpload("first");
  setupFileUpload("second");
  setupFileUpload("third");
  setupFileUpload("fourth");

  // Listen for auth changes to update button states
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth_token' || e.key === 'auth_cache') {
      const isAuthed = hasAuth();
      ['first', 'second', 'third', 'fourth'].forEach(year => {
        const uploadBtn = document.getElementById(`upload-${year}-year`);
        const statusEl = document.getElementById(`${year}-year-status`);
        const input = document.getElementById(`${year}-year-input`);
        
        if (uploadBtn && input) {
          const hasFile = input.files && input.files[0];
          uploadBtn.disabled = !isAuthed || !hasFile;
          uploadBtn.style.opacity = (!isAuthed || !hasFile) ? "0.6" : "1";
        }
        
        if (statusEl) {
          if (!isAuthed) {
            statusEl.style.color = "#ef4444";
            statusEl.textContent = "🔒 Login required to upload";
          } else if (input.files && input.files[0]) {
            statusEl.style.color = "#10b981";
            statusEl.textContent = "✅ Ready to upload";
          } else {
            statusEl.textContent = "";
          }
        }
      });
    }
  });
});

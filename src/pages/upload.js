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

  // Load current files on page load
  loadCurrentFiles();

  // Function to load and display current files
  function loadCurrentFiles() {
    const loadingEl = document.getElementById('files-loading');
    const listEl = document.getElementById('files-list');
    const noFilesEl = document.getElementById('no-files');

    if (!hasAuth()) {
      loadingEl.style.display = 'none';
      listEl.style.display = 'none';
      noFilesEl.style.display = 'block';
      noFilesEl.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.5">🔒</div>
        <p style="margin: 0; font-size: 16px">Login required</p>
        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.7">Please login to view and upload files</p>
      `;
      return;
    }

    fetch('http://localhost:8000/list_files', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
      }
    })
      .then(async res => {
        const data = await res.json();
        loadingEl.style.display = 'none';
        
        if (res.ok && data.files && data.files.length > 0) {
          displayFiles(data.files);
          listEl.style.display = 'block';
          // Always show the upload interface
          noFilesEl.style.display = 'block';
        } else {
          listEl.style.display = 'none';
          noFilesEl.style.display = 'block';
        }
      })
      .catch(err => {
        console.error('Error loading files:', err);
        loadingEl.style.display = 'none';
        listEl.style.display = 'none';
        noFilesEl.style.display = 'block';
        noFilesEl.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.5">⚠️</div>
          <p style="margin: 0; font-size: 16px; color: #374151">Error loading files</p>
          <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.7">Please try refreshing the page</p>
        `;
      });
  }

  // Function to display files list
  function displayFiles(files) {
    const listEl = document.getElementById('files-list');
    
    // Always show the quick upload interface, even when files exist
    const noFilesEl = document.getElementById('no-files');
    noFilesEl.style.display = 'block';
    
    // Update the header text when files exist
    const headerText = noFilesEl.querySelector('p');
    if (headerText && files.length > 0) {
      headerText.textContent = `${files.length} file(s) uploaded`;
    }
    
    listEl.innerHTML = files.map(file => `
      <div style="
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        padding: 12px; 
        margin-bottom: 8px; 
        background: white; 
        border: 1px solid #e5e7eb; 
        border-radius: 6px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      ">
        <div style="flex: 1">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px">
            <span style="font-size: 16px">📊</span>
            <span style="font-weight: 600; color: #1f2937; font-size: 14px">${file.filename}</span>
          </div>
          <div style="font-size: 11px; color: #6b7280">
            <span>📦 ${file.size_mb} MB</span>
            <span style="margin-left: 12px">📅 ${new Date(file.uploaded_at).toLocaleDateString()}</span>
            <span style="margin-left: 12px">🕒 ${new Date(file.uploaded_at).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Global functions for file management
  window.replaceFile = function(filename) {
    if (!confirm(`Are you sure you want to replace "${filename}"? This will permanently remove the current file.`)) {
      return;
    }
    
    // Create a temporary file input for replacement
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      // Delete the old file first
      deleteFileInternal(filename, () => {
        // Upload the new file with the same name
        uploadReplacementFile(file, filename);
      });
    };
    input.click();
  };

  window.deleteFile = function(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }
    deleteFileInternal(filename, () => {
      loadCurrentFiles(); // Refresh the list
    });
  };

  function deleteFileInternal(filename, callback) {
    fetch('http://localhost:8000/delete_xls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
      },
      body: JSON.stringify({ filename })
    })
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          if (callback) callback();
        } else {
          console.error('Delete failed:', data.error);
        }
      })
      .catch(err => {
        console.error('Delete error:', err);
      });
  }

  function uploadReplacementFile(file, originalFilename) {
    const fd = new FormData();
    fd.append('file', file, originalFilename); // Use original filename
    
    fetch('http://localhost:8000/upload_excel', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
      },
      body: fd
    })
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          loadCurrentFiles(); // Refresh the list
        } else {
          console.error('Replacement failed:', data.error);
        }
      })
      .catch(err => {
        console.error('Upload error:', err);
      });
  }

  // Quick upload functions for the no-files section
  window.triggerFileUpload = function(year) {
    if (!hasAuth()) {
      console.log('Please login first to upload files');
      return;
    }
    const input = document.getElementById(`quick-${year}-input`);
    if (input) {
      input.click();
    }
  };

  window.handleQuickUpload = function(year, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    if (!hasAuth()) {
      console.log('Login required to upload');
      return;
    }

    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('year', year);
    
    // Find the corresponding slot and update its appearance during upload
    const slot = inputElement.parentElement;
    const originalHTML = slot.innerHTML;
    slot.innerHTML = `
      <div style="
        display: inline-flex; 
        align-items: center; 
        justify-content: center; 
        width: 40px; 
        height: 40px; 
        background: linear-gradient(135deg, #6b7280, #4b5563); 
        color: white; 
        border-radius: 10px; 
        font-size: 16px; 
        margin-bottom: 8px;
      ">⏳</div>
      <p style="margin: 0; font-size: 14px; font-weight: 600; color: #374151">Uploading...</p>
      <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.6">${file.name}</p>
    `;
    
    fetch('http://localhost:8000/upload_excel', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
      },
      body: fd
    })
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          // Reset the slot to original state
          slot.innerHTML = originalHTML;
          // Clear the input
          const newInput = slot.querySelector('input[type="file"]');
          if (newInput) newInput.value = '';
          // Refresh the current files list
          loadCurrentFiles();
        } else {
          // Reset the slot and show error briefly
          slot.innerHTML = originalHTML;
          console.error('Upload failed:', data.error);
        }
      })
      .catch(err => {
        console.error('Quick upload error:', err);
        // Reset the slot
        slot.innerHTML = originalHTML;
      });
  };



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
            // Refresh the current files list
            loadCurrentFiles();
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
      
      // Refresh files list when auth changes
      loadCurrentFiles();
      
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

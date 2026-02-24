document.addEventListener("DOMContentLoaded", () => {
  // Auth helper function (Firebase Auth)
  const HOD_EMAIL = "hod.cse.srmtrichy@gmail.com";
  function hasAuth() {
    if (!window.firebase) return false;
    const auth = firebase.auth();
    const user = auth.currentUser;
    return !!user && user.email === HOD_EMAIL;
  }

  // Local storage for uploaded files (since we're uploading directly to Firestore)
  let localUploadedFiles = [];

  // Expose loadCurrentFiles globally so it can be called after login
  window.reloadUploadFiles = loadCurrentFiles;

  // Listen for auth state changes to load files when authenticated
  if (window.firebase) {
    firebase.auth().onAuthStateChanged(() => {
      loadCurrentFiles();
    });
  } else {
    // Fallback: load immediately if firebase not ready
    loadCurrentFiles();
  }

  // Function to load and display current files
  function loadCurrentFiles() {
    const loadingEl = document.getElementById("files-loading");
    const listEl = document.getElementById("files-list");
    const noFilesEl = document.getElementById("no-files");
    const fileCountEl = document.getElementById("file-count");
    const deleteAllBtn = document.getElementById("delete-all-btn");
    const convertBtn = document.getElementById("convert-btn");

    if (!hasAuth()) {
      loadingEl.style.display = "none";
      listEl.style.display = "none";
      noFilesEl.style.display = "block";
      if (fileCountEl) fileCountEl.textContent = "0 files";
      if (deleteAllBtn) deleteAllBtn.style.display = "none";
      if (convertBtn) convertBtn.style.display = "none";
      noFilesEl.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.5">🔒</div>
        <p style="margin: 0; font-size: 16px">Login required</p>
        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.7">Please login to view and upload files</p>
      `;
      return;
    }

    // Display locally uploaded files
    loadingEl.style.display = "none";

    if (localUploadedFiles.length > 0) {
      displayFiles(localUploadedFiles);
      listEl.style.display = "block";
      noFilesEl.style.display = "block";
    } else {
      listEl.style.display = "none";
      noFilesEl.style.display = "block";
      if (fileCountEl) fileCountEl.textContent = "0 files";
      if (deleteAllBtn) deleteAllBtn.style.display = "none";
      if (convertBtn) convertBtn.style.display = "none";
    }
  }

  // Function to display files list
  function displayFiles(files) {
    const listEl = document.getElementById("files-list");
    const fileCountEl = document.getElementById("file-count");
    const deleteAllBtn = document.getElementById("delete-all-btn");
    const convertBtn = document.getElementById("convert-btn");
    // cache for theme re-render
    window.__currentUploadFiles = files;

    // Update file count and show/hide action buttons
    if (fileCountEl) {
      fileCountEl.textContent = `${files.length} file${files.length !== 1 ? "s" : ""}`;
    }
    if (deleteAllBtn) {
      deleteAllBtn.style.display = files.length > 0 ? "flex" : "none";
    }
    if (convertBtn) {
      convertBtn.style.display = files.length > 0 ? "flex" : "none";
    }

    // Always show the quick upload interface, even when files exist
    const noFilesEl = document.getElementById("no-files");
    if (noFilesEl) {
      noFilesEl.style.display = "block";

      // Update the header text when files exist
      const headerText = noFilesEl.querySelector("p");
      if (headerText && files.length > 0) {
        headerText.textContent = `${files.length} file(s) ready for Firestore upload`;
      }
    }

    const dark = document.body.classList.contains("dark");
    listEl.innerHTML = files
      .map((file) => {
        const date = file.uploaded_at ? new Date(file.uploaded_at) : new Date();
        const sizeMB = file.size_mb || (file.size ? (file.size / (1024 * 1024)).toFixed(2) : '0.00');
        return `
        <div class="file-item">
          <div class="file-item__top">
            <p class="file-item__name" title="${file.filename || file.name}">${file.filename || file.name}</p>
          </div>
          <div class="file-item__meta">
            <span class="file-pill">${sizeMB} MB</span>
            <span>${date.toLocaleDateString()}</span>
            <span>${date.toLocaleTimeString()}</span>
          </div>
        </div>`;
      })
      .join("");
  }

  window.deleteFile = function (filename) {
    if (
      !confirm(
        `Are you sure you want to delete "${filename}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    deleteFileInternal(filename, () => {
      loadCurrentFiles(); // Refresh the list
    });
  };

  function deleteFileInternal(filename, callback) {
    localUploadedFiles = localUploadedFiles.filter(
      (file) => (file.filename || file.name) !== filename,
    );
    if (callback) callback();
  }

  // Quick upload functions for the no-files section
  window.triggerFileUpload = function (year) {
    if (!hasAuth()) {
      console.log("Please login first to upload files");
      return;
    }
    const input = document.getElementById(`quick-${year}-input`);
    if (input) {
      input.click();
    }
  };

  window.handleQuickUpload = function (year, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

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

    const fileInfo = {
      filename: file.name,
      name: file.name,
      size: file.size,
      size_mb: (file.size / (1024 * 1024)).toFixed(2),
      uploaded_at: new Date().toISOString(),
      fileObject: file,
      year,
    };
    localUploadedFiles.push(fileInfo);

    // Reset the slot to original state
    slot.innerHTML = originalHTML;
    // Clear the input
    const newInput = slot.querySelector('input[type="file"]');
    if (newInput) newInput.value = "";
    // Refresh the current files list
    loadCurrentFiles();
  };

  // Generic file upload handler
  function setupFileUpload(year) {
    const selectBtn = document.getElementById(`select-${year}-year`);
    const uploadBtn = document.getElementById(`upload-${year}-year`);
    const input = document.getElementById(`${year}-year-input`);
    const label = document.getElementById(`${year}-year-label`);
    const statusEl = document.getElementById(`${year}-year-status`);

    if (!selectBtn || !uploadBtn || !input || !label || !statusEl) return;

    // No server auth required
    statusEl.textContent = "";

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
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = "1";
        statusEl.style.color = "#10b981";
        statusEl.textContent = "✅ Ready to upload";
      }
    });

    // Upload handler
    uploadBtn.addEventListener("click", () => {
      if (!input.files || !input.files[0]) return;

      const file = input.files[0];
      statusEl.style.color = "#3b82f6";
      statusEl.textContent = "🚀 Uploading...";
      uploadBtn.disabled = true;
      uploadBtn.style.opacity = "0.6";
      selectBtn.disabled = true;
      selectBtn.style.opacity = "0.6";

      const fileInfo = {
        filename: file.name,
        name: file.name,
        size: file.size,
        size_mb: (file.size / (1024 * 1024)).toFixed(2),
        uploaded_at: new Date().toISOString(),
        fileObject: file,
        year,
      };
      localUploadedFiles.push(fileInfo);

      statusEl.style.color = "#10b981";
      statusEl.textContent = `🎉 ${year.charAt(0).toUpperCase() + year.slice(1)} year upload successful!`;
      // Clear the file input after successful upload
      input.value = "";
      label.textContent = "No file selected";
      // Refresh the current files list
      loadCurrentFiles();

      selectBtn.disabled = false;
      selectBtn.style.opacity = "1";
      const hasFile = input.files && input.files[0];
      uploadBtn.disabled = !hasFile;
      uploadBtn.style.opacity = !hasFile ? "0.6" : "1";
    });
  }

  // Setup all four year uploads
  setupFileUpload("first");
  setupFileUpload("second");
  setupFileUpload("third");
  setupFileUpload("fourth");

  // Listen for auth changes to update UI
  if (window.firebase) {
    firebase.auth().onAuthStateChanged(() => {
      loadCurrentFiles();
    });
  }

  // Delete All Files function
  window.deleteAllFiles = function () {
    const confirmModal = document.createElement("div");
    confirmModal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const isDark = document.body.classList.contains("dark");
    confirmModal.innerHTML = `
      <div style="
        background: ${isDark ? "#2d3748" : "#fff"};
        color: ${isDark ? "#e2e8f0" : "#1a202c"};
        padding: 24px;
        border-radius: 12px;
        max-width: 520px;
        width: 90%;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      ">
        <h3 style="margin: 0 0 8px;">Clear Firestore Data</h3>
        <p style="margin: 0 0 12px; line-height: 1.5;">
          This will permanently delete all student records from Firestore for the CSE department.
          This action cannot be undone.
        </p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-clear" class="btn-outline">Cancel</button>
          <button id="confirm-clear" class="btn-quiet danger">Yes, Delete All</button>
        </div>
      </div>
    `;

    document.body.appendChild(confirmModal);

    const cleanup = () => confirmModal.remove();
    confirmModal.querySelector("#cancel-clear").addEventListener("click", cleanup);

    confirmModal.querySelector("#confirm-clear").addEventListener("click", async () => {
      cleanup();

      const deleteAllBtn = document.getElementById("delete-all-btn");
      if (deleteAllBtn) {
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = "🧹 Clearing...";
        deleteAllBtn.style.opacity = "0.6";
      }

      // Progress modal
      const progressModal = document.createElement("div");
      progressModal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;
      progressModal.innerHTML = `
        <div style="
          background: ${isDark ? "#2d3748" : "#fff"};
          color: ${isDark ? "#e2e8f0" : "#1a202c"};
          padding: 20px 24px;
          border-radius: 10px;
          min-width: 280px;
          text-align: center;
        ">
          <div style="font-weight: 600; margin-bottom: 6px;">Clearing Firestore...</div>
          <div id="clear-progress" style="font-size: 14px; opacity: 0.8;">Starting...</div>
        </div>
      `;
      document.body.appendChild(progressModal);

      try {
        if (window.deleteAllStudentsFromFirestore) {
          await window.deleteAllStudentsFromFirestore((p) => {
            const detail = progressModal.querySelector("#clear-progress");
            if (detail) detail.textContent = `${p.processed}/${p.total} records deleted`;
          });
        }

        // Clear local list as well
        localUploadedFiles = [];
        loadCurrentFiles();

        alert("✅ All Firestore student records deleted successfully.");
      } catch (err) {
        console.error("Firestore delete all error:", err);
        alert("❌ Failed to clear Firestore data. Please try again.");
      } finally {
        progressModal.remove();
        if (deleteAllBtn) {
          deleteAllBtn.disabled = false;
          deleteAllBtn.innerHTML = "🧹 Clear Firestore";
          deleteAllBtn.style.opacity = "1";
        }
      }
    });
  };

  // Convert Excel files and upload to Firestore
  window.convertToCSV = async function () {
    if (!hasAuth()) {
      alert("Login required to convert files");
      return;
    }

    // Initialize Firebase if not already done
    if (window.initializeFirebase) {
      window.initializeFirebase();
    }

    // Get all uploaded files
    const filesList = window.__currentUploadFiles || [];
    if (filesList.length === 0) {
      alert("No files uploaded yet. Please upload Excel files first.");
      return;
    }

    // Update button state during operation
    const convertBtn = document.getElementById("convert-btn");
    const originalBtnText = convertBtn ? convertBtn.innerHTML : "";
    if (convertBtn) {
      convertBtn.disabled = true;
      convertBtn.innerHTML = "⏳ Processing...";
      convertBtn.style.opacity = "0.6";
    }

    try {
      // Show progress modal or message
      const progressMsg = document.createElement('div');
      progressMsg.id = 'conversion-progress';
      const isDark = document.body.classList.contains('dark');
      progressMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${isDark ? '#2d3748' : 'white'};
        color: ${isDark ? '#e2e8f0' : '#1a202c'};
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        min-width: 300px;
        text-align: center;
      `;
      progressMsg.innerHTML = `<p style="margin:0;font-weight:600;">Processing Excel files...</p><p id="progress-detail" style="margin:8px 0 0;font-size:14px;color:${isDark ? '#a0aec0' : '#666'};">Starting...</p>`;
      document.body.appendChild(progressMsg);

      const updateProgress = (msg) => {
        const detail = document.getElementById('progress-detail');
        if (detail) detail.textContent = msg;
      };

      // Process each Excel file
      let totalStudents = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      const allErrors = [];

      for (let i = 0; i < filesList.length; i++) {
        const fileInfo = filesList[i];
        updateProgress(`Processing file ${i + 1} of ${filesList.length}: ${fileInfo.filename || fileInfo.name}`);

        try {
          const file = fileInfo.fileObject;
          if (!file) {
            throw new Error("File object not found");
          }

          await new Promise((resolve, reject) => {
            window.handleExcelUploadToFirestore(
              file,
              (progress) => {
                if (progress.status === "uploading" && progress.current) {
                  updateProgress(`File ${i + 1}/${filesList.length}: Uploading ${progress.current}/${progress.total} students...`);
                }
              },
              (result) => {
                if (result.success) {
                  totalStudents += (result.results.success + result.results.failed);
                  totalSuccess += result.results.success;
                  totalFailed += result.results.failed;
                  if (result.results.errors.length > 0) {
                    allErrors.push(...result.results.errors);
                  }
                  resolve();
                } else {
                  reject(new Error(result.error || "Upload failed"));
                }
              }
            );
          });
        } catch (error) {
          console.error(`Error processing ${fileInfo.filename || fileInfo.name}:`, error);
          allErrors.push({ file: fileInfo.filename || fileInfo.name, error: error.message });
        }
      }

      // Remove progress modal
      const modal = document.getElementById("conversion-progress");
      if (modal) modal.remove();

      // Show results
      let message = `✅ Conversion Complete!\n\n`;
      message += `Total Students: ${totalStudents}\n`;
      message += `Successfully uploaded to Firestore: ${totalSuccess}\n`;
      if (totalFailed > 0) {
        message += `Failed: ${totalFailed}\n`;
      }
      if (allErrors.length > 0) {
        message += `\nErrors:\n${allErrors
          .slice(0, 5)
          .map((e) => `- ${e.student || e.file}: ${e.error}`)
          .join("\n")}`;
        if (allErrors.length > 5) {
          message += `\n...and ${allErrors.length - 5} more errors`;
        }
      }

      alert(message);

    } catch (error) {
      console.error("Conversion error:", error);
      alert("Error during conversion: " + error.message);

      // Remove progress modal if it exists
      const modal = document.getElementById('conversion-progress');
      if (modal) modal.remove();
    } finally {
      // Reset button state
      if (convertBtn) {
        convertBtn.disabled = false;
        convertBtn.innerHTML = originalBtnText || "Convert";
        convertBtn.style.opacity = "1";
      }
    }
  };

  // (Re)usable multi-file upload handler (was missing causing uploads to fail)
  function handleMultipleUpload(files) {
    if (!files || files.length === 0) return;

    // Filter only valid Excel files
    const excelFiles = files.filter((f) =>
      /\.xlsx?$/.test(f.name.toLowerCase()),
    );
    if (excelFiles.length === 0) {
      alert("No valid .xls or .xlsx files selected.");
      return;
    }

    // Simple inline progress feedback using the loading area if present
    const loadingEl = document.getElementById("files-loading");
    if (loadingEl) {
      loadingEl.style.display = "flex";
      loadingEl.innerHTML =
        '<span style="margin-right:8px">⬆️</span>Uploading ' +
        excelFiles.length +
        " file(s)...";
    }

    let succeeded = 0;
    let failed = 0;

    const uploadOne = (file) => {
      const fileInfo = {
        filename: file.name,
        name: file.name,
        size: file.size,
        size_mb: (file.size / (1024 * 1024)).toFixed(2),
        uploaded_at: new Date().toISOString(),
        fileObject: file, // Store the actual file object for later processing
      };

      localUploadedFiles.push(fileInfo);

      return Promise.resolve()
        .then(() => {
          succeeded++;
          if (loadingEl) {
            loadingEl.innerHTML = `<span style="margin-right:8px">⬆️</span>Uploading: ${succeeded + failed}/${excelFiles.length}`;
          }
        })
        .catch((err) => {
          failed++;
          console.error("Upload error for", file.name, err);
          if (loadingEl) {
            loadingEl.innerHTML = `<span style=\"margin-right:8px\">⚠️</span>Uploading: ${succeeded + failed}/${excelFiles.length}`;
          }
        });
    };

    Promise.all(excelFiles.map(uploadOne)).then(() => {
      // Refresh list when all done
      loadCurrentFiles();
      if (loadingEl) {
        if (failed === 0) {
          loadingEl.innerHTML =
            '<span style="margin-right:8px">✅</span>All files uploaded successfully';
          setTimeout(() => {
            if (loadingEl.style.display !== "none")
              loadingEl.style.display = "none";
          }, 1200);
        } else {
          loadingEl.innerHTML = `<span style="margin-right:8px">⚠️</span>${succeeded} succeeded, ${failed} failed`;
        }
      }
      if (failed > 0) {
        alert(
          `${succeeded} file(s) uploaded successfully, ${failed} failed. Check console for errors.`,
        );
      }
    });
  }

  // Theme toggle functionality
  const toggleDarkModeBtn = document.getElementById("toggle-dark-mode");
  const uploadInput = document.getElementById("upload-input"); // primary hidden input (multi)
  const uploadBtn = document.getElementById("upload-btn"); // may not exist on this page
  let fileDialogOpen = false; // global guard

  function openFileDialog() {
    if (!uploadInput) return;
    if (fileDialogOpen) return;
    fileDialogOpen = true;
    const resetGuard = () => {
      fileDialogOpen = false;
    };
    // reset guard when dialog closes (window regains focus)
    window.addEventListener("focus", resetGuard, { once: true });
    uploadInput.click();
    // fallback reset in case focus event doesn't fire
    setTimeout(resetGuard, 2000);
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openFileDialog();
    });
  }

  // Unified input & drop area/browse button
  const hiddenMainInput = document.getElementById("upload-input"); // same element
  const dropArea = document.getElementById("drop-area");
  const browseBtn = document.getElementById("browse-btn");
  if (hiddenMainInput) {
    // Ensure only ONE change handler processes uploads
    hiddenMainInput.addEventListener(
      "change",
      () => {
        const files = Array.from(hiddenMainInput.files || []);
        if (!files.length) return;
        handleMultipleUpload(files);
        // Clear input so selecting same file again re-triggers change
        hiddenMainInput.value = "";
      },
      { once: false },
    );
  }
  function triggerSelect(evt) {
    if (evt) evt.stopPropagation();
    openFileDialog();
  }
  if (browseBtn)
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerSelect(e);
    });
  if (dropArea) {
    // Only respond to Enter/Space key; avoid generic click to prevent double triggers
    dropArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect(e);
      }
    });
    ["dragenter", "dragover"].forEach((evt) =>
      dropArea.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add("dragover");
      }),
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropArea.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === "drop") {
          const files = Array.from(e.dataTransfer.files || []).filter((f) =>
            /\.xlsx?$/.test(f.name.toLowerCase()),
          );
          if (files.length) handleMultipleUpload(files);
        }
        dropArea.classList.remove("dragover");
      }),
    );
  }

  // Re-render files on theme toggle so inline dynamic colors update
  const themeToggleBtn = document.getElementById("toggle-dark-mode");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      // Slight delay to allow body.dark class to apply
      setTimeout(() => {
        if (window.__currentUploadFiles) {
          displayFiles(window.__currentUploadFiles);
        }
      }, 30);
    });
  }
});

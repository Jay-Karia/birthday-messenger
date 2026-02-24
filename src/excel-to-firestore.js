// Excel to Firestore conversion handler

// Initialize Firebase
let db = null;

function initializeFirebase() {
  if (!window.firebase || !window.FIREBASE_CONFIG) {
    console.error('Firebase not loaded');
    return false;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }

  db = firebase.firestore();
  return true;
}

// Normalize header text
function normalizeHeader(value) {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "");
}

const HEADER_ALIASES = {
  register_no: ["register no", "registe no", "register no"],
  student_name: ["student name"],
  dob: ["dob", "d o b", "date of birth"],
  father_name: ["father name"],
  mother_name: ["mother name"],
  parent_contact: ["parent contact no", "parent contact"],
  student_contact: ["student contact no", "student contact"],
  parent_whatsapp: ["parent whatsapp no", "parent whatsapp"],
  student_whatsapp: ["student whatsapp no", "student whatsapp"],
  parent_email: ["parent email"],
  student_email: ["student email"],
};

function mapHeaders(headerRow) {
  const headerMap = {};
  const normalized = headerRow.map((h) => normalizeHeader(h));
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) headerMap[key] = idx;
  });
  return headerMap;
}

function parseExcelRow(row, headerMap) {
  const get = (key) => {
    const idx = headerMap[key];
    if (idx == null) return "";
    const val = row[idx];
    return val == null ? "" : String(val).trim();
  };

  return {
    register_no: get("register_no"),
    student_name: get("student_name"),
    dob: get("dob"),
    father_name: get("father_name"),
    mother_name: get("mother_name"),
    parent_contact: get("parent_contact"),
    student_contact: get("student_contact"),
    parent_whatsapp: get("parent_whatsapp"),
    student_whatsapp: get("student_whatsapp"),
    parent_email: get("parent_email"),
    student_email: get("student_email"),
  };
}

// Parse Excel file and return array of student objects
function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Read raw rows
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }

        // Find header row (the row containing Register No. / Student Name)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
          const normalized = rows[i].map((h) => normalizeHeader(h));
          if (normalized.includes("register no") || normalized.includes("student name")) {
            headerRowIndex = i;
            break;
          }
        }

        const headerRow = rows[headerRowIndex] || [];
        const headerMap = mapHeaders(headerRow);

        const dataRows = rows.slice(headerRowIndex + 1);
        const students = dataRows
          .map((row) => parseExcelRow(row, headerMap))
          .filter((student) => student.register_no || student.student_name);

        resolve(students);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = function(error) {
      reject(error);
    };

    reader.readAsArrayBuffer(file);
  });
}

// Upload students to Firestore
async function uploadStudentsToFirestore(students, onProgress) {
  if (!db) {
    if (!initializeFirebase()) {
      throw new Error('Failed to initialize Firebase');
    }
  }

  const studentsCollection = db.collection('students');
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (let i = 0; i < students.length; i++) {
    const student = students[i];

    try {
      // Use register_no as document ID if available, otherwise auto-generate
      const docId = student.register_no ?
        student.register_no.toString().replace(/[^a-zA-Z0-9-_]/g, '_') :
        null;

      if (docId) {
        await studentsCollection.doc(docId).set(student, { merge: true });
      } else {
        await studentsCollection.add(student);
      }

      results.success++;

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: students.length,
          student: student.student_name || student.register_no
        });
      }
    } catch (error) {
      console.error('Error uploading student:', student, error);
      results.failed++;
      results.errors.push({
        student: student.student_name || student.register_no,
        error: error.message
      });
    }
  }

  return results;
}

// Delete all students from Firestore (batched)
async function deleteAllStudentsFromFirestore(onProgress) {
  if (!db) {
    if (!initializeFirebase()) {
      throw new Error("Failed to initialize Firebase");
    }
  }

  const studentsCollection = db.collection("students");
  const snapshot = await studentsCollection.get();
  const total = snapshot.size;
  let processed = 0;

  const chunkSize = 400;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + chunkSize);
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    processed += chunk.length;
    if (onProgress) {
      onProgress({ processed, total });
    }
  }

  return { deleted: processed };
}

// Main function to handle Excel upload
window.handleExcelUploadToFirestore = async function(file, onProgress, onComplete) {
  try {
    // Show initial status
    if (onProgress) {
      onProgress({ status: 'parsing', message: 'Parsing Excel file...' });
    }

    // Parse Excel file
    const students = await parseExcelFile(file);

    if (students.length === 0) {
      throw new Error('No valid student data found in Excel file');
    }

    if (onProgress) {
      onProgress({
        status: 'uploading',
        message: `Found ${students.length} students. Uploading to Firestore...`,
        total: students.length
      });
    }

    // Upload to Firestore
    const results = await uploadStudentsToFirestore(students, onProgress);

    if (onComplete) {
      onComplete({
        success: true,
        results: results,
        message: `Successfully uploaded ${results.success} students. ${results.failed > 0 ? `Failed: ${results.failed}` : ''}`
      });
    }

  } catch (error) {
    console.error('Excel upload error:', error);
    if (onComplete) {
      onComplete({
        success: false,
        error: error.message
      });
    }
  }
};

// Export for use
window.initializeFirebase = initializeFirebase;
window.deleteAllStudentsFromFirestore = deleteAllStudentsFromFirestore;

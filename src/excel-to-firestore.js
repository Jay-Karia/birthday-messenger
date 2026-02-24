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

// Map Excel columns to Firestore fields
function parseExcelRow(row) {
  return {
    register_no: row['Register No.'] || row['Registe No.'] || '',
    student_name: row['Student Name'] || '',
    dob: row['D.O.B'] || row['DOB'] || '',
    father_name: row['Father Name'] || '',
    mother_name: row['Mother Name'] || '',
    parent_contact: row['Parent Contact No'] || row['Parent Contact No.'] || '',
    student_contact: row['Student Contact No'] || row['Student Contact No.'] || '',
    parent_whatsapp: row['Parent Whatsapp No'] || row['Parent Whatsapp No.'] || '',
    parent_email: row['Parent email'] || '',
    student_email: row['Student email'] || ''
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

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Map to Firestore format
        const students = jsonData.map(parseExcelRow).filter(student => {
          // Filter out empty rows
          return student.register_no || student.student_name;
        });

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

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed
  role: { type: String, required: true, enum: ['student', 'teacher', 'admin'] },
  
  // Student specific
  rollNumber: { type: String, unique: true, sparse: true }, // sparse: allows null for teachers
  section: { type: String }, // e.g. A, B
  branch: { type: String }, // e.g. CSE
  year: { type: String, enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduated'] },
  course: { type: String },
  semester: { type: String },
  academicSession: { type: String, default: '2025-26' },
  
  // Teacher specific
  department: { type: String },
  assignedSubjects: { type: [Object], default: [] }, // Array of { subjectName, year, section, branch }

  // Class Coordinator (CC) — assigned by admin
  isCC: { type: Boolean, default: false },
  ccSection: { type: String },   // e.g. 'A'
  ccBranch: { type: String },    // e.g. 'CSE'
  ccYear: { type: String },      // e.g. '3rd Year'

  // Security — device binding for anti-proxy
  deviceFingerprint: { type: String, unique: true, sparse: true }, // Bound on first attendance mark

  status: { type: String, default: 'active', enum: ['active', 'inactive'] }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);

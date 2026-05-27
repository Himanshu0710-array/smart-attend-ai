import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed
  role: { type: String, required: true, enum: ['student', 'teacher', 'admin'] },
  
  // Student specific
  rollNumber: { type: String },
  section: { type: String }, // e.g. A, B
  branch: { type: String }, // e.g. CSE
  batch: { type: String }, // e.g. Algo Avengers
  course: { type: String },
  semester: { type: String },
  
  // Teacher specific
  department: { type: String },

  status: { type: String, default: 'active', enum: ['active', 'inactive'] }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);

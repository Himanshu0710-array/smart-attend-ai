import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  studentUid: { type: String, required: true },
  studentName: { type: String, required: true },
  roll: { type: String, required: true },
  status: { type: String, required: true, default: 'Absent' },
  markedAt: { type: String },
  distance: { type: String },
  reverifications: { type: Number, default: 0 },
  missedReverifications: { type: Number, default: 0 },
  date: { type: String }, // Used for history reporting
  subject: { type: String } // Used for history reporting
}, { timestamps: true });

export const Attendance = mongoose.model('Attendance', attendanceSchema);

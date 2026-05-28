import mongoose from 'mongoose';

const noticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  teacherName: { type: String, required: true },
  targetType: { type: String, enum: ['batch', 'student'], required: true },
  targetId: { type: String, required: true }, // Batch name or Student UID
}, { timestamps: true });

export const Notice = mongoose.model('Notice', noticeSchema);

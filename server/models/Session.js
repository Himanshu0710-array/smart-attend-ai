import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  classId: { type: String, required: true },
  className: { type: String, required: true },
  teacher: { type: String, required: true },
  room: { type: String, required: true },
  section: { type: String, required: true },
  lat: { type: Number },
  lon: { type: Number },
  radius: { type: Number },
  startTime: { type: String, required: true },
  endTime: { type: String },
  status: { type: String, required: true, enum: ['active', 'ended'], default: 'active' },
}, { timestamps: true });

export const Session = mongoose.model('Session', sessionSchema);

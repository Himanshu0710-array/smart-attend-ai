import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  classId: { type: String, required: true }, // auto-generated composite id: year-branch-section
  className: { type: String, required: true }, // display: "2nd Year - CSE - Sec A - SubjectName"
  teacher: { type: String, required: true },
  room: { type: String, required: true },
  section: { type: String, required: true },
  year: { type: String }, // e.g. "2nd Year"
  branch: { type: String }, // e.g. "CSE"

  // Legacy: single-point GPS + radius (kept for backward compatibility)
  lat: { type: Number },
  lon: { type: Number },
  radius: { type: Number },

  // Classroom bounding box and 4 corners (copied from selected classroom on session start)
  lat_min: { type: Number },
  lat_max: { type: Number },
  lon_min: { type: Number },
  lon_max: { type: Number },

  c1_lat: { type: Number },
  c1_lon: { type: Number },
  c2_lat: { type: Number },
  c2_lon: { type: Number },
  c3_lat: { type: Number },
  c3_lon: { type: Number },
  c4_lat: { type: Number },
  c4_lon: { type: Number },

  startTime: { type: String, required: true },
  endTime: { type: String },
  status: { type: String, required: true, enum: ['active', 'ended'], default: 'active' },
  reverifyInterval: { type: Number, default: 20 },
}, { timestamps: true });

export const Session = mongoose.model('Session', sessionSchema);

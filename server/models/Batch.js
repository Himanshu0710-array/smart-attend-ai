import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  section: { type: String }, // usually same as name
  semester: { type: String, default: 'CRT' },
  room: { type: String, required: true },
  teacher: { type: String }, // default teacher
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  radius: { type: Number, required: true, default: 200 }
}, { timestamps: true });

export const Batch = mongoose.model('Batch', batchSchema);

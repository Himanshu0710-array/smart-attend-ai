import mongoose from 'mongoose';

const timetableSchema = new mongoose.Schema({
  classGroup: { type: String, required: true, unique: true },
  schedule: [{
    date: { type: String, required: true },
    slots: [{
      subject: { type: String },
      room: { type: String },
      teacher: { type: String }
    }]
  }]
}, { timestamps: true });

export const Timetable = mongoose.model('Timetable', timetableSchema);

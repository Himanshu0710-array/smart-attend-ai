import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  code: { type: String }, // e.g. "CS-301"
  year: {
    type: String,
    required: true,
    enum: ['1st Year', '2nd Year', '3rd Year', '4th Year']
  }
}, { timestamps: true });

// Ensure unique index per subject code or unique combination of name/year if desired
subjectSchema.index({ name: 1, year: 1 }, { unique: true });

export const Subject = mongoose.model('Subject', subjectSchema);

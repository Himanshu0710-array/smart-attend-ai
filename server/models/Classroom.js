import mongoose from 'mongoose';

const classroomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true }, // e.g. "Room 401"
  
  // 4 corners of the classroom
  c1_lat: { type: Number, required: true },
  c1_lon: { type: Number, required: true },
  c2_lat: { type: Number, required: true },
  c2_lon: { type: Number, required: true },
  c3_lat: { type: Number, required: true },
  c3_lon: { type: Number, required: true },
  c4_lat: { type: Number, required: true },
  c4_lon: { type: Number, required: true },

  // Calculated bounding box (derived fields)
  lat_min: { type: Number },
  lat_max: { type: Number },
  lon_min: { type: Number },
  lon_max: { type: Number }
}, { timestamps: true });

classroomSchema.pre('save', function (next) {
  const lats = [this.c1_lat, this.c2_lat, this.c3_lat, this.c4_lat];
  const lons = [this.c1_lon, this.c2_lon, this.c3_lon, this.c4_lon];

  this.lat_min = Math.min(...lats);
  this.lat_max = Math.max(...lats);
  this.lon_min = Math.min(...lons);
  this.lon_max = Math.max(...lons);

  if (typeof next === 'function') {
    next();
  }
});

export const Classroom = mongoose.model('Classroom', classroomSchema);

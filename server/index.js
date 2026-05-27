import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models/User.js';
import { Batch } from './models/Batch.js';
import { Session } from './models/Session.js';
import { Attendance } from './models/Attendance.js';
import { Timetable } from './models/Timetable.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ========= DATABASE CONNECTION & SEEDING =========
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    await seedAdmin();
    await seedTimetableData();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function seedAdmin() {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = new User({
      uid: 'admin-001',
      name: 'Super Admin',
      email: 'admin@smartattend.com',
      password: hashedPassword,
      role: 'admin'
    });
    await admin.save();
    console.log('🌱 Default Admin Created (admin@smartattend.com / admin123)');
  }
}

async function seedTimetableData() {
  const count = await Timetable.countDocuments();
  if (count === 0) {
    console.log('🌱 Seeding initial timetable data...');
    // We will leave this empty initially, or we could seed the old data if we want.
    // For now, no hardcoded seed to keep it clean.
  }
}

// ========= AUTH ROUTES =========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { uid: user.uid, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = user.toObject();
    delete userData.password;

    res.json({ token, user: userData });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= ADMIN ROUTES =========

// Users
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find({}, '-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role, rollNumber, section, department } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password || 'password123', 10);
    const uid = `user-${Date.now()}`;

    const user = new User({
      uid, name, email, password: hashedPassword, role, rollNumber, section, department
    });
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json(userResponse);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:uid', requireAuth, requireAdmin, async (req, res) => {
  try {
    await User.findOneAndDelete({ uid: req.params.uid });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Batches / Classrooms
app.get('/api/classrooms', requireAuth, async (req, res) => {
  const batches = await Batch.find().sort({ name: 1 });
  res.json(batches); // Reusing the old classroom endpoint name for frontend compatibility
});

app.post('/api/admin/batches', requireAuth, requireAdmin, async (req, res) => {
  try {
    const batch = new Batch({
      id: `batch-${Date.now()}`,
      ...req.body
    });
    await batch.save();
    res.json(batch);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/batches/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Batch.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= SESSION & ATTENDANCE ROUTES (PROTECTED) =========

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { section } = req.query;
    const query = { status: 'active' };
    if (section) query.section = section;
    const sessions = await Session.find(query);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can start sessions' });

    const { classId, teacherName, subject, lat, lon, radius } = req.body;
    const batch = await Batch.findOne({ id: classId });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const sessionId = `session-${Date.now()}`;
    const displayClassName = subject ? `${batch.name} - ${subject}` : batch.name;

    const newSession = new Session({
      id: sessionId,
      classId,
      className: displayClassName,
      teacher: teacherName || batch.teacher,
      room: batch.room,
      section: batch.section,
      lat: lat !== undefined ? lat : batch.lat,
      lon: lon !== undefined ? lon : batch.lon,
      radius: radius !== undefined ? radius : batch.radius,
      startTime: new Date().toISOString(),
      status: 'active'
    });
    await newSession.save();

    // Find all students in this batch
    const students = await User.find({ role: 'student', section: batch.section });
    
    if (students.length > 0) {
      const attendanceDocs = students.map(student => ({
        sessionId,
        studentUid: student.uid,
        studentName: student.name,
        roll: student.rollNumber,
        status: 'Absent',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subject: displayClassName
      }));
      await Attendance.insertMany(attendanceDocs);
    }

    console.log(`✅ Session started: ${displayClassName}`);
    res.json(newSession);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can end sessions' });
    const { sessionId } = req.params;
    const session = await Session.findOneAndUpdate(
      { id: sessionId },
      { status: 'ended', endTime: new Date().toISOString() },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/attendance/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const records = await Attendance.find({ sessionId });
    const result = {};
    records.forEach(r => { result[r.studentUid] = r; });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/attendance/mark', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can mark attendance' });
    const { sessionId, studentUid, distance, isLate } = req.body;
    
    // Extra security check to prevent students from marking other students
    if (req.user.uid !== studentUid) return res.status(403).json({ error: 'Cannot mark attendance for another student' });

    const record = await Attendance.findOneAndUpdate(
      { sessionId, studentUid },
      { 
        status: isLate ? 'Late Entry' : 'Present',
        markedAt: new Date().toISOString(),
        distance: `${Math.round(distance)}m`,
        $inc: { reverifications: 1 },
        missedReverifications: 0
      },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/attendance/reverify', requireAuth, async (req, res) => {
  try {
    const { sessionId, studentUid, isInsideGeofence, distance } = req.body;
    if (req.user.uid !== studentUid) return res.status(403).json({ error: 'Unauthorized' });

    const record = await Attendance.findOne({ sessionId, studentUid });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    if (isInsideGeofence) {
      record.distance = `${Math.round(distance)}m`;
      record.reverifications += 1;
      record.missedReverifications = 0;
    } else {
      record.distance = `${Math.round(distance)}m`;
      record.missedReverifications += 1;
      if (record.missedReverifications >= 2) {
        record.status = 'Left Early';
      }
    }
    await record.save();
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/history/:studentUid', requireAuth, async (req, res) => {
  try {
    const { studentUid } = req.params;
    if (req.user.role === 'student' && req.user.uid !== studentUid) return res.status(403).json({ error: 'Unauthorized' });

    const records = await Attendance.find({ studentUid }).sort({ createdAt: -1 });
    const history = records.map(r => ({
      date: r.date,
      subject: r.subject,
      status: r.status,
      studentUid: r.studentUid,
      sessionId: r.sessionId,
      time: r.markedAt ? new Date(r.markedAt).toLocaleTimeString() : '-'
    }));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/teacher/history/:teacherName', requireAuth, async (req, res) => {
  try {
    const { teacherName } = req.params;
    const sessions = await Session.find({ teacher: teacherName, status: 'ended' }).sort({ createdAt: -1 });
    
    const history = [];
    for (let session of sessions) {
      const records = await Attendance.find({ sessionId: session.id });
      const recordsArr = records.map(r => ({
        uid: r.studentUid,
        studentName: r.studentName,
        roll: r.roll,
        status: r.status,
        markedAt: r.markedAt,
        distance: r.distance
      }));

      history.push({
        sessionId: session.id,
        classId: session.classId,
        className: session.className,
        teacher: session.teacher,
        room: session.room,
        date: new Date(session.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        startTime: session.startTime,
        endTime: session.endTime,
        records: recordsArr
      });
    }
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= TIMETABLE ROUTES =========
app.get('/api/timetable', requireAuth, async (req, res) => {
  try {
    const batches = await Batch.find();
    const timetables = await Timetable.find();
    
    const data = {};
    const defaultSchedule = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({
      date: day,
      slots: [
        { subject: '', teacher: '', room: '' },
        { subject: '', teacher: '', room: '' },
        { subject: '', teacher: '', room: '' },
        { subject: '', teacher: '', room: '' }
      ]
    }));

    for (const b of batches) {
      let t = timetables.find(doc => doc.batch === b.name);
      if (!t) {
        t = new Timetable({
          batch: b.name,
          schedule: JSON.parse(JSON.stringify(defaultSchedule)) // deep copy
        });
        await t.save();
      }
      data[b.name] = t.schedule;
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/timetable/update', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const { batch, date, slotIndex, data } = req.body;
    
    const timetable = await Timetable.findOne({ batch });
    if (!timetable) return res.status(404).json({ error: 'Batch not found' });
    
    const dayRow = timetable.schedule.find(d => d.date === date);
    if (!dayRow) return res.status(404).json({ error: 'Date not found' });

    Object.assign(dayRow.slots[slotIndex], data);
    await timetable.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SmartAttend API Server running on port ${PORT}`);
});

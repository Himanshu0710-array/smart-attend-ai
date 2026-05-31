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
import { Notice } from './models/Notice.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://smart-attend-ai.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow any Vercel preview deployment
    if (origin.endsWith('.vercel.app')) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// ========= DATABASE CONNECTION & SEEDING =========
let lastDbError = null;

async function connectWithRetry(retries = 5, delay = 3000) {
  // Log the URI host for debugging (hide password)
  const uri = process.env.MONGODB_URI || '';
  const hostMatch = uri.match(/@([^/]+)/);
  console.log(`🔗 MongoDB host: ${hostMatch ? hostMatch[1] : 'unknown'}`);
  console.log(`🔗 Full URI length: ${uri.length} chars`);

  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`🔄 MongoDB connection attempt ${i}/${retries}...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
      });
      console.log('✅ Connected to MongoDB Atlas');
      lastDbError = null;
      await seedAdmin();
      await seedTimetableData();
      return;
    } catch (err) {
      lastDbError = err.message;
      console.error(`❌ MongoDB attempt ${i} failed:`, err.message);
      if (i < retries) {
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 1.5;
      }
    }
  }
  console.error('❌ All MongoDB connection attempts failed. Server running without DB.');
}
connectWithRetry();

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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Check if a device fingerprint is valid for a student
app.post('/api/auth/verify-device', requireAuth, async (req, res) => {
  try {
    const { deviceFingerprint, studentUid } = req.body;
    if (!deviceFingerprint || !studentUid) return res.status(400).json({ error: 'Missing params' });

    const student = await User.findOne({ uid: studentUid });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // 1. If student already has a bound device, it MUST match
    if (student.deviceFingerprint && student.deviceFingerprint !== deviceFingerprint) {
      return res.json({ 
        valid: false, 
        message: '⚠️ Device Mismatch: You are trying to mark attendance from an unregistered device. Please use your primary registered device.' 
      });
    }

    // 2. Check if this device is already bound to ANY OTHER student
    const deviceOwner = await User.findOne({ deviceFingerprint, role: 'student' });
    if (deviceOwner && deviceOwner.uid !== studentUid) {
      return res.json({ 
        valid: false, 
        message: '🚨 PROXY DETECTED: This device is already registered to another student. You cannot mark attendance for multiple students from the same device.' 
      });
    }

    // Device is safe to use (either already theirs, or brand new)
    res.json({ valid: true, message: 'Device verified.' });
  } catch (error) {
    console.error('Verify device error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, role, password, rollNumber, batch, branch, section } = req.body;
    
    // SECURITY: Block student and admin self-registration
    if (role === 'admin') return res.status(403).json({ error: 'Cannot register as admin' });
    if (role === 'student') return res.status(403).json({ error: 'Student accounts must be created by a teacher or admin. Please contact your teacher.' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      uid: new mongoose.Types.ObjectId().toString(),
      name, email, role, password: hashedPassword, rollNumber, batch, branch, section
    });
    
    await user.save();

    const token = jwt.sign(
      { uid: user.uid, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userData = user.toObject();
    delete userData.password;

    res.json({ token, user: userData });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// ========= ADMIN ROUTES =========

// Users
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find({}, '-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/admin/users', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
       return res.status(403).json({ error: 'Access denied' });
    }
    
    const { name, email, password, role, rollNumber, section, branch, batch, department } = req.body;
    
    if (req.user.role === 'teacher' && role !== 'student') {
       return res.status(403).json({ error: 'Teachers can only create student accounts' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    // SECURITY: Check for duplicate roll number
    if (rollNumber) {
      const duplicateRoll = await User.findOne({ rollNumber });
      if (duplicateRoll) return res.status(400).json({ error: `Roll number ${rollNumber} is already assigned to ${duplicateRoll.name}` });
    }

    const hashedPassword = await bcrypt.hash(password || 'password123', 10);
    const uid = `user-${Date.now()}`;

    const user = new User({
      uid, name, email, password: hashedPassword, role, rollNumber, section, branch, batch, department
    });
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    res.json(userResponse);
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate entry: email or roll number already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/teacher/students', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const students = await User.find({ role: 'student' }, '-password').sort({ createdAt: -1 });
    res.json(students);
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

// Reset student device fingerprint
app.post('/api/admin/users/:uid/reset-device', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
       return res.status(403).json({ error: 'Access denied' });
    }
    
    const { uid } = req.params;
    const user = await User.findOneAndUpdate(
      { uid, role: 'student' },
      { $unset: { deviceFingerprint: 1 } },
      { new: true }
    );
    
    if (!user) return res.status(404).json({ error: 'Student not found' });
    
    console.log(`🔓 Device fingerprint reset for ${user.name} by ${req.user.email}`);
    res.json({ success: true, message: 'Device fingerprint reset successfully' });
  } catch (error) {
    console.error('Reset device error:', error);
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

    // Find all students in this batch (supports legacy 'section' field or new 'batch' field)
    const students = await User.find({ 
      role: 'student', 
      $or: [
        { batch: batch.name },
        { section: batch.name },
        { section: batch.section }
      ]
    });
    
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
    const session = await Session.findOne({ id: sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Calculate session duration in minutes
    const sessionStart = new Date(session.startTime);
    const sessionEnd = new Date();
    const durationMinutes = (sessionEnd - sessionStart) / 60000;
    const REVERIFY_INTERVAL = 20; // minutes
    const expectedChecks = Math.max(1, Math.floor(durationMinutes / REVERIFY_INTERVAL));

    // Evaluate final attendance for all students in this session
    const records = await Attendance.find({ sessionId });
    for (const record of records) {
      if (record.status === 'Absent') continue; // Stay absent
      if (record.status === 'Left Early') continue; // Already penalized

      // Check if student completed enough reverifications
      const actualChecks = record.reverifications || 0;
      if (expectedChecks > 1 && actualChecks < Math.ceil(expectedChecks * 0.5)) {
        record.status = 'Partial';
        await record.save();
      }
    }

    // End the session
    session.status = 'ended';
    session.endTime = sessionEnd.toISOString();
    await session.save();

    console.log(`📊 Session ended: ${session.className} | Duration: ${Math.round(durationMinutes)}min | Expected checks: ${expectedChecks}`);
    res.json({ success: true, evaluation: { durationMinutes: Math.round(durationMinutes), expectedChecks } });
  } catch (error) {
    console.error('End session error:', error);
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
    const { sessionId, studentUid, distance, isLate, deviceFingerprint } = req.body;
    
    // Extra security check to prevent students from marking other students
    if (req.user.uid !== studentUid) return res.status(403).json({ error: 'Cannot mark attendance for another student' });

    // SECURITY: Device fingerprint binding
    if (deviceFingerprint) {
      const student = await User.findOne({ uid: studentUid });
      if (student) {
        if (!student.deviceFingerprint) {
          // Check if ANY other student already bound this device globally
          const deviceOwner = await User.findOne({ deviceFingerprint, role: 'student' });
          if (deviceOwner && deviceOwner.uid !== studentUid) {
             console.warn(`🚨 GLOBAL PROXY DETECTED: Device ${deviceFingerprint.substring(0, 16)} is already bound to ${deviceOwner.name}`);
             return res.status(403).json({ error: 'This device is already registered to another student. You cannot mark attendance for multiple students from the same device.' });
          }

          // First time — bind this device to the student
          student.deviceFingerprint = deviceFingerprint;
          await student.save();
          console.log(`🔒 Device bound to ${student.name}: ${deviceFingerprint.substring(0, 16)}...`);
        } else if (student.deviceFingerprint !== deviceFingerprint) {
          // Different device — reject
          console.warn(`⚠️ Device mismatch for ${student.name}: expected ${student.deviceFingerprint.substring(0, 16)}, got ${deviceFingerprint.substring(0, 16)}`);
          return res.status(403).json({ error: 'Attendance must be marked from your registered device. Contact your teacher if you changed devices.' });
        }
      }
    }

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
    console.error('Mark attendance error:', error);
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

// Teacher manual attendance override (for Partial/Absent students)
app.post('/api/attendance/override', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers can override attendance' });
    }
    const { sessionId, studentUid, newStatus } = req.body;
    const allowedStatuses = ['Present', 'Absent', 'Late Entry', 'Left Early', 'Partial'];
    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const record = await Attendance.findOneAndUpdate(
      { sessionId, studentUid },
      { 
        status: newStatus,
        markedAt: newStatus === 'Present' ? new Date().toISOString() : undefined,
      },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: 'Record not found' });

    console.log(`✏️ Teacher override: ${record.studentName} → ${newStatus} (by ${req.user.email})`);
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

// ========= REPORTS ROUTE =========
app.post('/api/teacher/reports', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { startDate, endDate, branch, batch, section } = req.body;
    
    // 1. Find matching students
    const userQuery = { role: 'student' };
    if (branch) userQuery.branch = branch;
    if (batch) userQuery.batch = batch;
    if (section) userQuery.section = section;
    const students = await User.find(userQuery);
    
    if (students.length === 0) {
      return res.json([]);
    }

    const studentUids = students.map(s => s.uid);
    const studentMap = {};
    students.forEach(s => {
      studentMap[s.uid] = {
        uid: s.uid,
        name: s.name,
        rollNumber: s.rollNumber || 'N/A',
        branch: s.branch || 'N/A',
        batch: s.batch || 'N/A',
        section: s.section || 'N/A',
        totalClasses: 0,
        attended: 0
      };
    });

    // 2. Find sessions in date range
    const teacher = await User.findOne({ uid: req.user.uid });
    const sessionQuery = {};
    if (req.user.role === 'teacher') {
      sessionQuery.teacher = teacher.name;
    }
    
    if (startDate || endDate) {
      sessionQuery.createdAt = {};
      if (startDate) sessionQuery.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        sessionQuery.createdAt.$lte = end;
      }
    }
    const sessions = await Session.find(sessionQuery);
    const sessionIds = sessions.map(s => s.id);

    if (sessionIds.length === 0) {
      return res.json(Object.values(studentMap));
    }

    // 3. Find attendance
    const attendances = await Attendance.find({
      sessionId: { $in: sessionIds },
      studentUid: { $in: studentUids }
    });

    // We must calculate total classes carefully:
    // A student is part of a batch. If a session was created for their batch, it counts as 1 class.
    // Wait, session schema has 'section' which maps to the batch. 
    // Let's aggregate properly.
    sessions.forEach(session => {
      // Find students in this session's batch (section field)
      students.forEach(student => {
        // Assume session.section is the batch name or classroom ID. In this app, session.section is the batch name.
        if (student.batch === session.section || student.section === session.section) {
           studentMap[student.uid].totalClasses++;
        }
      });
    });

    attendances.forEach(record => {
      if (record.status === 'Present') {
        studentMap[record.studentUid].attended++;
      }
    });

    // Format output
    const report = Object.values(studentMap).map(s => {
      const percentage = s.totalClasses === 0 ? 0 : Math.round((s.attended / s.totalClasses) * 100);
      return {
        ...s,
        percentage
      };
    });

    res.json(report);
  } catch (error) {
    console.error('Reports error:', error);
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
// ========= SETTINGS & USER MANAGEMENT =========
app.put('/api/users/:uid/password', requireAuth, async (req, res) => {
  try {
    const { uid } = req.params;
    // Only the user themselves can change their own password (or an admin)
    if (req.user.uid !== uid && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { oldPassword, newPassword } = req.body;
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Admins don't need the old password to force change
    if (req.user.role !== 'admin') {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) return res.status(400).json({ error: 'Incorrect old password' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/users/:uid', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { uid } = req.params;
    const updateData = req.body;
    
    // Do not update password here
    delete updateData.password;

    const user = await User.findOneAndUpdate({ uid }, updateData, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= NOTICES & ANNOUNCEMENTS =========
app.post('/api/notices', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { title, message, targetType, targetId } = req.body;

    if (targetType === 'low-attendance') {
      // Calculate low attendance and send to all
      const students = await User.find({ role: 'student' });
      const noticesToInsert = [];

      for (const student of students) {
        const records = await Attendance.find({ studentUid: student.uid });
        const total = records.length;
        if (total === 0) continue;

        const attended = records.filter(r => r.status === 'Present' || r.status === 'Late Entry').length;
        const percentage = (attended / total) * 100;

        if (percentage < 75) {
          noticesToInsert.push({
            title,
            message,
            teacherName: req.user.name || 'Teacher',
            targetType: 'student',
            targetId: student.uid
          });
        }
      }

      if (noticesToInsert.length > 0) {
        await Notice.insertMany(noticesToInsert);
      }
      return res.status(201).json({ success: true, count: noticesToInsert.length });
    }

    // Standard single notice
    if (!targetId) return res.status(400).json({ error: 'Target ID required' });

    const notice = new Notice({
      title,
      message,
      teacherName: req.user.name || 'Teacher',
      targetType,
      targetId
    });
    await notice.save();
    res.status(201).json(notice);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/notices', requireAuth, async (req, res) => {
  try {
    const { batch, uid } = req.query;
    let query = {};
    
    if (req.user.role === 'student') {
      // Students see notices targeted to their batch or their specific UID
      query = {
        $or: [
          { targetType: 'batch', targetId: batch },
          { targetType: 'student', targetId: uid }
        ]
      };
    } else if (req.user.role === 'teacher') {
      // Teachers see notices they created
      query = { teacherName: req.user.name };
    }
    
    const notices = await Notice.find(query).sort({ createdAt: -1 }).limit(20);
    res.json(notices);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/teacher/low-attendance', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized' });
    
    // Get all students
    const students = await User.find({ role: 'student' });
    const lowAttendanceStudents = [];

    // Calculate attendance for each student
    for (const student of students) {
      const records = await Attendance.find({ studentUid: student.uid });
      const total = records.length;
      if (total === 0) continue;

      const attended = records.filter(r => r.status === 'Present' || r.status === 'Late Entry').length;
      const percentage = (attended / total) * 100;

      if (percentage < 75) {
        lowAttendanceStudents.push({
          uid: student.uid,
          name: student.name,
          rollNumber: student.rollNumber,
          batch: student.batch,
          percentage: percentage.toFixed(1)
        });
      }
    }

    res.json(lowAttendanceStudents);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


// Health check
app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ 
    status: dbState === 1 ? 'ok' : 'degraded',
    database: dbStates[dbState] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint - shows what's configured
app.get('/api/debug/status', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  
  let userCount = 0;
  let adminExists = false;
  try {
    userCount = await User.countDocuments();
    adminExists = !!(await User.findOne({ role: 'admin' }));
  } catch (e) {
    // DB not connected
  }
  
  // Show the host part of the URI for debugging
  const uri = process.env.MONGODB_URI || '';
  const hostMatch = uri.match(/@([^?]+)/);

  res.json({
    database: dbStates[dbState] || 'unknown',
    lastDbError,
    mongoUri: process.env.MONGODB_URI ? 'SET (hidden)' : 'NOT SET',
    mongoHost: hostMatch ? hostMatch[1] : 'unknown',
    jwtSecret: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    frontendUrl: process.env.FRONTEND_URL || 'NOT SET',
    userCount,
    adminExists,
    nodeEnv: process.env.NODE_ENV || 'not set'
  });
});

// Force reconnect endpoint
app.get('/api/debug/reconnect', async (req, res) => {
  res.json({ message: 'Reconnecting to MongoDB...' });
  // Disconnect first if in a bad state
  try { await mongoose.disconnect(); } catch(e) {}
  connectWithRetry();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SmartAttend API Server running on port ${PORT}`);
});

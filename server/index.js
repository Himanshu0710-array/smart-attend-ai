import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models/User.js';
import { Session } from './models/Session.js';
import { Attendance } from './models/Attendance.js';
import { Timetable } from './models/Timetable.js';
import { Notice } from './models/Notice.js';
import { Classroom } from './models/Classroom.js';
import { Subject } from './models/Subject.js';
import { SystemConfig } from './models/SystemConfig.js';
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

// ========= REQUEST LOGGER =========
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      console.log(`   └─ User: ${decoded.email} | Role: ${decoded.role} | UID: ${decoded.uid}`);
    } catch (e) {
      console.log(`   └─ Invalid Token: ${e.message}`);
    }
  } else {
    console.log(`   └─ No Bearer Token`);
  }
  next();
});

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
      await seedSystemConfig();
      await migrateExistingStudents();
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

async function migrateExistingStudents() {
  try {
    const result = await User.updateMany(
      { role: 'student', $or: [{ year: { $exists: false } }, { year: null }] },
      { $set: { year: '3rd Year' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`🧹 Database Migration: Updated ${result.modifiedCount} legacy students to "3rd Year"`);
    }
  } catch (err) {
    console.error('❌ Student migration failed:', err.message);
  }
}

connectWithRetry();

async function seedSystemConfig() {
  try {
    const config = await SystemConfig.findOne({ key: 'currentAcademicSession' });
    if (!config) {
      await SystemConfig.create({ key: 'currentAcademicSession', value: '2025-26' });
      console.log('🌱 Default academic session config created: "2025-26"');
    }
  } catch (error) {
    console.error('Failed to seed system config:', error.message);
  }
}

async function seedAdmin() {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@smartattend.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@SmartAttend2025!';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = new User({
      uid: new mongoose.Types.ObjectId().toString(),
      name: 'Super Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin'
    });
    await admin.save();
    console.log(`🌱 Default Admin Created (${adminEmail}) — password from ADMIN_PASSWORD env var`);
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

    // Input validation
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input format' });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
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
    const { name, email, role, password, rollNumber, branch, section } = req.body;

    // Input validation
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    // SECURITY: Block student and admin self-registration
    if (role === 'admin') return res.status(403).json({ error: 'Cannot register as admin' });
    if (role === 'student') return res.status(403).json({ error: 'Student accounts must be created by a teacher or admin. Please contact your teacher.' });

    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      uid: new mongoose.Types.ObjectId().toString(),
      name: name.trim(), email: email.trim().toLowerCase(), role, password: hashedPassword, rollNumber, branch, section
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
    
    const { name, email, password, role, rollNumber, section, branch, year, department } = req.body;

    // Input validation
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    if (req.user.role === 'teacher') {
       if (role !== 'student') {
          return res.status(403).json({ error: 'Teachers can only create student accounts' });
       }
       const teacherUser = await User.findOne({ uid: req.user.uid });
       if (!teacherUser || !teacherUser.isCC) {
          return res.status(403).json({ error: 'Access denied: Only Class Coordinators can register students' });
       }
       if (
         year !== teacherUser.ccYear ||
         section?.trim() !== teacherUser.ccSection ||
         branch?.trim() !== teacherUser.ccBranch
       ) {
          return res.status(403).json({ error: `Access denied: You can only register students for your coordinator section (${teacherUser.ccYear} - ${teacherUser.ccBranch} - Sec ${teacherUser.ccSection})` });
       }
    }

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    // SECURITY: Check for duplicate roll number
    if (rollNumber) {
      const duplicateRoll = await User.findOne({ rollNumber });
      if (duplicateRoll) return res.status(400).json({ error: `Roll number ${rollNumber} is already assigned to ${duplicateRoll.name}` });
    }

    const activeSessionConfig = await SystemConfig.findOne({ key: 'currentAcademicSession' });
    const currentSessionName = activeSessionConfig ? activeSessionConfig.value : '2025-26';

    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = new mongoose.Types.ObjectId().toString();

    const user = new User({
      uid,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role,
      rollNumber,
      section: section?.trim() || undefined,
      branch: branch?.trim() || undefined,
      year: year || undefined,
      department,
      academicSession: currentSessionName,
      assignedSubjects: role === 'teacher' ? (req.body.assignedSubjects || []) : []
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

// ========= BULK STUDENT IMPORT =========
app.post('/api/admin/users/bulk', requireAuth, async (req, res) => {
  try {
    let teacherUser = null;
    if (req.user.role === 'teacher') {
      teacherUser = await User.findOne({ uid: req.user.uid });
      if (!teacherUser || !teacherUser.isCC) {
        return res.status(403).json({ error: 'Access denied: Only Class Coordinators can import students' });
      }
    }

    const activeSessionConfig = await SystemConfig.findOne({ key: 'currentAcademicSession' });
    const currentSessionName = activeSessionConfig ? activeSessionConfig.value : '2025-26';

    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'students array is required and must not be empty' });
    }
    if (students.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 students per import' });
    }

    const created = [];
    const failed = [];

    await Promise.allSettled(
      students.map(async (student, index) => {
        const { name, email, password, rollNumber, branch, section, year } = student;

        if (!name || typeof name !== 'string' || !name.trim()) {
          failed.push({ row: index + 1, email: email || '—', reason: 'Name is required' });
          return;
        }
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
          failed.push({ row: index + 1, email: email || '—', reason: 'Invalid or missing email' });
          return;
        }
        if (!password || password.length < 6) {
          failed.push({ row: index + 1, email, reason: 'Password must be at least 6 characters' });
          return;
        }

        try {
          if (teacherUser) {
            if (
              year?.trim() !== teacherUser.ccYear ||
              section?.trim() !== teacherUser.ccSection ||
              branch?.trim() !== teacherUser.ccBranch
            ) {
              failed.push({ row: index + 1, email, reason: `Student is not in your coordinator section (${teacherUser.ccYear} - ${teacherUser.ccBranch} - Sec ${teacherUser.ccSection})` });
              return;
            }
          }

          const existing = await User.findOne({ email: email.trim().toLowerCase() });
          if (existing) {
            failed.push({ row: index + 1, email, reason: 'Email already exists' });
            return;
          }
          if (rollNumber) {
            const dupRoll = await User.findOne({ rollNumber: rollNumber.trim() });
            if (dupRoll) {
              failed.push({ row: index + 1, email, reason: `Roll number ${rollNumber} already assigned to ${dupRoll.name}` });
              return;
            }
          }

          const hashedPassword = await bcrypt.hash(password, 10);
          const uid = new mongoose.Types.ObjectId().toString();
          const user = new User({
            uid,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            role: 'student',
            rollNumber: rollNumber?.trim() || undefined,
            branch: branch?.trim() || undefined,
            section: section?.trim() || undefined,
            year: year?.trim() || undefined,
            academicSession: currentSessionName
          });
          await user.save();
          created.push({ row: index + 1, name: user.name, email: user.email });
        } catch (err) {
          if (err.code === 11000) {
            failed.push({ row: index + 1, email, reason: 'Duplicate entry (email or roll number already in DB)' });
          } else {
            failed.push({ row: index + 1, email, reason: err.message || 'Unknown error' });
          }
        }
      })
    );

    console.log(`📥 Bulk import by ${req.user.email}: ${created.length} created, ${failed.length} failed`);
    res.json({ created, failed, total: students.length });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Server error during bulk import' });
  }
});


app.get('/api/teacher/students', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Admin sees all students
    if (req.user.role === 'admin') {
      const students = await User.find({ role: 'student' }, '-password').sort({ rollNumber: 1 });
      return res.json(students);
    }

    const teacherUser = await User.findOne({ uid: req.user.uid });
    const assignments = teacherUser?.assignedSubjects || [];

    // Build allowed year/section/branch combos from assigned subjects
    const groupQueries = assignments.map(as => ({
      year: as.year,
      section: as.section,
      branch: as.branch
    }));

    // Also add CC section if teacher is a Class Coordinator
    if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
      groupQueries.push({
        year: teacherUser.ccYear,
        section: teacherUser.ccSection,
        branch: teacherUser.ccBranch
      });
    }

    if (groupQueries.length === 0) {
      return res.json([]); // No assignments and no CC role = no students visible
    }

    // Deduplicate combos
    const uniqueGroups = [];
    const seen = new Set();
    for (const g of groupQueries) {
      const key = `${g.year}|${g.section}|${g.branch}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueGroups.push(g);
      }
    }

    const students = await User.find(
      { role: 'student', $or: uniqueGroups },
      '-password'
    ).sort({ rollNumber: 1 });

    res.json(students);
  } catch (error) {
    console.error('Get teacher students error:', error);
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

// Helper: check if a teacher can access a specific student (via assigned subjects OR CC role)
function canTeacherAccessStudent(teacherUser, student) {
  if (!teacherUser || !student) return false;
  // Check assigned subjects sections
  const inAssigned = (teacherUser.assignedSubjects || []).some(as =>
    as.year === student.year &&
    as.section === student.section &&
    as.branch === student.branch
  );
  if (inAssigned) return true;
  // Check CC section
  if (teacherUser.isCC &&
      teacherUser.ccYear === student.year &&
      teacherUser.ccSection === student.section &&
      teacherUser.ccBranch === student.branch) {
    return true;
  }
  return false;
}

// Helper: check if a teacher is the Class Coordinator (CC) for a student's section
function isTeacherCCForStudent(teacherUser, student) {
  if (!teacherUser || !student) return false;
  return !!(teacherUser.isCC &&
      teacherUser.ccYear === student.year &&
      teacherUser.ccSection === student.section &&
      teacherUser.ccBranch === student.branch);
}

// Reset student device fingerprint
app.post('/api/admin/users/:uid/reset-device', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
       return res.status(403).json({ error: 'Access denied' });
    }
    
    const { uid } = req.params;
    const student = await User.findOne({ uid, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Non-admin teachers: check if they have access to the student
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      if (!canTeacherAccessStudent(teacherUser, student)) {
        return res.status(403).json({ error: 'Access denied: You do not have access to this student' });
      }
    }

    await User.findOneAndUpdate({ uid, role: 'student' }, { $unset: { deviceFingerprint: 1 } });
    console.log(`🔓 Device fingerprint reset for ${student.name} by ${req.user.email}`);
    res.json({ success: true, message: 'Device fingerprint reset successfully' });
  } catch (error) {
    console.error('Reset device error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher: Reset a student's password (no old password needed)
app.post('/api/teacher/students/:uid/reset-password', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { uid } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const student = await User.findOne({ uid, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Non-admin teachers: verify coordinator section access
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      if (!isTeacherCCForStudent(teacherUser, student)) {
        return res.status(403).json({ error: 'Access denied: You are not the Class Coordinator for this student\'s section' });
      }
    }

    student.password = await bcrypt.hash(newPassword, 10);
    await student.save();
    console.log(`🔑 Password reset for ${student.name} by ${req.user.email}`);
    res.json({ success: true, message: `Password reset for ${student.name}` });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher/Admin: Update student details
app.put('/api/teacher/students/:uid', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { uid } = req.params;
    const { name, email, rollNumber, branch, section, year } = req.body;

    const student = await User.findOne({ uid, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Non-admin teachers: verify coordinator section access
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      if (!isTeacherCCForStudent(teacherUser, student)) {
        return res.status(403).json({ error: 'Access denied: You are not the Class Coordinator for this student\'s section' });
      }
    }

    // Validate
    if (email && !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    // Check email uniqueness
    if (email) {
      const existing = await User.findOne({ email: email.trim().toLowerCase(), uid: { $ne: uid } });
      if (existing) return res.status(400).json({ error: 'Email already in use by another user' });
    }
    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.trim().toLowerCase();
    if (rollNumber !== undefined) updateData.rollNumber = rollNumber.trim() || undefined;
    if (branch !== undefined) updateData.branch = branch.trim() || undefined;
    if (section !== undefined) updateData.section = section.trim() || undefined;
    if (year !== undefined) updateData.year = year || undefined;

    const updatedStudent = await User.findOneAndUpdate({ uid, role: 'student' }, updateData, { new: true, select: '-password' });
    if (!updatedStudent) return res.status(404).json({ error: 'Student not found' });
    res.json(updatedStudent);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Duplicate email or roll number' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Teacher: Delete a student they have access to
app.delete('/api/teacher/students/:uid', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const student = await User.findOne({ uid: req.params.uid, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Non-admin teachers: verify coordinator section access
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      if (!isTeacherCCForStudent(teacherUser, student)) {
        return res.status(403).json({ error: 'Access denied: You are not the Class Coordinator for this student\'s section' });
      }
    }

    await User.findOneAndDelete({ uid: req.params.uid, role: 'student' });
    console.log(`🗑️ Student ${student.name} deleted by ${req.user.email}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= ADMIN: ASSIGN / REVOKE CLASS COORDINATOR (CC) =========
app.put('/api/admin/users/:uid/set-cc', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { isCC, ccSection, ccBranch, ccYear } = req.body;

    const teacher = await User.findOne({ uid, role: 'teacher' });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    if (isCC) {
      if (!ccSection || !ccBranch || !ccYear) {
        return res.status(400).json({ error: 'ccSection, ccBranch, and ccYear are required when assigning CC' });
      }
      teacher.isCC = true;
      teacher.ccSection = ccSection.trim();
      teacher.ccBranch = ccBranch.trim();
      teacher.ccYear = ccYear.trim();
    } else {
      teacher.isCC = false;
      teacher.ccSection = undefined;
      teacher.ccBranch = undefined;
      teacher.ccYear = undefined;
    }

    await teacher.save();
    const t = teacher.toObject();
    delete t.password;
    console.log(`🎓 ${teacher.name} CC status: ${isCC ? `CC of ${ccYear} Sec ${ccSection} (${ccBranch})` : 'revoked'} — by admin`);
    res.json(t);
  } catch (error) {
    console.error('Set CC error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= CLASS GROUPS ROUTE =========
// Returns distinct year+section+branch combinations derived from existing students
app.get('/api/class-groups', requireAuth, async (req, res) => {
  try {
    let students;

    if (req.user.role === 'admin') {
      // Admin sees all groups
      students = await User.find({ role: 'student' }, 'year section branch');
    } else if (req.user.role === 'teacher') {
      // Teacher sees only groups they are assigned to or CC for
      const teacherUser = await User.findOne({ uid: req.user.uid });
      const assignments = teacherUser?.assignedSubjects || [];
      
      const groupQueries = assignments.map(as => ({ year: as.year, section: as.section, branch: as.branch }));
      if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
        groupQueries.push({
          year: teacherUser.ccYear,
          section: teacherUser.ccSection,
          branch: teacherUser.ccBranch
        });
      }

      if (groupQueries.length === 0) return res.json([]);

      const seen = new Set();
      const uniqueGroups = [];
      for (const g of groupQueries) {
        const key = `${g.year}|${g.section}|${g.branch}`;
        if (!seen.has(key)) { seen.add(key); uniqueGroups.push(g); }
      }
      students = await User.find({ role: 'student', $or: uniqueGroups }, 'year section branch');
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    const groups = {};
    students.forEach(s => {
      if (!s.year || !s.section || !s.branch) return;
      const key = `${s.year}|${s.branch}|${s.section}`;
      if (!groups[key]) {
        groups[key] = { id: key, year: s.year, branch: s.branch, section: s.section,
          name: `${s.year} - ${s.branch} - Sec ${s.section}` };
      }
    });

    res.json(Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error('Class groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= SYSTEM CONFIG & PROMOTION ROUTES =========
app.get('/api/system/config', requireAuth, async (req, res) => {
  try {
    const sessionConfig = await SystemConfig.findOne({ key: 'currentAcademicSession' });
    res.json({ currentAcademicSession: sessionConfig ? sessionConfig.value : '2025-26' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/system/promote', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { newAcademicSession } = req.body;
    if (!newAcademicSession || !newAcademicSession.trim()) {
      return res.status(400).json({ error: 'New academic session is required' });
    }
    
    const cleanSession = newAcademicSession.trim();
    
    // Update global config
    await SystemConfig.findOneAndUpdate(
      { key: 'currentAcademicSession' },
      { value: cleanSession },
      { upsert: true }
    );

    // Progression mapping function
    const getNextYear = (currentYear) => {
      switch (currentYear) {
        case '1st Year': return '2nd Year';
        case '2nd Year': return '3rd Year';
        case '3rd Year': return '4th Year';
        case '4th Year': return 'Graduated';
        default: return 'Graduated';
      }
    };

    // Promote Students
    const students = await User.find({ role: 'student' });
    for (const student of students) {
      if (student.year === 'Graduated') continue;
      const nextYear = getNextYear(student.year || '1st Year');
      student.year = nextYear;
      student.academicSession = cleanSession;
      await student.save();
    }

    console.log(`🚀 Academic promotion complete! Advanced to session: ${cleanSession}`);
    res.json({ success: true, message: `System promoted to session ${cleanSession}`, studentsPromoted: students.length });
  } catch (error) {
    console.error('Promotion error:', error);
    res.status(500).json({ error: error.message || 'Server error during promotion' });
  }
});

// ========= CLASSROOMS ROUTES =========
app.get('/api/classrooms', requireAuth, async (req, res) => {
  try {
    const classrooms = await Classroom.find().sort({ name: 1 });
    res.json(classrooms);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/classrooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, c1_lat, c1_lon, c2_lat, c2_lon, c3_lat, c3_lon, c4_lat, c4_lon } = req.body;
    const classroom = new Classroom({
      id: `room-${Date.now()}`,
      name,
      c1_lat, c1_lon,
      c2_lat, c2_lon,
      c3_lat, c3_lon,
      c4_lat, c4_lon
    });
    await classroom.save();
    res.json(classroom);
  } catch (error) {
    console.error('Create classroom error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A classroom with this name already exists.' });
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.put('/api/admin/classrooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, c1_lat, c1_lon, c2_lat, c2_lon, c3_lat, c3_lon, c4_lat, c4_lon } = req.body;
    
    const classroom = await Classroom.findOne({ id: req.params.id });
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
    
    classroom.name = name;
    classroom.c1_lat = c1_lat;
    classroom.c1_lon = c1_lon;
    classroom.c2_lat = c2_lat;
    classroom.c2_lon = c2_lon;
    classroom.c3_lat = c3_lat;
    classroom.c3_lon = c3_lon;
    classroom.c4_lat = c4_lat;
    classroom.c4_lon = c4_lon;
    
    await classroom.save();
    res.json(classroom);
  } catch (error) {
    console.error('Update classroom error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A classroom with this name already exists.' });
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.delete('/api/admin/classrooms/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Classroom.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= SUBJECTS ROUTES =========
app.get('/api/subjects', requireAuth, async (req, res) => {
  try {
    const subjects = await Subject.find().sort({ name: 1 });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/subjects', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, code, year } = req.body;
    const subject = new Subject({
      id: `subj-${Date.now()}`,
      name, code, year
    });
    await subject.save();
    res.json(subject);
  } catch (error) {
    console.error('Create subject error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'This subject already exists for this year.' });
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.put('/api/admin/subjects/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, code, year } = req.body;
    const updated = await Subject.findOneAndUpdate(
      { id: req.params.id },
      { name, code, year },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Subject not found' });
    res.json(updated);
  } catch (error) {
    console.error('Update subject error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'This subject already exists for this year.' });
    }
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

app.delete('/api/admin/subjects/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await Subject.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========= SESSION & ATTENDANCE ROUTES (PROTECTED) =========

app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { section } = req.query;
    
    // If the requester is a student, only return sessions matching their year, section, and branch
    if (req.user.role === 'student') {
      const student = await User.findOne({ uid: req.user.uid });
      if (!student) return res.status(404).json({ error: 'Student not found' });

      const sessions = await Session.find({ 
        year: student.year,
        section: student.section,
        branch: student.branch,
        status: 'active' 
      });
      return res.json(sessions);
    }

    // For teachers and admin, return based on query or all active
    const query = { status: 'active' };
    if (section) {
      query.$or = [
        { section },
        { className: new RegExp(section, 'i') },
        { classId: section }
      ];
    }
    const sessions = await Session.find(query);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can start sessions' });

    const { year, section, branch, classroomId, teacherName, subject, lat, lon, radius } = req.body;

    // Validate required fields
    if (!year || !section || !branch) {
      return res.status(400).json({ error: 'Year, section, and branch are required to start a session' });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required to start a session' });
    }

    // Verify teacher is assigned to this subject for this year/section/branch
    // OR is the Class Coordinator for this section (CC can start any subject)
    const teacherUser = await User.findOne({ uid: req.user.uid });
    if (!teacherUser) return res.status(404).json({ error: 'Teacher profile not found' });

    const assignments = teacherUser.assignedSubjects || [];
    const isAssigned = assignments.some(as => 
      as.subjectName === subject.trim() &&
      as.year === year &&
      as.section === section &&
      as.branch === branch
    );

    // CC teachers can start sessions for ANY subject in their CC section
    const isCCForThisSection = teacherUser.isCC &&
      teacherUser.ccYear === year &&
      teacherUser.ccSection === section &&
      teacherUser.ccBranch === branch;

    if (!isAssigned && !isCCForThisSection) {
      return res.status(400).json({ 
        error: `You are not assigned to teach "${subject}" for ${year} - ${branch} - Sec ${section}, and you are not the Class Coordinator for this section.` 
      });
    }

    let roomName = 'Unknown';
    let latMin, latMax, lonMin, lonMax;
    let fallbackLat = lat;
    let fallbackLon = lon;

    if (classroomId) {
      const classroom = await Classroom.findOne({ id: classroomId });
      if (classroom) {
        roomName = classroom.name;
        latMin = classroom.lat_min;
        latMax = classroom.lat_max;
        lonMin = classroom.lon_min;
        lonMax = classroom.lon_max;
        if (lat === undefined) fallbackLat = (classroom.lat_min + classroom.lat_max) / 2;
        if (lon === undefined) fallbackLon = (classroom.lon_min + classroom.lon_max) / 2;
      }
    }

    const groupName = `${year} - ${branch} - Sec ${section}`;
    const classId = `${year}|${branch}|${section}`.replace(/\s+/g, '_');
    const sessionId = `session-${Date.now()}`;
    const displayClassName = `${groupName} — ${subject.trim()}`;

    const newSession = new Session({
      id: sessionId,
      classId,
      className: displayClassName,
      teacher: teacherName || teacherUser.name,
      room: roomName,
      section,
      year,
      branch,
      lat: fallbackLat,
      lon: fallbackLon,
      radius: radius !== undefined ? radius : 50,
      lat_min: latMin,
      lat_max: latMax,
      lon_min: lonMin,
      lon_max: lonMax,
      startTime: new Date().toISOString(),
      status: 'active'
    });
    await newSession.save();

    // Find all students matching this year, section, and branch
    const students = await User.find({ role: 'student', year, section, branch });
    
    if (students.length > 0) {
      const attendanceDocs = students.map(student => ({
        sessionId,
        studentUid: student.uid,
        studentName: student.name,
        roll: student.rollNumber || '',
        status: 'Absent',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subject: displayClassName
      }));
      await Attendance.insertMany(attendanceDocs);
    }

    console.log(`✅ Session started: ${displayClassName} (${students.length} students)`);
    res.json(newSession);
  } catch (error) {
    console.error('Session start error:', error.message);
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

    let record = await Attendance.findOne({ sessionId, studentUid });
    if (!record) {
      const student = await User.findOne({ uid: studentUid });
      const session = await Session.findOne({ id: sessionId });
      if (!student || !session) return res.status(404).json({ error: 'Student or Session not found' });

      record = new Attendance({
        sessionId,
        studentUid,
        studentName: student.name,
        roll: student.rollNumber || '',
        status: 'Absent',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        subject: session.className
      });
    }

    record.status = isLate ? 'Late Entry' : 'Present';
    record.markedAt = new Date().toISOString();
    record.distance = `${Math.round(distance)}m`;
    record.reverifications = (record.reverifications || 0) + 1;
    record.missedReverifications = 0;
    await record.save();

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

    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      const student = await User.findOne({ uid: studentUid, role: 'student' });
      if (!student || !canTeacherAccessStudent(teacherUser, student)) {
        return res.status(403).json({ error: 'Access denied: You are not related to this student' });
      }
    }

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
    // Use the requesting teacher's own name from their token (prevents seeing other teachers' sessions)
    const resolvedTeacherName = req.user.role === 'teacher'
      ? (await User.findOne({ uid: req.user.uid }))?.name || teacherName
      : teacherName;
    const sessions = await Session.find({ teacher: resolvedTeacherName, status: 'ended' }).sort({ createdAt: -1 });
    
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

    const { startDate, endDate, branch, year, section } = req.body;
    
    // 1. Find matching students (teachers only see their affiliated students)
    const userQuery = { role: 'student' };
    if (branch) userQuery.branch = branch;
    if (year) userQuery.year = year;
    if (section) userQuery.section = section;

    // Teachers see only students in their assigned groups or CC section
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      const assignments = teacherUser?.assignedSubjects || [];
      
      const groupQueries = assignments.map(as => ({ year: as.year, section: as.section, branch: as.branch }));
      if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
        groupQueries.push({
          year: teacherUser.ccYear,
          section: teacherUser.ccSection,
          branch: teacherUser.ccBranch
        });
      }

      if (groupQueries.length === 0) return res.json([]);

      const seen = new Set();
      const uniqueGroups = [];
      for (const g of groupQueries) {
        const key = `${g.year}|${g.section}|${g.branch}`;
        if (!seen.has(key)) { seen.add(key); uniqueGroups.push(g); }
      }
      // Combine teacher group filter with any user-provided filters
      userQuery.$or = uniqueGroups;
    }

    const students = await User.find(userQuery);
    if (students.length === 0) return res.json([]);

    const studentUids = students.map(s => s.uid);
    const studentMap = {};
    students.forEach(s => {
      studentMap[s.uid] = {
        uid: s.uid,
        name: s.name,
        rollNumber: s.rollNumber || 'N/A',
        branch: s.branch || 'N/A',
        year: s.year || 'N/A',
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
      return res.json(Object.values(studentMap).map(s => ({ ...s, percentage: 0 })));
    }

    // 3. Count total classes per student — a session counts for a student if year+section+branch matches
    sessions.forEach(session => {
      const countedStudents = new Set();
      students.forEach(student => {
        if (!countedStudents.has(student.uid) &&
            student.year === session.year &&
            student.section === session.section &&
            student.branch === session.branch) {
          studentMap[student.uid].totalClasses++;
          countedStudents.add(student.uid);
        }
      });
    });

    // 4. Count attended
    const attendances = await Attendance.find({
      sessionId: { $in: sessionIds },
      studentUid: { $in: studentUids }
    });
    attendances.forEach(record => {
      if (record.status === 'Present' || record.status === 'Late Entry') {
        if (studentMap[record.studentUid]) studentMap[record.studentUid].attended++;
      }
    });

    // Format output
    const report = Object.values(studentMap).map(s => {
      const percentage = s.totalClasses === 0 ? 0 : Math.round((s.attended / s.totalClasses) * 100);
      return { ...s, percentage };
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
    // Derive class groups from students
    let studentQuery = { role: 'student' };
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      const assignments = teacherUser?.assignedSubjects || [];
      
      const groupQueries = assignments.map(as => ({ year: as.year, section: as.section, branch: as.branch }));
      if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
        groupQueries.push({
          year: teacherUser.ccYear,
          section: teacherUser.ccSection,
          branch: teacherUser.ccBranch
        });
      }

      if (groupQueries.length === 0) return res.json({});

      const uniqueGroups = [];
      const seen = new Set();
      for (const a of groupQueries) {
        const k = `${a.year}|${a.section}|${a.branch}`;
        if (!seen.has(k)) { seen.add(k); uniqueGroups.push(a); }
      }
      studentQuery.$or = uniqueGroups;
    }

    const students = await User.find(studentQuery, 'year section branch');
    const groupKeys = new Set();
    students.forEach(s => {
      if (s.year && s.section && s.branch)
        groupKeys.add(`${s.year} - ${s.branch} - Sec ${s.section}`);
    });

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

    for (const groupName of groupKeys) {
      let t = timetables.find(doc => doc.classGroup === groupName || doc.batch === groupName);
      if (!t) {
        t = new Timetable({
          classGroup: groupName,
          schedule: JSON.parse(JSON.stringify(defaultSchedule))
        });
        await t.save();
      }
      data[groupName] = t.schedule;
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/timetable/update', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'student') return res.status(403).json({ error: 'Unauthorized' });
    const { classGroup, batch, date, slotIndex, data } = req.body;
    const targetGroup = classGroup || batch;
    
    const timetable = await Timetable.findOne({ $or: [{ classGroup: targetGroup }, { batch: targetGroup }] });
    if (!timetable) return res.status(404).json({ error: 'Class Group not found' });
    
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
app.get('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const userData = user.toObject();
    delete userData.password;
    res.json(userData);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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
    const { uid } = req.params;
    const updateData = req.body;
    
    // Authorization: Admin can update anyone, others can only update their own profile
    if (req.user.role !== 'admin' && req.user.uid !== uid) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Do not update password or immutable/unique fields if empty
    delete updateData.password;
    delete updateData._id;
    delete updateData.__v;
    if (updateData.rollNumber === "") delete updateData.rollNumber;
    if (updateData.deviceFingerprint === "") delete updateData.deviceFingerprint;

    // Secure fields: non-admins cannot change their role, CC status, or assigned subjects
    if (req.user.role !== 'admin') {
      delete updateData.role;
      delete updateData.isCC;
      delete updateData.ccSection;
      delete updateData.ccBranch;
      delete updateData.ccYear;
      delete updateData.assignedSubjects;
    }

    const user = await User.findOneAndUpdate({ uid }, updateData, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
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
      // Calculate low attendance and send to related students
      let studentQuery = { role: 'student' };
      if (req.user.role === 'teacher') {
        const teacherUser = await User.findOne({ uid: req.user.uid });
        const assignments = teacherUser?.assignedSubjects || [];
        const groupQueries = assignments.map(as => ({ year: as.year, section: as.section, branch: as.branch }));
        if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
          groupQueries.push({
            year: teacherUser.ccYear,
            section: teacherUser.ccSection,
            branch: teacherUser.ccBranch
          });
        }
        if (groupQueries.length === 0) return res.status(201).json({ success: true, count: 0 });
        studentQuery.$or = groupQueries;
      }

      const students = await User.find(studentQuery);
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
      targetType: targetType === 'batch' ? 'classGroup' : targetType,
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
    const { classGroup, batch, uid } = req.query;
    const targetGroup = classGroup || batch;
    let query = {};
    
    if (req.user.role === 'student') {
      // Students see notices targeted to their classGroup (or batch) or their specific UID
      query = {
        $or: [
          { targetType: 'classGroup', targetId: targetGroup },
          { targetType: 'batch', targetId: targetGroup },
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
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    
    // Use aggregation pipeline instead of N+1 queries — one DB call for all students
    const attendanceSummary = await Attendance.aggregate([
      {
        $group: {
          _id: '$studentUid',
          total: { $sum: 1 },
          attended: {
            $sum: {
              $cond: [{ $in: ['$status', ['Present', 'Late Entry']] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Build a map for quick lookup
    const summaryMap = {};
    attendanceSummary.forEach(s => {
      summaryMap[s._id] = s;
    });

    // Get related students
    let studentQuery = { role: 'student' };
    if (req.user.role === 'teacher') {
      const teacherUser = await User.findOne({ uid: req.user.uid });
      const assignments = teacherUser?.assignedSubjects || [];
      const groupQueries = assignments.map(as => ({ year: as.year, section: as.section, branch: as.branch }));
      if (teacherUser?.isCC && teacherUser.ccYear && teacherUser.ccSection && teacherUser.ccBranch) {
        groupQueries.push({
          year: teacherUser.ccYear,
          section: teacherUser.ccSection,
          branch: teacherUser.ccBranch
        });
      }
      if (groupQueries.length === 0) return res.json([]);
      studentQuery.$or = groupQueries;
    }

    const students = await User.find(studentQuery, 'uid name rollNumber year section branch');
    const lowAttendanceStudents = [];

    students.forEach(student => {
      const summary = summaryMap[student.uid];
      if (!summary || summary.total === 0) return;
      const percentage = (summary.attended / summary.total) * 100;
      if (percentage < 75) {
        lowAttendanceStudents.push({
          uid: student.uid,
          name: student.name,
          rollNumber: student.rollNumber,
          batch: `${student.year || ''} - ${student.branch || ''} - Sec ${student.section || ''}`,
          percentage: percentage.toFixed(1)
        });
      }
    });

    res.json(lowAttendanceStudents);
  } catch (error) {
    console.error('Low attendance error:', error);
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

// Debug endpoint - protected (admin only)
app.get('/api/debug/status', requireAuth, requireAdmin, async (req, res) => {
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
  
  res.json({
    database: dbStates[dbState] || 'unknown',
    lastDbError,
    mongoUri: process.env.MONGODB_URI ? 'SET (hidden)' : 'NOT SET',
    jwtSecret: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    frontendUrl: process.env.FRONTEND_URL || 'NOT SET',
    userCount,
    adminExists,
    nodeEnv: process.env.NODE_ENV || 'not set'
  });
});

// Force reconnect endpoint — admin only
app.get('/api/debug/reconnect', requireAuth, requireAdmin, async (req, res) => {
  res.json({ message: 'Reconnecting to MongoDB...' });
  try { await mongoose.disconnect(); } catch(e) {}
  connectWithRetry();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SmartAttend API Server running on port ${PORT}`);
});

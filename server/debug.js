import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';
import { Subject } from './models/Subject.js';
import { Classroom } from './models/Classroom.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("=== USERS ===");
    const users = await User.find();
    console.log(users.map(u => ({
      uid: u.uid,
      name: u.name,
      email: u.email,
      role: u.role,
      isCC: u.isCC,
      ccYear: u.ccYear,
      ccSection: u.ccSection,
      ccBranch: u.ccBranch,
      assignedSubjects: u.assignedSubjects,
      year: u.year,
      section: u.section,
      branch: u.branch
    })));

    console.log("=== SUBJECTS ===");
    const subjects = await Subject.find();
    console.log(subjects);

    console.log("=== CLASSROOMS ===");
    const classrooms = await Classroom.find();
    console.log(classrooms);

    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './models/User.js';
import { Batch } from './models/Batch.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const batches = await Batch.find();
    console.log("Batches:", batches.map(b => ({ name: b.name, section: b.section })));
    
    const students = await User.find({ role: 'student' });
    console.log("Students:", students.map(s => ({ name: s.name, section: s.section })));
    
    process.exit(0);
  });

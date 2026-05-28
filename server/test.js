import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const teachers = await User.find({ role: 'teacher' });
  console.log('Teachers:', teachers.map(t => ({ uid: t.uid, name: t.name, email: t.email })));
  
  const students = await User.find({ role: 'student' });
  console.log('Students:', students.map(s => ({ uid: s.uid, name: s.name, email: s.email, section: s.section, batch: s.batch, branch: s.branch })));
  
  process.exit(0);
}
run();

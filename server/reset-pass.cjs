const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const newPassword = await bcrypt.hash('password123', 10);
  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: 'himanshuchandlani07@gmail.com' },
    { $set: { password: newPassword } }
  );
  console.log('Password reset success:', result.modifiedCount > 0);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

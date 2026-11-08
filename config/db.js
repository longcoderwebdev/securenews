const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('Đã kết nối MongoDB');
}

module.exports = connectDB;
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../models/User');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

const accounts = [
  {
    role: 'admin',
    fullName: 'Quản trị viên',
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  },
  {
    role: 'editor',
    fullName: 'Biên tập viên',
    email: process.env.SEED_EDITOR_EMAIL,
    password: process.env.SEED_EDITOR_PASSWORD,
  },
];

async function seed() {
  for (const a of accounts) {
    if (!a.email || !a.password) {
      throw new Error(`Thiếu SEED_${a.role.toUpperCase()}_EMAIL hoặc SEED_${a.role.toUpperCase()}_PASSWORD trong .env`);
    }
    if (a.password.length < 10) {
      throw new Error(`Mật khẩu của ${a.role} phải có ít nhất 10 ký tự`);
    }
  }

  await mongoose.connect(process.env.MONGO_URI);
  for (const a of accounts) {
    const email = a.email.trim().toLowerCase();
    if (await User.exists({ email })) {
      console.log(`Bỏ qua (đã có): ${email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(a.password, ROUNDS);
    await User.create({ fullName: a.fullName, email, passwordHash, role: a.role });
    console.log(`Đã tạo ${a.role}: ${email}`);
  }
}

seed()
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
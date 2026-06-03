import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import pkg from 'pg';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'car_booking_jwt_super_secret_key_2026';

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE HYBRID CONNECTION CONFIGURATION ---

const usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;

if (usePostgres) {
  console.log('PostgreSQL database mode active');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Necessary for hosting like Render, Supabase, Neon
    }
  });
} else {
  console.log('Local JSON File database mode active');
}

// Local JSON File Helper Readers/Writers
const readDB = () => {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file, returning defaults', err);
    return { users: [], cars: [], bookings: [], notificationLogs: [], settings: {} };
  }
};

const writeDB = (data) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to database file', err);
  }
};

// --- UNIFIED DATABASE PROVIDER INTERFACE (DB ABSTRACT LAYER) ---

const db = {
  getUsers: async () => {
    if (usePostgres) {
      const res = await pgPool.query('SELECT * FROM users');
      return res.rows;
    } else {
      return readDB().users;
    }
  },

  saveUser: async (user) => {
    if (usePostgres) {
      await pgPool.query(
        'INSERT INTO users (id, username, email, password, name, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [user.id, user.username, user.email, user.password, user.name, user.role, user.status]
      );
    } else {
      const data = readDB();
      data.users.push(user);
      writeDB(data);
    }
  },

  updateUserStatus: async (id, status) => {
    if (usePostgres) {
      await pgPool.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
    } else {
      const data = readDB();
      const u = data.users.find(x => x.id === id);
      if (u) u.status = status;
      writeDB(data);
    }
  },

  updateUserRole: async (id, role) => {
    if (usePostgres) {
      await pgPool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    } else {
      const data = readDB();
      const u = data.users.find(x => x.id === id);
      if (u) u.role = role;
      writeDB(data);
    }
  },

  getCars: async () => {
    if (usePostgres) {
      const res = await pgPool.query('SELECT * FROM cars ORDER BY id ASC');
      return res.rows;
    } else {
      return readDB().cars;
    }
  },

  updateCarStatus: async (id, status) => {
    if (usePostgres) {
      await pgPool.query('UPDATE cars SET status = $1 WHERE id = $2', [status, id]);
    } else {
      const data = readDB();
      const c = data.cars.find(x => x.id === id);
      if (c) c.status = status;
      writeDB(data);
    }
  },

  getBookings: async () => {
    if (usePostgres) {
      const res = await pgPool.query(`
        SELECT b.*, u.name as "userName", u.email as "userEmail", c.model as "carModel", c.image as "carImage"
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN cars c ON b.car_id = c.id
        ORDER BY b.start_time ASC
      `);
      return res.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        carId: row.car_id,
        startTime: new Date(row.start_time).toISOString().substring(0, 16), // YYYY-MM-DDTHH:MM
        endTime: new Date(row.end_time).toISOString().substring(0, 16),
        purpose: row.purpose,
        destination: row.destination,
        passengers: row.passengers,
        status: row.status,
        notes: row.notes || '',
        approvedBy: row.approved_by || '',
        createdAt: row.created_at,
        userName: row.userName,
        userEmail: row.userEmail,
        carModel: row.carModel,
        carImage: row.carImage
      }));
    } else {
      const fileData = readDB();
      return fileData.bookings.map(b => {
        const user = fileData.users.find(u => u.id === b.userId);
        const car = fileData.cars.find(c => c.id === b.carId);
        return {
          ...b,
          userName: user ? user.name : 'ไม่ระบุผู้ใช้',
          userEmail: user ? user.email : '',
          carModel: car ? `${car.model} (${car.color})` : 'ไม่พบข้อมูลรถยนต์',
          carImage: car ? car.image : ''
        };
      });
    }
  },

  saveBooking: async (booking) => {
    if (usePostgres) {
      await pgPool.query(
        'INSERT INTO bookings (id, user_id, car_id, start_time, end_time, purpose, destination, passengers, status, notes, approved_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [booking.id, booking.userId, booking.carId, booking.startTime, booking.endTime, booking.purpose, booking.destination, booking.passengers, booking.status, booking.notes, booking.approvedBy]
      );
    } else {
      const data = readDB();
      data.bookings.push(booking);
      writeDB(data);
    }
  },

  updateBookingStatus: async (id, status, notes, approvedBy) => {
    if (usePostgres) {
      await pgPool.query(
        'UPDATE bookings SET status = $1, notes = $2, approved_by = $3 WHERE id = $4',
        [status, notes, approvedBy, id]
      );
    } else {
      const data = readDB();
      const b = data.bookings.find(x => x.id === id);
      if (b) {
        b.status = status;
        b.notes = notes;
        b.approvedBy = approvedBy;
      }
      writeDB(data);
    }
  },

  getSettings: async () => {
    if (usePostgres) {
      const res = await pgPool.query('SELECT value FROM settings WHERE key = $1', ['config']);
      if (res.rows.length > 0) {
        return JSON.parse(res.rows[0].value);
      }
      return {
        smtp: { host: '', port: '587', secure: false, user: '', pass: '', from: 'noreply@carbooking.com' },
        line: { channelAccessToken: '', channelSecret: '', adminUserId: '' }
      };
    } else {
      return readDB().settings || {};
    }
  },

  saveSettings: async (settings) => {
    if (usePostgres) {
      await pgPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        ['config', JSON.stringify(settings)]
      );
    } else {
      const data = readDB();
      data.settings = settings;
      writeDB(data);
    }
  },

  getNotificationLogs: async () => {
    if (usePostgres) {
      const res = await pgPool.query('SELECT * FROM notification_logs ORDER BY timestamp DESC LIMIT 200');
      return res.rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        recipient: row.recipient,
        subject: row.subject,
        message: row.message,
        status: row.status,
        error: row.error || undefined
      }));
    } else {
      return readDB().notificationLogs || [];
    }
  },

  saveNotificationLog: async (log) => {
    if (usePostgres) {
      await pgPool.query(
        'INSERT INTO notification_logs (id, type, recipient, subject, message, status, error) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [log.id, log.type, log.recipient, log.subject, log.message, log.status, log.error || null]
      );
    } else {
      const data = readDB();
      data.notificationLogs = data.notificationLogs || [];
      data.notificationLogs.unshift(log);
      if (data.notificationLogs.length > 200) {
        data.notificationLogs = data.notificationLogs.slice(0, 200);
      }
      writeDB(data);
    }
  }
};

// --- AUTOMATIC SCHEMA MIGRATIONS FOR CLOUD POSTGRESQL ---

const initPostgresDB = async () => {
  if (!usePostgres) return;
  const client = await pgPool.connect();
  try {
    console.log('Running PostgreSQL table verification...');
    
    // Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Cars Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cars (
        id VARCHAR(50) PRIMARY KEY,
        model VARCHAR(100) NOT NULL,
        color VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        image VARCHAR(100) NOT NULL
      )
    `);

    // Create Bookings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        car_id VARCHAR(50) REFERENCES cars(id) ON DELETE CASCADE,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        purpose TEXT NOT NULL,
        destination VARCHAR(255) NOT NULL,
        passengers INTEGER DEFAULT 1,
        status VARCHAR(20) NOT NULL,
        notes TEXT,
        approved_by VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Notification Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id VARCHAR(50) PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        type VARCHAR(20) NOT NULL,
        recipient VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        error TEXT
      )
    `);

    // Create Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    console.log('PostgreSQL Tables verified.');

    // Seed cars if empty
    const carsCheck = await client.query('SELECT COUNT(*) FROM cars');
    if (parseInt(carsCheck.rows[0].count) === 0) {
      console.log('Seeding default cars into PostgreSQL...');
      const defaultCars = [
        ['car1', 'รถตู้ ฮร 8010', 'สีขาว', 'van', 'available', 'van_white'],
        ['car2', 'รถตู้ ฮย 1906', 'สีเทา', 'van', 'available', 'van_grey'],
        ['car3', 'รถยาริส ฌอ 6249', 'สีเทา', 'sedan', 'available', 'yaris_grey'],
        ['car4', 'รถเชฟ ศฐ 8709', 'สีดำ', 'suv', 'available', 'chevrolet_black'],
        ['car5', 'รถอัลพาร์ด 8กว 6276', 'สีขาว', 'luxury', 'available', 'alphard_white']
      ];
      for (const car of defaultCars) {
        await client.query(
          'INSERT INTO cars (id, model, color, type, status, image) VALUES ($1, $2, $3, $4, $5, $6)',
          car
        );
      }
    }

    // Seed default users if empty
    const usersCheck = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(usersCheck.rows[0].count) === 0) {
      console.log('Seeding default users into PostgreSQL...');
      // generate standard bcrypt for CarBookingSecurePass2026!
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('CarBookingSecurePass2026!', salt);
      
      const defaultUsers = [
        ['u1', 'admin', 'admin@booking.local', hash, 'ผู้ดูแลระบบ (Admin)', 'admin', 'active'],
        ['u2', 'scheduler', 'scheduler@booking.local', hash, 'เจ้าหน้าที่จัดคิวรถ (Scheduler)', 'scheduler', 'active'],
        ['u3', 'user', 'user@booking.local', hash, 'พนักงานทั่วไป (User)', 'user', 'active']
      ];
      for (const u of defaultUsers) {
        await client.query(
          'INSERT INTO users (id, username, email, password, name, role, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          u
        );
      }
    } else {
      // If users table is not empty, update the passwords of the default accounts to the new secure password
      const salt = bcrypt.genSaltSync(10);
      const updateHash = bcrypt.hashSync('CarBookingSecurePass2026!', salt);
      await client.query(
        "UPDATE users SET password = $1 WHERE username IN ('admin', 'scheduler', 'user')",
        [updateHash]
      );
      console.log('PostgreSQL default user passwords updated successfully.');
    }

    // Seed settings if empty
    const settingsCheck = await client.query('SELECT COUNT(*) FROM settings');
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      console.log('Seeding default settings into PostgreSQL...');
      const defaultSettings = {
        smtp: { host: '', port: '587', secure: false, user: '', pass: '', from: 'noreply@carbooking.com' },
        line: { channelAccessToken: '', channelSecret: '', adminUserId: '' }
      };
      await client.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['config', JSON.stringify(defaultSettings)]
      );
    }
  } catch (err) {
    console.error('PostgreSQL migration/seeding failed:', err);
  } finally {
    client.release();
  }
};

// --- MIDDLEWARES ---

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'ไม่ได้เข้าสู่ระบบ' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
    req.user = user;
    next();
  });
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ในการดำเนินการนี้' });
    }
    next();
  };
};

// --- THAI DATE-TIME FORMATTING HELPERS (Guarantees strict 24-hour style) ---

const formatThaiDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate();
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${String(year).slice(-2)}`;
};

const formatThaiDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const pad = (num) => String(num).padStart(2, '0');
  
  const day = date.getDate();
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543;
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  
  return `${day} ${month} ${String(year).slice(-2)} เวลา ${h}:${min} น.`;
};

// --- NOTIFICATION HANDLERS (Actual SMTP & LINE or Simulator Hub) ---

const sendNotification = async (type, recipient, subject, messageText) => {
  const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const logEntry = {
    id: logId,
    timestamp: new Date().toISOString(),
    type, // 'email' | 'line'
    recipient,
    subject,
    message: messageText,
    status: 'simulated' // 'simulated' | 'sent' | 'failed'
  };

  const settings = await db.getSettings();

  if (type === 'email') {
    const smtp = settings.smtp || {};
    if (smtp.host && smtp.user && smtp.pass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: parseInt(smtp.port || '587'),
          secure: smtp.secure === 'true' || smtp.secure === true,
          auth: {
            user: smtp.user,
            pass: smtp.pass
          }
        });

        await transporter.sendMail({
          from: smtp.from || 'noreply@carbooking.com',
          to: recipient,
          subject: subject,
          text: messageText
        });
        logEntry.status = 'sent';
      } catch (err) {
        console.error('SMTP Email sending failed:', err);
        logEntry.status = 'failed';
        logEntry.error = err.message;
      }
    }
  } else if (type === 'line') {
    const line = settings.line || {};
    if (line.channelAccessToken) {
      try {
        const targetUserId = line.adminUserId || recipient;
        if (targetUserId && targetUserId.startsWith('U')) {
          const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${line.channelAccessToken}`
            },
            body: JSON.stringify({
              to: targetUserId,
              messages: [{ type: 'text', text: `${subject}\n\n${messageText}` }]
            })
          });

          if (response.ok) {
            logEntry.status = 'sent';
          } else {
            const errText = await response.text();
            logEntry.status = 'failed';
            logEntry.error = `Line API error: ${response.status} ${errText}`;
          }
        } else {
          logEntry.status = 'simulated';
          logEntry.error = 'LINE ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U สำหรับ Line User ID)';
        }
      } catch (err) {
        console.error('LINE Message sending failed:', err);
        logEntry.status = 'failed';
        logEntry.error = err.message;
      }
    }
  }

  await db.saveNotificationLog(logEntry);
};

// Double Booking Checker
const checkOverlap = (carId, startTime, endTime, bookings, excludeBookingId = null) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  return bookings.some(b => {
    if (b.carId !== carId) return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    if (b.status === 'rejected' || b.status === 'cancelled') return false;

    const bStart = new Date(b.startTime);
    const bEnd = new Date(b.endTime);

    // Overlap condition
    return (start < bEnd && end > bStart);
  });
};

// --- EXPRESS ROUTING REST APIs ---

// Root Status Route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'ระบบหลังบ้านสำหรับการจองรถยนต์ทำงานปกติ (Car Booking API Server is running)',
    version: '1.0.0',
    databaseMode: usePostgres ? 'PostgreSQL (Cloud)' : 'JSON File (Local)'
  });
});

// Register User
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, name } = req.body;
  if (!username || !email || !password || !name) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  try {
    const users = await db.getUsers();

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' });
    }
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ message: 'อีเมลนี้ถูกลงทะเบียนไปแล้ว' });
    }

    const activeUserCount = users.filter(u => u.status === 'active').length;
    if (activeUserCount >= 30) {
      return res.status(400).json({ message: 'ระบบมีจำนวนผู้ใช้งานที่อนุมัติเต็มขีดจำกัด 30 คนแล้ว ไม่สามารถลงทะเบียนเพิ่มได้' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const newUser = {
      id: 'u_' + Date.now(),
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: 'user',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await db.saveUser(newUser);

    // Notify Admins
    const admins = users.filter(u => u.role === 'admin');
    for (const admin of admins) {
      await sendNotification(
        'email',
        admin.email,
        'สมัครสมาชิกใหม่รอการอนุมัติ',
        `ผู้ใช้ใหม่: ${name} (${username})\nอีเมล: ${email}\nกรุณาเข้าสู่ระบบหลังบ้านเพื่ออนุมัติสิทธิ์การใช้งาน`
      );
      await sendNotification(
        'line',
        admin.id,
        '📌 สมัครสมาชิกใหม่รออนุมัติ',
        `ชื่อ: ${name}\nชื่อผู้ใช้: ${username}\nอีเมล: ${email}\nกรุณาตรวจสอบระบบอนุมัติหลังบ้าน`
      );
    }

    res.status(201).json({ message: 'ลงทะเบียนสำเร็จ กรุณารอผู้ดูแลระบบ (Admin) อนุมัติการเข้าใช้งาน' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ระบบเกิดข้อผิดพลาดในการลงทะเบียน' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  try {
    const users = await db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase());

    if (!user) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติการเข้าใช้งาน' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งานชั่วคราว' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ระบบเกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// Get active user data (Me)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้' });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถโหลดข้อมูลสิทธิ์ผู้ใช้ได้' });
  }
});

// List Cars
app.get('/api/cars', authenticateToken, async (req, res) => {
  try {
    const cars = await db.getCars();
    res.json(cars);
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถโหลดข้อมูลรถยนต์ได้' });
  }
});

// Update Car status
app.patch('/api/cars/:id', authenticateToken, requireRole(['admin', 'scheduler']), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'available' | 'maintenance'

  if (!status) return res.status(400).json({ message: 'กรุณาระบุสถานะ' });

  try {
    const cars = await db.getCars();
    const car = cars.find(c => c.id === id);
    if (!car) return res.status(404).json({ message: 'ไม่พบข้อมูลรถยนต์' });

    await db.updateCarStatus(id, status);
    res.json({ message: 'อัปเดตสถานะรถยนต์เรียบร้อย', car: { ...car, status } });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถแก้ไขสถานะรถยนต์ได้' });
  }
});

// List bookings
app.get('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await db.getBookings();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถดึงข้อมูลการจองได้' });
  }
});

// Create booking
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { carId, startTime, endTime, purpose } = req.body;

  if (!carId || !startTime || !endTime || !purpose) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลการจองให้ครบถ้วน' });
  }

  try {
    const cars = await db.getCars();
    const car = cars.find(c => c.id === carId);

    if (!car) return res.status(404).json({ message: 'ไม่พบข้อมูลรถยนต์ที่ระบุ' });
    if (car.status === 'maintenance') {
      return res.status(400).json({ message: 'ขออภัย รถยนต์คันนี้อยู่ระหว่างการซ่อมบำรุง' });
    }

    const bookings = await db.getBookings();
    const isOverlapping = checkOverlap(carId, startTime, endTime, bookings);
    if (isOverlapping) {
      return res.status(400).json({ message: 'ขออภัย รถยนต์คันนี้มีผู้จองแล้วในช่วงเวลาดังกล่าว กรุณาเลือกเวลาอื่นหรือรถยนต์คันอื่น' });
    }

    const newBooking = {
      id: 'b_' + Date.now(),
      userId: req.user.id,
      carId,
      startTime,
      endTime,
      purpose,
      destination: '',
      passengers: 1,
      status: 'pending',
      notes: '',
      approvedBy: '',
      createdAt: new Date().toISOString()
    };

    await db.saveBooking(newBooking);

    // Notify Admins & Schedulers
    const users = await db.getUsers();
    const notifyList = users.filter(u => u.role === 'admin' || u.role === 'scheduler');
    for (const approver of notifyList) {
      await sendNotification(
        'email',
        approver.email,
        'คำขอจองรถยนต์ใหม่รอการอนุมัติ',
        `ผู้ขอจอง: ${req.user.name}\nรถยนต์: ${car.model} (${car.color})\nวันเวลา: ${formatThaiDateTime(startTime)} - ${formatThaiDateTime(endTime)}\nวัตถุประสงค์: ${purpose}\n\nกรุณาเข้าสู่ระบบเพื่อจัดการอนุมัติคำขอ`
      );
      await sendNotification(
        'line',
        approver.id,
        '🚗 คำขอจองรถยนต์ใหม่ (รออนุมัติ)',
        `ผู้ขอ: ${req.user.name}\nรถ: ${car.model}\nเวลา: ${formatThaiDateTime(startTime)} ถึง ${formatThaiDateTime(endTime)}\nวัตถุประสงค์: ${purpose}`
      );
    }

    res.status(201).json({ message: 'ส่งคำขอจองรถยนต์สำเร็จแล้ว กรุณารอการอนุมัติจากเจ้าหน้าที่', booking: newBooking });
  } catch (err) {
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการจองรถ' });
  }
});

// Cancel Booking
app.post('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const bookings = await db.getBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });

    if (booking.userId !== req.user.id && req.user.role === 'user') {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ยกเลิกรายการจองของผู้อื่น' });
    }

    await db.updateBookingStatus(id, 'cancelled', `ยกเลิกโดย ${req.user.name}`, '');

    // Notify
    const cars = await db.getCars();
    const car = cars.find(c => c.id === booking.carId);
    const users = await db.getUsers();
    const notifyList = users.filter(u => u.role === 'admin' || u.role === 'scheduler' || u.id === booking.userId);

    for (const person of notifyList) {
      if (person.id !== req.user.id) {
        await sendNotification(
          'email',
          person.email,
          'รายการจองรถยนต์ถูกยกเลิก',
          `รายการจองรถยนต์ ${car ? car.model : ''} สำหรับวันที่ ${formatThaiDateTime(booking.startTime)} ได้ถูกยกเลิกแล้วโดย ${req.user.name}`
        );
        await sendNotification(
          'line',
          person.id,
          '❌ รายการจองรถยนต์ถูกยกเลิก',
          `รถ: ${car ? car.model : ''}\nวันเวลา: ${formatThaiDate(booking.startTime)}\nผู้ยกเลิก: ${req.user.name}`
        );
      }
    }

    res.json({ message: 'ยกเลิกการจองรถยนต์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถยกเลิกการจองรถยนต์ได้' });
  }
});

// Approve Booking
app.post('/api/bookings/:id/approve', authenticateToken, requireRole(['admin', 'scheduler']), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const bookings = await db.getBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });

    const isOverlapping = checkOverlap(booking.carId, booking.startTime, booking.endTime, bookings, booking.id);
    if (isOverlapping) {
      return res.status(400).json({ message: 'ไม่สามารถอนุมัติได้เนื่องจากมีรายการจองอื่นที่ได้รับอนุมัติแล้วในช่วงเวลาเดียวกัน' });
    }

    const noteText = notes || 'ได้รับการอนุมัติ';
    await db.updateBookingStatus(id, 'approved', noteText, req.user.name);

    // Notify User
    const cars = await db.getCars();
    const car = cars.find(c => c.id === booking.carId);
    const users = await db.getUsers();
    const targetUser = users.find(u => u.id === booking.userId);

    if (targetUser) {
      await sendNotification(
        'email',
        targetUser.email,
        'คำขอจองรถยนต์ของคุณได้รับการอนุมัติแล้ว',
        `ยินดีด้วย! คำขอจองรถยนต์ ${car ? car.model : ''} (${car ? car.color : ''})\nวันเวลา: ${formatThaiDateTime(booking.startTime)} - ${formatThaiDateTime(booking.endTime)}\nวัตถุประสงค์: ${booking.purpose}\nได้รับการอนุมัติแล้วโดย ${req.user.name}\nหมายเหตุ: ${noteText}`
      );
      await sendNotification(
        'line',
        targetUser.id,
        '✅ คำขอจองรถยนต์ได้รับการอนุมัติ',
        `รถ: ${car ? car.model : ''}\nเวลา: ${formatThaiDateTime(booking.startTime)}\nผู้อนุมัติ: ${req.user.name}\nหมายเหตุ: ${noteText}`
      );
    }

    res.json({ message: 'อนุมัติการจองรถยนต์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถทำเรื่องอนุมัติการจองรถยนต์ได้' });
  }
});

// Reject Booking
app.post('/api/bookings/:id/reject', authenticateToken, requireRole(['admin', 'scheduler']), async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  if (!notes) return res.status(400).json({ message: 'กรุณาระบุเหตุผลในการปฏิเสธการจอง' });

  try {
    const bookings = await db.getBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });

    await db.updateBookingStatus(id, 'rejected', notes, req.user.name);

    // Notify User
    const cars = await db.getCars();
    const car = cars.find(c => c.id === booking.carId);
    const users = await db.getUsers();
    const targetUser = users.find(u => u.id === booking.userId);

    if (targetUser) {
      await sendNotification(
        'email',
        targetUser.email,
        'คำขอจองรถยนต์ของคุณถูกปฏิเสธ',
        `คำขอจองรถยนต์ ${car ? car.model : ''} สำหรับวันที่ ${formatThaiDateTime(booking.startTime)} ไม่ได้รับการอนุมัติ\nเหตุผล: ${notes}\nตรวจสอบหรือจองใหม่ได้ที่หน้าเว็บไซต์`
      );
      await sendNotification(
        'line',
        targetUser.id,
        '❌ คำขอจองรถยนต์ไม่ได้รับการอนุมัติ',
        `รถ: ${car ? car.model : ''}\nวันเวลา: ${formatThaiDate(booking.startTime)}\nเหตุผล: ${notes}\nโดย: ${req.user.name}`
      );
    }

    res.json({ message: 'ปฏิเสธการจองรถยนต์เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถปฏิเสธคำขอจองได้' });
  }
});

// List Users for Admin
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const users = await db.getUsers();
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถดึงข้อมูลสมาชิกได้' });
  }
});

// Admin Approve User Account
app.post('/api/admin/users/:id/approve', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  
  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });

    const activeUserCount = users.filter(u => u.status === 'active').length;
    if (activeUserCount >= 30 && user.status !== 'active') {
      return res.status(400).json({ message: 'ไม่สามารถอนุมัติได้เนื่องจากมีจำนวนผู้ใช้งานอนุมัติเต็มขีดจำกัด 30 คนแล้ว' });
    }

    await db.updateUserStatus(id, 'active');

    // Notify User
    await sendNotification(
      'email',
      user.email,
      'บัญชีผู้ใช้งานของคุณได้รับการอนุมัติแล้ว',
      `สวัสดีคุณ ${user.name}\nบัญชีผู้ใช้งานระบบจองรถยนต์ของคุณได้รับการอนุมัติโดยผู้ดูแลระบบเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบเพื่อดำเนินการจองรถยนต์ส่วนกลางได้ทันที`
    );
    await sendNotification(
      'line',
      user.id,
      '🎉 บัญชีผู้ใช้ของคุณได้รับการอนุมัติแล้ว',
      `คุณ ${user.name} สามารถเข้าล็อกอินใช้งานระบบจองรถได้แล้ววันนี้!`
    );

    res.json({ message: 'อนุมัติผู้ใช้งานเปิดการใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถอนุมัติบัญชีใช้งานได้' });
  }
});

// Admin change User role
app.post('/api/admin/users/:id/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['user', 'scheduler', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'ระบุสิทธิ์ไม่ถูกต้อง' });
  }

  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });

    await db.updateUserRole(id, role);
    res.json({ message: 'เปลี่ยนสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว', role });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถอัปเดตบทบาทหน้าที่ได้' });
  }
});

// Admin suspend user account
app.post('/api/admin/users/:id/suspend', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  
  try {
    const users = await db.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
    if (user.id === req.user.id) return res.status(400).json({ message: 'คุณไม่สามารถระงับการใช้งานบัญชีของคุณเองได้' });

    await db.updateUserStatus(id, 'suspended');
    res.json({ message: 'ระงับบัญชีผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถระงับบัญชีใช้งานได้' });
  }
});

// Get simulated notification logs
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const logs = await db.getNotificationLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถโหลดประวัติการแจ้งเตือนได้' });
  }
});

// Get settings
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await db.getSettings();
    
    // Sanitize credentials
    const safeSettings = {
      smtp: {
        host: settings.smtp?.host || '',
        port: settings.smtp?.port || '587',
        secure: settings.smtp?.secure || false,
        user: settings.smtp?.user || '',
        pass: settings.smtp?.pass ? '********' : '',
        from: settings.smtp?.from || 'noreply@carbooking.com'
      },
      line: {
        channelAccessToken: settings.line?.channelAccessToken ? '********' : '',
        channelSecret: settings.line?.channelSecret ? '********' : '',
        adminUserId: settings.line?.adminUserId || ''
      }
    };

    res.json(safeSettings);
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถโหลดข้อมูลเชื่อมต่อได้' });
  }
});

// Save settings
app.post('/api/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { smtp, line } = req.body;
  
  try {
    const current = await db.getSettings();
    const updated = { ...current };

    if (smtp) {
      updated.smtp = updated.smtp || {};
      updated.smtp.host = smtp.host;
      updated.smtp.port = smtp.port;
      updated.smtp.secure = smtp.secure;
      updated.smtp.user = smtp.user;
      updated.smtp.from = smtp.from;
      
      if (smtp.pass && smtp.pass !== '********') {
        updated.smtp.pass = smtp.pass;
      }
    }

    if (line) {
      updated.line = updated.line || {};
      updated.line.adminUserId = line.adminUserId;
      
      if (line.channelAccessToken && line.channelAccessToken !== '********') {
        updated.line.channelAccessToken = line.channelAccessToken;
      }
      if (line.channelSecret && line.channelSecret !== '********') {
        updated.line.channelSecret = line.channelSecret;
      }
    }

    await db.saveSettings(updated);
    res.json({ message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถบันทึกข้อมูลการตั้งค่าได้' });
  }
});

// --- SERVER INITIALIZATION ---

const PORT = process.env.PORT || 5000;

// Execute Postgres Auto-Migration if active, then start express app
const startServer = async () => {
  if (usePostgres) {
    await initPostgresDB();
  }
  
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT} in ${usePostgres ? 'PostgreSQL' : 'Local JSON'} mode`);
  });
};

startServer().catch(err => {
  console.error('Server startup failed:', err);
});

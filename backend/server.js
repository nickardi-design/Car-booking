import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pkg from 'pg';
import cron from 'node-cron';

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'car_booking_jwt_super_secret_key_2026';

const app = express();
app.use(cors());
app.use(express.json());

// Prevent browser caching for all API endpoints
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

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
    return { users: [], cars: [], bookings: [] };
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
        'INSERT INTO users (id, username, email, password, name, role, status, line_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [user.id, user.username, user.email, user.password, user.name, user.role, user.status, user.line_user_id || null]
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

  linkLineUser: async (id, lineUserId) => {
    if (usePostgres) {
      await pgPool.query('UPDATE users SET line_user_id = $1 WHERE id = $2', [lineUserId, id]);
    } else {
      const data = readDB();
      const u = data.users.find(x => x.id === id);
      if (u) u.line_user_id = lineUserId;
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
        LEFT JOIN users u ON b.user_id = u.id
        LEFT JOIN cars c ON b.car_id = c.id
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
        driver: row.driver || '',
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
          carModel: car ? `${car.model} (${car.color})` : (b.carId ? 'ไม่พบข้อมูลรถยนต์' : null),
          carImage: car ? car.image : ''
        };
      });
    }
  },

  saveBooking: async (booking) => {
    if (usePostgres) {
      await pgPool.query(
        'INSERT INTO bookings (id, user_id, car_id, start_time, end_time, purpose, destination, passengers, status, notes, approved_by, driver) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [booking.id, booking.userId, booking.carId, booking.startTime, booking.endTime, booking.purpose, booking.destination, booking.passengers, booking.status, booking.notes, booking.approvedBy, booking.driver || '']
      );
    } else {
      const data = readDB();
      data.bookings.push(booking);
      writeDB(data);
    }
  },

  updateBookingStatus: async (id, status, notes, approvedBy, carId = undefined, driver = undefined) => {
    if (usePostgres) {
      if (carId !== undefined || driver !== undefined) {
        if (carId !== undefined && driver !== undefined) {
          await pgPool.query(
            'UPDATE bookings SET status = $1, notes = $2, approved_by = $3, car_id = $4, driver = $5 WHERE id = $6',
            [status, notes, approvedBy, carId, driver, id]
          );
        } else if (carId !== undefined) {
          await pgPool.query(
            'UPDATE bookings SET status = $1, notes = $2, approved_by = $3, car_id = $4 WHERE id = $5',
            [status, notes, approvedBy, carId, id]
          );
        } else {
          await pgPool.query(
            'UPDATE bookings SET status = $1, notes = $2, approved_by = $3, driver = $4 WHERE id = $5',
            [status, notes, approvedBy, driver, id]
          );
        }
      } else {
        await pgPool.query(
          'UPDATE bookings SET status = $1, notes = $2, approved_by = $3 WHERE id = $4',
          [status, notes, approvedBy, id]
        );
      }
    } else {
      const data = readDB();
      const b = data.bookings.find(x => x.id === id);
      if (b) {
        b.status = status;
        b.notes = notes;
        b.approvedBy = approvedBy;
        if (carId !== undefined) b.carId = carId;
        if (driver !== undefined) b.driver = driver;
      }
      writeDB(data);
    }
  },

  resetSystem: async () => {
    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE bookings CASCADE');
        await client.query("DELETE FROM users WHERE username NOT IN ('admin', 'scheduler', 'user')");
        await client.query("UPDATE cars SET status = 'available'");
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const data = readDB();
      data.bookings = [];
      data.users = data.users.filter(u => ['admin', 'scheduler', 'user'].includes(u.username));
      data.cars.forEach(c => {
        c.status = 'available';
      });
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
        line_user_id VARCHAR(100) UNIQUE,
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
        driver VARCHAR(100) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure driver column exists on existing PostgreSQL databases
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver VARCHAR(100) DEFAULT '';");

    // Ensure line_user_id column exists on existing PostgreSQL databases
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(100) UNIQUE;");

    // Ensure car_id column is nullable on existing PostgreSQL databases
    await client.query("ALTER TABLE bookings ALTER COLUMN car_id DROP NOT NULL;");

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

const sendNotification = async (type, recipient, subject, messageText) => {
  // Email and LINE notification functionality has been removed
};

const getBangkokTodayString = () => {
  const tzDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const sendDailyBookingsToLINE = async () => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!token || !groupId) {
    console.error("LINE group notification failed: LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID is not configured in environment variables.");
    return { success: false, message: "LINE credentials not configured in environment variables." };
  }

  try {
    const bookings = await db.getBookings();
    const todayStr = getBangkokTodayString();
    
    // Filter bookings starting today (Bangkok timezone) that are approved
    const todayBookings = bookings.filter(b => {
      if (b.status !== 'approved') return false;
      const bDate = new Date(b.startTime);
      const bTzStr = new Date(bDate.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const y = bTzStr.getFullYear();
      const m = String(bTzStr.getMonth() + 1).padStart(2, '0');
      const d = String(bTzStr.getDate()).padStart(2, '0');
      const bDateStr = `${y}-${m}-${d}`;
      return bDateStr === todayStr;
    });

    // Format Thai date for message
    const formattedDate = formatThaiDate(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })));
    
    let messageText = `🚗 รายงานรายการจองรถยนต์วันนี้ (${formattedDate})\n\n`;
    
    if (todayBookings.length === 0) {
      messageText += `ไม่มีรายการจองรถยนต์ที่ได้รับการอนุมัติในวันนี้`;
    } else {
      todayBookings.forEach((b, idx) => {
        const startHour = b.startTime.split('T')[1]?.substring(0, 5) || '';
        const endHour = b.endTime.split('T')[1]?.substring(0, 5) || '';
        messageText += `${idx + 1}. เวลา: ${startHour} - ${endHour} น.\n`;
        messageText += `   รถยนต์: ${b.carModel}\n`;
        messageText += `   วัตถุประสงค์: ${b.purpose}\n`;
        messageText += `   คนขับ: ${b.driver || 'ไม่ระบุ'}\n`;
        messageText += `   ผู้ขอจอง: ${b.userName}\n\n`;
      });
      messageText = messageText.trim();
    }

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: messageText }]
      })
    });

    if (response.ok) {
      console.log("Daily bookings LINE notification sent successfully.");
      return { success: true, message: "Notification sent successfully.", count: todayBookings.length };
    } else {
      const errText = await response.text();
      console.error(`LINE API push message failed: ${response.status} ${errText}`);
      return { success: false, message: `LINE API error: ${response.status} ${errText}` };
    }
  } catch (err) {
    console.error("Error sending daily bookings LINE notification:", err);
    return { success: false, message: err.message };
  }
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

const checkDriverOverlap = (driver, startTime, endTime, bookings, excludeBookingId = null) => {
  if (!driver || !driver.trim()) return false;
  const start = new Date(startTime);
  const end = new Date(endTime);

  return bookings.some(b => {
    if (!b.driver || b.driver.trim() !== driver.trim()) return false;
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
      status: user.status,
      lineUserId: user.line_user_id || null
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถโหลดข้อมูลสิทธิ์ผู้ใช้ได้' });
  }
});

// Link LINE account
app.post('/api/auth/link-line', authenticateToken, async (req, res) => {
  const { lineUserId } = req.body;
  if (!lineUserId || !lineUserId.trim()) {
    return res.status(400).json({ message: 'กรุณาระบุ LINE User ID' });
  }

  try {
    const users = await db.getUsers();
    const existingUser = users.find(u => u.line_user_id === lineUserId.trim() && u.id !== req.user.id);
    if (existingUser) {
      return res.status(400).json({ message: `LINE User ID นี้ถูกใช้ผูกบัญชีกับผู้ใช้อื่นแล้ว (${existingUser.name})` });
    }

    await db.linkLineUser(req.user.id, lineUserId.trim());
    res.json({ message: 'เชื่อมโยงบัญชี LINE ของคุณสำเร็จแล้ว!' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'ไม่สามารถเชื่อมโยงบัญชี LINE ได้' });
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
  const { carId, startTime, endTime, purpose, driver } = req.body;

  if (!startTime || !endTime || !purpose) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลการจองให้ครบถ้วน' });
  }

  try {
    const bookings = await db.getBookings();
    let selectedCar = null;

    if (carId && carId.trim()) {
      const cars = await db.getCars();
      selectedCar = cars.find(c => c.id === carId);

      if (!selectedCar) return res.status(404).json({ message: 'ไม่พบข้อมูลรถยนต์ที่ระบุ' });
      if (selectedCar.status === 'maintenance') {
        return res.status(400).json({ message: 'ขออภัย รถยนต์คันนี้อยู่ระหว่างการซ่อมบำรุง' });
      }

      const isOverlapping = checkOverlap(carId, startTime, endTime, bookings);
      if (isOverlapping) {
        return res.status(400).json({ message: 'ขออภัย รถยนต์คันนี้มีผู้จองแล้วในช่วงเวลาดังกล่าว กรุณาเลือกเวลาอื่นหรือรถยนต์คันอื่น' });
      }
    }

    if (driver && driver.trim()) {
      const isDriverOverlapping = checkDriverOverlap(driver, startTime, endTime, bookings);
      if (isDriverOverlapping) {
        return res.status(400).json({ message: `ขออภัย พนักงานขับรถ (${driver}) ติดงานอื่นในช่วงเวลาดังกล่าว กรุณาเลือกพนักงานขับรถคนอื่นหรือเปลี่ยนเวลา` });
      }
    }

    const newBooking = {
      id: 'b_' + Date.now(),
      userId: req.user.id,
      carId: carId && carId.trim() ? carId : null,
      startTime,
      endTime,
      purpose,
      destination: '',
      passengers: 1,
      status: 'pending',
      notes: '',
      approvedBy: '',
      driver: driver || '',
      createdAt: new Date().toISOString()
    };

    await db.saveBooking(newBooking);

    // Notify Admins & Schedulers
    const users = await db.getUsers();
    const notifyList = users.filter(u => u.role === 'admin' || u.role === 'scheduler');
    const carInfoText = selectedCar ? `${selectedCar.model} (${selectedCar.color})` : 'รอการจัดสรรรถยนต์';
    for (const approver of notifyList) {
      await sendNotification(
        'email',
        approver.email,
        'คำขอจองรถยนต์ใหม่รอการอนุมัติ',
        `ผู้ขอจอง: ${req.user.name}\nรถยนต์: ${carInfoText}\nวันเวลา: ${formatThaiDateTime(startTime)} - ${formatThaiDateTime(endTime)}\nวัตถุประสงค์: ${purpose}\n\nกรุณาเข้าสู่ระบบเพื่อจัดการอนุมัติคำขอ`
      );
      await sendNotification(
        'line',
        approver.id,
        '🚗 คำขอจองรถยนต์ใหม่ (รออนุมัติ)',
        `ผู้ขอ: ${req.user.name}\nรถ: ${carInfoText}\nเวลา: ${formatThaiDateTime(startTime)} ถึง ${formatThaiDateTime(endTime)}\nวัตถุประสงค์: ${purpose}`
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
  const { notes, carId, driver } = req.body;

  try {
    const bookings = await db.getBookings();
    const booking = bookings.find(b => b.id === id);

    if (!booking) return res.status(404).json({ message: 'ไม่พบข้อมูลการจอง' });

    // Determine final car and driver
    const finalCarId = carId !== undefined ? (carId && carId.trim() ? carId : null) : booking.carId;
    const finalDriver = driver !== undefined ? driver : booking.driver;

    if (!finalCarId) {
      return res.status(400).json({ message: 'ไม่สามารถอนุมัติได้เนื่องจากยังไม่ได้ระบุรถยนต์ กรุณาเลือกจัดสรรรถยนต์ก่อนกดยืนยันอนุมัติ' });
    }

    // Check overlap for finalCarId
    const isOverlapping = checkOverlap(finalCarId, booking.startTime, booking.endTime, bookings, booking.id);
    if (isOverlapping) {
      return res.status(400).json({ message: 'ไม่สามารถอนุมัติได้เนื่องจากมีรายการจองรถยนต์คันนี้ในช่วงเวลาเดียวกันได้รับการอนุมัติแล้ว' });
    }

    // Check overlap for finalDriver
    if (finalDriver && finalDriver.trim()) {
      const isDriverOverlapping = checkDriverOverlap(finalDriver, booking.startTime, booking.endTime, bookings, booking.id);
      if (isDriverOverlapping) {
        return res.status(400).json({ message: `ไม่สามารถอนุมัติได้เนื่องจากพนักงานขับรถ (${finalDriver}) ติดงานอื่นในช่วงเวลาเดียวกัน` });
      }
    }

    const noteText = notes || 'ได้รับการอนุมัติ';
    await db.updateBookingStatus(id, 'approved', noteText, req.user.name, finalCarId, finalDriver);

    // Notify User
    const cars = await db.getCars();
    const car = cars.find(c => c.id === finalCarId);
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
        `รถ: ${car ? car.model : ''}\nเวลา: ${formatThaiDateTime(booking.startTime)}\nคนขับ: ${finalDriver || 'ไม่ระบุ'}\nผู้อนุมัติ: ${req.user.name}\nหมายเหตุ: ${noteText}`
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

// Admin reset system database
app.post('/api/admin/reset-system', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.resetSystem();
    res.json({ message: 'ล้างข้อมูลในระบบและสิทธิ์ผู้ใช้งานทั้งหมดเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'เกิดข้อผิดพลาดในการล้างระบบข้อมูล' });
  }
});



// --- LINE WEBHOOK AND TEXT BOOKING PARSER ---

const sendLINEReply = async (replyToken, messageText) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN not configured");
    return;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text: messageText }]
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`LINE reply API failed: ${res.status} ${txt}`);
    }
  } catch (err) {
    console.error("Error sending LINE reply:", err);
  }
};

const parseLINEBookingText = (text) => {
  const lineText = text.trim();
  
  // 1. Parse Date
  let dateStr = getBangkokTodayString(); // Default to today
  const inlineDateRegex = /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/;
  const inlineDateMatch = lineText.match(inlineDateRegex);
  let cleanedText = lineText;
  
  if (inlineDateMatch) {
    const d = parseInt(inlineDateMatch[1]);
    const m = parseInt(inlineDateMatch[2]);
    let y = parseInt(inlineDateMatch[3]);
    if (y > 2400) y -= 543; // Convert B.E. to A.D.
    dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cleanedText = cleanedText.replace(inlineDateMatch[0], '');
  }

  // 2. Parse Time
  let startTime = '08:00';
  let endTime = '10:00';
  const rangeRegex = /(?:เวลา\s*)?(\d{1,2})[\.:](\d{2})\s*(?:-|ถึง)\s*(\d{1,2})[\.:](\d{2})\s*(?:น\.)?/;
  const rangeMatch = cleanedText.match(rangeRegex);
  
  if (rangeMatch) {
    startTime = `${String(rangeMatch[1]).padStart(2, '0')}:${rangeMatch[2]}`;
    endTime = `${String(rangeMatch[3]).padStart(2, '0')}:${rangeMatch[4]}`;
    cleanedText = cleanedText.replace(rangeMatch[0], '');
  } else {
    const singleTimeRegex = /(?:เวลา\s*)?(\d{1,2})[\.:](\d{2})\s*(?:น\.)?/;
    const singleMatch = cleanedText.match(singleTimeRegex);
    if (singleMatch) {
      startTime = `${String(singleMatch[1]).padStart(2, '0')}:${singleMatch[2]}`;
      let endHour = parseInt(singleMatch[1]) + 2;
      if (endHour > 23) endHour = 23;
      endTime = `${String(endHour).padStart(2, '0')}:${singleMatch[2]}`;
      cleanedText = cleanedText.replace(singleMatch[0], '');
    }
  }

  // 3. Match Car
  let matchedCarId = null;
  const carsMapping = [
    { id: 'car1', keywords: ['รถตู้ขาว', 'ตู้ขาว', 'ฮร 8010', '8010'] },
    { id: 'car2', keywords: ['รถตู้เทา', 'ตู้เทา', 'ฮย 1906', '1906'] },
    { id: 'car3', keywords: ['ยาริส', 'เก๋งเทา', '6249'] },
    { id: 'car4', keywords: ['เชฟ', 'เชฟโรเลต', '8709'] },
    { id: 'car5', keywords: ['อัลพาร์ด', 'alphard', '6276'] }
  ];

  for (const car of carsMapping) {
    for (const kw of car.keywords) {
      if (cleanedText.toLowerCase().includes(kw.toLowerCase())) {
        matchedCarId = car.id;
        const kwRegex = new RegExp(kw, 'gi');
        cleanedText = cleanedText.replace(kwRegex, '');
        break;
      }
    }
    if (matchedCarId) break;
  }

  // 4. Match Driver
  let matchedDriver = '';
  const driversList = [
    'นายสุรศักดิ์ ชาแท่น',
    'นายสุระเชษฐ วิบูลพันธุ์',
    'นายวิไล พลรักษา',
    'นายเฉลิมพล ชมเชย'
  ];

  for (const drv of driversList) {
    const firstName = drv.split(' ')[0];
    if (cleanedText.includes(drv) || cleanedText.includes(firstName)) {
      matchedDriver = drv;
      cleanedText = cleanedText.replace(drv, '').replace(firstName, '');
      break;
    }
  }

  // 5. Purpose
  let purpose = cleanedText
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s\-:|]+|[,.\s\-:|]+$/g, '')
    .trim();

  if (!purpose) purpose = 'จองรถผ่าน LINE';

  return {
    carId: matchedCarId,
    startTime: `${dateStr}T${startTime}`,
    endTime: `${dateStr}T${endTime}`,
    purpose,
    driver: matchedDriver
  };
};

app.post('/api/line/webhook', async (req, res) => {
  const { events } = req.body;
  if (!events || events.length === 0) {
    return res.sendStatus(200);
  }

  const event = events[0];
  if (event.type !== 'message' || event.message.type !== 'text') {
    return res.sendStatus(200);
  }

  const replyToken = event.replyToken;
  const lineText = event.message.text.trim();
  const lineUserId = event.source.userId;

  // Simple "id" trigger
  if (lineText.toLowerCase() === 'id') {
    await sendLINEReply(replyToken, `LINE User ID ของคุณคือ:\n${lineUserId}`);
    return res.sendStatus(200);
  }

  try {
    const users = await db.getUsers();
    const user = users.find(u => u.line_user_id === lineUserId);

    if (!user) {
      const replyMsg = `⚠️ **ยังไม่ได้ผูกบัญชี LINE กับระบบจองรถ**\n\nรหัส LINE User ID ของคุณคือ:\n${lineUserId}\n\n👉 **วิธีเปิดสิทธิ์จอง:**\nกรุณาคัดลอกรหัสนี้ไปใส่ในหน้าเว็บแอป (ปุ่ม "🔗 ผูกบัญชี LINE" ด้านขวาบน) เพื่อยืนยันตัวตนก่อนจองค่ะ`;
      await sendLINEReply(replyToken, replyMsg);
      return res.sendStatus(200);
    }

    const cars = await db.getCars();
    const parsed = parseLINEBookingText(lineText);

    // Verify times
    const start = new Date(parsed.startTime);
    const end = new Date(parsed.endTime);
    if (start >= end) {
      await sendLINEReply(replyToken, `❌ จองรถไม่สำเร็จ: เวลาเริ่มต้นเดินทางต้องอยู่ก่อนเวลาสิ้นสุดเดินทางค่ะ`);
      return res.sendStatus(200);
    }

    // Overlap checks (only run if car/driver specified)
    const bookings = await db.getBookings();
    if (parsed.carId) {
      const isOverlapping = checkOverlap(parsed.carId, parsed.startTime, parsed.endTime, bookings);
      if (isOverlapping) {
        const car = cars.find(c => c.id === parsed.carId);
        await sendLINEReply(replyToken, `❌ จองรถไม่สำเร็จ: ขออภัย รถยนต์ (${car ? car.model : ''}) มีผู้จองแล้วในช่วงเวลาดังกล่าว กรุณาเลือกเวลาอื่นหรือเปลี่ยนคันค่ะ`);
        return res.sendStatus(200);
      }
    }

    if (parsed.driver) {
      const isDriverOverlapping = checkDriverOverlap(parsed.driver, parsed.startTime, parsed.endTime, bookings);
      if (isDriverOverlapping) {
        await sendLINEReply(replyToken, `❌ จองรถไม่สำเร็จ: ขออภัย คนขับ (${parsed.driver}) ติดงานอื่นในช่วงเวลาดังกล่าว กรุณาเลือกเวลาอื่นหรือเปลี่ยนคนขับค่ะ`);
        return res.sendStatus(200);
      }
    }

    const newBooking = {
      id: 'b_' + Date.now(),
      userId: user.id,
      carId: parsed.carId,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      purpose: parsed.purpose,
      destination: '',
      passengers: 1,
      status: 'pending',
      notes: '',
      approvedBy: '',
      driver: parsed.driver,
      createdAt: new Date().toISOString()
    };

    await db.saveBooking(newBooking);

    // Format reply message
    const formattedDate = formatThaiDate(parsed.startTime.split('T')[0]);
    const startHour = parsed.startTime.split('T')[1];
    const endHour = parsed.endTime.split('T')[1];
    const car = parsed.carId ? cars.find(c => c.id === parsed.carId) : null;
    
    let confirmMsg = `✅ ส่งคำขอจองรถยนต์สำเร็จแล้ว! (รออนุมัติ)\n`;
    confirmMsg += `👤 ผู้จอง: ${user.name}\n`;
    confirmMsg += `📅 วันเดินทาง: ${formattedDate}\n`;
    confirmMsg += `⏰ เวลา: ${startHour} - ${endHour} น.\n`;
    confirmMsg += `🚗 รถยนต์: ${car ? car.model : '⏳ รอเจ้าหน้าที่จัดสรรรถยนต์'}\n`;
    confirmMsg += `👤 คนขับ: ${parsed.driver || '⏳ รอเจ้าหน้าที่จัดสรรคนขับ'}\n`;
    confirmMsg += `📝 วัตถุประสงค์: ${parsed.purpose}`;

    await sendLINEReply(replyToken, confirmMsg);
  } catch (err) {
    console.error("Webhook processing error:", err);
    await sendLINEReply(replyToken, `❌ เกิดข้อผิดพลาดของระบบ: ไม่สามารถบันทึกการจองได้ในขณะนี้`);
  }

  res.sendStatus(200);
});

// Expose public API route for manual or external cron triggers
app.get('/api/cron/daily-send', async (req, res) => {
  // Option: verify key to prevent spam
  const secretKey = req.query.key;
  if (process.env.CRON_KEY && secretKey !== process.env.CRON_KEY) {
    return res.status(401).json({ message: 'Unauthorized: invalid cron key' });
  }

  const result = await sendDailyBookingsToLINE();
  if (result.success) {
    res.json({ message: 'Daily LINE notification triggered successfully', data: result });
  } else {
    res.status(500).json({ message: 'Failed to send daily LINE notification', error: result });
  }
});

// Register the local cron schedule at 08:30 AM Asia/Bangkok time
cron.schedule('30 8 * * *', async () => {
  console.log('Running daily scheduled LINE notification at 8:30 AM Bangkok Time...');
  await sendDailyBookingsToLINE();
}, {
  scheduled: true,
  timezone: "Asia/Bangkok"
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

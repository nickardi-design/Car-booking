const getBaseApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return 'http://localhost:5000/api';
  const cleanedUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  return `${cleanedUrl}/api`;
};

const API_URL = getBaseApiUrl();

// Get stored token
export const getToken = () => localStorage.getItem('booking_token');

// Save token
export const setToken = (token) => {
  if (token) {
    localStorage.setItem('booking_token', token);
  } else {
    localStorage.removeItem('booking_token');
  }
};

// Remove token / Logout
export const logout = () => {
  localStorage.removeItem('booking_token');
  localStorage.removeItem('booking_user');
};

// Get stored user details
export const getStoredUser = () => {
  try {
    const userStr = localStorage.getItem('booking_user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

// Save user details
export const setStoredUser = (user) => {
  if (user) {
    localStorage.setItem('booking_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('booking_user');
  }
};

// Base Fetch Wrapper
const request = async (endpoint, options = {}) => {
  const token = getToken();
  
  // Cache busting for GET requests to prevent aggressive browser caching (especially on Safari/mobile)
  let url = `${API_URL}${endpoint}`;
  if (options.method === 'GET' || !options.method) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}_t=${Date.now()}`;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }

  return data;
};

// API Functions
export const api = {
  // Auth
  login: async (username, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    return data;
  },

  register: (username, email, password, name) => {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, name }),
    });
  },

  getMe: async () => {
    const user = await request('/auth/me');
    setStoredUser(user);
    return user;
  },

  // Cars
  getCars: () => request('/cars'),
  updateCarStatus: (id, status) => {
    return request(`/cars/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Bookings
  getBookings: () => request('/bookings'),
  createBooking: (bookingData) => {
    return request('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  },
  cancelBooking: (id) => {
    return request(`/bookings/${id}/cancel`, {
      method: 'POST',
    });
  },
  approveBooking: (id, notes, carId = undefined, driver = undefined) => {
    return request(`/bookings/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes, carId, driver }),
    });
  },
  rejectBooking: (id, notes) => {
    return request(`/bookings/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  // Admin User Management
  getUsers: () => request('/admin/users'),
  approveUser: (id) => {
    return request(`/admin/users/${id}/approve`, {
      method: 'POST',
    });
  },
  suspendUser: (id) => {
    return request(`/admin/users/${id}/suspend`, {
      method: 'POST',
    });
  },
  changeRole: (id, role) => {
    return request(`/admin/users/${id}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },
  resetSystem: () => {
    return request('/admin/reset-system', {
      method: 'POST',
    });
  },
  linkLineUser: (lineUserId) => {
    return request('/auth/line-links', {
      method: 'POST',
      body: JSON.stringify({ lineUserId }),
    });
  },
  addLineLink: (lineUserId) => {
    return request('/auth/line-links', {
      method: 'POST',
      body: JSON.stringify({ lineUserId }),
    });
  },
  deleteLineLink: (id) => {
    return request(`/auth/line-links/${id}`, {
      method: 'DELETE',
    });
  },
};

// Date Format Helpers (Thai locale)
export const formatThaiDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
};

export const formatThaiDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' น.';
};

export const getCarIcon = (type) => {
  switch (type) {
    case 'van': return '🚐';
    case 'sedan': return '🚗';
    case 'suv': return '🚙';
    case 'luxury': return '✨';
    default: return '🚗';
  }
};

export const generateICSFileLink = (booking) => {
  const formatTimeICS = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const pad = (num) => String(num).padStart(2, '0');
    
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const s = pad(date.getUTCSeconds());
    
    return `${y}${m}${d}T${h}${min}${s}Z`;
  };

  const start = formatTimeICS(booking.startTime);
  const end = formatTimeICS(booking.endTime);
  const now = formatTimeICS(new Date().toISOString());
  
  const getIcon = (carModel, carImage) => {
    const model = (carModel || '').toLowerCase();
    const img = (carImage || '').toLowerCase();
    if (model.includes('ตู้') || img.includes('van') || img.includes('alphard')) return '🚐';
    if (model.includes('ยาริส') || img.includes('yaris') || img.includes('sedan')) return '🚗';
    if (model.includes('เชฟ') || img.includes('chev') || img.includes('suv')) return '🚙';
    return '🚐';
  };
  const icon = getIcon(booking.carModel, booking.carImage);
  const driverName = booking.driver || 'ไม่ระบุคนขับ';
  const modelName = booking.carModel || 'ไม่ระบุรถยนต์';
  const purposeText = booking.purpose || '';
  const title = `${icon} ${driverName} ${modelName} ${purposeText}`.trim();
  const details = `วัตถุประสงค์: ${booking.purpose}\\nผู้จอง: ${booking.userName}\\nผู้อนุมัติ: ${booking.approvedBy || 'ไม่ระบุ'}\\nคนขับ: ${booking.driver || 'ไม่ระบุ'}`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity Car Booking//NONSGML v1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking_${booking.id}@carbooking.local`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const icsContent = icsLines.join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
};

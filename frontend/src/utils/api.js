const API_URL = 'http://localhost:5000/api';

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
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
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
  approveBooking: (id, notes) => {
    return request(`/bookings/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
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

  // Settings & Logs
  getNotificationLogs: () => request('/notifications'),
  getSettings: () => request('/settings'),
  saveSettings: (settingsData) => {
    return request('/settings', {
      method: 'POST',
      body: JSON.stringify(settingsData),
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

export const generateGoogleCalendarLink = (booking) => {
  const formatTime = (isoString) => {
    // Format: YYYYMMDDTHHmmss
    const date = new Date(isoString);
    const pad = (num) => String(num).padStart(2, '0');
    
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    
    return `${y}${m}${d}T${h}${min}00`;
  };

  const title = `🚗 จองรถ: ${booking.carModel}`;
  const dates = `${formatTime(booking.startTime)}/${formatTime(booking.endTime)}`;
  const details = `วัตถุประสงค์: ${booking.purpose}\nผู้เดินทาง: ${booking.userName} (${booking.passengers} คน)\nผู้อนุมัติ: ${booking.approvedBy || 'ไม่ระบุ'}`;
  const location = booking.destination;

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
};


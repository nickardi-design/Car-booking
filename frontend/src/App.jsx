import React, { useState, useEffect } from 'react';
import { api, formatThaiDate, formatThaiDateTime, getCarIcon, generateGoogleCalendarLink } from './utils/api';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState('dark');

  // Auth States
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('booking_token') || '');
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  
  // Auth Form States
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'my-bookings' | 'admin' | 'settings'
  const [adminSubTab, setAdminSubTab] = useState('booking-requests'); // 'booking-requests' | 'user-activation' | 'car-status'
  
  // Data States
  const [cars, setCars] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [notificationLogs, setNotificationLogs] = useState([]);
  const [settings, setSettings] = useState({
    smtp: { host: '', port: '587', secure: false, user: '', pass: '', from: 'noreply@carbooking.com' },
    line: { channelAccessToken: '', channelSecret: '', adminUserId: '' }
  });
  
  // App UI/Interaction States
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedCar, setSelectedCar] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [bookingToReject, setBookingToReject] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');
  
  // Booking Form States
  const [bookingStart, setBookingStart] = useState('');
  const [bookingEnd, setBookingEnd] = useState('');
  const [bookingPurpose, setBookingPurpose] = useState('');
  const [bookingDestination, setBookingDestination] = useState('');
  const [bookingPassengers, setBookingPassengers] = useState(1);
  
  // Toast notifications
  const [toasts, setToasts] = useState([]);
  
  // Global loading
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Add Toast helper
  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Toggle Theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    const body = document.body;
    if (newTheme === 'light') {
      body.classList.add('light-mode');
    } else {
      body.classList.remove('light-mode');
    }
  };

  // Load Initial Data if logged in
  useEffect(() => {
    if (token) {
      fetchUserData();
      fetchDashboardData();
    }
  }, [token]);

  // Periodic updates for booking lists & logs (every 10 seconds)
  useEffect(() => {
    let interval;
    if (token) {
      interval = setInterval(() => {
        api.getBookings().then(setBookings).catch(console.error);
        api.getNotificationLogs().then(setNotificationLogs).catch(console.error);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [token]);

  const fetchUserData = async () => {
    try {
      const userMe = await api.getMe();
      setUser(userMe);
    } catch (err) {
      handleLogout();
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const fetchedCars = await api.getCars();
      setCars(fetchedCars);
      
      const fetchedBookings = await api.getBookings();
      setBookings(fetchedBookings);
      
      const logs = await api.getNotificationLogs();
      setNotificationLogs(logs);
    } catch (err) {
      setErrorMsg(err.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    if (user?.role !== 'admin' && user?.role !== 'scheduler') return;
    try {
      if (user.role === 'admin') {
        const fetchedUsers = await api.getUsers();
        setUsers(fetchedUsers);
        
        const fetchedSettings = await api.getSettings();
        setSettings(fetchedSettings);
      }
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Trigger admin load when tab changes
  useEffect(() => {
    if (activeTab === 'admin' || activeTab === 'settings') {
      fetchAdminData();
    }
  }, [activeTab]);

  // --- ACTIONS ---

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.login(username, password);
      setToken(res.token);
      setUser(res.user);
      addToast(`ยินดีต้อนรับคุณ ${res.user.name}`, 'success');
      // Reset form
      setUsername('');
      setPassword('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.register(username, email, password, name);
      addToast(res.message, 'success');
      setAuthView('login');
      // Reset registration form
      setUsername('');
      setEmail('');
      setPassword('');
      setName('');
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken('');
    api.logout();
    addToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  };

  // Submit Booking request
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const startDateTime = `${selectedDate}T${bookingStart}`;
      const endDateTime = `${selectedDate}T${bookingEnd}`;
      
      // Basic check
      if (new Date(startDateTime) >= new Date(endDateTime)) {
        addToast('เวลาเริ่มต้นต้องอยู่ก่อนเวลาสิ้นสุด', 'danger');
        setLoading(false);
        return;
      }

      await api.createBooking({
        carId: selectedCar.id,
        startTime: startDateTime,
        endTime: endDateTime,
        purpose: bookingPurpose,
        destination: bookingDestination,
        passengers: bookingPassengers
      });

      addToast('ส่งคำขอจองสำเร็จแล้ว! กรุณารอเจ้าหน้าที่จัดคิวอนุมัติ', 'success');
      setShowBookingModal(false);
      
      // Reset Form fields
      setBookingStart('');
      setBookingEnd('');
      setBookingPurpose('');
      setBookingDestination('');
      setBookingPassengers(1);

      // Refresh Data
      fetchDashboardData();
    } catch (err) {
      addToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm('คุณต้องการยกเลิกรายการจองรถยนต์คันนี้ใช่หรือไม่?')) return;
    try {
      const res = await api.cancelBooking(id);
      addToast(res.message, 'success');
      fetchDashboardData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin/Scheduler Approve Booking
  const handleApproveBooking = async (id) => {
    const notes = prompt('ใส่หมายเหตุการอนุมัติ (ตัวเลือก):') || '';
    try {
      const res = await api.approveBooking(id, notes);
      addToast(res.message, 'success');
      fetchDashboardData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin/Scheduler Reject Booking
  const openRejectModal = (booking) => {
    setBookingToReject(booking);
    setRejectNotes('');
    setShowRejectModal(true);
  };

  const handleRejectBooking = async () => {
    if (!rejectNotes) {
      addToast('กรุณาระบุเหตุผลการปฏิเสธคำขอจอง', 'danger');
      return;
    }
    try {
      const res = await api.rejectBooking(bookingToReject.id, rejectNotes);
      addToast(res.message, 'success');
      setShowRejectModal(false);
      fetchDashboardData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin Approve User Registration
  const handleApproveUser = async (userId) => {
    try {
      const res = await api.approveUser(userId);
      addToast(res.message, 'success');
      fetchAdminData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin Suspend User
  const handleSuspendUser = async (userId) => {
    if (!window.confirm('ต้องการระงับการใช้งานบัญชีนี้ชั่วคราว?')) return;
    try {
      const res = await api.suspendUser(userId);
      addToast(res.message, 'success');
      fetchAdminData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin Change User Role
  const handleChangeRole = async (userId, currentRole) => {
    const newRole = currentRole === 'user' ? 'scheduler' : currentRole === 'scheduler' ? 'admin' : 'user';
    try {
      const res = await api.changeRole(userId, newRole);
      addToast(res.message, 'success');
      fetchAdminData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin Update Car Status
  const handleToggleCarStatus = async (carId, currentStatus) => {
    const newStatus = currentStatus === 'available' ? 'maintenance' : 'available';
    try {
      const res = await api.updateCarStatus(carId, newStatus);
      addToast(res.message, 'success');
      fetchDashboardData();
    } catch (err) {
      addToast(err.message, 'danger');
    }
  };

  // Admin Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.saveSettings(settings);
      addToast('บันทึกข้อมูลการเชื่อมต่อ Line & Email เรียบร้อย', 'success');
    } catch (err) {
      addToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // --- RENDERING HELPERS & DATA PARSING ---

  // Overlap percentages calculation for Gantt Timeline chart
  // Start from 06:00 (6 AM) to 22:00 (10 PM) -> 16 hours duration
  const renderBookingBlocks = (carId) => {
    const startHourLimit = 0;
    const endHourLimit = 24;
    const totalHours = endHourLimit - startHourLimit;

    // Filter bookings for this car on selected Date and approved/pending
    const dayBookings = bookings.filter(b => {
      if (b.carId !== carId) return false;
      if (b.status === 'rejected' || b.status === 'cancelled') return false;

      // Booking start/end dates matches selected date
      const bStartDay = b.startTime.split('T')[0];
      const bEndDay = b.endTime.split('T')[0];
      return bStartDay === selectedDate || bEndDay === selectedDate;
    });

    return dayBookings.map(b => {
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);

      // Extract hours & minutes as decimals relative to start of timeline (6:00 AM)
      const startHour = bStart.getHours() + bStart.getMinutes() / 60;
      const endHour = bEnd.getHours() + bEnd.getMinutes() / 60;

      // Clamp within timeline limits 06:00 - 22:00
      const leftHour = Math.max(startHourLimit, Math.min(endHourLimit, startHour));
      const rightHour = Math.max(startHourLimit, Math.min(endHourLimit, endHour));

      const leftPercent = ((leftHour - startHourLimit) / totalHours) * 100;
      const widthPercent = ((rightHour - leftHour) / totalHours) * 100;

      // Ignore zero width (e.g. fully outside timeline)
      if (widthPercent <= 0) return null;

      const startStr = b.startTime.split('T')[1].substring(0, 5);
      const endStr = b.endTime.split('T')[1].substring(0, 5);
      const isNarrow = widthPercent < 18;
      const isVeryNarrow = widthPercent < 8;
      const statusIcon = b.status === 'approved' ? '✓' : '⏳';

      return (
        <div
          key={b.id}
          className={`timeline-slot-bar ${b.status}`}
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
          onClick={() => addToast(`🚗 จองรถ: ${b.carModel} โดย: ${b.userName} (${b.purpose}) | เวลา ${startStr} - ${endStr} น.`, 'info')}
        >
          {isVeryNarrow ? (
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{statusIcon}</span>
          ) : isNarrow ? (
            <strong>{startStr}-{endStr}</strong>
          ) : (
            <span>
              <strong>{statusIcon} {startStr} - {endStr}</strong> | {b.userName} ({b.destination})
            </span>
          )}
        </div>
      );
    });
  };

  // Render auth screens (Login & Register)
  if (!token) {
    return (
      <div className="auth-container">
        {toasts.length > 0 && (
          <div className="toast-container">
            {toasts.map(t => (
              <div key={t.id} className={`toast border-${t.type}`}>
                <span>{t.type === 'success' ? '✅' : t.type === 'danger' ? '❌' : 'ℹ️'}</span>
                {t.message}
              </div>
            ))}
          </div>
        )}

        <div className="glass-panel auth-card">
          <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '20px' }}>
            🚐 ระบบจองรถยนต์ส่วนกลาง
          </div>

          {authView === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="auth-header-title">
                <h2>ลงชื่อเข้าใช้งาน</h2>
                <p>โปรดเข้าสู่ระบบเพื่อดำเนินการจองหรืออนุมัติคิวรถยนต์</p>
              </div>

              {errorMsg && <div style={{ color: 'var(--danger)', marginBottom: '15px', textAlign: 'center', fontWeight: '500' }}>{errorMsg}</div>}

              <div className="form-group">
                <label>ชื่อผู้ใช้งาน หรือ อีเมล</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="admin / user / scheduler"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>รหัสผ่าน</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="ระบุรหัสผ่านของคุณ"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                ยังไม่มีบัญชีใช่หรือไม่?{' '}
                <span onClick={() => { setAuthView('register'); setErrorMsg(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}>
                  ลงทะเบียนขอสิทธิ์ใช้งาน
                </span>
              </div>

              <div className="glass-panel" style={{ marginTop: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', fontSize: '0.85rem' }}>
                <p style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--primary)' }}>🔑 บัญชีทดสอบสำหรับการสาธิต:</p>
                <ul style={{ listStyleType: 'none', paddingLeft: '0', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)' }}>
                  <li>👤 <strong>Admin:</strong> <code>admin</code> / password123</li>
                  <li>📅 <strong>Scheduler:</strong> <code>scheduler</code> / password123</li>
                  <li>🚗 <strong>User:</strong> <code>user</code> / password123</li>
                </ul>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="auth-header-title">
                <h2>ลงทะเบียนผู้ใช้ใหม่</h2>
                <p>จำกัดระบบผู้ใช้งานอนุมัติไม่เกิน 30 คน</p>
              </div>

              {errorMsg && <div style={{ color: 'var(--danger)', marginBottom: '15px', textAlign: 'center', fontWeight: '500' }}>{errorMsg}</div>}

              <div className="form-group">
                <label>ชื่อ-นามสกุลจริง</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น นายธนาดี เจริญชัย"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>ชื่อผู้ใช้งาน (Username)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="ภาษาอังกฤษเท่านั้น เช่น thanadee"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>อีเมลติดต่อ (ใช้สำหรับส่งแจ้งเตือน)</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="เช่น user@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>รหัสผ่าน</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="กำหนดรหัสผ่านของคุณ"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
                {loading ? 'กำลังลงทะเบียน...' : 'ส่งคำขอสมัครสมาชิก'}
              </button>

              <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                มีบัญชีอยู่แล้ว?{' '}
                <span onClick={() => { setAuthView('login'); setErrorMsg(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}>
                  เข้าสู่ระบบที่นี่
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Loaded Application View
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Toast Notifications Panel */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast border-${t.type}`} style={{ borderLeft: `4px solid var(--${t.type})` }}>
              <span>
                {t.type === 'success' && '✅'}
                {t.type === 'danger' && '❌'}
                {t.type === 'warning' && '⚠️'}
                {t.type === 'info' && 'ℹ️'}
              </span>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* App Header */}
      <header className="app-header">
        <div className="logo-section">
          🚐 คลังยานพาหนะจองออนไลน์
        </div>

        <nav className="nav-links">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            🏠 แผงจองรถ
          </div>
          <div className={`nav-item ${activeTab === 'my-bookings' ? 'active' : ''}`} onClick={() => setActiveTab('my-bookings')}>
            📅 การจองของฉัน
          </div>
          {(user?.role === 'admin' || user?.role === 'scheduler') && (
            <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
              🛡️ จัดการคำขอจอง {bookings.filter(b => b.status === 'pending').length > 0 && <span style={{ background: 'var(--danger)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px' }}>{bookings.filter(b => b.status === 'pending').length}</span>}
            </div>
          )}
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            ⚙️ แจ้งเตือน & ตั้งค่า
          </div>
        </nav>

        <div className="user-profile-menu">
          <button className="btn btn-secondary" onClick={toggleTheme} style={{ padding: '8px 12px' }}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{user?.name}</span>
            <span className={`badge badge-${user?.role}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{user?.role}</span>
          </div>

          <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '8px 14px' }}>
            🚪 ออก
          </button>
        </div>
      </header>

      {/* Main View Grid Content */}
      <main style={{ flex: '1' }}>
        
        {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--primary)', fontWeight: '600' }}>กำลังโหลดข้อมูล...</div>}

        {/* 1. DASHBOARD VIEW */}
        {activeTab === 'dashboard' && !loading && (
          <div style={{ padding: '24px 4%', width: '100%', maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Daily Timeline Gantt Chart (Full Screen Width) */}
            <div className="glass-panel timeline-section" style={{ margin: '0' }}>
              <div className="timeline-header">
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>📅 ตารางเวลาจองรถยนต์วันนี้ (ครอบคลุม 24 ชม.)</h3>
                <div className="form-group" style={{ margin: '0', flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                  <label style={{ margin: '0' }}>ระบุวันที่:</label>
                  <input
                    type="date"
                    className="input-field"
                    style={{ padding: '6px 12px', width: 'auto' }}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="timeline-container">
                <div className="timeline-grid">
                  
                  {/* Time Label Header Row */}
                  <div className="timeline-time-labels">
                    <div style={{ padding: '8px 16px', borderRight: '1px solid var(--border-color)' }}>รุ่นรถยนต์ / สิทธิ์จอง</div>
                    <div className="timeline-time-labels-slots">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div 
                          key={i} 
                          style={{ 
                            fontSize: '0.65rem', 
                            display: 'flex', 
                            justifyContent: i === 23 ? 'space-between' : 'flex-start',
                            paddingLeft: '4px',
                            paddingRight: i === 23 ? '6px' : '0',
                            color: 'var(--text-muted)'
                          }}
                        >
                          <span>{i.toString().padStart(2, '0')}:00</span>
                          {i === 23 && <span>24:00</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Booking Blocks for Each Car */}
                  {cars.map(car => (
                    <div className="timeline-row" key={car.id}>
                      <div className="timeline-car-info">
                        <div>{getCarIcon(car.type)} {car.model}</div>
                        <span>สถานะ: {car.status === 'available' ? '🟢 พร้อมใช้' : '🔴 ซ่อมบำรุง'}</span>
                      </div>
                      <div className="timeline-slots">
                        {/* Render hour divisions subtle background line */}
                        <div className="timeline-time-labels-slots" style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0.06' }}>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div 
                              key={i} 
                              style={{ 
                                borderLeft: '1px solid var(--text-main)', 
                                borderRight: i === 23 ? '1px solid var(--text-main)' : 'none',
                                height: '80px' 
                              }} 
                            />
                          ))}
                        </div>
                        {renderBookingBlocks(car.id)}
                      </div>
                    </div>
                  ))}

                </div>
              </div>
            </div>

            {/* Bottom Section (2 Columns Grid) */}
            <div className="dashboard-bottom-grid">
              
              {/* Left Column: Cars Selection List */}
              <div className="glass-panel" style={{ margin: '0' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px' }}>🚗 รายการพาหนะในระบบจอง (ขนาด 5 คัน)</h3>
                <div className="car-card-container">
                  {cars.map(car => (
                    <div className="car-card" key={car.id}>
                      <div className="car-image-placeholder">
                        {getCarIcon(car.type)}
                      </div>
                      <h4 style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '4px' }}>{car.model}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>สีรถ: {car.color}</p>
                      
                      <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginTop: 'auto' }}>
                        <span className={`badge ${car.status === 'available' ? 'badge-approved' : 'badge-rejected'}`} style={{ fontSize: '0.7rem' }}>
                          {car.status === 'available' ? 'พร้อมให้บริการ' : 'อยู่ระหว่างปรับปรุง'}
                        </span>
                        
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.85rem', marginLeft: 'auto' }}
                          disabled={car.status !== 'available'}
                          onClick={() => {
                            setSelectedCar(car);
                            setBookingStart('08:00');
                            setBookingEnd('09:00');
                            setShowBookingModal(true);
                          }}
                        >
                          จองคันนี้
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Mini Statistics & Simulated Logs hub */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Quick Status Stats */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '16px' }}>📊 สรุปข้อมูลพาหนะวันนี้</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>จำนวนรถยนต์ทั้งหมด</span>
                      <strong style={{ fontSize: '1.1rem' }}>{cars.length} คัน</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>เปิดใช้พร้อมบริการ</span>
                      <strong style={{ color: 'var(--success)', fontSize: '1.1rem' }}>{cars.filter(c => c.status === 'available').length} คัน</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>รอการอนุมัติคิวจอง</span>
                      <strong style={{ color: 'var(--warning)', fontSize: '1.1rem' }}>{bookings.filter(b => b.status === 'pending').length} รายการ</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>อนุมัติการเดินทางวันนี้</span>
                      <strong style={{ color: 'var(--info)', fontSize: '1.1rem' }}>{bookings.filter(b => b.status === 'approved' && b.startTime.startsWith(new Date().toISOString().split('T')[0])).length} เที่ยว</strong>
                    </div>
                  </div>
                </div>

                {/* simulated notification widget */}
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '6px' }}>🔔 ข้อความจำลอง (Line / Email Logs)</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>ระบบจะส่งข้อความแจ้งเตือนหา Admin/User เสมือนจริง</p>
                  <div className="log-list" style={{ maxHeight: '300px' }}>
                    {notificationLogs.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>ยังไม่มีรายการจำลองส่งแจ้งเตือนในระบบ</div>
                    ) : (
                      notificationLogs.map(log => (
                        <div key={log.id} className="log-item">
                          <div className="log-item-header">
                            <span className="log-item-tag" style={{ color: log.type === 'line' ? '#06c755' : 'var(--info)' }}>
                              {log.type === 'line' ? '💬 LINE NOTIFY' : '📧 EMAIL MAIL'}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleTimeString('th-TH')} น.</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{log.subject}</div>
                          <div className="log-item-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.message}</div>
                          <span style={{ alignSelf: 'flex-end', fontSize: '0.7rem', color: log.status === 'sent' ? 'var(--success)' : 'var(--text-muted)' }}>
                            สถานะ: {log.status === 'sent' ? '✓ ส่งจริงสำเร็จ' : 'ℹ️ จำลองบนหน้าจอ'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* 2. MY BOOKINGS VIEW */}
        {activeTab === 'my-bookings' && !loading && (
          <div style={{ padding: '24px 5%', maxWidth: '1000px', margin: '0 auto' }}>
            <div className="glass-panel">
              <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '16px' }}>📅 รายการประวัติจองรถยนต์ของฉัน</h3>
              
              {bookings.filter(b => b.userId === user?.id).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  คุณยังไม่มีคำขอจองรถยนต์ในระบบ กดที่แถบ "แผงจองรถ" เพื่อทำเรื่องขออนุมัติจองได้ทันที
                </div>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>วันเดินทาง</th>
                        <th>รถยนต์ที่เลือก</th>
                        <th>ช่วงเวลาจอง</th>
                        <th>วัตถุประสงค์ / ปลายทาง</th>
                        <th>จำนวนผู้เดินทาง</th>
                        <th>สถานะการจอง</th>
                        <th>การอนุมัติ / หมายเหตุ</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.filter(b => b.userId === user?.id).map(b => (
                        <tr key={b.id}>
                          <td><strong>{formatThaiDate(b.startTime)}</strong></td>
                          <td>{getCarIcon(b.carImage ? b.carImage.replace(/[a-z_]+/g, 'van') : 'van')} {b.carModel}</td>
                          <td>{b.startTime.split('T')[1].substring(0, 5)} - {b.endTime.split('T')[1].substring(0, 5)} น.</td>
                          <td>
                            <div>{b.purpose}</div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ปลายทาง: {b.destination}</span>
                          </td>
                          <td>{b.passengers} คน</td>
                          <td>
                            <span className={`badge badge-${b.status}`}>
                              {b.status === 'pending' ? 'รอพิจารณา' : b.status === 'approved' ? 'อนุมัติแล้ว' : b.status === 'rejected' ? 'ปฏิเสธคำขอ' : 'ยกเลิกคำขอ'}
                            </span>
                          </td>
                          <td>
                            {b.status === 'approved' && <div style={{ fontSize: '0.8rem', color: 'var(--success)' }}>อนุมัติโดย: {b.approvedBy}</div>}
                            {b.status === 'rejected' && <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>เหตุผล: {b.notes}</div>}
                            {b.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>รอดำเนินการ</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '130px' }}>
                              {b.status === 'approved' && (
                                <a
                                  href={generateGoogleCalendarLink(b)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn"
                                  style={{ padding: '6px 10px', fontSize: '0.75rem', textDecoration: 'none', background: '#4285F4', color: '#ffffff', border: 'none', borderRadius: '8px', textAlign: 'center', fontWeight: '600', display: 'block' }}
                                >
                                  📅 เพิ่มลง Google
                                </a>
                              )}
                              {(b.status === 'pending' || b.status === 'approved') && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}
                                  onClick={() => handleCancelBooking(b.id)}
                                >
                                  ยกเลิกการจอง
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. ADMIN / SCHEDULER VIEW PANEL */}
        {activeTab === 'admin' && !loading && (user?.role === 'admin' || user?.role === 'scheduler') && (
          <div style={{ padding: '24px 5%', maxWidth: '1200px', margin: '0 auto' }}>
            <div className="glass-panel">
              
              {/* Header Selector for Admin Sub-Tabbing */}
              <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '700' }}>🛡️ แผงควบคุมผู้จัดการคิวรถยนต์และอนุมัติ</h3>
                <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                  <button
                    className={`btn ${adminSubTab === 'booking-requests' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                    onClick={() => setAdminSubTab('booking-requests')}
                  >
                    อนุมัติการจองรถ ({bookings.filter(b => b.status === 'pending').length})
                  </button>
                  {user?.role === 'admin' && (
                    <button
                      className={`btn ${adminSubTab === 'user-activation' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                      onClick={() => setAdminSubTab('user-activation')}
                    >
                      อนุมัติผู้ใช้งาน ({users.filter(u => u.status === 'pending').length})
                    </button>
                  )}
                  <button
                    className={`btn ${adminSubTab === 'car-status' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                    onClick={() => setAdminSubTab('car-status')}
                  >
                    ปรับปรุงสถานะรถยนต์
                  </button>
                </div>
              </div>

              {/* Sub-Tab 1: Booking Requests List */}
              {adminSubTab === 'booking-requests' && (
                <div>
                  <h4 style={{ fontWeight: '600', marginBottom: '10px' }}>📋 รายชื่อคำจองจองรถรอการตรวจสอบคิว</h4>
                  {bookings.filter(b => b.status === 'pending').length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      ยอดเยี่ยม! ยังไม่มีคำขอจองคิวรถยนต์ค้างรออนุมัติในระบบ
                    </div>
                  ) : (
                    <div className="admin-table-container">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>ผู้ขอจอง</th>
                            <th>ประเภท / รุ่นรถ</th>
                            <th>วันที่เดินทาง</th>
                            <th>ช่วงเวลา</th>
                            <th>ปลายทาง / วัตถุประสงค์</th>
                            <th>ผู้เดินทาง</th>
                            <th>อนุมัติ / ปฏิเสธ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings.filter(b => b.status === 'pending').map(b => (
                            <tr key={b.id}>
                              <td><strong>{b.userName}</strong></td>
                              <td>{b.carModel}</td>
                              <td>{formatThaiDate(b.startTime)}</td>
                              <td>{b.startTime.split('T')[1].substring(0, 5)} - {b.endTime.split('T')[1].substring(0, 5)} น.</td>
                              <td>
                                <div>{b.purpose}</div>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ไป: {b.destination}</span>
                              </td>
                              <td>{b.passengers} คน</td>
                              <td style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn btn-success"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  onClick={() => handleApproveBooking(b.id)}
                                >
                                  อนุมัติ
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  onClick={() => openRejectModal(b)}
                                >
                                  ปฏิเสธคำขอ
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-Tab 2: User Account Activation (Admin Only) */}
              {adminSubTab === 'user-activation' && user?.role === 'admin' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ fontWeight: '600' }}>👥 บัญชีผู้ใช้ในระบบทั้งหมด ({users.length} / 30 คน)</h4>
                    <span className="badge badge-pending" style={{ padding: '4px 10px' }}>
                      ผู้ใช้อนุมัติแล้ว: {users.filter(u => u.status === 'active').length} / 30 คน
                    </span>
                  </div>
                  
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>ชื่อ-นามสกุล</th>
                          <th>Username</th>
                          <th>อีเมล</th>
                          <th>สิทธิ์เข้าใช้</th>
                          <th>สถานะระบบ</th>
                          <th>การจัดการบัญชี</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id}>
                            <td><strong>{u.name}</strong> {u.id === user.id && <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>(บัญชีของคุณ)</span>}</td>
                            <td><code>{u.username}</code></td>
                            <td>{u.email}</td>
                            <td>
                              <span className={`badge badge-${u.role}`} style={{ marginRight: '8px' }}>{u.role}</span>
                              {u.id !== user.id && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                                  onClick={() => handleChangeRole(u.id, u.role)}
                                >
                                  สลับสิทธิ์
                                </button>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${u.status === 'active' ? 'badge-approved' : u.status === 'pending' ? 'badge-pending' : 'badge-rejected'}`}>
                                {u.status === 'active' ? 'อนุมัติแล้ว' : u.status === 'pending' ? 'รอการอนุมัติ' : 'ระงับการใช้'}
                              </span>
                            </td>
                            <td>
                              {u.status === 'pending' && (
                                <button
                                  className="btn btn-success"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  onClick={() => handleApproveUser(u.id)}
                                >
                                  อนุมัติบัญชี
                                </button>
                              )}
                              {u.status === 'active' && u.id !== user.id && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}
                                  onClick={() => handleSuspendUser(u.id)}
                                >
                                  ระงับบัญชี
                                </button>
                              )}
                              {u.status === 'suspended' && (
                                <button
                                  className="btn btn-success"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  onClick={() => handleApproveUser(u.id)}
                                >
                                  ยกเลิกระงับ
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-Tab 3: Cars Status Adjustment */}
              {adminSubTab === 'car-status' && (
                <div>
                  <h4 style={{ fontWeight: '600', marginBottom: '10px' }}>🔧 จัดการความพร้อมในการวิ่งรถยนต์ (ขนาด 5 คัน)</h4>
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>รูป</th>
                          <th>ยี่ห้อ / ทะเบียนรถยนต์</th>
                          <th>สี</th>
                          <th>ประเภท</th>
                          <th>สถานะการจอง</th>
                          <th>แก้ไขความพร้อมใช้งาน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cars.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontSize: '1.5rem' }}>{getCarIcon(c.type)}</td>
                            <td><strong>{c.model}</strong></td>
                            <td>{c.color}</td>
                            <td><span style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>{c.type}</span></td>
                            <td>
                              <span className={`badge ${c.status === 'available' ? 'badge-approved' : 'badge-rejected'}`}>
                                {c.status === 'available' ? '🟢 วิ่งงานปกติ' : '🔴 งดบริการ / ซ่อมบำรุง'}
                              </span>
                            </td>
                            <td>
                              <button
                                className={`btn ${c.status === 'available' ? 'btn-danger' : 'btn-success'}`}
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={() => handleToggleCarStatus(c.id, c.status)}
                              >
                                {c.status === 'available' ? 'ระบุว่า: ซ่อมบำรุง' : 'ระบุว่า: วิ่งงานปกติ'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* 4. SETTINGS & LOGS TAB */}
        {activeTab === 'settings' && !loading && (
          <div style={{ padding: '24px 5%', maxWidth: '1000px', margin: '0 auto' }}>
            <div className="dashboard-grid" style={{ gridTemplateColumns: user?.role === 'admin' ? '1fr 1fr' : '1fr' }}>
              
              {/* Left Column: Admin SMTP & LINE credentials setup */}
              {user?.role === 'admin' && (
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '6px' }}>⚙️ การเชื่อมต่อแจ้งเตือนจริง</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>หากใส่ค่าข้อมูลจริง ระบบจะส่ง LINE Notify / SMTP เมลของหน่วยงานจริง</p>
                  
                  <form onSubmit={handleSaveSettings}>
                    <h4 style={{ fontSize: '0.95rem', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '14px' }}>📧 การเชื่อมต่อ Mail (SMTP)</h4>
                    
                    <div className="form-group">
                      <label>SMTP Host</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="เช่น smtp.gmail.com"
                        value={settings.smtp.host}
                        onChange={(e) => setSettings({ ...settings, smtp: { ...settings.smtp, host: e.target.value } })}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label>SMTP Port</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="587 / 465"
                          value={settings.smtp.port}
                          onChange={(e) => setSettings({ ...settings, smtp: { ...settings.smtp, port: e.target.value } })}
                        />
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', height: '100%' }}>
                        <input
                          type="checkbox"
                          id="smtp_secure"
                          style={{ marginRight: '8px' }}
                          checked={settings.smtp.secure}
                          onChange={(e) => setSettings({ ...settings, smtp: { ...settings.smtp, secure: e.target.checked } })}
                        />
                        <label htmlFor="smtp_secure" style={{ margin: '0', cursor: 'pointer' }}>ใช้ Secure SSL/TLS</label>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label>อีเมลผู้ส่ง (Username)</label>
                        <input
                          type="text"
                          className="input-field"
                          placeholder="เช่น office@domain.com"
                          value={settings.smtp.user}
                          onChange={(e) => setSettings({ ...settings, smtp: { ...settings.smtp, user: e.target.value } })}
                        />
                      </div>
                      <div className="form-group">
                        <label>รหัสผ่านอีเมล (Password)</label>
                        <input
                          type="password"
                          className="input-field"
                          placeholder={settings.smtp.pass ? '********' : 'ตั้งค่ารหัสผ่านใหม่'}
                          value={settings.smtp.pass}
                          onChange={(e) => setSettings({ ...settings, smtp: { ...settings.smtp, pass: e.target.value } })}
                        />
                      </div>
                    </div>

                    <h4 style={{ fontSize: '0.95rem', color: '#06c755', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginTop: '24px', marginBottom: '14px' }}>💬 การเชื่อมต่อ LINE Messaging API</h4>
                    
                    <div className="form-group">
                      <label>LINE Channel Access Token</label>
                      <input
                        type="password"
                        className="input-field"
                        placeholder={settings.line.channelAccessToken ? '********' : 'ระบุ Token ของท่าน'}
                        value={settings.line.channelAccessToken}
                        onChange={(e) => setSettings({ ...settings, line: { ...settings.line, channelAccessToken: e.target.value } })}
                      />
                    </div>

                    <div className="form-group">
                      <label>LINE User ID ของผู้ดูแลระบบ (สำหรับรับแจ้งเตือนจองรถเข้า)</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="เช่น U828198f3bb..."
                        value={settings.line.adminUserId}
                        onChange={(e) => setSettings({ ...settings, line: { ...settings.line, adminUserId: e.target.value } })}
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
                      บันทึกตั้งค่า
                    </button>
                  </form>
                </div>
              )}

              {/* Right/Single Column: Full notification log list */}
              <div className="glass-panel">
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '6px' }}>📝 ประวัติส่งแจ้งเตือนทั้งหมดในเซิร์ฟเวอร์</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>การเคลื่อนไหวของการอนุมัติ การจองรถ และการสมัคสมาชิก</p>
                
                <div className="log-list" style={{ maxHeight: '550px' }}>
                  {notificationLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>ยังไม่พบประวัติการแจ้งเตือนในระบบ</div>
                  ) : (
                    notificationLogs.map(log => (
                      <div key={log.id} className="log-item">
                        <div className="log-item-header">
                          <span className="log-item-tag" style={{ color: log.type === 'line' ? '#06c755' : 'var(--info)' }}>
                            {log.type === 'line' ? '💬 LINE MESSAGING' : '📧 EMAIL SMTP'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatThaiDateTime(log.timestamp)}</span>
                        </div>
                        <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{log.subject}</div>
                        <div className="log-item-body" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{log.message}</div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>ผู้รับ: {log.recipient}</span>
                          <span style={{ fontWeight: '600', color: log.status === 'sent' ? 'var(--success)' : 'var(--warning)' }}>
                            {log.status === 'sent' ? '✓ จัดส่งเรียบร้อย' : 'ℹ️ ระบบจำลอง Log'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* --- POPUP MODAL: BOOKING FORM --- */}
      {showBookingModal && selectedCar && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h3>✍️ กรอกรายละเอียดเพื่อจองรถคันนี้</h3>
              <button className="modal-close-btn" onClick={() => setShowBookingModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleCreateBooking}>
              <div style={{ display: 'flex', gap: '15px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', marginBottom: '20px' }}>
                <span style={{ fontSize: '2rem' }}>{getCarIcon(selectedCar.type)}</span>
                <div>
                  <h4 style={{ fontWeight: '700' }}>{selectedCar.model}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ประเภท: {selectedCar.type.toUpperCase()} | สี: {selectedCar.color}</p>
                </div>
              </div>

              <div className="form-group">
                <label>วันที่เดินทาง (กรุณาเลือกใน Timeline ตารางจองของวันนี้)</label>
                <input
                  type="date"
                  className="input-field"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>เวลาเดินทางไป (Start)</label>
                  <select
                    className="input-field"
                    value={bookingStart}
                    onChange={(e) => setBookingStart(e.target.value)}
                    required
                  >
                    {Array.from({ length: 48 }).map((_, i) => {
                      const h = Math.floor(i / 2);
                      const m = i % 2 === 0 ? '00' : '30';
                      const val = `${String(h).padStart(2, '0')}:${m}`;
                      return <option key={i} value={val}>{val} น.</option>;
                    })}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>เวลาเดินทางกลับ (End)</label>
                  <select
                    className="input-field"
                    value={bookingEnd}
                    onChange={(e) => setBookingEnd(e.target.value)}
                    required
                  >
                    {Array.from({ length: 49 }).map((_, i) => {
                      let val;
                      if (i === 48) {
                        val = '24:00';
                      } else {
                        const h = Math.floor(i / 2);
                        const m = i % 2 === 0 ? '00' : '30';
                        val = `${String(h).padStart(2, '0')}:${m}`;
                      }
                      return <option key={i} value={val}>{val} น.</option>;
                    })}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>วัตถุประสงค์ในการใช้รถยนต์</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น ขนย้ายเอกสารการประชุม, พาคู่ค้าดูงาน"
                  value={bookingPurpose}
                  onChange={(e) => setBookingPurpose(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>ปลายทางที่ต้องการเดินทางไป</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น โรงแรมแกรนด์, สาขาย่อยรังสิต"
                  value={bookingDestination}
                  onChange={(e) => setBookingDestination(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>จำนวนผู้ร่วมเดินทางจริง (คน)</label>
                <input
                  type="number"
                  className="input-field"
                  min="1"
                  max="15"
                  value={bookingPassengers}
                  onChange={(e) => setBookingPassengers(parseInt(e.target.value || '1'))}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBookingModal(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'กำลังประมวลผลคำขอ...' : 'ส่งคำขออนุมัติจองรถ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- POPUP MODAL: ADMIN REJECT REASON --- */}
      {showRejectModal && bookingToReject && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>❌ ปฏิเสธคำขอจองคิวรถยนต์</h3>
              <button className="modal-close-btn" onClick={() => setShowRejectModal(false)}>×</button>
            </div>
            
            <div className="form-group">
              <label>ผู้ขอจอง: {bookingToReject.userName}</label>
              <label>รถ: {bookingToReject.carModel}</label>
              <label style={{ marginTop: '10px' }}>ระบุเหตุผลในการไม่สามารถอนุมัติได้ (จำเป็น)</label>
              <textarea
                className="input-field"
                style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'var(--font-family)' }}
                placeholder="เช่น ตารางทับซ้อนกับผู้บริหาร, รถต้องเข้าตรวจเช็กสภาพ"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={handleRejectBooking}>ปฏิเสธการจองนี้</button>
            </div>
          </div>
        </div>
      )}

      {/* Corporate Footer copyright */}
      <footer style={{ padding: '16px', textFillColor: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', borderTop: '1px solid var(--border-color)', marginTop: 'auto', background: 'rgba(0,0,0,0.2)' }}>
        <p style={{ color: 'var(--text-muted)' }}>© 2026 ระบบจองและอนุมัติคิวรถยนต์ส่วนกลางขององค์กร • จำกัดผู้ใช้งานเปิดระบบสูงสุด 30 คน</p>
      </footer>

    </div>
  );
}

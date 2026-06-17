import React, { useState, useEffect } from 'react';
import { api, logout, formatThaiDate, formatThaiDateTime, getCarIcon, generateICSFileLink } from './utils/api';

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
  const [activeTab, setActiveTab] = useState(localStorage.getItem('active_tab') || 'dashboard'); // 'dashboard' | 'my-bookings' | 'admin' | 'line-management'
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('active_tab', tab);
  };
  const [adminSubTab, setAdminSubTab] = useState('booking-requests'); // 'booking-requests' | 'user-activation' | 'car-status'
  
  // Data States
  const [cars, setCars] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  
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
  const [bookingDriver, setBookingDriver] = useState('นายสุรศักดิ์ ชาแท่น');
  const [selectedCarsForApproval, setSelectedCarsForApproval] = useState({});
  const [selectedDriversForApproval, setSelectedDriversForApproval] = useState({});
  
  // Custom Thai Date States for independent visual inline calendar selection (วัน เดือน ปี พ.ศ.)
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYearBE, setCalYearBE] = useState(new Date().getFullYear() + 543);

  // States for Quick Text Booking Paste feature
  const [quickBookingText, setQuickBookingText] = useState('');
  const [parsedResults, setParsedResults] = useState([]);

  // State for Admin System Reset
  const [confirmResetText, setConfirmResetText] = useState('');

  // States for 1-to-many LINE account links
  const [newLineUserId, setNewLineUserId] = useState('');

  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const formatThaiFullDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    return `วัน${days[date.getDay()]}ที่ ${date.getDate()} ${THAI_MONTHS[date.getMonth()]} พ.ศ. ${date.getFullYear() + 543}`;
  };

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYearBE(prev => prev - 1);
    } else {
      setCalMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYearBE(prev => prev + 1);
    } else {
      setCalMonth(prev => prev + 1);
    }
  };
  
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

  // Periodic updates for booking lists (every 10 seconds)
  useEffect(() => {
    let interval;
    if (token) {
      interval = setInterval(() => {
        api.getBookings().then(setBookings).catch(console.error);
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

  const handleOpenBookingModal = (car) => {
    setSelectedCar(car);
    setBookingStart('08:00');
    setBookingEnd('09:00');
    setBookingPurpose('');
    setBookingDriver('นายสุรศักดิ์ ชาแท่น');
    
    const d = new Date(selectedDate);
    if (!isNaN(d.getTime())) {
      setBookingDate(selectedDate);
      setCalMonth(d.getMonth());
      setCalYearBE(d.getFullYear() + 543);
    } else {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      setBookingDate(dateStr);
      setCalMonth(today.getMonth());
      setCalYearBE(today.getFullYear() + 543);
    }
    
    setShowBookingModal(true);
  };

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
    logout();
    addToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  };

  const handleAddLineLink = async (e) => {
    e.preventDefault();
    if (!newLineUserId.trim()) {
      addToast('กรุณากรอก LINE User ID ที่ถูกต้อง', 'danger');
      return;
    }

    setLoading(true);
    try {
      const res = await api.addLineLink(newLineUserId.trim());
      addToast(res.message || 'ผูกบัญชี LINE สำเร็จแล้ว!', 'success');
      setNewLineUserId('');
      await fetchUserData(); // reload user data to get updated lineLinks list
    } catch (err) {
      addToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLineLink = async (id) => {
    if (!window.confirm('คุณต้องการยกเลิกการเชื่อมโยงบัญชี LINE นี้ใช่หรือไม่?')) return;
    setLoading(true);
    try {
      const res = await api.deleteLineLink(id);
      addToast(res.message || 'ยกเลิกการเชื่อมโยงบัญชี LINE สำเร็จ!', 'success');
      await fetchUserData(); // reload list
    } catch (err) {
      addToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Submit Booking request
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const startDateTime = `${bookingDate}T${bookingStart}`;
      const endDateTime = `${bookingDate}T${bookingEnd}`;
      
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
        driver: bookingDriver
      });

      addToast('ส่งคำขอจองสำเร็จแล้ว! กรุณารอเจ้าหน้าที่จัดคิวอนุมัติ', 'success');
      setShowBookingModal(false);
      
      // Reset Form fields
      setBookingStart('');
      setBookingEnd('');
      setBookingPurpose('');

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

  const handleSystemReset = async () => {
    if (confirmResetText !== 'RESET') return;
    if (!window.confirm('คำเตือน: ข้อมูลการจองและบัญชีผู้ใช้อื่นทั้งหมดจะถูกลบถาวร ต้องการดำเนินการต่อหรือไม่?')) return;
    
    setLoading(true);
    try {
      const res = await api.resetSystem();
      addToast(res.message || 'ล้างระบบข้อมูลสำเร็จแล้ว', 'success');
      setConfirmResetText('');
      setAdminSubTab('booking-requests');
      handleTabChange('dashboard');
      // Refresh all data
      fetchDashboardData();
      if (user?.role === 'admin') {
        fetchAdminData();
      }
    } catch (err) {
      addToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // --- AI QUICK BOOKING PASTE UTILITIES ---

  const parseBookingText = (inputText) => {
    if (!inputText || !inputText.trim()) return [];
    
    const lines = inputText.split('\n').map(l => l.trim()).filter(Boolean);
    let currentDate = new Date().toISOString().split('T')[0];
    const results = [];
    
    const carsMapping = [
      { id: 'car1', model: 'รถตู้ ฮร 8010 สีขาว', keywords: ['รถตู้ขาว', 'ตู้ขาว', 'รถตู้ ฮร', 'ฮร 8010', 'ตู้ ฮร'] },
      { id: 'car2', model: 'รถตู้ ฮย 1906 สีเทา', keywords: ['รถตู้เทา', 'ตู้เทา', 'รถตู้ ฮย', 'ฮย 1906', 'ตู้ ฮย'] },
      { id: 'car3', model: 'รถยาริส ฌอ 6249 สีเทา', keywords: ['ยาริส', 'เก๋งเทา', 'ยาริส ฌอ', 'ฌอ 6249'] },
      { id: 'car4', model: 'รถเชฟ ศฐ 8709 สีดำ', keywords: ['เชฟ', 'เชฟโรเลต', 'รถดำ', 'ศฐ 8709'] },
      { id: 'car5', model: 'รถอัลพาร์ด 8กว 6276 สีขาว', keywords: ['อัลพาร์ด', 'alphard', 'ตู้หรู', '8กว 6276'] }
    ];

    for (let line of lines) {
      // Check if line is just a date
      const dateOnlyRegex = /^\s*(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})\s*$/;
      const dateOnlyMatch = line.match(dateOnlyRegex);
      if (dateOnlyMatch) {
        const d = parseInt(dateOnlyMatch[1]);
        const m = parseInt(dateOnlyMatch[2]);
        let y = parseInt(dateOnlyMatch[3]);
        if (y > 2400) y -= 543;
        currentDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        continue;
      }

      let lineDate = currentDate;
      let lineText = line;

      // Check for inline date in line
      const inlineDateRegex = /(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/;
      const inlineDateMatch = lineText.match(inlineDateRegex);
      if (inlineDateMatch) {
        const d = parseInt(inlineDateMatch[1]);
        const m = parseInt(inlineDateMatch[2]);
        let y = parseInt(inlineDateMatch[3]);
        if (y > 2400) y -= 543;
        lineDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        lineText = lineText.replace(inlineDateMatch[0], '');
      }

      // Parse Times
      let startTime = '';
      let endTime = '';

      const rangeRegex = /(?:เวลา\s*)?(\d{1,2})[\.:](\d{2})\s*(?:-|ถึง)\s*(\d{1,2})[\.:](\d{2})\s*(?:น\.)?/;
      const rangeMatch = lineText.match(rangeRegex);
      if (rangeMatch) {
        startTime = `${String(rangeMatch[1]).padStart(2, '0')}:${rangeMatch[2]}`;
        endTime = `${String(rangeMatch[3]).padStart(2, '0')}:${rangeMatch[4]}`;
        lineText = lineText.replace(rangeMatch[0], '');
      } else {
        const singleTimeRegex = /(?:เวลา\s*)?(\d{1,2})[\.:](\d{2})\s*(?:น\.)?/;
        const singleMatch = lineText.match(singleTimeRegex);
        if (singleMatch) {
          startTime = `${String(singleMatch[1]).padStart(2, '0')}:${singleMatch[2]}`;
          let endHour = parseInt(singleMatch[1]) + 2;
          if (endHour > 23) endHour = 23;
          endTime = `${String(endHour).padStart(2, '0')}:${singleMatch[2]}`;
          lineText = lineText.replace(singleMatch[0], '');
        }
      }

      // Match Car
      let matchedCarId = '';
      let matchedCarModel = '';
      for (const car of carsMapping) {
        for (const kw of car.keywords) {
          if (lineText.toLowerCase().includes(kw.toLowerCase())) {
            matchedCarId = car.id;
            matchedCarModel = car.model;
            const kwRegex = new RegExp(kw, 'gi');
            lineText = lineText.replace(kwRegex, '');
            break;
          }
        }
        if (matchedCarId) break;
      }

      let purpose = lineText
        .replace(/\s+/g, ' ')
        .replace(/^[,.\s\-:|]+|[,.\s\-:|]+$/g, '')
        .trim();

      if (startTime || purpose) {
        const displayDate = new Date(lineDate);
        const thaiMonths = [
          'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
          'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
        ];
        const dateFormatted = `${displayDate.getDate()} ${thaiMonths[displayDate.getMonth()]} ${displayDate.getFullYear() + 543}`;

        results.push({
          date: lineDate,
          dateFormatted,
          startTime: startTime || '08:00',
          endTime: endTime || '10:00',
          carId: matchedCarId,
          carModel: matchedCarModel,
          purpose: purpose || 'ไม่ได้ระบุวัตถุประสงค์'
        });
      }
    }
    return results;
  };

  const handleParseQuickBooking = () => {
    try {
      const results = parseBookingText(quickBookingText);
      if (results.length === 0) {
        addToast('ไม่พบข้อมูลการจองในข้อความที่กรอก กรุณาตรวจสอบรูปแบบข้อความ', 'warning');
        return;
      }
      setParsedResults(results);
      addToast(`วิเคราะห์ข้อมูลสำเร็จ พบรายการจองทั้งหมด ${results.length} รายการ`, 'success');
      
      if (results.length === 1) {
        handleApplyParsedBooking(results[0]);
      }
    } catch (err) {
      addToast('เกิดข้อผิดพลาดในการวิเคราะห์ข้อความ', 'danger');
    }
  };

  const handleApplyParsedBooking = (result) => {
    const targetCar = cars.find(c => c.id === result.carId);
    if (!targetCar) {
      setSelectedCar(cars[0] || null);
    } else {
      setSelectedCar(targetCar);
    }
    
    setBookingDate(result.date);
    
    const d = new Date(result.date);
    setCalMonth(d.getMonth());
    setCalYearBE(d.getFullYear() + 543);

    setBookingStart(result.startTime);
    setBookingEnd(result.endTime);
    setBookingPurpose(result.purpose);
    setBookingDriver('นายสุรศักดิ์ ชาแท่น');

    setShowBookingModal(true);
    addToast('กรอกข้อมูลจองอัตโนมัติสำเร็จแล้ว กรุณาตรวจสอบและกดบันทึก', 'info');
  };

  // Admin/Scheduler Approve Booking
  const handleApproveBooking = async (id) => {
    const booking = bookings.find(b => b.id === id);
    const allocatedCarId = selectedCarsForApproval[id] !== undefined ? selectedCarsForApproval[id] : (booking?.carId || '');
    const allocatedDriver = selectedDriversForApproval[id] !== undefined ? selectedDriversForApproval[id] : (booking?.driver || '');

    if (!allocatedCarId) {
      addToast('กรุณาเลือกจัดสรรรถยนต์ก่อนกดยืนยันอนุมัติ', 'warning');
      return;
    }

    if (!window.confirm('ยืนยันการอนุมัติการจองและจัดสรรยานพาหนะใช่หรือไม่?')) return;
    try {
      const res = await api.approveBooking(id, '', allocatedCarId, allocatedDriver);
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



  // --- RENDERING HELPERS & DATA PARSING ---

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
                  placeholder="ระบุชื่อผู้ใช้งาน หรือ อีเมล"
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
        <nav className="nav-links">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabChange('dashboard')}>
            🏠 แผงจองรถ
          </div>
          <div className={`nav-item ${activeTab === 'my-bookings' ? 'active' : ''}`} onClick={() => handleTabChange('my-bookings')}>
            📅 การจองของฉัน
          </div>
          <div className={`nav-item ${activeTab === 'line-management' ? 'active' : ''}`} onClick={() => handleTabChange('line-management')}>
            💬 จัดการ LINE {user?.lineLinks?.length > 0 ? `(${user.lineLinks.length})` : ''}
          </div>
          {(user?.role === 'admin' || user?.role === 'scheduler') && (
            <div className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => handleTabChange('admin')}>
              🛡️ จัดการคำขอจอง {bookings.filter(b => b.status === 'pending').length > 0 && <span style={{ background: 'var(--danger)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px' }}>{bookings.filter(b => b.status === 'pending').length}</span>}
            </div>
          )}
        </nav>

        <div className="user-profile-menu">
          <button className="btn btn-secondary" onClick={toggleTheme} style={{ padding: '8px 12px' }}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{user?.name}</span>
            <span className={`badge badge-${user?.role}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{user?.role}</span>
          </div>

          <button 
            className="btn" 
            onClick={() => handleTabChange('line-management')}
            style={{ 
              padding: '8px 12px', 
              fontSize: '0.8rem', 
              background: activeTab === 'line-management' ? '#04a747' : '#06C755', 
              color: '#ffffff', 
              border: 'none',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            💬 จัดการ LINE {user?.lineLinks?.length > 0 ? `(${user.lineLinks.length})` : ''}
          </button>

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
            
            {/* รายการจองรถยนต์ทั้งหมด (เรียงจากวันที่ล่าสุดด้านบน) */}
            <div className="glass-panel" style={{ margin: '0', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0' }}>🚐 รายการจองรถยนต์ทั้งหมด</h3>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  ทั้งหมด: {bookings.filter(b => b.status === 'approved' || b.status === 'pending').length} รายการ
                </span>
              </div>

              {bookings.filter(b => b.status === 'approved' || b.status === 'pending').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  ไม่มีรายการจองรถยนต์ในระบบ
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '450px', overflowY: 'auto', paddingRight: '6px' }}>
                  {[...bookings]
                    .filter(b => b.status === 'approved' || b.status === 'pending') // กรองเฉพาะรายการที่ใช้งานจริง (อนุมัติแล้ว หรือ รออนุมัติ)
                    .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || '')) // จัดเรียงแบบตัวอักษรเพื่อหลีกเลี่ยงปัญหา Date parsing บนเบราว์เซอร์ และป้องกันการแครชถ้าไม่มีฟิลด์ startTime
                    .map(b => {
                      const car = cars.find(c => c.id === b.carId);
                      const carType = car ? car.type : null;
                      return (
                        <div 
                          key={b.id} 
                          className="glass-panel" 
                          style={{ 
                            margin: '0', 
                            padding: '16px 20px', 
                            background: 'rgba(255, 255, 255, 0.01)', 
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '16px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: '1', minWidth: '280px' }}>
                            <span style={{ fontSize: '2rem', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {carType ? getCarIcon(carType) : '❓'}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                                {(b.driver || '⏳ รอจัดสรรคนขับ')} {(b.carModel || '⏳ รอจัดสรรรถยนต์')} {b.purpose}
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                                📅 {formatThaiDateTime(b.startTime)} - {b.endTime.split('T')[1]?.substring(0, 5) || ''} น.
                              </div>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>👤 ผู้ขอจอง: {b.userName || 'ไม่ระบุผู้ใช้'}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '120px' }}>
                            <span className={`badge badge-${b.status}`} style={{ padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                              {b.status === 'pending' ? 'รอพิจารณา' : b.status === 'approved' ? 'อนุมัติแล้ว' : b.status === 'rejected' ? 'ปฏิเสธคำขอ' : 'ยกเลิกคำขอ'}
                            </span>
                            {b.status === 'approved' && b.approvedBy && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>อนุมัติโดย: {b.approvedBy}</span>
                            )}
                            {b.status === 'rejected' && b.notes && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--danger)', maxWidth: '180px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.notes}>เหตุผล: {b.notes}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Quick Paste Booking Section */}
            <div className="glass-panel" style={{ margin: '0', padding: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚡ จองรถยนต์อัจฉริยะด้วยการวางข้อความ
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                คุณสามารถคัดลอกข้อความตารางงานจองรถยนต์จาก LINE หรือข้อความจัดตารางงานมาวางด้านล่างนี้ ระบบจะทำการประมวลผลดึงข้อมูลให้อัตโนมัติ (รองรับการจองหลายรายการพร้อมกันในข้อความเดียว)
              </p>
              
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <textarea
                  className="input-field"
                  style={{ flex: '1', minWidth: '300px', height: '100px', padding: '12px', resize: 'vertical', fontSize: '0.9rem', fontFamily: 'inherit' }}
                  placeholder="ตัวอย่างการจองเดี่ยว: 4/6/2569 เวลา 08.00 น. รถตู้ขาว รับ-ส่ง ที่ปรึกษาสภากาชาดไทย...&#10;ตัวอย่างการจองหลายรายการ:&#10;2/6/2569&#10;เวลา 09.00 น. รถตู้ขาว รับ-ส่ง นาย A...&#10;เวลา 12.00 น. รถตู้ขาว รับ-ส่ง นาย B..."
                  value={quickBookingText}
                  onChange={(e) => setQuickBookingText(e.target.value)}
                />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'stretch', justifyContent: 'center' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleParseQuickBooking}
                    style={{ padding: '10px 20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    ⚡ วิเคราะห์และจองด่วน
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setQuickBookingText(''); setParsedResults([]); }}
                    style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                  >
                    ล้างค่า
                  </button>
                </div>
              </div>

              {/* Parsed Results List */}
              {parsedResults.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '12px', color: 'var(--primary)' }}>
                    🔍 รายการจองที่วิเคราะห์พบ ({parsedResults.length} รายการ):
                  </h4>
                  <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                    {parsedResults.map((result, idx) => (
                      <div key={idx} className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.01)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', margin: '0', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '250px' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--primary)' }}>
                            {result.carModel ? `🚗 ${result.carModel}` : '❌ ไม่สามารถระบุรถยนต์ได้ (กรุณาเลือกในฟอร์ม)'}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            📅 วันเดินทาง: <strong>{result.dateFormatted}</strong> | ⏰ เวลา: <strong>{result.startTime} - {result.endTime} น.</strong>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            📝 วัตถุประสงค์: <em>"{result.purpose}"</em>
                          </div>
                        </div>
                        
                        <button
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          onClick={() => handleApplyParsedBooking(result)}
                        >
                          ดึงข้อมูลเพื่อจองรถคันนี้
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                          onClick={() => handleOpenBookingModal(car)}
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



              </div>

            </div>

          </div>
        )}

        {/* 2. MY BOOKINGS VIEW */}
        {activeTab === 'my-bookings' && !loading && (
          <div style={{ padding: '24px 5%', maxWidth: '1000px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0' }}>📅 รายการประวัติจองรถยนต์ของฉัน</h3>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
                  ทั้งหมด: {bookings.filter(b => b.userId === user?.id).length} รายการ
                </span>
              </div>
              
              {bookings.filter(b => b.userId === user?.id).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  คุณยังไม่มีคำขอจองรถยนต์ในระบบ กดที่แถบ "แผงจองรถ" เพื่อทำเรื่องขออนุมัติจองได้ทันที
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto', paddingRight: '6px' }}>
                  {[...bookings]
                    .filter(b => b.userId === user?.id)
                    .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
                    .map(b => {
                      const car = cars.find(c => c.id === b.carId);
                      const carType = car ? car.type : null;
                      return (
                        <div 
                          key={b.id} 
                          className="glass-panel" 
                          style={{ 
                            margin: '0', 
                            padding: '16px 20px', 
                            background: 'rgba(255, 255, 255, 0.01)', 
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '16px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: '1', minWidth: '280px' }}>
                            <span style={{ fontSize: '2rem', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {carType ? getCarIcon(carType) : '❓'}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                                {(b.driver || '⏳ รอจัดสรรคนขับ')} {(b.carModel || '⏳ รอจัดสรรรถยนต์')} {b.purpose}
                              </div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                                📅 {formatThaiDateTime(b.startTime)} - {b.endTime.split('T')[1]?.substring(0, 5) || ''} น.
                              </div>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>👤 ผู้ขอจอง: {b.userName || 'ไม่ระบุผู้ใช้'}</span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '120px' }}>
                              <span className={`badge badge-${b.status}`} style={{ padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                                {b.status === 'pending' ? 'รอพิจารณา' : b.status === 'approved' ? 'อนุมัติแล้ว' : b.status === 'rejected' ? 'ปฏิเสธคำขอ' : 'ยกเลิกคำขอ'}
                              </span>
                              {b.status === 'approved' && b.approvedBy && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>อนุมัติโดย: {b.approvedBy}</span>
                              )}
                              {b.status === 'rejected' && b.notes && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--danger)', maxWidth: '180px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.notes}>เหตุผล: {b.notes}</span>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {b.status === 'approved' && (
                                <a
                                  href={generateICSFileLink(b)}
                                  download={`car_booking_${b.id}.ics`}
                                  className="btn"
                                  style={{ padding: '6px 10px', fontSize: '0.75rem', textDecoration: 'none', background: '#0078d4', color: '#ffffff', border: 'none', borderRadius: '8px', textAlign: 'center', fontWeight: '600', display: 'block' }}
                                >
                                  📅 เพิ่มลง Outlook
                                </a>
                              )}
                              {(b.status === 'pending' || b.status === 'approved') && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}
                                  onClick={() => handleCancelBooking(b.id)}
                                >
                                  ยกเลิกการจอง
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. LINE LINK MANAGEMENT VIEW */}
        {activeTab === 'line-management' && !loading && (
          <div style={{ padding: '24px 5%', maxWidth: '600px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0' }}>💬 จัดการบัญชี LINE ที่เชื่อมโยง</h3>
                <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#06C755', color: '#ffffff' }}>
                  เชื่อมต่อแล้ว: {user?.lineLinks?.length || 0} บัญชี
                </span>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.6' }}>
                  คุณสามารถเชื่อมโยงบัญชี LINE ได้หลายบัญชี เพื่อให้สามารถสั่งจองรถยนต์ผ่านแชตกลุ่มไลน์จากบัญชีไลน์ที่แตกต่างกันได้ภายใต้สิทธิ์ชื่อบัญชีของคุณ
                </p>
                
                <h4 style={{ fontWeight: '600', fontSize: '1.05rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                  รายชื่อไลน์ที่ผูกไว้ในปัจจุบัน
                </h4>
                
                {(!user?.lineLinks || user.lineLinks.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.95rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                    ยังไม่มีการเชื่อมโยงบัญชี LINE
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', paddingRight: '4px' }}>
                    {user.lineLinks.map(link => (
                      <div 
                        key={link.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          background: 'rgba(255,255,255,0.02)', 
                          padding: '12px 16px', 
                          borderRadius: '10px',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <strong style={{ fontSize: '0.95rem', color: '#06C755', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.6rem' }}>🟢</span> {link.lineDisplayName || 'ผู้ใช้ LINE'}
                          </strong>
                          <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {link.lineUserId.substring(0, 15)}...</code>
                        </div>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleDeleteLineLink(link.id)}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '0.8rem', 
                            color: 'var(--danger)', 
                            borderColor: 'var(--danger-glow)',
                            minWidth: 'auto'
                          }}
                          title="ยกเลิกการผูกบัญชีนี้"
                        >
                          🗑️ ลบการเชื่อมโยง
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleAddLineLink} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <div className="form-group" style={{ margin: '0 0 20px 0' }}>
                  <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block', color: 'var(--text-main)' }}>➕ เพิ่มการเชื่อมโยงบัญชี LINE ใหม่</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="กรอก LINE User ID (ตัวอย่าง U1234...)"
                      value={newLineUserId}
                      onChange={(e) => setNewLineUserId(e.target.value)}
                      required
                      style={{ flex: '1', padding: '12px' }}
                    />
                    <button 
                      type="submit" 
                      className="btn" 
                      style={{ background: '#06C755', color: '#ffffff', border: 'none', padding: '12px 24px', fontWeight: '600', borderRadius: '8px' }}
                      disabled={loading}
                    >
                      {loading ? 'กำลังบันทึก...' : 'เพิ่มบัญชี LINE'}
                    </button>
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  <strong>💡 วิธีการหา LINE User ID ของคุณ:</strong>
                  <ol style={{ paddingLeft: '20px', marginTop: '6px', marginBottom: '0' }}>
                    <li>ส่งข้อความคำว่า <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px', color: '#06C755' }}>id</code> (ตัวพิมพ์เล็กทั้งหมด) เข้าไปในแชตกลุ่มไลน์หรือหน้าแชตบอท</li>
                    <li>บอทจะตอบกลับด้วยรหัสผู้ใช้ขึ้นต้นด้วยอักษร <code style={{ color: 'var(--primary)' }}>U</code> เช่น <code style={{ color: 'var(--primary)' }}>U1a2b3c...</code></li>
                    <li>คัดลอกรหัสดังกล่าวมาวางลงในช่องด้านบนแล้วกด <strong>"เพิ่มบัญชี LINE"</strong></li>
                  </ol>
                </div>
              </form>
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
                  {user?.role === 'admin' && (
                    <button
                      className={`btn ${adminSubTab === 'system-reset' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'var(--danger-glow)' }}
                      onClick={() => setAdminSubTab('system-reset')}
                    >
                      ⚠️ ล้างระบบข้อมูลจริง
                    </button>
                  )}
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
                            <th>จัดสรรรถยนต์</th>
                            <th>จัดสรรพนักงานขับรถ</th>
                            <th>วันเดินทาง / ช่วงเวลา</th>
                            <th>วัตถุประสงค์การใช้รถ</th>
                            <th>การจัดการ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings.filter(b => b.status === 'pending').map(b => (
                            <tr key={b.id}>
                              <td><strong>{b.userName}</strong></td>
                              <td>
                                <select
                                  className="input-field"
                                  style={{ padding: '6px', fontSize: '0.85rem', minWidth: '180px' }}
                                  value={selectedCarsForApproval[b.id] !== undefined ? selectedCarsForApproval[b.id] : (b.carId || '')}
                                  onChange={(e) => setSelectedCarsForApproval(prev => ({ ...prev, [b.id]: e.target.value }))}
                                >
                                  <option value="">-- เลือกจัดสรรรถยนต์ --</option>
                                  {cars.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.model} ({c.color})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="input-field"
                                  style={{ padding: '6px', fontSize: '0.85rem', minWidth: '180px' }}
                                  value={selectedDriversForApproval[b.id] !== undefined ? selectedDriversForApproval[b.id] : (b.driver || '')}
                                  onChange={(e) => setSelectedDriversForApproval(prev => ({ ...prev, [b.id]: e.target.value }))}
                                >
                                  <option value="">-- เลือกพนักงานขับรถ --</option>
                                  <option value="นายสุรศักดิ์ ชาแท่น">นายสุรศักดิ์ ชาแท่น</option>
                                  <option value="นายสุระเชษฐ วิบูลพันธุ์">นายสุระเชษฐ วิบูลพันธุ์</option>
                                  <option value="นายวิไล พลรักษา">นายวิไล พลรักษา</option>
                                  <option value="นายเฉลิมพล ชมเชย">นายเฉลิมพล ชมเชย</option>
                                </select>
                              </td>
                              <td>
                                <div><strong>{formatThaiDate(b.startTime)}</strong></div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600', marginTop: '2px' }}>
                                  {b.startTime.split('T')[1].substring(0, 5)} - {b.endTime.split('T')[1].substring(0, 5)} น.
                                </div>
                              </td>
                              <td>{b.purpose}</td>
                              <td style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn btn-success"
                                  style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: '600' }}
                                  onClick={() => handleApproveBooking(b.id)}
                                >
                                  อนุมัติ
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: '600' }}
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

              {/* Sub-Tab 4: System Reset (Admin Only) */}
              {adminSubTab === 'system-reset' && user?.role === 'admin' && (
                <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 0' }}>
                  <div style={{
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    background: 'rgba(239, 68, 68, 0.05)',
                    borderRadius: '12px',
                    padding: '24px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '3rem' }}>⚠️</span>
                    <h4 style={{ fontWeight: '700', color: 'var(--danger)', fontSize: '1.2rem', marginTop: '12px', marginBottom: '16px' }}>
                      ต้องการล้างค่าข้อมูลในระบบทั้งหมดเพื่อเริ่มใช้ข้อมูลจริง?
                    </h4>
                    <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-main)', marginBottom: '20px' }}>
                      การล้างระบบจะทำการลบข้อมูลการจองรถยนต์ทั้งหมด รวมถึงลบบัญชีผู้ใช้งานอื่น ๆ ทั้งหมด (ที่เพิ่งสมัครเข้ามา) ออกจากฐานข้อมูลถาวร เพื่อให้ระบบว่างพร้อมใช้สำหรับงานจริง
                    </p>
                    
                    <div style={{ textAlign: 'left', background: 'rgba(0, 0, 0, 0.2)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                      <h5 style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-muted)' }}>ข้อมูลที่ระบบจะเก็บรักษาไว้:</h5>
                      <ul style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '20px', lineHeight: '1.6' }}>
                        <li>บัญชีผู้ดูแลระบบหลัก (admin)</li>
                        <li>บัญชีเจ้าหน้าที่จัดคิวรถ (scheduler)</li>
                        <li>บัญชีผู้ใช้งานเริ่มต้น (user)</li>
                        <li>ข้อมูลรถยนต์ส่วนกลางทั้ง 5 คัน (จะถูกรีเซ็ตสถานะเป็น วิ่งงานปกติ ทั้งหมด)</li>
                      </ul>
                    </div>

                    <div className="form-group" style={{ textAlign: 'left', marginBottom: '20px' }}>
                      <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block', color: 'var(--text-main)' }}>
                        กรุณาพิมพ์คำว่า <code style={{ color: 'var(--danger)', fontSize: '1rem', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>RESET</code> เพื่อยืนยันการดำเนินการ:
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="พิมพ์ RESET ตรงนี้"
                        value={confirmResetText}
                        onChange={(e) => setConfirmResetText(e.target.value)}
                        style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '2px', borderColor: confirmResetText === 'RESET' ? 'var(--danger)' : 'var(--border-color)', width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setAdminSubTab('booking-requests')}
                        style={{ padding: '8px 20px' }}
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={confirmResetText !== 'RESET' || loading}
                        onClick={handleSystemReset}
                        style={{ padding: '8px 20px', background: confirmResetText === 'RESET' ? 'var(--danger)' : 'rgba(239, 68, 68, 0.2)', borderColor: confirmResetText === 'RESET' ? 'var(--danger)' : 'transparent', color: confirmResetText === 'RESET' ? '#ffffff' : 'rgba(255,255,255,0.4)' }}
                      >
                        {loading ? 'กำลังล้างระบบ...' : 'ยืนยันล้างข้อมูลระบบ'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
                <label>วันที่เดินทาง: <strong style={{ color: 'var(--primary)' }}>{formatThaiFullDate(bookingDate)}</strong></label>
                
                {/* Visual Gregorian-to-Buddhist Inline Calendar Picker */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '14px',
                  marginTop: '8px',
                  userSelect: 'none'
                }}>
                  {/* Calendar Header with Month/Year Navigation */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '30px' }} 
                      onClick={handlePrevMonth}
                    >
                      ◀
                    </button>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {THAI_MONTHS[calMonth]} พ.ศ. {calYearBE}
                    </span>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '2px 8px', fontSize: '0.75rem', minWidth: '30px' }} 
                      onClick={handleNextMonth}
                    >
                      ▶
                    </button>
                  </div>
                  
                  {/* Calendar Grid Container */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {/* Day-of-week Labels */}
                    {['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((dayName, idx) => (
                      <div key={dayName} style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: '700', 
                        color: idx === 0 ? 'var(--danger)' : idx === 6 ? 'var(--info)' : 'var(--text-muted)',
                        paddingBottom: '4px'
                      }}>
                        {dayName}
                      </div>
                    ))}
                    
                    {/* Padding cells before the 1st of the month */}
                    {Array.from({ length: new Date(calYearBE - 543, calMonth, 1).getDay() }).map((_, idx) => (
                      <div key={`empty-${idx}`} />
                    ))}
                    
                    {/* Active Month Days grid */}
                    {Array.from({ length: new Date(calYearBE - 543, calMonth + 1, 0).getDate() }).map((_, idx) => {
                      const dayNum = idx + 1;
                      const cellDateStr = `${calYearBE - 543}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const isSelected = bookingDate === cellDateStr;
                      
                      return (
                        <button
                          key={dayNum}
                          type="button"
                          style={{
                            border: 'none',
                            background: isSelected ? 'var(--primary)' : 'transparent',
                            color: isSelected ? '#ffffff' : 'var(--text-main)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            margin: '0 auto',
                            transition: 'all 0.15s',
                            fontWeight: isSelected ? '700' : 'normal'
                          }}
                          className={isSelected ? '' : 'calendar-day-hover'}
                          onClick={() => setBookingDate(cellDateStr)}
                        >
                          {dayNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                <label>พนักงานขับรถ (Driver)</label>
                <select
                  className="input-field"
                  value={bookingDriver}
                  onChange={(e) => setBookingDriver(e.target.value)}
                  required
                >
                  <option value="นายสุรศักดิ์ ชาแท่น">นายสุรศักดิ์ ชาแท่น</option>
                  <option value="นายสุระเชษฐ วิบูลพันธุ์">นายสุระเชษฐ วิบูลพันธุ์</option>
                  <option value="นายวิไล พลรักษา">นายวิไล พลรักษา</option>
                  <option value="นายเฉลิมพล ชมเชย">นายเฉลิมพล ชมเชย</option>
                </select>
              </div>

              <div className="form-group">
                <label>วัตถุประสงค์ในการใช้รถยนต์</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น รับ-ส่ง ที่ปรึกษาสภากาชาดไทย จากบ้านพักมาพบแพทย์ที่ รพ.จุฬา"
                  value={bookingPurpose}
                  onChange={(e) => setBookingPurpose(e.target.value)}
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

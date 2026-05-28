const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('smartattend_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json();
  
  if (!response.ok) {
    throw data;
  }
  return data;
};

// Auth
export const login = async (email, password) => {
  const res = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (res.token) {
    localStorage.setItem('smartattend_token', res.token);
    localStorage.setItem('smartattend_user', JSON.stringify(res.user));
  }
  return res;
};

export const signup = async (userData) => {
  const res = await request('/auth/signup', { method: 'POST', body: JSON.stringify(userData) });
  if (res.token) {
    localStorage.setItem('smartattend_token', res.token);
    localStorage.setItem('smartattend_user', JSON.stringify(res.user));
  }
  return res;
};

export const logout = () => {
  localStorage.removeItem('smartattend_token');
  localStorage.removeItem('smartattend_user');
};

// Admin Users
export const getUsers = () => request('/admin/users');
export const createUser = (user) => request('/admin/users', { method: 'POST', body: JSON.stringify(user) });
export const deleteUser = (uid) => request(`/admin/users/${uid}`, { method: 'DELETE' });

// Admin Batches (Classrooms)
export const getClassrooms = () => request('/classrooms'); // Works for both Teachers and Admin
export const createBatch = (batch) => request('/admin/batches', { method: 'POST', body: JSON.stringify(batch) });
export const deleteBatch = (id) => request(`/admin/batches/${id}`, { method: 'DELETE' });

// Sessions
export const getSessions = (section) => request(`/sessions${section ? `?section=${section}` : ''}`);
export const startSession = (classId, teacherName, subject, lat, lon) => request('/sessions', { method: 'POST', body: JSON.stringify({ classId, teacherName, subject, lat, lon }) });
export const endSession = (sessionId) => request(`/sessions/${sessionId}`, { method: 'DELETE' });

// Attendance
export const getAttendance = (sessionId) => request(`/attendance/${sessionId}`);
export const getSessionRecords = (sessionId) => request(`/attendance/${sessionId}`);
export const markAttendance = (sessionId, studentUid, distance, isLate) => request('/attendance/mark', { method: 'POST', body: JSON.stringify({ sessionId, studentUid, distance, isLate }) });
export const reverifyAttendance = (sessionId, studentUid, isInsideGeofence, distance) => request('/attendance/reverify', { method: 'POST', body: JSON.stringify({ sessionId, studentUid, isInsideGeofence, distance }) });

// History & Reports
export const getStudentHistory = (studentUid) => request(`/history/${studentUid}`);
export const getTeacherHistory = (teacherName) => request(`/teacher/history/${teacherName}`);
export const getTeacherReports = (filters) => request('/teacher/reports', { method: 'POST', body: JSON.stringify(filters) });
export const createStudentByTeacher = (studentData) => request('/admin/users', { method: 'POST', body: JSON.stringify({ ...studentData, role: 'student' }) });
export const getTeacherStudents = () => request('/teacher/students');

// Timetable
export const getTimetable = () => request('/timetable');
export const updateTimetable = (batch, date, slotIndex, data) => request('/timetable/update', { method: 'POST', body: JSON.stringify({ batch, date, slotIndex, data }) });

// User Management & Settings
export const updateUser = (uid, data) => request(`/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) });
export const updatePassword = (uid, oldPassword, newPassword) => request(`/users/${uid}/password`, { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) });

// Notices & Announcements
export const createNotice = (data) => request('/notices', { method: 'POST', body: JSON.stringify(data) });
export const getNotices = (batch = '', uid = '') => request(`/notices?batch=${encodeURIComponent(batch)}&uid=${encodeURIComponent(uid)}`);
export const getLowAttendanceStudents = () => request('/teacher/low-attendance');

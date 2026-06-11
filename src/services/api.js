const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

export const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('smartattend_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    localStorage.removeItem('smartattend_token');
    localStorage.removeItem('smartattend_user');
    window.location.href = '/login';
    throw { error: 'Session expired. Please log in again.' };
  }

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

// Class Groups (derived from student year/section/branch)
export const getClassGroups = () => request('/class-groups');

// Classrooms
export const getClassrooms = () => request('/classrooms');
export const createClassroom = (classroom) => request('/admin/classrooms', { method: 'POST', body: JSON.stringify(classroom) });
export const updateClassroom = (id, data) => request(`/admin/classrooms/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClassroom = (id) => request(`/admin/classrooms/${id}`, { method: 'DELETE' });

// Subjects
export const getSubjects = () => request('/subjects');
export const createSubject = (subject) => request('/admin/subjects', { method: 'POST', body: JSON.stringify(subject) });
export const updateSubject = (id, data) => request(`/admin/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSubject = (id) => request(`/admin/subjects/${id}`, { method: 'DELETE' });

// Sessions — now takes year/section/branch instead of classId
export const getSessions = (section) => request(`/sessions${section ? `?section=${section}` : ''}`);
export const startSession = (year, section, branch, classroomId, teacherName, subject, lat, lon, reverifyInterval) =>
  request('/sessions', { method: 'POST', body: JSON.stringify({ year, section, branch, classroomId, teacherName, subject, lat, lon, reverifyInterval }) });
export const endSession = (sessionId) => request(`/sessions/${sessionId}`, { method: 'DELETE' });

// Attendance
export const getAttendance = (sessionId) => request(`/attendance/${sessionId}`);
export const getSessionRecords = (sessionId) => request(`/attendance/${sessionId}`);
export const markAttendance = (sessionId, studentUid, lat, lon, distance, isLate, deviceFingerprint) => request('/attendance/mark', { method: 'POST', body: JSON.stringify({ sessionId, studentUid, lat, lon, distance, isLate, deviceFingerprint }) });
export const reverifyAttendance = (sessionId, studentUid, isInsideGeofence, distance) => request('/attendance/reverify', { method: 'POST', body: JSON.stringify({ sessionId, studentUid, isInsideGeofence, distance }) });
export const overrideAttendance = (sessionId, studentUid, newStatus) => request('/attendance/override', { method: 'POST', body: JSON.stringify({ sessionId, studentUid, newStatus }) });

// History & Reports
export const getStudentHistory = (studentUid) => request(`/history/${studentUid}`);
export const getTeacherHistory = (teacherName) => request(`/teacher/history/${teacherName}`);
export const getTeacherReports = (filters) => request('/teacher/reports', { method: 'POST', body: JSON.stringify(filters) });
export const createStudentByTeacher = (studentData) => request('/admin/users', { method: 'POST', body: JSON.stringify({ ...studentData, role: 'student' }) });
export const getTeacherStudents = () => request('/teacher/students');
export const bulkCreateStudents = (students) => request('/admin/users/bulk', { method: 'POST', body: JSON.stringify({ students }) });
export const resetStudentPassword = (uid, newPassword) => request(`/teacher/students/${uid}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
export const updateStudentByTeacher = (uid, data) => request(`/teacher/students/${uid}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteStudentByTeacher = (uid) => request(`/teacher/students/${uid}`, { method: 'DELETE' });

// Timetable
export const getTimetable = () => request('/timetable');
export const updateTimetable = (classGroup, date, slotIndex, data) => request('/timetable/update', { method: 'POST', body: JSON.stringify({ classGroup, date, slotIndex, data }) });

// User Management & Settings
export const getProfile = () => request('/users/profile');
export const updateUser = (uid, data) => request(`/users/${uid}`, { method: 'PUT', body: JSON.stringify(data) });
export const updatePassword = (uid, oldPassword, newPassword) => request(`/users/${uid}/password`, { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) });

// Notices & Announcements
export const createNotice = (data) => request('/notices', { method: 'POST', body: JSON.stringify(data) });
export const getNotices = (classGroup = '', uid = '') => request(`/notices?classGroup=${encodeURIComponent(classGroup)}&uid=${encodeURIComponent(uid)}`);
export const getLowAttendanceStudents = () => request('/teacher/low-attendance');

// Device Security
export const verifyDeviceFingerprint = (deviceFingerprint, studentUid) => request('/auth/verify-device', { method: 'POST', body: JSON.stringify({ deviceFingerprint, studentUid }) });
export const resetDeviceFingerprint = (studentUid) => request(`/admin/users/${studentUid}/reset-device`, { method: 'POST' });

// System Config & Promotion
export const getSystemConfig = () => request('/system/config');
export const promoteSystemSession = (newAcademicSession) => request('/admin/system/promote', { method: 'POST', body: JSON.stringify({ newAcademicSession }) });

// CC (Class Coordinator) management — admin only
export const setTeacherAsCC = (uid, data) => request(`/admin/users/${uid}/set-cc`, { method: 'PUT', body: JSON.stringify(data) });

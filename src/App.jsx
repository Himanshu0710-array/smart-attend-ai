import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SessionProvider } from './contexts/SessionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import StudentDashboard from './pages/StudentDashboard';
import MarkAttendance from './pages/MarkAttendance';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminDashboard from './pages/AdminDashboard';
import StudentSettings from './pages/StudentSettings';

function DashboardRedirect() {
  const { userData } = useAuth();

  if (!userData) return <div className="flex items-center justify-center h-64 text-slate-500">Loading...</div>;

  if (userData.role === 'admin') return <Navigate to="/admin" replace />;
  if (userData.role === 'teacher') return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
      <AuthProvider>
        <SessionProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Routes inside Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardRedirect />} />

            {/* Student Routes */}
            <Route path="student" element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            } />
            <Route path="student/attendance" element={
              <ProtectedRoute allowedRoles={['student']}>
                <MarkAttendance />
              </ProtectedRoute>
            } />
            <Route path="student/settings" element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentSettings />
              </ProtectedRoute>
            } />

            {/* Teacher Routes */}
            <Route path="teacher" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherDashboard />
              </ProtectedRoute>
            } />
            <Route path="teacher/sessions" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherDashboard />
              </ProtectedRoute>
            } />
            <Route path="teacher/settings" element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Settings</h2>
                  <p className="text-slate-500">Teacher settings coming soon.</p>
                </div>
              </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="admin/users" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="admin/classrooms" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="admin/settings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Admin Settings</h2>
                  <p className="text-slate-500">System settings coming soon.</p>
                </div>
              </ProtectedRoute>
            } />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Router>
        </SessionProvider>
      </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;

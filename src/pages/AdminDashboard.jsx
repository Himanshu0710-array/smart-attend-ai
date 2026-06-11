import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import BulkImportModal from '../components/BulkImportModal';
import {
  Users, UserPlus, MapPin, BarChart3, Search,
  Pencil, Trash2, GraduationCap, Building2, FileSpreadsheet, LocateFixed, Save, X, Shield, ShieldCheck
} from 'lucide-react';

export default function AdminDashboard() {
  const { userData } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
  const [users, setUsers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Academic Session & Promotion States
  const [academicSessionInput, setAcademicSessionInput] = useState('');
  const [currentAcademicSession, setCurrentAcademicSession] = useState('');
  const [promoting, setPromoting] = useState(false);

  // Modals state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'student', rollNumber: '', section: '', branch: 'CSE', year: '1st Year' });
  
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);

  // Subject assignment for teacher modal
  const [assignSubName, setAssignSubName] = useState('');
  const [assignYear, setAssignYear] = useState('1st Year');
  const [assignSection, setAssignSection] = useState('');
  const [assignBranch, setAssignBranch] = useState('CSE');

  // Classroom modal states
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [newClassroom, setNewClassroom] = useState({ name: '', c1_lat: '', c1_lon: '', c2_lat: '', c2_lon: '', c3_lat: '', c3_lon: '', c4_lat: '', c4_lon: '' });
  const [showEditClassroomModal, setShowEditClassroomModal] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState(null);

  // Subject modal states
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', code: '', year: '1st Year' });
  const [showEditSubjectModal, setShowEditSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);

  // CC assignment state (in edit user modal)
  const [ccForm, setCcForm] = useState({ isCC: false, ccSection: '', ccBranch: 'CSE', ccYear: '1st Year' });
  const [savingCC, setSavingCC] = useState(false);

  const [detectingGPS, setDetectingGPS] = useState(null); // stores corner identifier like 'c1', 'c2', 'c3', 'c4' or false

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [u, c, s, sys] = await Promise.all([
        api.getUsers(),
        api.getClassrooms(),
        api.getSubjects(),
        api.getSystemConfig()
      ]);
      setUsers(u);
      setClassrooms(c);
      setSubjects(s);
      setCurrentAcademicSession(sys.currentAcademicSession || '2025-26');
      setAcademicSessionInput(sys.currentAcademicSession || '2025-26');
    } catch (e) {
      console.error('Error fetching admin data:', e);
    } finally {
      setLoading(false);
    }
  }

  const handlePromoteStudents = async () => {
    if (!academicSessionInput.trim()) {
      toast.error('Session name cannot be empty');
      return;
    }
    if (academicSessionInput.trim() === currentAcademicSession) {
      toast.error('New session must be different from current session');
      return;
    }
    const confirmMsg = `Are you sure you want to promote all students to academic session ${academicSessionInput.trim()}?\nThis will advance their academic year and cannot be easily undone.`;
    if (!window.confirm(confirmMsg)) return;
    
    setPromoting(true);
    try {
      await api.promoteSystemSession(academicSessionInput.trim());
      toast.success('Students promoted and session updated successfully!');
      fetchData();
    } catch (error) {
      toast.error(error.error || 'Failed to promote students');
    } finally {
      setPromoting(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUser);
      toast.success('User created successfully!');
      setShowUserModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'student', rollNumber: '', section: '', branch: 'CSE', year: '1st Year' });
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to create user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...editUser,
        isCC: ccForm.isCC,
        ccSection: ccForm.isCC ? ccForm.ccSection : undefined,
        ccBranch: ccForm.isCC ? ccForm.ccBranch : undefined,
        ccYear: ccForm.isCC ? ccForm.ccYear : undefined
      };
      await api.updateUser(editUser.uid, payload);
      toast.success('User updated successfully!');
      setShowEditUserModal(false);
      setEditUser(null);
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to update user');
    }
  };

  const openEditModal = (user) => {
    setEditUser({ 
      ...user,
      assignedSubjects: user.assignedSubjects || [] 
    });
    setCcForm({
      isCC: user.isCC || false,
      ccSection: user.ccSection || '',
      ccBranch: user.ccBranch || 'CSE',
      ccYear: user.ccYear || '1st Year'
    });
    setAssignSubName('');
    setShowEditUserModal(true);
  };

  const handleAddAssignment = (e) => {
    e.preventDefault();
    if (!assignSubName || !assignYear || !assignSection || !assignBranch) {
      toast.error('Please fill in all assignment fields');
      return;
    }
    
    const newAssignment = {
      subjectName: assignSubName,
      year: assignYear,
      section: assignSection,
      branch: assignBranch
    };
    
    const exists = editUser.assignedSubjects.some(as => 
      as.subjectName === newAssignment.subjectName &&
      as.year === newAssignment.year &&
      as.section === newAssignment.section &&
      as.branch === newAssignment.branch
    );
    
    if (exists) {
      toast.error('This assignment already exists');
      return;
    }
    
    setEditUser({
      ...editUser,
      assignedSubjects: [...editUser.assignedSubjects, newAssignment]
    });
    setAssignSubName('');
  };

  const handleDeleteUser = async (uid, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(uid);
      toast.success('User deleted.');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete user');
    }
  };

  const handleSaveCC = async () => {
    if (!editUser) return;
    setSavingCC(true);
    try {
      const payload = ccForm.isCC
        ? { isCC: true, ccSection: ccForm.ccSection, ccBranch: ccForm.ccBranch, ccYear: ccForm.ccYear }
        : { isCC: false };
      const updatedTeacher = await api.setTeacherAsCC(editUser.uid, payload);
      
      // Update local editUser so that saving other details doesn't overwrite / revert CC info
      setEditUser(prev => ({
        ...prev,
        isCC: updatedTeacher.isCC,
        ccSection: updatedTeacher.ccSection,
        ccBranch: updatedTeacher.ccBranch,
        ccYear: updatedTeacher.ccYear
      }));

      toast.success(ccForm.isCC
        ? `${editUser.name} is now CC of ${ccForm.ccYear} Sec ${ccForm.ccSection} (${ccForm.ccBranch})`
        : `CC role removed from ${editUser.name}`);
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to update CC status');
    } finally {
      setSavingCC(false);
    }
  };

  // Classroom handlers
  const handleCreateClassroom = async (e) => {
    e.preventDefault();
    try {
      await api.createClassroom(newClassroom);
      toast.success('Classroom created!');
      setShowClassroomModal(false);
      setNewClassroom({ name: '', c1_lat: '', c1_lon: '', c2_lat: '', c2_lon: '', c3_lat: '', c3_lon: '', c4_lat: '', c4_lon: '' });
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to create classroom');
    }
  };

  const handleEditClassroom = async (e) => {
    e.preventDefault();
    try {
      await api.updateClassroom(editingClassroom.id, editingClassroom);
      toast.success('Classroom updated!');
      setShowEditClassroomModal(false);
      setEditingClassroom(null);
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to update classroom');
    }
  };

  const openEditClassroom = (room) => {
    setEditingClassroom({ ...room });
    setShowEditClassroomModal(true);
  };

  const handleDeleteClassroom = async (id, name) => {
    if (!window.confirm(`Delete classroom "${name}"?`)) return;
    try {
      await api.deleteClassroom(id);
      toast.success('Classroom deleted.');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete classroom');
    }
  };

  // Subject handlers
  const handleCreateSubject = async (e) => {
    e.preventDefault();
    try {
      await api.createSubject(newSubject);
      toast.success('Subject created!');
      setShowSubjectModal(false);
      setNewSubject({ name: '', code: '', year: '1st Year' });
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to create subject');
    }
  };

  const handleEditSubject = async (e) => {
    e.preventDefault();
    try {
      await api.updateSubject(editingSubject.id, editingSubject);
      toast.success('Subject updated!');
      setShowEditSubjectModal(false);
      setEditingSubject(null);
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to update subject');
    }
  };

  const openEditSubject = (subject) => {
    setEditingSubject({ ...subject });
    setShowEditSubjectModal(true);
  };

  const handleDeleteSubject = async (id, name) => {
    if (!window.confirm(`Delete subject "${name}"?`)) return;
    try {
      await api.deleteSubject(id);
      toast.success('Subject deleted.');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete subject');
    }
  };

  const detectCornerGPS = (cornerKey, setter) => {
    setDetectingGPS(cornerKey);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setter(prev => ({
          ...prev,
          [`${cornerKey}_lat`]: pos.coords.latitude.toFixed(6),
          [`${cornerKey}_lon`]: pos.coords.longitude.toFixed(6)
        }));
        setDetectingGPS(null);
        toast.success(`Corner ${cornerKey.toUpperCase()} detected!`);
      },
      () => {
        toast.error('Could not get location. Please enable GPS permissions.');
        setDetectingGPS(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const students = users.filter(u => u.role === 'student');
  const teachers = users.filter(u => u.role === 'teacher');
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'classrooms', label: 'Classrooms', icon: Building2 },
    { id: 'subjects', label: 'Subjects', icon: FileSpreadsheet },
  ];

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage users and system settings</p>
      </div>

      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Students', value: students.length, icon: GraduationCap, bg: 'bg-blue-50 dark:bg-blue-900/20', iconBg: 'from-blue-500 to-blue-600' },
              { label: 'Total Teachers', value: teachers.length, icon: Users, bg: 'bg-purple-50 dark:bg-purple-900/20', iconBg: 'from-purple-500 to-purple-600' },
              { label: 'Total Classrooms', value: classrooms.length, icon: Building2, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconBg: 'from-emerald-500 to-emerald-600' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${stat.bg} rounded-2xl p-5 border border-slate-200/50 dark:border-slate-800/50`}>
                  <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${stat.iconBg} mb-3`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="pro-card p-6 bg-slate-50 dark:bg-slate-850/50 border border-slate-200 dark:border-slate-800/80 rounded-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-500" />
              Academic Session & Student Promotion
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-2xl">
              Updating the academic session will promote all active students to the next academic year (e.g., 1st Year → 2nd Year).
            </p>
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="flex-1 max-w-xs w-full">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Active Session</label>
                <input 
                  type="text" 
                  value={academicSessionInput} 
                  onChange={e => setAcademicSessionInput(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg dark:bg-slate-800 dark:text-white font-mono text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button 
                onClick={handlePromoteStudents}
                disabled={promoting}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg hover:shadow-md transition-shadow disabled:opacity-50 flex items-center gap-2"
              >
                {promoting ? 'Promoting...' : 'Promote Students & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="pro-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="admin">Admins</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBulkModal(true)} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 hover:shadow-md transition-shadow">
                <FileSpreadsheet className="w-4 h-4" />
                Import CSV
              </button>
              <button onClick={() => setShowUserModal(true)} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 hover:shadow-md transition-shadow">
                <UserPlus className="w-4 h-4" />
                Add User
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Name</th>
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Email</th>
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Role</th>
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Section</th>
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.uid} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium text-sm text-slate-900 dark:text-white block">{user.name}</span>
                          {user.rollNumber && <span className="text-xs text-slate-400 font-mono">{user.rollNumber}</span>}
                          {user.role === 'teacher' && user.isCC && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full mt-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              CC: Sec {user.ccSection} {user.ccBranch} {user.ccYear}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm text-slate-600 dark:text-slate-300">{user.email}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.role === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-sm text-slate-600 dark:text-slate-300">{user.section || '-'}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditModal(user)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteUser(user.uid, user.name)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'classrooms' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowClassroomModal(true)} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 hover:shadow-md transition-shadow">
              <Building2 className="w-4 h-4" />
              Add Classroom
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classrooms.map((room) => (
              <div key={room.id} className="pro-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditClassroom(room)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500 transition-colors" title="Edit classroom">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteClassroom(room.id, room.name)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors" title="Delete classroom">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{room.name}</h3>
                <div className="p-2 bg-slate-50/50 dark:bg-slate-800/50 rounded-lg grid grid-cols-2 gap-1 font-mono text-[10px] text-slate-500">
                  <div>C1: {room.c1_lat?.toFixed(5)}, {room.c1_lon?.toFixed(5)}</div>
                  <div>C2: {room.c2_lat?.toFixed(5)}, {room.c2_lon?.toFixed(5)}</div>
                  <div>C3: {room.c3_lat?.toFixed(5)}, {room.c3_lon?.toFixed(5)}</div>
                  <div>C4: {room.c4_lat?.toFixed(5)}, {room.c4_lon?.toFixed(5)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowSubjectModal(true)} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 hover:shadow-md transition-shadow">
              <FileSpreadsheet className="w-4 h-4" />
              Add Subject
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year) => {
              const yearSubjects = subjects.filter(s => s.year === year);
              return (
                <div key={year} className="pro-card p-6 border-t-4 border-t-purple-500">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{year}</h3>
                  <div className="space-y-2">
                    {yearSubjects.map(sub => (
                      <div key={sub.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-sm">{sub.name}</p>
                          <p className="text-xs text-slate-400">{sub.code}</p>
                        </div>
                        <div className="flex gap-0.5">
                          <button onClick={() => openEditSubject(sub)} className="p-1 hover:text-blue-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteSubject(sub.id, sub.name)} className="p-1 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add User</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 dark:text-white">Role</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div><input type="text" placeholder="Name" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="email" placeholder="Email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="password" placeholder="Password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              
              {newUser.role === 'student' && (
                <>
                  <div>
                    <label className="block text-sm mb-1 dark:text-white">Academic Year</label>
                    <select value={newUser.year || '1st Year'} onChange={e => setNewUser({...newUser, year: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                  <div><input type="text" placeholder="Branch (e.g. CSE)" required value={newUser.branch} onChange={e => setNewUser({...newUser, branch: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Section (e.g. A)" required value={newUser.section} onChange={e => setNewUser({...newUser, section: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Roll Number" value={newUser.rollNumber} onChange={e => setNewUser({...newUser, rollNumber: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                </>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowUserModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditUserModal && editUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Edit User</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm mb-1 dark:text-white">Role</label>
                <select value={editUser.role} onChange={e => setEditUser({...editUser, role: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div><input type="text" placeholder="Name" required value={editUser.name} onChange={e => setEditUser({...editUser, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="email" placeholder="Email" required value={editUser.email} onChange={e => setEditUser({...editUser, email: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              
              {editUser.role === 'student' && (
                <>
                  <div>
                    <label className="block text-sm mb-1 dark:text-white">Academic Year</label>
                    <select value={editUser.year || '1st Year'} onChange={e => setEditUser({...editUser, year: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                  <div><input type="text" placeholder="Branch (e.g. CSE)" required value={editUser.branch || ''} onChange={e => setEditUser({...editUser, branch: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Section (e.g. A)" required value={editUser.section || ''} onChange={e => setEditUser({...editUser, section: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Roll Number" value={editUser.rollNumber || ''} onChange={e => setEditUser({...editUser, rollNumber: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                </>
              )}

              {editUser.role === 'teacher' && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    📚 Assigned Subjects ({editUser.assignedSubjects?.length || 0})
                  </h3>
                  
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {(editUser.assignedSubjects || []).length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic">No subjects assigned yet.</p>
                    ) : (
                      (editUser.assignedSubjects || []).map((as, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="font-semibold text-slate-950 dark:text-white">{as.subjectName}</span>
                            <span className="text-slate-400 block">{as.year} • Sec {as.section} ({as.branch})</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setEditUser({
                              ...editUser,
                              assignedSubjects: editUser.assignedSubjects.filter((_, i) => i !== idx)
                            })}
                            className="p-1 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <select value={assignSubName} onChange={e => setAssignSubName(e.target.value)} className="w-full p-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                          <option value="">Select Subject</option>
                          {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <select value={assignYear} onChange={e => setAssignYear(e.target.value)} className="w-full p-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Branch (e.g. CSE)" value={assignBranch} onChange={e => setAssignBranch(e.target.value)} className="w-full p-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
                      <input type="text" placeholder="Section (e.g. A)" value={assignSection} onChange={e => setAssignSection(e.target.value)} className="w-full p-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
                    </div>
                    <button type="button" onClick={handleAddAssignment} className="w-full py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors">+ Add Subject Assignment</button>
                  </div>
                </div>
              )}

              {editUser.role === 'teacher' && (
                <div className="border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-900/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Class Coordinator (CC)
                    </h3>
                    {editUser.isCC && (
                      <span className="text-[10px] font-bold bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                        Currently CC
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    CC teachers can view &amp; update all students in their section, and start sessions for any subject in their section.
                  </p>

                  {/* Toggle CC */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="ccToggle"
                      checked={ccForm.isCC}
                      onChange={e => setCcForm({ ...ccForm, isCC: e.target.checked })}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Make this teacher a Class Coordinator</span>
                  </label>

                  {ccForm.isCC && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Year</label>
                          <select
                            value={ccForm.ccYear}
                            onChange={e => setCcForm({ ...ccForm, ccYear: e.target.value })}
                            className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                          >
                            <option value="1st Year">1st Year</option>
                            <option value="2nd Year">2nd Year</option>
                            <option value="3rd Year">3rd Year</option>
                            <option value="4th Year">4th Year</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Branch</label>
                          <input
                            type="text"
                            placeholder="e.g. CSE"
                            value={ccForm.ccBranch}
                            onChange={e => setCcForm({ ...ccForm, ccBranch: e.target.value })}
                            className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Section</label>
                          <input
                            type="text"
                            placeholder="e.g. A"
                            value={ccForm.ccSection}
                            onChange={e => setCcForm({ ...ccForm, ccSection: e.target.value })}
                            className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveCC}
                    disabled={savingCC || (ccForm.isCC && (!ccForm.ccSection || !ccForm.ccBranch))}
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white border border-amber-400 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {savingCC ? 'Saving...' : (ccForm.isCC ? 'Save CC Assignment' : 'Remove CC Role')}
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setShowEditUserModal(false); setEditUser(null); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Modal — REMOVED */}
      {/* Edit Batch Modal — REMOVED */}

      {/* Classroom Modal (Add) */}
      {showClassroomModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="pro-card p-6 w-full max-w-lg my-8">
            <h2 className="text-xl font-bold mb-2 dark:text-white">Add Classroom</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
              📍 Stand at each of the **4 corners** of the room and click the corresponding **📡 Detect** button to define the classroom boundary.
            </p>
            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div>
                <input type="text" placeholder="Classroom Name (e.g. Room 401)" required value={newClassroom.name} onChange={e => setNewClassroom({...newClassroom, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-medium" />
              </div>
              
              {/* 4 Corners coordinate fields */}
              {['c1', 'c2', 'c3', 'c4'].map((corner, i) => (
                <div key={corner} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Corner {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => detectCornerGPS(corner, setNewClassroom)}
                      disabled={detectingGPS !== null}
                      className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-250 dark:border-emerald-805 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <LocateFixed className={`w-3.5 h-3.5 ${detectingGPS === corner ? 'animate-pulse' : ''}`} />
                      {detectingGPS === corner ? 'Detecting...' : '📡 Detect'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input type="number" step="any" placeholder="Latitude" required value={newClassroom[`${corner}_lat`] || ''} onChange={e => setNewClassroom({...newClassroom, [`${corner}_lat`]: e.target.value})} className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" />
                    </div>
                    <div>
                      <input type="number" step="any" placeholder="Longitude" required value={newClassroom[`${corner}_lon`] || ''} onChange={e => setNewClassroom({...newClassroom, [`${corner}_lon`]: e.target.value})} className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowClassroomModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Classroom Modal (Edit) */}
      {showEditClassroomModal && editingClassroom && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="pro-card p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold dark:text-white">Edit Classroom</h2>
              <button onClick={() => { setShowEditClassroomModal(false); setEditingClassroom(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-100 dark:border-slate-850">
              📍 Walk to any corner that needs update and click Detect, or adjust the coordinates manually.
            </p>
            <form onSubmit={handleEditClassroom} className="space-y-4">
              <div>
                <input type="text" placeholder="Classroom Name" required value={editingClassroom.name} onChange={e => setEditingClassroom({...editingClassroom, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-medium" />
              </div>
              
              {/* 4 Corners coordinate fields */}
              {['c1', 'c2', 'c3', 'c4'].map((corner, i) => (
                <div key={corner} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Corner {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => detectCornerGPS(corner, setEditingClassroom)}
                      disabled={detectingGPS !== null}
                      className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-955 border border-emerald-250 dark:border-emerald-805 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <LocateFixed className={`w-3.5 h-3.5 ${detectingGPS === corner ? 'animate-pulse' : ''}`} />
                      {detectingGPS === corner ? 'Detecting...' : '📡 Detect'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input type="number" step="any" placeholder="Latitude" required value={editingClassroom[`${corner}_lat`] || ''} onChange={e => setEditingClassroom({...editingClassroom, [`${corner}_lat`]: e.target.value})} className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" />
                    </div>
                    <div>
                      <input type="number" step="any" placeholder="Longitude" required value={editingClassroom[`${corner}_lon`] || ''} onChange={e => setEditingClassroom({...editingClassroom, [`${corner}_lon`]: e.target.value})} className="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setShowEditClassroomModal(false); setEditingClassroom(null); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subject Modal (Add) */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add Subject</h2>
            <form onSubmit={handleCreateSubject} className="space-y-4">
              <div><input type="text" placeholder="Subject Name (e.g. Compiler Design)" required value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="text" placeholder="Subject Code (e.g. CS-402)" required value={newSubject.code} onChange={e => setNewSubject({...newSubject, code: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" /></div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Academic Year</label>
                <select value={newSubject.year} onChange={e => setNewSubject({...newSubject, year: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowSubjectModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white font-medium">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subject Modal (Edit) */}
      {showEditSubjectModal && editingSubject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold dark:text-white">Edit Subject</h2>
              <button onClick={() => { setShowEditSubjectModal(false); setEditingSubject(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubject} className="space-y-4">
              <div><input type="text" placeholder="Subject Name" required value={editingSubject.name} onChange={e => setEditingSubject({...editingSubject, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="text" placeholder="Subject Code" required value={editingSubject.code || ''} onChange={e => setEditingSubject({...editingSubject, code: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white font-mono" /></div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Academic Year</label>
                <select value={editingSubject.year || '1st Year'} onChange={e => setEditingSubject({...editingSubject, year: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setShowEditSubjectModal(false); setEditingSubject(null); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

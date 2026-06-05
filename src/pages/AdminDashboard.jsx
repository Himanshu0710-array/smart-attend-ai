import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import BulkImportModal from '../components/BulkImportModal';
import {
  Users, UserPlus, MapPin, BarChart3, Search,
  Pencil, Trash2, GraduationCap, Building2, FileSpreadsheet
} from 'lucide-react';

export default function AdminDashboard() {
  const { userData } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
  const [users, setUsers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'student', rollNumber: '', section: '', branch: '', batch: '' });
  
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: '', room: '', teacher: '', lat: 26.8529, lon: 75.7841, radius: 50 });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [u, b] = await Promise.all([
        api.getUsers(),
        api.getClassrooms() // we alias this to batches
      ]);
      setUsers(u);
      setBatches(b);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.createUser(newUser);
      toast.success('User created successfully!');
      setShowUserModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'student', section: '', rollNumber: '' });
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to create user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await api.updateUser(editUser.uid, editUser);
      toast.success('User updated successfully!');
      setShowEditUserModal(false);
      setEditUser(null);
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to update user');
    }
  };

  const openEditModal = (user) => {
    setEditUser({ ...user });
    setShowEditUserModal(true);
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

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    try {
      const b = { ...newBatch, section: newBatch.name };
      await api.createBatch(b);
      toast.success('Batch created!');
      setShowBatchModal(false);
      setNewBatch({ name: '', room: '', teacher: '', lat: 26.8529, lon: 75.7841, radius: 50 });
      fetchData();
    } catch (e) {
      toast.error(e.error || 'Failed to create batch');
    }
  };

  const handleDeleteBatch = async (id, name) => {
    if (!window.confirm(`Delete batch "${name}"?`)) return;
    try {
      await api.deleteBatch(id);
      toast.success('Batch deleted.');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete batch');
    }
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
    { id: 'classrooms', label: 'Batches', icon: MapPin },
  ];

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Admin Panel</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage users, batches, and system settings</p>
      </div>

      {/* Tabs */}
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

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Students', value: students.length, icon: GraduationCap, bg: 'bg-blue-50 dark:bg-blue-900/20', iconBg: 'from-blue-500 to-blue-600' },
              { label: 'Total Teachers', value: teachers.length, icon: Users, bg: 'bg-purple-50 dark:bg-purple-900/20', iconBg: 'from-purple-500 to-purple-600' },
              { label: 'Total Batches', value: batches.length, icon: Building2, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconBg: 'from-emerald-500 to-emerald-600' },
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
        </div>
      )}

      {/* Users Tab */}
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
                  <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Batch</th>
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

      {/* Batches Tab */}
      {activeTab === 'classrooms' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 hover:shadow-md transition-shadow">
              <MapPin className="w-4 h-4" />
              Add Batch
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map((room) => (
              <div key={room.id} className="pro-card p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleDeleteBatch(room.id, room.name)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{room.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Room: {room.room} | Teacher: {room.teacher}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-slate-400">Lat</p>
                    <p className="font-mono font-medium text-slate-700 dark:text-slate-300">{room.lat}°</p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <p className="text-slate-400">Lon</p>
                    <p className="font-mono font-medium text-slate-700 dark:text-slate-300">{room.lon}°</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Modal */}
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
                    <select 
                      value={newUser.batch} 
                      onChange={e => setNewUser({...newUser, batch: e.target.value})} 
                      className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      required
                    >
                      <option value="" disabled>Select Batch</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
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

      {/* Edit User Modal */}
      {showEditUserModal && editUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md">
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
                    <select 
                      value={editUser.batch || ''} 
                      onChange={e => setEditUser({...editUser, batch: e.target.value})} 
                      className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      required
                    >
                      <option value="" disabled>Select Batch</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div><input type="text" placeholder="Branch (e.g. CSE)" required value={editUser.branch || ''} onChange={e => setEditUser({...editUser, branch: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Section (e.g. A)" required value={editUser.section || ''} onChange={e => setEditUser({...editUser, section: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                  <div><input type="text" placeholder="Roll Number" value={editUser.rollNumber || ''} onChange={e => setEditUser({...editUser, rollNumber: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                </>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => { setShowEditUserModal(false); setEditUser(null); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="pro-card p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add Batch</h2>
            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div><input type="text" placeholder="Batch Name" required value={newBatch.name} onChange={e => setNewBatch({...newBatch, name: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="text" placeholder="Room (e.g. Audi-A)" required value={newBatch.room} onChange={e => setNewBatch({...newBatch, room: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div><input type="text" placeholder="Default Teacher" required value={newBatch.teacher} onChange={e => setNewBatch({...newBatch, teacher: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><input type="number" step="any" placeholder="Latitude" required value={newBatch.lat} onChange={e => setNewBatch({...newBatch, lat: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
                <div><input type="number" step="any" placeholder="Longitude" required value={newBatch.lon} onChange={e => setNewBatch({...newBatch, lon: e.target.value})} className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" /></div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowBatchModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg dark:text-white">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <BulkImportModal
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => { setShowBulkModal(false); fetchData(); }}
        />
      )}

    </div>
  );
}

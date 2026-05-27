import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import {
  Users, Play, Square, Clock, CheckCircle, XCircle, AlertTriangle,
  Eye, FileSpreadsheet, FileText, RefreshCw, MapPin, Search, Calendar as CalendarIcon, Download, Edit3, X, Save
} from 'lucide-react';

const statusStyles = {
  'Present': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Absent': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Late Entry': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Left Early': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const statusIcons = {
  'Present': CheckCircle,
  'Absent': XCircle,
  'Late Entry': Clock,
  'Left Early': AlertTriangle,
};


export default function TeacherDashboard() {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'history', 'timetable'

  // Live Session State
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sessionSubject, setSessionSubject] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [studentList, setStudentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  // History State
  const [historySessions, setHistorySessions] = useState([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Timetable State
  const [timetableData, setTimetableData] = useState({});
  const [selectedBatch, setSelectedBatch] = useState('');
  const [editingCell, setEditingCell] = useState(null); // { date, slotIndex, data }

  const teacherName = userData?.name || 'Teacher';

  // Load classrooms on mount
  useEffect(() => {
    api.getClassrooms().then(data => {
      setClassrooms(data);
      if (data.length > 0) {
        setSelectedClassId(data[0].id);
        if (!selectedBatch) setSelectedBatch(data[0].name);
      }
    }).catch(console.error);
  }, []);

  // Poll for active sessions
  useEffect(() => {
    const check = async () => {
      if (activeTab !== 'live') return;
      try {
        const sessions = await api.getSessions();
        const mySession = sessions.find(s => s.teacher === teacherName);
        if (mySession) {
          setActiveSession(mySession);
        } else {
          setActiveSession(null);
          setStudentList([]);
        }
      } catch (e) { console.error(e); }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [activeTab, teacherName]);

  // Poll attendance records for the active session
  const fetchRecords = useCallback(async () => {
    if (!activeSession || activeTab !== 'live') return;
    try {
      const records = await api.getAttendance(activeSession.id);
      const list = Object.entries(records).map(([uid, data]) => ({ uid, ...data }));
      setStudentList(list);
    } catch (e) { console.error(e); }
  }, [activeSession, activeTab]);

  useEffect(() => {
    fetchRecords();
    if (activeSession && activeTab === 'live') {
      const interval = setInterval(fetchRecords, 3000); // Poll every 3 seconds
      return () => clearInterval(interval);
    }
  }, [activeSession, fetchRecords, activeTab]);

  // Fetch History when tab changes to history
  useEffect(() => {
    if (activeTab === 'history') {
      api.getTeacherHistory(teacherName).then(data => {
        setHistorySessions(data);
        if (data.length > 0 && !selectedHistorySession) {
          setSelectedHistorySession(data[0]);
        }
      }).catch(console.error);
    }
  }, [activeTab, teacherName, selectedHistorySession]);

  // Fetch Timetable when tab changes to timetable
  useEffect(() => {
    if (activeTab === 'timetable') {
      api.getTimetable().then(data => {
        setTimetableData(data);
      }).catch(console.error);
    }
  }, [activeTab]);

  const present = studentList.filter(s => s.status === 'Present').length;
  const absent = studentList.filter(s => s.status === 'Absent').length;
  const late = studentList.filter(s => s.status === 'Late Entry').length;
  const left = studentList.filter(s => s.status === 'Left Early').length;

  async function handleStartSession() {
    setLoading(true);
    setLocationError('');

    const startWithLocation = async (lat, lon) => {
      try {
        const session = await api.startSession(selectedClassId, teacherName, sessionSubject, lat, lon);
        setActiveSession(session);
      } catch (e) {
        console.error(e);
        setLocationError('Failed to start session on the server.');
      }
      setLoading(false);
    };

    if (!navigator.geolocation) {
      startWithLocation(undefined, undefined);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        startWithLocation(latitude, longitude);
      },
      (error) => {
        console.warn('Geolocation failed', error);
        startWithLocation(undefined, undefined);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function handleEndSession() {
    if (!activeSession) return;
    setLoading(true);
    try {
      await api.endSession(activeSession.id);
      setActiveSession(null);
      setStudentList([]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function exportCSV(recordsArray, className) {
    const headers = 'Name,Roll Number,Status,Check-in Time,Distance,Re-checks\n';
    const rows = recordsArray.map(s => `${s.studentName},${s.roll},${s.status},${s.markedAt ? new Date(s.markedAt).toLocaleTimeString() : '-'},${s.distance || '-'},${s.reverifications || 0}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${className}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Handle Timetable save
  async function handleSaveCell() {
    if (!editingCell) return;
    try {
      await api.updateTimetable(selectedBatch, editingCell.date, editingCell.slotIndex, editingCell.data);
      // Update local state
      const newData = { ...timetableData };
      const dayRow = newData[selectedBatch].find(d => d.date === editingCell.date);
      if (dayRow) {
        dayRow.slots[editingCell.slotIndex] = { ...dayRow.slots[editingCell.slotIndex], ...editingCell.data };
        setTimetableData(newData);
      }
      setEditingCell(null);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">Teacher Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Welcome, {teacherName} • {userData?.department || 'Department'}
          </p>
        </div>
        {activeSession && activeTab === 'live' && (
          <button onClick={fetchRecords} className="p-2 text-slate-500 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Refresh">
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-full max-w-md">
        {[
          { id: 'live', label: 'Live Session' },
          { id: 'history', label: 'History & Reports' },
          { id: 'timetable', label: 'Time Table' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =========================================================================
          TAB: LIVE SESSION
          ========================================================================= */}
      {activeTab === 'live' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Present', value: present, icon: CheckCircle, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'from-emerald-500 to-emerald-600' },
              { label: 'Absent', value: absent, icon: XCircle, bg: 'bg-red-50 dark:bg-red-900/20', iconColor: 'from-red-500 to-red-600' },
              { label: 'Late Entry', value: late, icon: Clock, bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'from-amber-500 to-orange-600' },
              { label: 'Left Early', value: left, icon: AlertTriangle, bg: 'bg-orange-50 dark:bg-orange-900/20', iconColor: 'from-orange-500 to-orange-600' },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className={`${stat.bg} rounded-2xl p-5 border border-slate-200/50 dark:border-slate-800/50`}>
                  <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${stat.iconColor} mb-3`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex justify-between items-center">
              <span>Session Control</span>
              {!activeSession && (
                <span className="text-xs font-normal bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Uses your live GPS on start
                </span>
              )}
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Select Batch</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={!!activeSession}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:opacity-50"
                >
                  {classrooms.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name} ({cls.room})</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Subject (Optional)</label>
                <input
                  type="text"
                  value={sessionSubject}
                  onChange={(e) => setSessionSubject(e.target.value)}
                  disabled={!!activeSession}
                  placeholder="e.g. DSA, SI Practice"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:opacity-50"
                />
              </div>

              {!activeSession ? (
                <button onClick={handleStartSession} disabled={loading} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 disabled:opacity-50">
                  <Play className="w-4 h-4" />
                  {loading ? 'Starting...' : 'Start Session'}
                </button>
              ) : (
                <button onClick={handleEndSession} disabled={loading} className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-500/30 transition-all flex items-center gap-2 disabled:opacity-50">
                  <Square className="w-4 h-4" />
                  {loading ? 'Ending...' : 'End Session'}
                </button>
              )}
            </div>
            {locationError && (
              <p className="mt-3 text-sm text-red-500">{locationError}</p>
            )}

            {activeSession && (
              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="font-medium">Live:</span> {activeSession.className} — Started at {new Date(activeSession.startTime).toLocaleTimeString()}
                <span className="ml-2 text-xs opacity-75 hidden sm:inline">(Lat: {activeSession.lat.toFixed(4)}, Lon: {activeSession.lon.toFixed(4)})</span>
                <span className="ml-auto text-xs text-emerald-600/60">Auto-refreshing every 3s</span>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                Live Attendance
                {activeSession && <span className="text-sm font-normal text-slate-500">({studentList.length} students)</span>}
              </h2>
              {activeSession && (
                <div className="flex gap-2">
                  <button onClick={() => exportCSV(studentList, activeSession.className)} className="px-3 py-1.5 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </button>
                </div>
              )}
            </div>

            {!activeSession ? (
              <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No active session</p>
                <p className="text-sm mt-1">Start a class session to see live attendance</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Student</th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Roll No.</th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Status</th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Time</th>
                      <th className="text-left py-3 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentList.map((student) => {
                      const Icon = statusIcons[student.status] || XCircle;
                      return (
                        <tr key={student.uid} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                                {student.studentName?.charAt(0)}
                              </div>
                              <span className="font-medium text-sm text-slate-900 dark:text-white">{student.studentName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-sm text-slate-600 dark:text-slate-300 font-mono">{student.roll}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusStyles[student.status] || ''}`}>
                              <Icon className="w-3.5 h-3.5" />
                              {student.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400">
                            {student.markedAt ? new Date(student.markedAt).toLocaleTimeString() : '-'}
                          </td>
                          <td className="py-3 px-3 text-sm text-slate-500 dark:text-slate-400">{student.distance || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* =========================================================================
          TAB: HISTORY & REPORTS
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Past Sessions</h2>
            {historySessions.length === 0 ? (
              <p className="text-slate-500 text-sm">No historical sessions found.</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {historySessions.map(session => (
                  <button
                    key={session.sessionId}
                    onClick={() => setSelectedHistorySession(session)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedHistorySession?.sessionId === session.sessionId
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                  >
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{session.className}</p>
                    <p className="text-xs text-slate-500 mt-1">{session.date} • {new Date(session.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            {!selectedHistorySession ? (
              <div className="text-center py-12 text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a past session to view details</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedHistorySession.className}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedHistorySession.date} • {selectedHistorySession.room} • {selectedHistorySession.records.length} Students
                    </p>
                  </div>
                  <button
                    onClick={() => exportCSV(selectedHistorySession.records, selectedHistorySession.className)}
                    className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download CSV
                  </button>
                </div>

                <div className="relative mb-6">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search student by name or roll number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm transition-colors"
                  />
                </div>

                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="text-left py-3 px-3 text-sm font-medium text-slate-500">Student</th>
                        <th className="text-left py-3 px-3 text-sm font-medium text-slate-500">Roll No.</th>
                        <th className="text-left py-3 px-3 text-sm font-medium text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHistorySession.records
                        .filter(student =>
                          student.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          student.roll.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((student) => {
                          const Icon = statusIcons[student.status] || XCircle;
                          return (
                            <tr key={student.uid} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                              <td className="py-3 px-3 font-medium text-sm text-slate-900 dark:text-white">{student.studentName}</td>
                              <td className="py-3 px-3 text-sm text-slate-600 dark:text-slate-300 font-mono">{student.roll}</td>
                              <td className="py-3 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusStyles[student.status] || ''}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                  {student.status}
                                </span>
                              </td>
                            </tr>
                          );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB: TIME TABLE (INTERACTIVE GRID)
          ========================================================================= */}
      {activeTab === 'timetable' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full">
          
          {/* Header & Batch Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-purple-500" />
              CRT Timetable
            </h2>
            <div className="flex flex-wrap gap-2">
              {classrooms.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedBatch(cls.name)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                    selectedBatch === cls.name 
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/50'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cls.name}
                </button>
              ))}
            </div>
          </div>

          {/* Grid Container */}
          <div className="flex-1 overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
            {timetableData[selectedBatch] ? (
              <table className="w-full min-w-[800px] text-sm text-center border-collapse">
                <thead>
                  <tr className="bg-[#fcf802] dark:bg-yellow-600/20 text-slate-900 dark:text-white border-b border-slate-300 dark:border-slate-700">
                    <th className="p-3 border-r border-slate-300 dark:border-slate-700 w-24">Date</th>
                    <th className="p-3 border-r border-slate-300 dark:border-slate-700 w-1/4">8:30 - 10:00</th>
                    <th className="p-3 border-r border-slate-300 dark:border-slate-700 w-1/4">10:15 - 11:45</th>
                    <th className="p-3 border-r border-slate-300 dark:border-slate-700 w-16 whitespace-nowrap"><span className="writing-vertical-lr font-bold tracking-widest text-xs">45 Min.</span></th>
                    <th className="p-3 border-r border-slate-300 dark:border-slate-700 w-1/4">12:30 - 2:00</th>
                    <th className="p-3">2:15 - 3:45</th>
                  </tr>
                </thead>
                <tbody>
                  {timetableData[selectedBatch].map((dayRow, rowIdx) => (
                    <tr key={dayRow.date} className="border-b border-slate-200 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 border-r border-slate-200 dark:border-slate-700 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {dayRow.date}
                      </td>
                      
                      {/* Slot 0 */}
                      <td 
                        className="p-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group relative"
                        onClick={() => setEditingCell({ date: dayRow.date, slotIndex: 0, data: { ...dayRow.slots[0] } })}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{dayRow.slots[0].subject || '-'} {dayRow.slots[0].teacher ? `(${dayRow.slots[0].teacher})` : ''}</div>
                        <div className="text-xs text-slate-500">{dayRow.slots[0].room}</div>
                        <Edit3 className="w-4 h-4 absolute top-2 right-2 opacity-0 group-hover:opacity-50 text-blue-500" />
                      </td>
                      
                      {/* Slot 1 */}
                      <td 
                        className="p-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group relative"
                        onClick={() => setEditingCell({ date: dayRow.date, slotIndex: 1, data: { ...dayRow.slots[1] } })}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{dayRow.slots[1].subject || '-'} {dayRow.slots[1].teacher ? `(${dayRow.slots[1].teacher})` : ''}</div>
                        <div className="text-xs text-slate-500">{dayRow.slots[1].room}</div>
                        <Edit3 className="w-4 h-4 absolute top-2 right-2 opacity-0 group-hover:opacity-50 text-blue-500" />
                      </td>
                      
                      {/* Break Column */}
                      {rowIdx === 0 && (
                        <td rowSpan={10} className="border-r border-slate-200 dark:border-slate-700 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')]">
                          <div className="writing-vertical-lr font-bold tracking-[0.5em] text-slate-400 rotate-180 mx-auto py-8">
                            BREAK
                          </div>
                        </td>
                      )}
                      
                      {/* Slot 2 */}
                      <td 
                        className="p-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group relative"
                        onClick={() => setEditingCell({ date: dayRow.date, slotIndex: 2, data: { ...dayRow.slots[2] } })}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{dayRow.slots[2].subject || '-'} {dayRow.slots[2].teacher ? `(${dayRow.slots[2].teacher})` : ''}</div>
                        <div className="text-xs text-slate-500">{dayRow.slots[2].room}</div>
                        <Edit3 className="w-4 h-4 absolute top-2 right-2 opacity-0 group-hover:opacity-50 text-blue-500" />
                      </td>
                      
                      {/* Slot 3 */}
                      <td 
                        className="p-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group relative"
                        onClick={() => setEditingCell({ date: dayRow.date, slotIndex: 3, data: { ...dayRow.slots[3] } })}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">{dayRow.slots[3].subject || '-'} {dayRow.slots[3].teacher ? `(${dayRow.slots[3].teacher})` : ''}</div>
                        <div className="text-xs text-slate-500">{dayRow.slots[3].room}</div>
                        <Edit3 className="w-4 h-4 absolute top-2 right-2 opacity-0 group-hover:opacity-50 text-blue-500" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">Loading timetable...</div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT MODAL
          ========================================================================= */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-slate-900 dark:text-white">Edit Slot</h3>
              <button onClick={() => setEditingCell(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-500 mb-4 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-center">
                <span className="font-medium text-slate-700 dark:text-slate-300">{selectedBatch}</span> • {editingCell.date} • Slot {editingCell.slotIndex + 1}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Subject</label>
                <input 
                  type="text" 
                  value={editingCell.data.subject} 
                  onChange={e => setEditingCell({ ...editingCell, data: { ...editingCell.data, subject: e.target.value } })}
                  placeholder="e.g. DSA, SI, PI"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Teacher</label>
                  <input 
                    type="text" 
                    value={editingCell.data.teacher} 
                    onChange={e => setEditingCell({ ...editingCell, data: { ...editingCell.data, teacher: e.target.value } })}
                    placeholder="e.g. MS, SC, JS"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Room</label>
                  <input 
                    type="text" 
                    value={editingCell.data.room} 
                    onChange={e => setEditingCell({ ...editingCell, data: { ...editingCell.data, room: e.target.value } })}
                    placeholder="e.g. C-401"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveCell}
                className="w-full mt-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

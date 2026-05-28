import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import * as api from '../services/api';
import { MapPin, Clock, CheckCircle, XCircle, AlertTriangle, CalendarDays, TrendingUp, BookOpen } from 'lucide-react';

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

export default function StudentDashboard() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const studentGroup = userData?.batch || userData?.section || 'A';
  const studentUid = userData?.uid || 'demo-student-001';

  const [liveSessions, setLiveSessions] = useState([]);
  const [sessionStatuses, setSessionStatuses] = useState({}); // { [sessionId]: myStatus }
  const [history, setHistory] = useState([]);

  // Poll for live sessions every 3 seconds
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const sessions = await api.getSessions(studentGroup);
        setLiveSessions(sessions);

        // Fetch my status for each session
        const statuses = {};
        for (const session of sessions) {
          const records = await api.getSessionRecords(session.id);
          statuses[session.id] = records[studentUid]?.status || 'Absent';
        }
        setSessionStatuses(statuses);
      } catch (e) { console.error(e); }
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, [studentGroup, studentUid]);

  // Fetch history
  useEffect(() => {
    api.getStudentHistory(studentUid).then(setHistory).catch(console.error);
  }, [studentUid]);

  const totalClasses = history.length;
  const attended = history.filter(h => h.status === 'Present' || h.status === 'Late Entry').length;
  const percentage = totalClasses > 0 ? ((attended / totalClasses) * 100).toFixed(1) : '—';

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white">
            Welcome back, {userData?.name?.split(' ')[0] || 'Student'} 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {userData?.branch || userData?.course || 'Branch'} • {userData?.batch || 'Batch'} • Section {userData?.section || '—'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full w-fit">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
          Roll: {userData?.rollNumber || 'N/A'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Classes', value: totalClasses, icon: BookOpen, color: 'from-blue-500 to-blue-600', bgLight: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Attended', value: attended, icon: CheckCircle, color: 'from-emerald-500 to-emerald-600', bgLight: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Percentage', value: totalClasses > 0 ? `${percentage}%` : '—', icon: TrendingUp, color: 'from-amber-500 to-orange-600', bgLight: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Live Sessions', value: liveSessions.length, icon: CalendarDays, color: 'from-purple-500 to-purple-600', bgLight: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${stat.bgLight} rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/50 hover:shadow-md transition-shadow`}>
              <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${stat.color} mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Active Sessions */}
      <div className="pro-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          Active Sessions
          {liveSessions.length > 0 && (
            <span className="text-xs font-normal text-slate-400">• auto-refreshing</span>
          )}
        </h2>
        {liveSessions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No active sessions right now</p>
            <p className="text-sm mt-1">Sessions will appear here when a teacher starts a class for your section</p>
          </div>
        ) : (
          <div className="space-y-3">
            {liveSessions.map((session) => {
              const myStatus = sessionStatuses[session.id] || 'Absent';
              const isMarked = myStatus === 'Present' || myStatus === 'Late Entry';
              return (
                <div key={session.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border ${isMarked ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{session.className}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{session.teacher} • {session.room}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-6 sm:ml-0">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      Started {new Date(session.startTime).toLocaleTimeString()}
                    </span>
                    {isMarked ? (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${statusStyles[myStatus]}`}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {myStatus}
                      </span>
                    ) : (
                      <button
                        onClick={() => navigate('/student/attendance')}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-1.5"
                      >
                        <MapPin className="w-4 h-4" />
                        Mark Attendance
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Attendance History */}
      <div className="pro-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent History</h2>
        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No attendance history yet</p>
            <p className="text-sm mt-1">Your attendance records will appear here after sessions end</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-500 dark:text-slate-400">Date</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-500 dark:text-slate-400">Subject</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-slate-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record, i) => {
                  const Icon = statusIcons[record.status] || XCircle;
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                      <td className="py-3 px-2 text-sm text-slate-600 dark:text-slate-300">{record.date}</td>
                      <td className="py-3 px-2 text-sm font-medium text-slate-900 dark:text-white">{record.subject}</td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusStyles[record.status] || ''}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

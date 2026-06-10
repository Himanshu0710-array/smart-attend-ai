import React, { useState, useEffect, useRef } from 'react';
import { Menu, Bell, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import * as api from '../services/api';

export default function Navbar({ setIsOpen }) {
  const { userData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [notices, setNotices] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (userData?.role === 'student') {
      const classGroup = `${userData.year} - ${userData.branch} - Sec ${userData.section}`;
      api.getNotices(classGroup, userData.uid).then(data => {
        setNotices(data);
        const lastSeen = localStorage.getItem('lastSeenNotices');
        if (data.length > 0 && (!lastSeen || new Date(data[0].createdAt) > new Date(lastSeen))) {
          setHasUnread(true);
        }
      }).catch(console.error);
    }
  }, [userData]);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications && notices.length > 0) {
      setHasUnread(false);
      localStorage.setItem('lastSeenNotices', new Date().toISOString());
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 z-30 sticky top-0 transition-colors">
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 mr-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 lg:hidden rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold capitalize hidden sm:block text-slate-900 dark:text-white">
          {userData?.role} Portal
        </h2>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        <button 
          onClick={toggleTheme}
          className="p-2 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
        
        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={handleOpenNotifications}
            className={`p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${showNotifications ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <Bell className="w-5 h-5" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
              <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900 dark:text-white">Notifications</h3>
                {hasUnread && <span className="text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full uppercase tracking-wider">New</span>}
              </div>
              
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                {notices.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                    No new notifications
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {notices.map(notice => (
                      <div key={notice._id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{notice.title}</h4>
                          <span className="text-[10px] text-slate-400">{new Date(notice.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{notice.message}</p>
                        <p className="text-[10px] text-slate-400 mt-2">From: {notice.teacherName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shadow-sm">
            {userData?.email?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </div>
          <div className="hidden md:block text-sm">
            <p className="font-medium text-slate-900 dark:text-white">{userData?.name || 'User'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{userData?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}


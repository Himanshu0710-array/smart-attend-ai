import React from 'react';
import { Menu, Bell, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Navbar({ setIsOpen }) {
  const { userData } = useAuth();
  const { theme, toggleTheme } = useTheme();

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
        
        <button className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 relative transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
        </button>
        
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


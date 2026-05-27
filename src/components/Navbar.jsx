import React from 'react';
import { Menu, Bell, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar({ setIsOpen }) {
  const { userData } = useAuth();

  return (
    <header className="h-16 glass-effect border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 z-30 sticky top-0">
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 mr-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 lg:hidden rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold capitalize hidden sm:block">
          {userData?.role} Portal
        </h2>
      </div>

      <div className="flex items-center space-x-4">
        <button className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shadow-sm">
            {userData?.email?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
          </div>
          <div className="hidden md:block text-sm">
            <p className="font-medium">{userData?.name || 'User'}</p>
            <p className="text-xs text-slate-500 capitalize">{userData?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

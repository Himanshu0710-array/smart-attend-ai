import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  MapPin, 
  Users, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { userData, logout } = useAuth();
  const location = useLocation();

  const getLinks = () => {
    const role = userData?.role || 'student';
    if (role === 'admin') {
      return [
        { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { name: 'Users', path: '/admin/users', icon: Users },
        { name: 'Classrooms', path: '/admin/classrooms', icon: MapPin },
        { name: 'Settings', path: '/admin/settings', icon: Settings },
      ];
    } else if (role === 'teacher') {
      return [
        { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
        { name: 'Sessions', path: '/teacher/sessions', icon: Users },
        { name: 'Settings', path: '/teacher/settings', icon: Settings },
      ];
    } else {
      return [
        { name: 'Dashboard', path: '/student', icon: LayoutDashboard },
        { name: 'Mark Attendance', path: '/student/attendance', icon: MapPin },
        { name: 'Settings', path: '/student/settings', icon: Settings },
      ];
    }
  };

  const links = getLinks();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 lg:static lg:block transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="flex items-center space-x-2 font-bold text-xl text-blue-600 dark:text-blue-500">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <span>SmartAttend</span>
          </Link>
          <button className="lg:hidden p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => setIsOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 h-[calc(100vh-4rem)] overflow-y-auto flex flex-col justify-between">
          <ul className="space-y-1.5">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
              return (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-medium' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span>{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="pb-4 border-t border-slate-200 dark:border-slate-800 pt-4 mt-auto">
            <button
              onClick={() => logout()}
              className="flex w-full items-center space-x-3 px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors font-medium"
            >
              <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
              <span>Log out</span>
            </button>
          </div>
        </nav>
      </aside>
    </>
  );
}

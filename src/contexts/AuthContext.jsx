import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../services/api';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login(email, password) {
    try {
      const response = await api.login(email, password);
      // api.login handles storing the token
      setCurrentUser(response.user);
      setUserData(response.user);
      return response;
    } catch (error) {
      throw new Error(error.error || 'Failed to login');
    }
  }

  function logout() {
    setUserData(null);
    setCurrentUser(null);
    api.logout(); // Removes token from localStorage
  }

  useEffect(() => {
    // Check if we have an existing session
    const token = localStorage.getItem('smartattend_token');
    const savedUser = localStorage.getItem('smartattend_user');
    
    if (token && savedUser) {
      const parsed = JSON.parse(savedUser);
      setCurrentUser(parsed);
      setUserData(parsed);

      // Fetch latest profile from backend to sync settings (isCC, assignedSubjects, etc.)
      api.getProfile().then(profile => {
        setCurrentUser(profile);
        setUserData(profile);
        localStorage.setItem('smartattend_user', JSON.stringify(profile));
      }).catch(err => {
        console.warn('Failed to refresh user profile:', err);
      });
    }
    setLoading(false);

    // Sync auth state across multiple tabs in real-time
    const handleStorageChange = (e) => {
      if (e.key === 'smartattend_token' || e.key === 'smartattend_user') {
        const token = localStorage.getItem('smartattend_token');
        const savedUser = localStorage.getItem('smartattend_user');
        if (token && savedUser) {
          const parsed = JSON.parse(savedUser);
          setCurrentUser(parsed);
          setUserData(parsed);
        } else {
          setCurrentUser(null);
          setUserData(null);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  async function signup(email, password, role, additionalData) {
    try {
      const response = await api.signup({ email, password, role, ...additionalData });
      setCurrentUser(response.user);
      setUserData(response.user);
      return response;
    } catch (error) {
      throw new Error(error.error || 'Failed to create account');
    }
  }

  const value = {
    currentUser,
    userData,
    login,
    signup,
    logout,
    isDemoMode: false, // Demo mode is fully disabled now
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

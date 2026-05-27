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
    }
    setLoading(false);
  }, []);

  const value = {
    currentUser,
    userData,
    login,
    logout,
    isDemoMode: false, // Demo mode is fully disabled now
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

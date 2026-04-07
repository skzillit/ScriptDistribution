import React, { createContext, useContext, useState, useEffect } from 'react';
import client, { setUserId } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/auth/me')
      .then(res => {
        setUser(res.data.user);
        setUserId(res.data.user._id);
      })
      .catch(() => {
        client.post('/auth/register-device', { name: 'Web User' })
          .then(res => {
            setUser(res.data.user);
            setUserId(res.data.user._id);
          })
          .catch(console.error);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateProfile = async (data) => {
    const res = await client.put('/auth/profile', data);
    setUser(res.data.user);
    return res.data.user;
  };

  const switchRole = async (role) => {
    const res = await client.put('/auth/profile', { role });
    setUser(res.data.user);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, updateProfile, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

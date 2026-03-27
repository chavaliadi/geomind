import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";
import axios from 'axios';
import Dashboard from './components/Dashboard';
import TaskManager from './components/TaskManager';
import Analytics from './components/Analytics';
import LocationSimulator from './components/LocationSimulator';
import GeoMap from './components/GeoMap';
import TaskDetail from './components/TaskDetail';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const App = () => {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
  });

  // Setup Axios Interceptor
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error("Clerk token error:", err);
      }
      return config;
    });
    return () => axios.interceptors.request.eject(interceptor);
  }, [getToken]);

  // Toast notification system
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Fetch tasks from backend
  const fetchTasks = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/tasks`, {
        headers: { 'Content-Type': 'application/json' },
      });
      setTasks(response.data || []);
      updateStats(response.data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  const updateStats = (taskList) => {
    const completed = taskList.filter((t) => t.status === 'triggered').length;
    const pending = taskList.filter((t) => t.status === 'pending').length;
    setStats({
      totalTasks: taskList.length,
      completedTasks: completed,
      pendingTasks: pending,
    });
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      fetchTasks();
      const interval = setInterval(fetchTasks, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    } else {
      setTasks([]);
      setStats({ totalTasks: 0, completedTasks: 0, pendingTasks: 0 });
    }
  }, [fetchTasks, isSignedIn, isLoaded]);

  return (
    <div className="app">
            {/* Toast Notification */}
            {toast && (
              <div className={`toast toast-${toast.type}`}>
                <span>{toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'} {toast.message}</span>
                <button className="toast-close" onClick={() => setToast(null)}>×</button>
              </div>
            )}

            <header className="app-header">
              <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <div>
                  <h1>🗺️ GeoMind Dashboard</h1>
                  <p>Smart Location-Based Reminder System</p>
                </div>
                <SignedIn>
                  <div className="clerk-user-btn-wrap">
                    <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 40, height: 40 } } }} />
                  </div>
                </SignedIn>
              </div>
            </header>

      <nav className="app-nav">
        <div className="nav-tabs">
          {[
            { to: '/', label: '📊 Dashboard' },
            { to: '/tasks', label: '📝 Manage Tasks' },
            { to: '/map', label: '🗺️ Live Map' },
            { to: '/analytics', label: '📈 Analytics' },
            { to: '/simulator', label: '🎯 Simulator' },
          ].map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
              end={tab.to === '/'}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="app-main">
        <SignedIn>
          <Routes>
            <Route path="/" element={<Dashboard tasks={tasks} stats={stats} loading={loading} onTasksUpdate={fetchTasks} showToast={showToast} />} />
            <Route path="/tasks" element={<TaskManager tasks={tasks} onTasksUpdate={fetchTasks} apiUrl={API_URL} showToast={showToast} />} />
            <Route path="/tasks/:id" element={<TaskDetail apiUrl={API_URL} showToast={showToast} />} />
            <Route path="/map" element={<GeoMap tasks={tasks} apiUrl={API_URL} showToast={showToast} />} />
            <Route path="/analytics" element={<Analytics tasks={tasks} loading={loading} />} />
            <Route path="/simulator" element={<LocationSimulator apiUrl={API_URL} showToast={showToast} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SignedIn>
        <SignedOut>
          <div className="auth-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 0', minHeight: '50vh' }}>
            <h2 style={{ marginBottom: '30px', color: '#2c3e50', textAlign: 'center' }}>
              Welcome to GeoMind <br/> <span style={{fontSize: '16px', fontWeight: 'normal', color: '#555'}}>Please sign in to access your secure task dashboard.</span>
            </h2>
            <SignIn routing="hash" />
          </div>
        </SignedOut>
      </main>

      <footer className="app-footer">
        <p>GeoMind © 2026 • Built with React • Powered by Location Intelligence</p>
      </footer>
    </div>
  );
};

export default App;

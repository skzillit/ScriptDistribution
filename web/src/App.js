import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ScriptDetailPage from './pages/ScriptDetailPage';
import BreakdownPage from './pages/BreakdownPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SidesPage from './pages/SidesPage';
import CallSheetPage from './pages/CallSheetPage';
import SchedulePageNew from './pages/SchedulePageNew';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  const role = user?.role || 'viewer';
  const defaultRoute = role === 'viewer' ? '/sides' : '/callsheet';

  return (
    <>
      <Header />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <main style={{ marginLeft: '220px', flex: 1, minHeight: 'calc(100vh - 60px)' }}>
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            {(role === 'admin' || role === 'editor') && (
              <>
                <Route path="/callsheet" element={<CallSheetPage />} />
                <Route path="/script" element={<DashboardPage />} />
                <Route path="/scripts/:id" element={<ScriptDetailPage />} />
                <Route path="/scripts/:id/breakdown/:versionId" element={<BreakdownPage />} />
                <Route path="/scripts/:id/analytics" element={<AnalyticsPage />} />
                <Route path="/schedule" element={<SchedulePageNew />} />
              </>
            )}
            <Route path="/sides" element={<SidesPage />} />
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

export default App;

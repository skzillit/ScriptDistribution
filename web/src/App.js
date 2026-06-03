import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import GlobalLoader from './components/common/GlobalLoader';
import ScriptsManagerPage from './pages/ScriptsManagerPage';
import ScriptDetailPage from './pages/ScriptDetailPage';
import SidesPage from './pages/SidesPage';
import GenerateSidesPage from './pages/GenerateSidesPage';
import CallSheetPage from './pages/CallSheetPage';
import SchedulePageNew from './pages/SchedulePageNew';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-spinner">Loading...</div>;
  }

  const role = user?.role || 'viewer';
  // Sides is the app's home for every role — call sheets are managed inside the
  // sides generation popups, not on a standalone page.
  const defaultRoute = '/sides';

  return (
    <>
      <GlobalLoader />
      <Header />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ marginLeft: '220px', flex: 1, minHeight: 'calc(100vh - 60px)', background: 'var(--bg-primary)', backgroundImage: 'var(--gradient-bg)', backgroundAttachment: 'fixed' }}>
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            {(role === 'admin' || role === 'editor') && (
              <>
                <Route path="/callsheet" element={<CallSheetPage />} />
                <Route path="/script" element={<ScriptsManagerPage />} />
                <Route path="/scripts/:id" element={<ScriptDetailPage />} />
                <Route path="/schedule" element={<SchedulePageNew />} />
                <Route path="/sides/generate" element={<GenerateSidesPage />} />
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

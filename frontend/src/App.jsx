import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import CaptureBox from './components/CaptureBox';
import Feed from './components/Feed';
import PeopleDirectory from './components/PeopleDirectory';
import PersonProfile from './components/PersonProfile';
import ProjectDirectory from './components/ProjectDirectory';
import ProjectCard from './components/ProjectCard';
import MeetingMode from './components/MeetingMode';
import DailyDigest from './components/DailyDigest';
import SettingsPage from './components/SettingsPage';
import ImportExport from './components/ImportExport';
import OrgChartPage from './components/OrgChart';
import Timeline from './components/Timeline';
import QuickSearch from './components/QuickSearch';
import Toast from './components/Toast';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [authenticated, setAuthenticated] = useState(null); // null=checking
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDigestBanner, setShowDigestBanner] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => setAuthenticated(r.ok))
      .catch(() => setAuthenticated(false));
  }, []);

  // Show digest banner once per day, only if overdue or today items exist
  useEffect(() => {
    if (!authenticated) return;
    const today = new Date().toISOString().split('T')[0];
    const dismissed = localStorage.getItem('ledger_digest_dismissed');
    if (dismissed === today) return;
    fetch('/api/digest').then(r => r.json()).then(d => {
      if ((d.overdue_items?.length > 0) || (d.today_items?.length > 0)) {
        setShowDigestBanner(true);
      }
    }).catch(() => {});
  }, [authenticated]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'item_updated') refresh();
    if (data.type === 'resolution_suggestion' && data.auto_resolve) {
      setToast({ message: 'An item was auto-resolved', type: 'info' });
      refresh();
    }
  }, [refresh]);

  useWebSocket(authenticated ? handleWsMessage : null);

  // Keyboard shortcuts
  useEffect(() => {
    if (!authenticated) return;
    const handler = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('capture-input')?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowSearch(s => !s); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') { e.preventDefault(); navigate('/people'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); navigate('/projects'); }
      if (e.key === 'Escape') setShowSearch(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, authenticated]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
  };

  // Loading state
  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Loading...</div>
      </div>
    );
  }

  // Not authenticated
  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  const isMeeting = location.pathname.startsWith('/meeting');

  return (
    <div className="flex h-screen overflow-hidden">
      {!isMeeting && (
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onLogout={handleLogout} />
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <CaptureBox onCapture={refresh} onSearch={() => setShowSearch(true)} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Feed refreshKey={refreshKey} onRefresh={refresh} showDigestBanner={showDigestBanner} onDismissDigest={() => { setShowDigestBanner(false); localStorage.setItem('ledger_digest_dismissed', new Date().toISOString().split('T')[0]); }} />} />
            <Route path="/people" element={<PeopleDirectory refreshKey={refreshKey} />} />
            <Route path="/people/:id" element={<PersonProfile refreshKey={refreshKey} onRefresh={refresh} />} />
            <Route path="/projects" element={<ProjectDirectory refreshKey={refreshKey} />} />
            <Route path="/projects/:id" element={<ProjectCard refreshKey={refreshKey} onRefresh={refresh} />} />
            <Route path="/meeting/:type/:id" element={<MeetingMode refreshKey={refreshKey} onRefresh={refresh} />} />
            <Route path="/digest" element={<DailyDigest />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/org-chart" element={<OrgChartPage />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="/settings" element={<SettingsPage theme={theme} onToggleTheme={toggleTheme} />} />
          </Routes>
        </main>
      </div>
      {showSearch && <QuickSearch onClose={() => setShowSearch(false)} />}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

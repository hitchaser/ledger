import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import Sidebar from './components/Sidebar';
import CaptureBox from './components/CaptureBox';
import Feed from './components/Feed';
import PeopleDirectory from './components/PeopleDirectory';
import PersonProfile from './components/PersonProfile';
import ProjectDirectory from './components/ProjectDirectory';
import ProjectCard from './components/ProjectCard';
import MeetingMode from './components/MeetingMode';
import DailyDigest from './components/DailyDigest';
import QuickSearch from './components/QuickSearch';
import Toast from './components/Toast';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showDigestBanner, setShowDigestBanner] = useState(true);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'item_updated') {
      refresh();
    }
    if (data.type === 'resolution_suggestion') {
      if (data.auto_resolve) {
        setToast({ message: 'An item was auto-resolved', type: 'info', undoAction: null });
        refresh();
      }
    }
  }, [refresh]);

  useWebSocket(handleWsMessage);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('capture-input')?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        navigate('/people');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        navigate('/projects');
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const isMeeting = location.pathname.startsWith('/meeting');

  return (
    <div className="flex h-screen overflow-hidden">
      {!isMeeting && (
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <CaptureBox onCapture={refresh} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Feed refreshKey={refreshKey} onRefresh={refresh} showDigestBanner={showDigestBanner} onDismissDigest={() => setShowDigestBanner(false)} />} />
            <Route path="/people" element={<PeopleDirectory refreshKey={refreshKey} />} />
            <Route path="/people/:id" element={<PersonProfile refreshKey={refreshKey} onRefresh={refresh} />} />
            <Route path="/projects" element={<ProjectDirectory refreshKey={refreshKey} />} />
            <Route path="/projects/:id" element={<ProjectCard refreshKey={refreshKey} onRefresh={refresh} />} />
            <Route path="/meeting/:type/:id" element={<MeetingMode onRefresh={refresh} />} />
            <Route path="/digest" element={<DailyDigest />} />
          </Routes>
        </main>
      </div>
      {showSearch && <QuickSearch onClose={() => setShowSearch(false)} />}
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

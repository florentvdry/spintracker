import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from '@components/layout/Layout';
import Dashboard from '@pages/Dashboard';
import HandHistory from '@pages/HandHistory';
import RangeResearch from '@pages/RangeResearch';
import Analysis from '@pages/Analysis';
import Settings from '@pages/Settings';
import Charts from '@pages/Charts';
import { useAppStore } from '@stores/appStore';
import { useFilterStore } from '@stores/filterStore';
import { useNotificationStore } from '@stores/notificationStore';
import NotificationContainer from '@components/ui/NotificationContainer';
import ProgressModal from '@components/ui/ProgressModal';
import UpdateModal from '@components/ui/UpdateModal';

function App() {
  const initializeApp = useAppStore(state => state.initialize);
  const isInitialized = useAppStore(state => state.isInitialized);
  const refreshAll = useAppStore(state => state.refreshAll);
  const { heroName, dateRange, customDateFrom, customDateTo, buyIn, selectedSession, _hasHydrated } = useFilterStore();

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // Synchronisation globale : dès que les filtres changent, on rafraîchit tout
  // Mais UNIQUEMENT si le store est initialisé (backend prêt + filtres chargés)
  useEffect(() => {
    if (_hasHydrated && isInitialized && heroName) {
      refreshAll();
    }
  }, [heroName, dateRange, customDateFrom, customDateTo, buyIn, selectedSession, _hasHydrated, isInitialized, refreshAll]);

  return (
    <>
      <Layout>
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hands" element={<HandHistory />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/ranges" element={<RangeResearch />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <NotificationContainer />
      <ProgressModal />
      <UpdateModal />
    </>
  );
}

export default App;

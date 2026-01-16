import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from '@components/layout/Layout';
import Dashboard from '@pages/Dashboard';
import HandHistory from '@pages/HandHistory';
import RangeAnalysis from '@pages/RangeAnalysis';
import RangeResearch from '@pages/RangeResearch';
import Analysis from '@pages/Analysis';
import StatsBuilder from '@pages/StatsBuilder';
import Settings from '@pages/Settings';
import { useAppStore } from '@stores/appStore';
import { useNotificationStore } from '@stores/notificationStore';
import NotificationContainer from '@components/ui/NotificationContainer';
import ProgressModal from '@components/ui/ProgressModal';
import UpdateModal from '@components/ui/UpdateModal';

function App() {
  const initializeApp = useAppStore(state => state.initialize);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  return (
    <>
      <Layout>
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hands" element={<HandHistory />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/ranges" element={<RangeResearch />} />
          <Route path="/stats-builder" element={<StatsBuilder />} />
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

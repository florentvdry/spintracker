import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from '@components/layout/Layout';
import Dashboard from '@pages/Dashboard';
import HandHistory from '@pages/HandHistory';
import LeakAnalysis from '@pages/LeakAnalysis';
import RangeAnalysis from '@pages/RangeAnalysis';
import Analysis from '@pages/Analysis';
import Settings from '@pages/Settings';
import { useAppStore } from '@stores/appStore';
import { useNotificationStore } from '@stores/notificationStore';
import NotificationContainer from '@components/ui/NotificationContainer';
import ProgressModal from '@components/ui/ProgressModal';

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
          <Route path="/leaks" element={<LeakAnalysis />} />
          <Route path="/ranges" element={<RangeAnalysis />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <NotificationContainer />
      <ProgressModal />
    </>
  );
}

export default App;

import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import NotificationContainer from '@/components/ui/NotificationContainer'
import ProgressModal from '@/components/ui/ProgressModal'
import StartupNotice from '@/components/ui/StartupNotice'
import UpdateModal from '@/components/ui/UpdateModal'
import { ipcService } from '@/services/ipcService'
import { useAppStore } from '@/stores/appStore'
import { useAutoImportStore } from '@/stores/autoImportStore'
import { useFilterStore } from '@/stores/filterStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useUpdateStore } from '@/stores/updateStore'
import { heroNamesOf } from '@/utils/heroNames'

const Dashboard = lazy(() => import('@/views/Dashboard'))
const HandHistory = lazy(() => import('@/views/HandHistory'))
const Analysis = lazy(() => import('@/views/Analysis'))
const Players = lazy(() => import('@/views/Players'))
const LiveHud = lazy(() => import('@/views/LiveHud'))
const Ranges = lazy(() => import('@/views/Ranges'))
const Settings = lazy(() => import('@/views/Settings'))
const OnboardingWizard = lazy(() => import('@/views/OnboardingWizard'))

export default function App() {
  const initialize = useAppStore((s) => s.initialize)
  const refreshAll = useAppStore((s) => s.refreshAll)
  const isInitialized = useAppStore((s) => s.isInitialized)
  const initializeUpdates = useUpdateStore((s) => s.initialize)
  const listenAutoImport = useAutoImportStore((s) => s.listen)
  const onboardingCompleted = useOnboardingStore((s) => s.completed)
  const loadOnboarding = useOnboardingStore((s) => s.load)
  const { pathname } = useLocation()

  const { heroName, dateRange, customDateFrom, customDateTo, buyIn, selectedSession, hasHydrated } = useFilterStore()

  useEffect(() => {
    void initialize()
    return initializeUpdates()
  }, [initialize, initializeUpdates])

  useEffect(() => listenAutoImport(), [listenAutoImport])

  // Load the first-launch onboarding wizard once the app is initialized.
  useEffect(() => {
    if (isInitialized && !onboardingCompleted) void loadOnboarding()
  }, [isInitialized, onboardingCompleted, loadOnboarding])

  // The HUD finds the hero at a table from the names the user plays under.
  const aliases = useFilterStore((s) => s.aliases)
  useEffect(() => {
    void ipcService.setHudHeroes(heroNamesOf(heroName, aliases))
  }, [heroName, aliases])

  // Any change to the global filters reloads the shared dashboard data.
  useEffect(() => {
    if (hasHydrated && isInitialized && heroName) void refreshAll()
  }, [heroName, dateRange, customDateFrom, customDateTo, buyIn, selectedSession, hasHydrated, isInitialized, refreshAll])

  return (
    <>
      <Layout>
        <ErrorBoundary resetKey={pathname}>
          {isInitialized ? (
            onboardingCompleted ? (
              <Suspense fallback={<div className="spinner mx-auto mt-24" />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/hands" element={<HandHistory />} />
                  <Route path="/analysis" element={<Analysis />} />
                  <Route path="/players" element={<Players />} />
                  <Route path="/hud" element={<LiveHud />} />
                  <Route path="/ranges" element={<Ranges />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Suspense>
            ) : (
              <OnboardingWizard />
            )
          ) : (
            <StartupNotice />
          )}
        </ErrorBoundary>
      </Layout>
      <NotificationContainer />
      <ProgressModal />
      <UpdateModal />
    </>
  )
}

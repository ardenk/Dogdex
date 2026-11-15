import { lazy, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router'
import { TabBar } from './components/TabBar'
import { ToastProvider } from './components/ToastProvider'
import { BadgesPage } from './features/badges/BadgesPage'
import { BreedPage, CustomBreedPage } from './features/breed/BreedPage'
import { DogPage } from './features/dog/DogPage'
import { DogdexPage } from './features/dogdex/DogdexPage'
import { GroupPage } from './features/dogdex/GroupPage'
import { HomePage } from './features/home/HomePage'
import { LogPage } from './features/log/LogPage'
import { QuizPage } from './features/quiz/QuizPage'
import { YouPage } from './features/you/YouPage'
import { DataProvider } from './storage/DataProvider'
import { SyncProvider } from './sync/SyncProvider'

// The share card pulls in a server-side renderer for its silhouette; load it only when someone opens a share screen.
const SharePage = lazy(() => import('./features/share/SharePage').then((m) => ({ default: m.SharePage })))

function TabLayout() {
  return (
    <div className="app">
      <Outlet />
      <TabBar />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DataProvider>
          <SyncProvider>
          <Routes>
            <Route element={<TabLayout />}>
              <Route index element={<HomePage />} />
              <Route path="dogdex" element={<DogdexPage />} />
              <Route path="dogdex/group/:groupId" element={<GroupPage />} />
              <Route path="dogdex/breed/:breedId" element={<BreedPage />} />
              <Route path="dogdex/other/:label" element={<CustomBreedPage />} />
              <Route path="dog/:dogId" element={<DogPage />} />
              <Route path="share/:dogId" element={<Suspense fallback={<p className="page muted">Loading…</p>}><SharePage /></Suspense>} />
              <Route path="badges" element={<BadgesPage />} />
              <Route path="you" element={<YouPage />} />
              <Route path="*" element={<main className="page"><h1>Not found</h1></main>} />
            </Route>
            <Route path="log" element={<LogPage />} />
            <Route path="quiz" element={<QuizPage />} />
          </Routes>
          </SyncProvider>
        </DataProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { RequireAuth } from '@/auth/RequireAuth'
import { Callback } from '@/auth/Callback'
import { Login } from '@/pages/Login'
import { Inbox } from '@/pages/Inbox'
import { Projects } from '@/pages/Projects'
import { ProjectOverview } from '@/pages/ProjectOverview'
import { ProjectInbox } from '@/pages/ProjectInbox'
import { Section } from '@/pages/Section'
import { Settings } from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<Callback />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/inbox/archived" element={<Inbox archived />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectOverview />} />
        <Route path="/projects/:id/inbox" element={<ProjectInbox />} />
        <Route path="/projects/:id/sections/:sid" element={<Section />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  )
}

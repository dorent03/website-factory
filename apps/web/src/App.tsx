import { Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { SimulationBanner } from './components/SimulationBanner.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Customers, CustomerDetail, NewCustomer } from './pages/Customers.tsx';
import { Websites } from './pages/Websites.tsx';
import { Workspace } from './pages/Workspace.tsx';
import { Research } from './pages/Research.tsx';
import { Generate } from './pages/Generate.tsx';
import { Agents } from './pages/Agents.tsx';
import { Jobs, JobDetail } from './pages/Jobs.tsx';
import { DesignSystems } from './pages/DesignSystems.tsx';
import { Assets } from './pages/Assets.tsx';
import { QAOverview } from './pages/QA.tsx';
import { LegalOverview } from './pages/Legal.tsx';
import { Settings } from './pages/Settings.tsx';

export function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <SimulationBanner />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<NewCustomer />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/websites" element={<Websites />} />
          <Route path="/websites/:id" element={<Workspace />} />
          <Route path="/research" element={<Research />} />
          <Route path="/generate" element={<Generate />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/design-systems" element={<DesignSystems />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/qa" element={<QAOverview />} />
          <Route path="/legal" element={<LegalOverview />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="p-6 text-ink-2">Not found.</div>} />
        </Routes>
      </main>
      <CommandPalette />
    </div>
  );
}

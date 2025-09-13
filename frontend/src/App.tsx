import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { AnnotatorWorkspace } from './pages/AnnotatorWorkspace';
import { ClientPortal } from './pages/ClientPortal';
import { ProjectSetup } from './pages/ProjectSetup';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/setup" element={<ProjectSetup />} />
            <Route path="/annotate/:projectId" element={<AnnotatorWorkspace />} />
            <Route path="/client/:projectId" element={<ClientPortal />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
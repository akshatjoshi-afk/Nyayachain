import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import CasesPage from './pages/CasesPage';
import DocumentsPage from './pages/DocumentsPage';
import AuditLogPage from './pages/AuditLogPage';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';

function ProtectedRoute({ children, requiredRole }: { children: JSX.Element; requiredRole?: string }) {
  const { isAuthenticated, user, loading } = useAuth();

  // 1. Wait for AuthContext rehydration on initial mount/reload
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-gray-500">Restoring session...</p>
        </div>
      </div>
    );
  }

  // 2. Evaluate auth state after loading is complete
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/cases" replace />;

  return children;
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/cases" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases"
            element={
              <ProtectedRoute>
                <CasesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/:caseId/documents"
            element={
              <ProtectedRoute>
                <DocumentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute requiredRole="ADMIN">
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;

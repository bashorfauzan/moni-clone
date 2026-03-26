import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Reports from './pages/Reports';
import Targets from './pages/Targets';
import MenuPage from './pages/Menu';
import Investment from './pages/Investment';
import Login from './pages/Login';
import Register from './pages/Register';
import { TransactionProvider } from './context/TransactionContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SecurityProvider } from './context/SecurityContext';
import Spinner from './components/Spinner';
import { type ReactNode } from 'react';

// Guard: redirect to /login if not authenticated
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <Spinner message="Menyiapkan Sistem..." />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Home />} />
          <Route path="reports" element={<Reports />} />
          <Route path="targets" element={<Targets />} />
          <Route path="investment" element={<Investment />} />
          <Route path="menu" element={<MenuPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SecurityProvider>
          <TransactionProvider>
            <AppRoutes />
          </TransactionProvider>
        </SecurityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

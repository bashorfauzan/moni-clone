import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TransactionProvider } from './context/TransactionContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SecurityProvider } from './context/SecurityContext';
import Spinner from './components/Spinner';

const Layout = lazy(() => import('./components/layout/Layout'));
const Home = lazy(() => import('./pages/Home'));
const Reports = lazy(() => import('./pages/Reports'));
const Targets = lazy(() => import('./pages/Targets'));
const MenuPage = lazy(() => import('./pages/Menu'));
const Investment = lazy(() => import('./pages/Investment'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

const RouteFallback = () => <Spinner message="Membuka Halaman..." />;

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
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
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

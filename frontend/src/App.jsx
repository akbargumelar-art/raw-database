import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { LoadingProvider } from './contexts/LoadingContext';
import LoadingOverlay from './components/LoadingOverlay';

// Layout
import Layout from './components/Layout/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Databases from './pages/Databases';
import DatabaseDesigner from './pages/DatabaseDesigner';
import DataExplorer from './pages/DataExplorer';
import UploadData from './pages/UploadData';
import UserManagement from './pages/UserManagement';
import DatabaseServers from './pages/DatabaseServers';
import BatchLookup from './pages/BatchLookup';

// Protected Route component
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    return children;
};

const AppRoutes = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

            <Route path="/" element={
                <ProtectedRoute>
                    <Layout />
                </ProtectedRoute>
            }>
                <Route index element={<Dashboard />} />
                <Route path="databases" element={<Databases />} />
                <Route path="designer" element={<DatabaseDesigner />} />
                <Route path="explorer" element={<DataExplorer />} />
                <Route path="upload" element={<UploadData />} />
                <Route path="users" element={
                    <ProtectedRoute adminOnly>
                        <UserManagement />
                    </ProtectedRoute>
                } />
                <Route path="lookup" element={<BatchLookup />} />
                <Route path="servers" element={<DatabaseServers />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ToastProvider>
                    <ConnectionProvider>
                        <LoadingProvider>
                            <LoadingOverlay />
                            <AppRoutes />
                        </LoadingProvider>
                    </ConnectionProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;

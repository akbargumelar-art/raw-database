import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useConnection } from '../contexts/ConnectionContext';
import { databaseAPI } from '../services/api';
import ConnectionSelector from '../components/ConnectionSelector';
import {
    Database,
    Plus,
    Trash2,
    Table2,
    RefreshCw,
    AlertTriangle,
    X,
    Loader2,
    Clock
} from 'lucide-react';

const Databases = () => {
    const [dbStats, setDbStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(null);
    const [newDbName, setNewDbName] = useState('');
    const [creating, setCreating] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const { isAdmin } = useAuth();
    const { selectedConnection } = useConnection();
    const toast = useToast();

    useEffect(() => {
        if (selectedConnection) {
            loadDatabases();
        }
    }, [selectedConnection]);

    const loadDatabases = async () => {
        if (!selectedConnection) return;

        setLoading(true);
        try {
            const res = await databaseAPI.getStats(selectedConnection.id);
            setDbStats(res.data);
        } catch (error) {
            toast.error('Failed to load databases');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newDbName.trim()) {
            toast.error('Please enter a database name');
            return;
        }

        setCreating(true);
        try {
            await databaseAPI.create(newDbName.trim());
            toast.success(`Database '${newDbName}' created successfully`);
            setShowCreateModal(false);
            setNewDbName('');
            loadDatabases();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create database');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await databaseAPI.drop(showDeleteModal);
            toast.success(`Database '${showDeleteModal}' deleted successfully`);
            setShowDeleteModal(null);
            loadDatabases();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete database');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Databases</h1>
                    <p className="text-gray-400 mt-1">View database activity and manage connections</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadDatabases} className="btn-ghost">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {isAdmin() && (
                        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            New Database
                        </button>
                    )}
                </div>
            </div>

            {/* Connection Selector */}
            <ConnectionSelector className="max-w-md" />

            {/* Database Activity Cards */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="card p-5">
                            <div className="skeleton h-5 w-32 mb-2" />
                            <div className="skeleton h-4 w-24 mb-3" />
                            <div className="skeleton h-4 w-full" />
                        </div>
                    ))}
                </div>
            ) : dbStats.length === 0 ? (
                <div className="card p-12 text-center">
                    <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-300 mb-2">No Databases</h3>
                    <p className="text-gray-500">Create your first database to get started</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dbStats.map(db => (
                        <div key={db.database} className="card p-5 relative group">
                            <Link
                                to={`/explorer?database=${db.database}`}
                                className="block"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                            <Database className="w-5 h-5 text-brand-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-white group-hover:text-brand-400 transition-colors">
                                                {db.database}
                                            </h3>
                                            <p className="text-xs text-gray-500">{db.tableCount} tables</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-3 border-t border-gray-800">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Clock className="w-4 h-4 text-gray-500" />
                                        <span className="text-gray-400">Last update:</span>
                                        <span className={`font-medium ${db.lastUpdate ? 'text-green-400' : 'text-gray-500'}`}>
                                            {formatDate(db.lastUpdate)}
                                        </span>
                                    </div>
                                    {db.lastUpdateTable && (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Table2 className="w-3 h-3" />
                                            <span>{db.lastUpdateTable}</span>
                                        </div>
                                    )}
                                </div>
                            </Link>

                            {/* Delete button */}
                            {isAdmin() && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowDeleteModal(db.database); }}
                                    className="absolute top-3 right-3 p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card p-6 w-full max-w-md animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-white">Create Database</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <input
                                type="text"
                                value={newDbName}
                                onChange={(e) => setNewDbName(e.target.value)}
                                placeholder="Enter database name"
                                className="input-dark w-full mb-4"
                                autoFocus
                            />
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">
                                    Cancel
                                </button>
                                <button type="submit" disabled={creating} className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card p-6 w-full max-w-md animate-fade-in">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-white">Delete Database</h2>
                                <p className="text-gray-400 text-sm">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-gray-300 mb-6">
                            Are you sure you want to delete <span className="font-medium text-white">{showDeleteModal}</span>?
                            All data will be permanently lost.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDeleteModal(null)} className="btn-secondary flex-1">
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Databases;

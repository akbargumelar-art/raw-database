import { useState, useEffect } from 'react';
import { Server, Plus, Edit2, Trash2, Check, X, Loader2, TestTube } from 'lucide-react';
import { connectionsAPI } from '../services/connectionsAPI';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useConnection } from '../contexts/ConnectionContext';
import ConnectionFormModal from '../components/ConnectionFormModal';

const DatabaseServers = () => {
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingConnection, setEditingConnection] = useState(null);
    const [testingId, setTestingId] = useState(null);
    const toast = useToast();
    const { user } = useAuth();
    const { selectConnection } = useConnection();

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        loadConnections();
    }, []);

    const loadConnections = async () => {
        try {
            setLoading(true);
            const response = await connectionsAPI.list();
            setConnections(response.data);
        } catch (error) {
            toast.error('Failed to load connections');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setEditingConnection(null);
        setShowModal(true);
    };

    const handleEdit = (connection) => {
        setEditingConnection(connection);
        setShowModal(true);
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete connection "${name}"?`)) {
            return;
        }

        try {
            await connectionsAPI.delete(id);
            toast.success('Connection deleted successfully');
            loadConnections();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete connection');
        }
    };

    const handleSetDefault = async (id, name) => {
        try {
            await connectionsAPI.setDefault(id);
            toast.success(`"${name}" set as default connection`);

            // Auto-switch to the new default connection
            const newDefault = connections.find(c => c.id === id);
            if (newDefault) {
                selectConnection({ ...newDefault, is_default: true });
            }

            loadConnections();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to set default connection');
        }
    };

    const handleTest = async (connection) => {
        setTestingId(connection.id);
        try {
            const response = await connectionsAPI.test({
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: '' // Can't test without password, will show limitations
            });

            if (response.data.success) {
                toast.success(`Connection to "${connection.name}" successful!`);
            } else {
                toast.error(response.data.message || 'Connection test failed');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Connection test failed');
        } finally {
            setTestingId(null);
        }
    };

    const handleModalClose = (shouldReload) => {
        setShowModal(false);
        setEditingConnection(null);
        if (shouldReload) {
            loadConnections();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Server className="w-8 h-8 text-brand-500" />
                        Database Servers
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Manage MySQL database server connections
                    </p>
                </div>
                {isAdmin && (
                    <button onClick={handleAdd} className="btn-primary flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Add Connection
                    </button>
                )}
            </div>

            {/* Connections Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connections.map((conn) => (
                    <div
                        key={conn.id}
                        className="card p-5 hover:border-brand-500/50 transition-colors"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${conn.is_default ? 'bg-green-500' : 'bg-gray-500'}`} />
                                <div>
                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        {conn.name}
                                        {conn.is_default && (
                                            <span className="text-xs px-2 py-1 rounded bg-brand-500/20 text-brand-400">
                                                Default
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {conn.host}:{conn.port}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 mb-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-400">
                                <span className="font-medium">User:</span>
                                <span>{conn.username}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <span className="font-medium">Created:</span>
                                <span>{new Date(conn.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => handleEdit(conn)}
                                        className="btn-ghost text-sm flex items-center gap-1 flex-1"
                                        title="Edit connection"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Edit
                                    </button>
                                    {!conn.is_default && (
                                        <>
                                            <button
                                                onClick={() => handleSetDefault(conn.id, conn.name)}
                                                className="btn-ghost text-sm flex items-center gap-1"
                                                title="Set as default"
                                            >
                                                <Check className="w-4 h-4" />
                                                Set Default
                                            </button>
                                            <button
                                                onClick={() => handleDelete(conn.id, conn.name)}
                                                className="btn-ghost text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                                                title="Delete connection"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {connections.length === 0 && (
                <div className="card p-12 text-center">
                    <Server className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-400 mb-2">
                        No connections found
                    </h3>
                    <p className="text-gray-500 mb-4">
                        {isAdmin ? 'Add your first database connection to get started.' : 'No database servers have been configured yet.'}
                    </p>
                    {isAdmin && (
                        <button onClick={handleAdd} className="btn-primary">
                            <Plus className="w-5 h-5 mr-2" />
                            Add Connection
                        </button>
                    )}
                </div>
            )}

            {/* Connection Form Modal */}
            {showModal && (
                <ConnectionFormModal
                    connection={editingConnection}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
};

export default DatabaseServers;

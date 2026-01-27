import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { authAPI, databaseAPI } from '../services/api';
import { useConnection } from '../contexts/ConnectionContext';
import ConnectionSelector from '../components/ConnectionSelector';
import {
    Users,
    Plus,
    Edit2,
    Trash2,
    Save,
    X,
    Shield,
    User,
    Loader2,
    AlertTriangle,
    Database
} from 'lucide-react';

const UserManagement = () => {
    const { user: currentUser } = useAuth();
    const { selectedConnection } = useConnection();
    const toast = useToast();

    const [users, setUsers] = useState([]);
    const [databases, setDatabases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'operator',
        allowed_databases: []
    });
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        loadData();
    }, [selectedConnection]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersRes, dbRes] = await Promise.all([
                authAPI.getUsers(),
                selectedConnection ? databaseAPI.list(selectedConnection.id) : { data: [] }
            ]);
            setUsers(usersRes.data);
            setDatabases(dbRes.data);
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({ username: '', password: '', role: 'operator', allowed_databases: [] });
        setShowModal(true);
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setFormData({
            username: user.username,
            password: '',
            role: user.role,
            allowed_databases: user.allowed_databases || []
        });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);

        try {
            if (editingUser) {
                await authAPI.updateUser(editingUser.id, {
                    password: formData.password || undefined,
                    role: formData.role,
                    allowed_databases: formData.allowed_databases
                });
                toast.success('User updated');
            } else {
                if (!formData.username || !formData.password) {
                    toast.error('Username and password are required');
                    setSaving(false);
                    return;
                }
                await authAPI.register(formData);
                toast.success('User created');
            }
            setShowModal(false);
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Operation failed');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await authAPI.deleteUser(showDeleteModal.id);
            toast.success('User deleted');
            setShowDeleteModal(null);
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const toggleDatabase = (dbName) => {
        const current = formData.allowed_databases;
        const connId = selectedConnection ? String(selectedConnection.id) : '1';
        const scopedDb = `${connId}:${dbName}`;

        // Check if present (either scoped or legacy if localhost)
        const isPresent = current.includes(scopedDb) || (connId === '1' && current.includes(dbName));

        if (isPresent) {
            // Remove both scoped and legacy versions
            setFormData({
                ...formData,
                allowed_databases: current.filter(d => d !== scopedDb && d !== dbName)
            });
        } else {
            // Add scoped version
            setFormData({ ...formData, allowed_databases: [...current, scopedDb] });
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">User Management</h1>
                    <p className="text-gray-400 mt-1">Manage users and permissions</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-64">
                        <ConnectionSelector />
                    </div>
                    <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Add User
                    </button>
                </div>
            </div>

            {/* Users List */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400" />
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Allowed Databases</th>
                                <th>Created</th>
                                <th className="w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                {user.role === 'admin' ? (
                                                    <Shield className="w-4 h-4 text-brand-400" />
                                                ) : (
                                                    <User className="w-4 h-4 text-gray-400" />
                                                )}
                                            </div>
                                            <span className="font-medium text-white">{user.username}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${user.role === 'admin'
                                            ? 'bg-brand-500/20 text-brand-400'
                                            : 'bg-gray-700 text-gray-300'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>
                                        {user.role === 'admin' ? (
                                            <span className="text-gray-500 text-sm">All databases</span>
                                        ) : user.allowed_databases?.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {user.allowed_databases.slice(0, 3).map(db => (
                                                    <span key={db} className="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-300">
                                                        {db.includes(':') ? `${db.split(':')[1]} (ID:${db.split(':')[0]})` : db}
                                                    </span>
                                                ))}
                                                {user.allowed_databases.length > 3 && (
                                                    <span className="text-xs text-gray-500">+{user.allowed_databases.length - 3} more</span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-500 text-sm">None</span>
                                        )}
                                    </td>
                                    <td className="text-gray-400 text-sm">
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => openEditModal(user)}
                                                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            {user.id !== currentUser?.id && (
                                                <button
                                                    onClick={() => setShowDeleteModal(user)}
                                                    className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="card p-6 w-full max-w-lg animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-white">
                                {editingUser ? 'Edit User' : 'Create User'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Username</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="input-dark w-full"
                                    disabled={!!editingUser}
                                    required={!editingUser}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Password {editingUser && <span className="text-gray-500">(leave empty to keep current)</span>}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="input-dark w-full"
                                    required={!editingUser}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="select-dark w-full"
                                >
                                    <option value="operator">Operator</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            {formData.role === 'operator' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        <Database className="w-4 h-4 inline mr-1" />
                                        Allowed Databases ({selectedConnection?.name || 'Localhost'})
                                    </label>
                                    <div className="max-h-48 overflow-y-auto border border-gray-800 rounded-lg p-3 space-y-2">
                                        {databases.map(db => (
                                            <label key={db} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={
                                                        formData.allowed_databases.includes(`${selectedConnection ? selectedConnection.id : '1'}:${db}`) ||
                                                        ((!selectedConnection || String(selectedConnection.id) === '1') && formData.allowed_databases.includes(db))
                                                    }
                                                    onChange={() => toggleDatabase(db)}
                                                    className="rounded border-gray-600"
                                                />
                                                <span className="text-sm text-gray-300">{db}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingUser ? 'Update' : 'Create'}
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
                                <h2 className="text-xl font-semibold text-white">Delete User</h2>
                                <p className="text-gray-400 text-sm">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-gray-300 mb-6">
                            Are you sure you want to delete <span className="font-medium text-white">{showDeleteModal.username}</span>?
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

export default UserManagement;

import { useState, useEffect } from 'react';
import { X, Loader2, TestTube, Check, AlertCircle } from 'lucide-react';
import { connectionsAPI } from '../services/connectionsAPI';
import { useToast } from '../hooks/useToast';

const ConnectionFormModal = ({ connection, onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        port: 3306,
        username: '',
        password: '',
        is_default: false
    });
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const toast = useToast();

    const isEdit = !!connection;

    useEffect(() => {
        if (connection) {
            setFormData({
                name: connection.name,
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: '', // Don't populate password for security
                is_default: connection.is_default
            });
        }
    }, [connection]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        // Reset test result when any field changes
        setTestResult(null);
    };

    const handleTest = async () => {
        if (!formData.host || !formData.username || !formData.password) {
            toast.error('Please fill in host, username, and password to test');
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            const response = await connectionsAPI.test({
                host: formData.host,
                port: formData.port || 3306,
                username: formData.username,
                password: formData.password
            });

            if (response.data.success) {
                setTestResult({
                    success: true,
                    message: response.data.message,
                    databases: response.data.databases
                });
                toast.success('Connection successful!');
            } else {
                setTestResult({
                    success: false,
                    message: response.data.message
                });
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Connection test failed';
            setTestResult({
                success: false,
                message: errorMessage
            });
            toast.error(errorMessage);
        } finally {
            setTesting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name || !formData.host || !formData.username) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (!isEdit && !formData.password) {
            toast.error('Password is required for new connection');
            return;
        }

        setLoading(true);

        try {
            const dataToSubmit = {
                name: formData.name,
                host: formData.host,
                port: parseInt(formData.port) || 3306,
                username: formData.username,
                is_default: formData.is_default
            };

            // Only include password if it's provided
            if (formData.password) {
                dataToSubmit.password = formData.password;
            }

            if (isEdit) {
                await connectionsAPI.update(connection.id, dataToSubmit);
                toast.success('Connection updated successfully');
            } else {
                await connectionsAPI.create(dataToSubmit);
                toast.success('Connection created successfully');
            }

            onClose(true); // true = reload connections list
        } catch (error) {
            toast.error(error.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} connection`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">
                        {isEdit ? 'Edit Connection' : 'Add New Connection'}
                    </h2>
                    <button
                        onClick={() => onClose(false)}
                        className="text-gray-400 hover:text-white"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Connection Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Connection Name *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="input-dark w-full"
                            placeholder="e.g., Production Server"
                            required
                        />
                    </div>

                    {/* Host */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Host *
                        </label>
                        <input
                            type="text"
                            name="host"
                            value={formData.host}
                            onChange={handleChange}
                            className="input-dark w-full"
                            placeholder="e.g., localhost, 192.168.1.100, example.com"
                            required
                        />
                    </div>

                    {/* Port */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Port
                        </label>
                        <input
                            type="number"
                            name="port"
                            value={formData.port}
                            onChange={handleChange}
                            className="input-dark w-full"
                            placeholder="3306"
                            min="1"
                            max="65535"
                        />
                    </div>

                    {/* Username */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Username *
                        </label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            className="input-dark w-full"
                            placeholder="MySQL username"
                            required
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Password {isEdit && '(leave blank to keep current)'}
                            {!isEdit && '*'}
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="input-dark w-full"
                            placeholder={isEdit ? '••••••••' : 'MySQL password'}
                            required={!isEdit}
                        />
                    </div>

                    {/* Set as Default */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_default"
                            name="is_default"
                            checked={formData.is_default}
                            onChange={handleChange}
                            className="rounded border-gray-700 bg-gray-800 text-brand-500 focus:ring-brand-500"
                        />
                        <label htmlFor="is_default" className="text-sm text-gray-300">
                            Set as default connection
                        </label>
                    </div>

                    {/* Test Connection Button */}
                    <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing || !formData.host || !formData.username || !formData.password}
                        className="btn-ghost w-full flex items-center justify-center gap-2"
                    >
                        {testing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Testing Connection...
                            </>
                        ) : (
                            <>
                                <TestTube className="w-5 h-5" />
                                Test Connection
                            </>
                        )}
                    </button>

                    {/* Test Result */}
                    {testResult && (
                        <div className={`p-4 rounded-lg border ${testResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                            <div className="flex items-start gap-2">
                                {testResult.success ? (
                                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <p className={`font-medium ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                        {testResult.message}
                                    </p>
                                    {testResult.success && testResult.databases && (
                                        <p className="text-sm text-gray-400 mt-1">
                                            Found {testResult.databases.length} database(s)
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => onClose(false)}
                            className="btn-ghost flex-1"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary flex-1 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {isEdit ? 'Updating...' : 'Creating...'}
                                </>
                            ) : (
                                isEdit ? 'Update Connection' : 'Create Connection'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ConnectionFormModal;

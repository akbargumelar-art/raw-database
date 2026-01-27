import { Server, ChevronDown } from 'lucide-react';
import { useConnection } from '../contexts/ConnectionContext';

const ConnectionSelector = ({ className = '' }) => {
    const { connections, selectedConnection, selectConnection, loading } = useConnection();

    if (loading || !selectedConnection) {
        return (
            <div className={`flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg ${className}`}>
                <Server className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500">Loading...</span>
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <select
                value={selectedConnection.id}
                onChange={(e) => {
                    const conn = connections.find(c => c.id === parseInt(e.target.value));
                    if (conn) selectConnection(conn);
                }}
                className="appearance-none w-full px-4 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer hover:bg-gray-750 transition-colors"
            >
                {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                        {conn.name} ({conn.host}:{conn.port})
                    </option>
                ))}
            </select>

            {/* Custom icon */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-400" />
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </div>

            {/* Default badge */}
            {selectedConnection.is_default && (
                <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-brand-500 text-white text-xs rounded-full">
                    Default
                </div>
            )}
        </div>
    );
};

export default ConnectionSelector;

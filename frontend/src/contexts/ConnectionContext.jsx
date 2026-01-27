import { createContext, useContext, useState, useEffect } from 'react';
import { connectionsAPI } from '../services/connectionsAPI';

const ConnectionContext = createContext();

export const useConnection = () => {
    const context = useContext(ConnectionContext);
    if (!context) {
        throw new Error('useConnection must be used within ConnectionProvider');
    }
    return context;
};

export const ConnectionProvider = ({ children }) => {
    const [connections, setConnections] = useState([]);
    const [selectedConnection, setSelectedConnection] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load connections on mount
    useEffect(() => {
        // Only load if user is authenticated (token exists)
        const token = localStorage.getItem('token');
        if (token) {
            loadConnections();
        } else {
            setLoading(false);
        }
    }, []);

    const loadConnections = async () => {
        try {
            setLoading(true);
            const response = await connectionsAPI.list();
            const connList = response.data;
            setConnections(connList);

            // Get saved connection ID from localStorage
            const savedId = localStorage.getItem('selectedConnectionId');

            if (savedId) {
                const saved = connList.find(c => c.id === parseInt(savedId));
                if (saved) {
                    setSelectedConnection(saved);
                    return;
                }
            }

            // If no saved or not found, use default connection
            const defaultConn = connList.find(c => c.is_default);
            if (defaultConn) {
                setSelectedConnection(defaultConn);
                localStorage.setItem('selectedConnectionId', defaultConn.id.toString());
            } else if (connList.length > 0) {
                // If no default, use first connection
                setSelectedConnection(connList[0]);
                localStorage.setItem('selectedConnectionId', connList[0].id.toString());
            }
        } catch (error) {
            // Don't log errors on login page (401 is expected)
            if (error.response?.status !== 401) {
                console.error('Failed to load connections:', error);
            }
        } finally {
            setLoading(false);
        }
    };

    const selectConnection = (connection) => {
        setSelectedConnection(connection);
        localStorage.setItem('selectedConnectionId', connection.id.toString());
    };

    const refreshConnections = async () => {
        await loadConnections();
    };

    const value = {
        connections,
        selectedConnection,
        selectConnection,
        refreshConnections,
        loading
    };

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
};

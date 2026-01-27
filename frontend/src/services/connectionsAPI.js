import api from './api';

export const connectionsAPI = {
    // Get all connections
    list: () => api.get('/connections'),

    // Get connection by ID
    getById: (id) => api.get(`/connections/${id}`),

    // Create new connection
    create: (data) => api.post('/connections', data),

    // Update connection
    update: (id, data) => api.put(`/connections/${id}`, data),

    // Delete connection
    delete: (id) => api.delete(`/connections/${id}`),

    // Test connection
    test: (data) => api.post('/connections/test', data),

    // Set as default
    setDefault: (id) => api.put(`/connections/${id}/set-default`)
};

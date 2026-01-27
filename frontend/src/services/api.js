import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    login: (username, password) => api.post('/auth/login', { username, password }),
    register: (data) => api.post('/auth/register', data),
    getMe: () => api.get('/auth/me'),
    getUsers: () => api.get('/auth/users'),
    updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
    deleteUser: (id) => api.delete(`/auth/users/${id}`)
};

// Database API
export const databaseAPI = {
    list: (connectionId) => api.get('/databases', { params: { connectionId } }),
    getStats: (connectionId) => api.get('/databases/stats', { params: { connectionId } }),
    getTables: (database, connectionId) => api.get(`/databases/${database}/tables`, { params: { connectionId } }),
    getTableInfo: (database, table, connectionId) => api.get(`/databases/${database}/${table}`, { params: { connectionId } }),
    getStructure: (database, table, connectionId) => api.get(`/databases/${database}/${table}/structure`, { params: { connectionId } }),
    create: (name) => api.post('/databases', { name }),
    drop: (database) => api.delete(`/databases/${database}`)
};

// Schema API
export const schemaAPI = {
    analyzeFile: (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/schema/analyze', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    createTable: (database, tableName, columns) =>
        api.post(`/schema/${database}/create-table`, { tableName, columns }),
    editColumn: (database, table, column, data) =>
        api.put(`/schema/${database}/${table}/column/${column}`, data),
    addColumn: (database, table, data) =>
        api.post(`/schema/${database}/${table}/column`, data),
    deleteColumn: (database, table, column) =>
        api.delete(`/schema/${database}/${table}/column/${column}`),
    reorderColumn: (database, table, column, type, afterColumn) =>
        api.put(`/schema/${database}/${table}/reorder`, { column, type, afterColumn }),
    dropTable: (database, table) =>
        api.delete(`/schema/${database}/${table}`)
};

// Data API
export const dataAPI = {
    get: (database, table, params) =>
        api.get(`/data/${database}/${table}`, { params }),
    insert: (database, table, data) =>
        api.post(`/data/${database}/${table}`, data),
    update: (database, table, id, data) =>
        api.put(`/data/${database}/${table}/${id}`, data),
    delete: (database, table, id, primaryKey) =>
        api.delete(`/data/${database}/${table}/${id}`, { params: { primaryKey } }),
    export: (database, table, params) =>
        api.get(`/data/${database}/${table}/export`, { params, responseType: 'blob' }),
    query: (database, sql, confirmed = false) =>
        api.post(`/data/${database}/query`, { sql, confirmed })
};

// Upload API
export const uploadAPI = {
    upload: (database, table, file, batchSize = 5000, duplicateMode = 'skip', duplicateCheckFields = [], onProgress) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('batchSize', batchSize);
        formData.append('duplicateMode', duplicateMode);
        formData.append('duplicateCheckFields', JSON.stringify(duplicateCheckFields));
        return api.post(`/upload/${database}/${table}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: onProgress
        });
    },
    getProgress: (taskId) => api.get(`/upload/progress/${taskId}`)
};

export default api;

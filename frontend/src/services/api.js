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
    createTable: (database, tableName, columns, connectionId) =>
        api.post(`/schema/${database}/create-table`, { tableName, columns }, { params: { connectionId } }),
    editColumn: (database, table, column, data, connectionId) =>
        api.put(`/schema/${database}/${table}/column/${column}`, data, { params: { connectionId } }),
    addColumn: (database, table, data, connectionId) =>
        api.post(`/schema/${database}/${table}/column`, data, { params: { connectionId } }),
    deleteColumn: (database, table, column, connectionId) =>
        api.delete(`/schema/${database}/${table}/column/${column}`, { params: { connectionId } }),
    reorderColumn: (database, table, column, type, afterColumn, connectionId) =>
        api.put(`/schema/${database}/${table}/reorder`, { column, type, afterColumn }, { params: { connectionId } }),
    dropTable: (database, table, connectionId) =>
        api.delete(`/schema/${database}/${table}`, { params: { connectionId } })
};

// Data API
export const dataAPI = {
    get: (database, table, params) =>
        api.get(`/data/${database}/${table}`, { params }),
    insert: (database, table, data, connectionId) =>
        api.post(`/data/${database}/${table}`, data, { params: { connectionId } }),
    update: (database, table, id, data, connectionId) =>
        api.put(`/data/${database}/${table}/${id}`, data, { params: { connectionId } }),
    delete: (database, table, id, primaryKey, connectionId) =>
        api.delete(`/data/${database}/${table}/${id}`, { params: { primaryKey, connectionId } }),
    export: (database, table, params) =>
        api.get(`/data/${database}/${table}/export`, { params, responseType: 'blob' }),
    query: (database, sql, confirmed = false, connectionId) =>
        api.post(`/data/${database}/query`, { sql, confirmed }, { params: { connectionId } })
};

// Upload API
export const uploadAPI = {
    upload: (database, table, file, batchSize = 5000, duplicateMode = 'skip', duplicateCheckFields = [], onProgress, connectionId) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('batchSize', batchSize);
        formData.append('duplicateMode', duplicateMode);
        formData.append('duplicateCheckFields', JSON.stringify(duplicateCheckFields));
        if (connectionId) formData.append('connectionId', connectionId);
        return api.post(`/upload/${database}/${table}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: onProgress
        });
    },
    getProgress: (taskId) => api.get(`/upload/progress/${taskId}`),
    downloadTemplate: (database, table, connectionId) =>
        api.get(`/upload/template/${database}/${table}`, {
            params: { connectionId },
            responseType: 'blob'
        })
};

// Lookup API
export const lookupAPI = {
    process: (formData, onProgress) => api.post('/lookup/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress
    }),
    processCustom: (formData, onProgress) => api.post('/lookup/process-custom', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: onProgress
    }),
    download: (fileKey) => api.get(`/lookup/download/${fileKey}`, {
        responseType: 'blob'
    })
};

export default api;

import { useState, useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { databaseAPI, uploadAPI } from '../services/api';
import {
    Upload,
    FileSpreadsheet,
    Database,
    Table2,
    Loader2,
    CheckCircle,
    XCircle,
    BarChart3,
    X
} from 'lucide-react';

const UploadData = () => {
    const toast = useToast();
    const fileInputRef = useRef(null);

    const [databases, setDatabases] = useState([]);
    const [tables, setTables] = useState([]);
    const [selectedDb, setSelectedDb] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [file, setFile] = useState(null);
    const [batchSize, setBatchSize] = useState(5000);

    // Duplicate handling
    const [duplicateMode, setDuplicateMode] = useState('update'); // 'skip' | 'update' | 'error' - default to update
    const [tableColumns, setTableColumns] = useState([]);
    const [duplicateCheckFields, setDuplicateCheckFields] = useState([]);
    const [primaryKeys, setPrimaryKeys] = useState([]);

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [taskId, setTaskId] = useState(null);
    const [status, setStatus] = useState(null);
    const [polling, setPolling] = useState(false);

    useEffect(() => {
        loadDatabases();
    }, []);

    useEffect(() => {
        if (selectedDb) {
            loadTables(selectedDb);
        }
    }, [selectedDb]);

    useEffect(() => {
        if (taskId && !polling) {
            pollProgress();
        }
    }, [taskId]);

    const loadDatabases = async () => {
        try {
            const res = await databaseAPI.list();
            setDatabases(res.data);
        } catch (error) {
            toast.error('Failed to load databases');
        }
    };

    const loadTables = async (db) => {
        try {
            const res = await databaseAPI.getTables(db);
            setTables(res.data);
        } catch (error) {
            toast.error('Failed to load tables');
        }
    };

    const loadTableColumns = async (db, table) => {
        try {
            const res = await databaseAPI.getTableInfo(db, table);
            setTableColumns(res.data.columns || []);
            // Extract primary keys
            const pkFields = (res.data.columns || []).filter(c => c.key === 'PRI').map(c => c.name);
            setPrimaryKeys(pkFields);
        } catch (error) {
            console.error('Failed to load columns:', error);
        }
    };

    useEffect(() => {
        if (selectedDb && selectedTable) {
            loadTableColumns(selectedDb, selectedTable);
        }
    }, [selectedDb, selectedTable]);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setStatus(null);
        }
    };

    const pollProgress = async () => {
        if (!taskId) return;
        setPolling(true);

        const interval = setInterval(async () => {
            try {
                const res = await uploadAPI.getProgress(taskId);
                setStatus(res.data);

                if (res.data.status === 'completed' || res.data.status === 'error') {
                    clearInterval(interval);
                    setPolling(false);
                    setUploading(false);

                    if (res.data.status === 'completed') {
                        toast.success(`Upload complete! ${res.data.insertedRows} rows inserted.`);
                    } else {
                        toast.error('Upload failed');
                    }
                }
            } catch (error) {
                clearInterval(interval);
                setPolling(false);
            }
        }, 1000);
    };

    const handleUpload = async () => {
        if (!selectedDb || !selectedTable || !file) {
            toast.error('Select database, table, and file');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setStatus(null);

        try {
            const res = await uploadAPI.upload(
                selectedDb,
                selectedTable,
                file,
                batchSize,
                duplicateMode,
                duplicateCheckFields,
                (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(progress);
                }
            );

            setTaskId(res.data.taskId);
            toast.info('Upload started, processing...');
        } catch (error) {
            toast.error(error.response?.data?.error || 'Upload failed');
            setUploading(false);
        }
    };

    const resetUpload = () => {
        setFile(null);
        setStatus(null);
        setTaskId(null);
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const progressPercent = status?.totalRows
        ? Math.round((status.processedRows / status.totalRows) * 100)
        : 0;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Upload Data</h1>
                <p className="text-gray-400 mt-1">Import CSV or Excel files with batch processing</p>
            </div>

            {/* Configuration */}
            <div className="card p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            <Database className="w-4 h-4 inline mr-2" />
                            Database
                        </label>
                        <select
                            value={selectedDb}
                            onChange={(e) => { setSelectedDb(e.target.value); setSelectedTable(''); }}
                            className="select-dark w-full"
                            disabled={uploading}
                        >
                            <option value="">Select database...</option>
                            {databases.map(db => (
                                <option key={db} value={db}>{db}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            <Table2 className="w-4 h-4 inline mr-2" />
                            Table
                        </label>
                        <select
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="select-dark w-full"
                            disabled={!selectedDb || uploading}
                        >
                            <option value="">Select table...</option>
                            {tables.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                        Batch Size (rows per batch)
                    </label>
                    <input
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(parseInt(e.target.value) || 5000)}
                        min={100}
                        max={10000}
                        className="input-dark w-48"
                        disabled={uploading}
                    />
                    <p className="text-xs text-gray-500 mt-1">Recommended: 5000 for large files</p>
                </div>

                {/* Duplicate Handling */}
                <div className="space-y-4 pt-4 border-t border-gray-800">
                    <h3 className="text-sm font-medium text-gray-300">Duplicate Prevention</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Duplicate Handling Mode
                            </label>
                            <select
                                value={duplicateMode}
                                onChange={(e) => setDuplicateMode(e.target.value)}
                                className="select-dark w-full"
                                disabled={uploading}
                            >
                                <option value="skip">Skip duplicates (INSERT IGNORE)</option>
                                <option value="update">Update duplicates (ON DUPLICATE KEY UPDATE)</option>
                                <option value="error">Error on duplicates (abort)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {duplicateMode === 'skip' && 'Duplicate rows will be ignored'}
                                {duplicateMode === 'update' && 'Duplicate rows will be updated with new data'}
                                {duplicateMode === 'error' && 'Upload will abort if duplicates found'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Check Fields for Duplicates (optional)
                            </label>
                            {primaryKeys.length > 0 && (
                                <div className="mb-2 p-2 bg-brand-500/10 border border-brand-500/30 rounded text-xs">
                                    <span className="text-brand-400 font-medium">PRIMARY KEY:</span>
                                    <span className="text-gray-300 ml-2">{primaryKeys.join(', ')}</span>
                                </div>
                            )}
                            <select
                                multiple
                                value={duplicateCheckFields}
                                onChange={(e) => setDuplicateCheckFields(Array.from(e.target.selectedOptions, opt => opt.value))}
                                className="select-dark w-full h-24"
                                disabled={uploading || tableColumns.length === 0}
                            >
                                {tableColumns.map(col => (
                                    <option key={col.name} value={col.name}>
                                        {col.name} ({col.type}){col.key === 'PRI' ? ' 🔑 PRIMARY' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Hold Ctrl/Cmd to select multiple fields. Empty = use PRIMARY KEY only.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* File Upload */}
            <div className="card p-6">
                {!file ? (
                    <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
                        <FileSpreadsheet className="w-12 h-12 text-gray-500 mb-4" />
                        <p className="text-gray-300 font-medium">Drop your file here or click to browse</p>
                        <p className="text-sm text-gray-500 mt-1">Supports CSV, XLSX, XLS (up to 200MB)</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileSelect}
                            className="hidden"
                            disabled={uploading}
                        />
                    </label>
                ) : (
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                <FileSpreadsheet className="w-6 h-6 text-brand-400" />
                            </div>
                            <div>
                                <p className="font-medium text-white">{file.name}</p>
                                <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        </div>
                        {!uploading && (
                            <button onClick={resetUpload} className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Progress */}
            {(uploading || status) && (
                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        {status?.status === 'completed' ? (
                            <CheckCircle className="w-6 h-6 text-green-400" />
                        ) : status?.status === 'error' ? (
                            <XCircle className="w-6 h-6 text-red-400" />
                        ) : (
                            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
                        )}
                        <span className="font-medium text-white">
                            {status?.status === 'completed' ? 'Upload Complete' :
                                status?.status === 'error' ? 'Upload Failed' :
                                    uploadProgress < 100 ? 'Uploading file...' : 'Processing data...'}
                        </span>
                    </div>

                    {/* Upload Progress Bar */}
                    {uploadProgress < 100 && (
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>Uploading</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-500 transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Processing Progress */}
                    {status && uploadProgress >= 100 && (
                        <div>
                            <div className="flex justify-between text-sm text-gray-400 mb-1">
                                <span>Processing rows</span>
                                <span>{status.processedRows} / {status.totalRows}</span>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-300"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Stats */}
                    {status && (
                        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-white">{status.processedRows || 0}</p>
                                <p className="text-sm text-gray-500">Processed</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-green-400">{status.insertedRows || 0}</p>
                                <p className="text-sm text-gray-500">Inserted</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-yellow-400">{status.skippedRows || 0}</p>
                                <p className="text-sm text-gray-500">Skipped</p>
                            </div>
                            {status.updatedRows > 0 && (
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-blue-400">{status.updatedRows || 0}</p>
                                    <p className="text-sm text-gray-500">Updated</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Errors */}
                    {status?.errors?.length > 0 && (
                        <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-lg">
                            <p className="text-sm font-medium text-red-400 mb-2">Errors:</p>
                            {status.errors.map((err, i) => (
                                <p key={i} className="text-sm text-red-300">{err.error}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Upload Button */}
            {file && !status?.status && (
                <button
                    onClick={handleUpload}
                    disabled={uploading || !selectedDb || !selectedTable}
                    className="btn-primary flex items-center gap-2"
                >
                    {uploading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        <>
                            <Upload className="w-5 h-5" />
                            Start Upload
                        </>
                    )}
                </button>
            )}

            {/* New Upload Button */}
            {status?.status === 'completed' && (
                <button onClick={resetUpload} className="btn-secondary">
                    Upload Another File
                </button>
            )}
        </div>
    );
};

export default UploadData;

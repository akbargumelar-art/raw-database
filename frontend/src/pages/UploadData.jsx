import { useState, useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { useConnection } from '../contexts/ConnectionContext';
import { databaseAPI, uploadAPI } from '../services/api';
import ConnectionSelector from '../components/ConnectionSelector';
import {
    Upload,
    FileSpreadsheet,
    Database,
    Table2,
    Loader2,
    CheckCircle,
    XCircle,
    X,
    Download,
    AlertTriangle,
    Clock,
    Trash2,
    Play,
    RefreshCw,
    UploadCloud,
    HardDrive,
    ArrowRight
} from 'lucide-react';

const UploadData = () => {
    const toast = useToast();
    const { selectedConnection } = useConnection();
    const fileInputRef = useRef(null);

    // Phase management
    const [currentPhase, setCurrentPhase] = useState(1); // 1 = Upload to VPS, 2 = Process to DB

    // Database/Table selection
    const [databases, setDatabases] = useState([]);
    const [tables, setTables] = useState([]);
    const [selectedDb, setSelectedDb] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [batchSize, setBatchSize] = useState(5000);

    // Duplicate handling
    const [duplicateMode, setDuplicateMode] = useState('update');
    const [tableColumns, setTableColumns] = useState([]);
    const [duplicateCheckFields, setDuplicateCheckFields] = useState([]);
    const [primaryKeys, setPrimaryKeys] = useState([]);

    // File state
    const [file, setFile] = useState(null);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [selectedPendingFile, setSelectedPendingFile] = useState(null);

    // Upload state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadedFileId, setUploadedFileId] = useState(null);

    // Processing state
    const [processing, setProcessing] = useState(false);
    const [taskId, setTaskId] = useState(null);
    const [status, setStatus] = useState(null);
    const [polling, setPolling] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    // Active tasks state (for reconnection after browser refresh)
    const [activeTasks, setActiveTasks] = useState([]);
    const [activeTaskStatuses, setActiveTaskStatuses] = useState({});

    // Constants
    const MAX_FILE_SIZE_MB = 500; // Increased for two-phase
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

    useEffect(() => {
        if (selectedConnection) {
            loadDatabases();
            loadPendingFiles();
        }
    }, [selectedConnection]);

    useEffect(() => {
        if (selectedDb) {
            loadTables(selectedDb);
        }
    }, [selectedDb]);

    useEffect(() => {
        if (selectedDb && selectedTable) {
            loadTableColumns(selectedDb, selectedTable);
        }
    }, [selectedDb, selectedTable]);

    useEffect(() => {
        if (taskId && !polling) {
            pollProgress();
        }
    }, [taskId]);

    // Check for active tasks on mount (reconnection after browser refresh)
    useEffect(() => {
        checkActiveTasks();
    }, []);

    const loadDatabases = async () => {
        if (!selectedConnection) return;
        try {
            const res = await databaseAPI.list(selectedConnection.id);
            setDatabases(res.data);
        } catch (error) {
            toast.error('Failed to load databases');
        }
    };

    const loadTables = async (db) => {
        if (!selectedConnection) return;
        try {
            const res = await databaseAPI.getTables(db, selectedConnection.id);
            setTables(res.data);
        } catch (error) {
            toast.error('Failed to load tables');
        }
    };

    const loadTableColumns = async (db, table) => {
        if (!selectedConnection) return;
        try {
            const res = await databaseAPI.getTableInfo(db, table, selectedConnection.id);
            setTableColumns(res.data.columns || []);
            const pkFields = (res.data.columns || []).filter(c => c.key === 'PRI').map(c => c.name);
            setPrimaryKeys(pkFields);
        } catch (error) {
            console.error('Failed to load columns:', error);
        }
    };

    const loadPendingFiles = async () => {
        try {
            const res = await uploadAPI.getPendingUploads();
            setPendingFiles(res.data || []);
        } catch (error) {
            console.error('Failed to load pending files:', error);
        }
    };

    // Check for active tasks and start polling their progress
    const checkActiveTasks = async () => {
        try {
            const res = await uploadAPI.getActiveTasks();
            const tasks = res.data || [];
            setActiveTasks(tasks);

            // Start polling for each active task
            if (tasks.length > 0) {
                setCurrentPhase(2); // Switch to phase 2 to show progress
                tasks.forEach(task => {
                    pollActiveTask(task.taskId);
                });
                toast.info(`${tasks.length} proses aktif ditemukan`);
            }
        } catch (error) {
            console.error('Failed to check active tasks:', error);
        }
    };

    // Poll progress for an active task (from reconnection)
    const pollActiveTask = (activeTaskId) => {
        const interval = setInterval(async () => {
            try {
                const res = await uploadAPI.getProgress(activeTaskId);
                setActiveTaskStatuses(prev => ({
                    ...prev,
                    [activeTaskId]: res.data
                }));

                if (res.data.status === 'completed' || res.data.status === 'error') {
                    clearInterval(interval);
                    // Remove from active tasks
                    setActiveTasks(prev => prev.filter(t => t.taskId !== activeTaskId));
                    loadPendingFiles();

                    if (res.data.status === 'completed') {
                        toast.success(`Proses selesai: ${res.data.insertedRows} baris dimasukkan`);
                    } else {
                        toast.error('Proses gagal');
                    }
                }
            } catch (error) {
                clearInterval(interval);
                setActiveTasks(prev => prev.filter(t => t.taskId !== activeTaskId));
            }
        }, 1500);
    };

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setUploadError(null);
        setStatus(null);
        setUploadedFileId(null);

        const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            setUploadError({
                type: 'INVALID_TYPE',
                message: `Tipe file tidak didukung: ${ext}`,
                details: `Hanya file ${ALLOWED_EXTENSIONS.join(', ')} yang diizinkan.`
            });
            return;
        }

        if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
            const fileSizeMB = (selectedFile.size / 1024 / 1024).toFixed(2);
            setUploadError({
                type: 'FILE_TOO_LARGE',
                message: `File terlalu besar: ${fileSizeMB} MB`,
                details: `Batas maksimal ukuran file adalah ${MAX_FILE_SIZE_MB} MB.`
            });
            return;
        }

        setFile(selectedFile);
    };

    // Phase 1: Upload file to VPS
    const handleUploadToVPS = async () => {
        if (!file) {
            toast.error('Pilih file terlebih dahulu');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        try {
            const res = await uploadAPI.uploadFile(file, (progressEvent) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(progress);
            });

            setUploadedFileId(res.data.fileId);
            toast.success('File berhasil diupload ke server! Siap untuk diproses.');
            loadPendingFiles();

            // Auto switch to phase 2
            setCurrentPhase(2);
            setSelectedPendingFile(res.data.file);

        } catch (error) {
            console.error('Upload error:', error);
            const errorDetails = getErrorDetails(error);
            setUploadError(errorDetails);
            toast.error(errorDetails.message);
        } finally {
            setUploading(false);
        }
    };

    // Phase 2: Process file to database
    const handleProcessToDatabase = async (fileId = null, fileName = null) => {
        const targetFileId = fileId || uploadedFileId || selectedPendingFile?.id;

        if (!targetFileId) {
            toast.error('Pilih file yang akan diproses');
            return;
        }

        if (!selectedDb || !selectedTable) {
            toast.error('Pilih database dan table terlebih dahulu');
            return;
        }

        setProcessing(true);
        setStatus(null);
        setUploadError(null);

        try {
            const res = await uploadAPI.processFile(
                targetFileId,
                selectedDb,
                selectedTable,
                batchSize,
                duplicateMode,
                duplicateCheckFields,
                selectedConnection?.id
            );

            setTaskId(res.data.taskId);
            toast.info('Proses dimulai! Browser dapat ditutup dengan aman.');

        } catch (error) {
            console.error('Process error:', error);
            const msg = error.response?.data?.error || 'Gagal memulai proses';
            toast.error(msg);
            setProcessing(false);
        }
    };

    const handleDeletePendingFile = async (fileId) => {
        if (!confirm('Hapus file ini?')) return;

        try {
            await uploadAPI.deletePendingFile(fileId);
            toast.success('File dihapus');
            loadPendingFiles();
            if (selectedPendingFile?.fileId === fileId) {
                setSelectedPendingFile(null);
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Gagal menghapus file');
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
                    setProcessing(false);

                    if (res.data.status === 'completed') {
                        toast.success(`Selesai! ${res.data.insertedRows} baris dimasukkan.`);
                        loadPendingFiles();
                    } else {
                        toast.error('Proses gagal');
                    }
                }
            } catch (error) {
                clearInterval(interval);
                setPolling(false);
            }
        }, 1000);
    };

    const getErrorDetails = (error) => {
        if (!error.response) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                return { type: 'TIMEOUT', message: 'Koneksi timeout', details: 'Upload memakan waktu terlalu lama.' };
            }
            return { type: 'NETWORK', message: 'Error jaringan', details: error.message || 'Terjadi kesalahan koneksi.' };
        }

        const status = error.response?.status;
        const serverMessage = error.response?.data?.error;

        switch (status) {
            case 413: return { type: 'FILE_TOO_LARGE', message: 'File terlalu besar', details: 'Server menolak file.' };
            case 504: return { type: 'TIMEOUT', message: 'Gateway timeout', details: 'Server tidak merespon.' };
            default: return { type: 'UNKNOWN', message: serverMessage || 'Error', details: 'Terjadi kesalahan.' };
        }
    };

    const resetUpload = () => {
        setFile(null);
        setStatus(null);
        setTaskId(null);
        setUploadProgress(0);
        setUploadError(null);
        setUploadedFileId(null);
        setSelectedPendingFile(null);
        setProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownloadTemplate = async () => {
        if (!selectedDb || !selectedTable) {
            toast.error('Pilih database dan table terlebih dahulu');
            return;
        }

        try {
            const res = await uploadAPI.downloadTemplate(selectedDb, selectedTable, selectedConnection?.id);
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedTable}_template.xlsx`;
            a.click();
            toast.success('Template downloaded');
        } catch (error) {
            toast.error('Failed to download template');
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const progressPercent = status?.totalRows
        ? ((status.processedRows / status.totalRows) * 100).toFixed(2)
        : '0.00';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Upload Data</h1>
                    <p className="text-gray-400 mt-1">Two-Phase Upload: File disimpan di server, proses berjalan di background</p>
                </div>
                <div className="w-full md:w-72">
                    <ConnectionSelector />
                </div>
            </div>

            {/* Phase Indicator */}
            <div className="card p-4">
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={() => setCurrentPhase(1)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentPhase === 1
                            ? 'bg-brand-500 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                    >
                        <UploadCloud className="w-5 h-5" />
                        <span className="font-medium">Phase 1: Upload ke Server</span>
                    </button>
                    <ArrowRight className="w-5 h-5 text-gray-600" />
                    <button
                        onClick={() => setCurrentPhase(2)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentPhase === 2
                            ? 'bg-brand-500 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                    >
                        <HardDrive className="w-5 h-5" />
                        <span className="font-medium">Phase 2: Proses ke Database</span>
                    </button>
                </div>
            </div>

            {/* Phase 1: Upload to VPS */}
            {currentPhase === 1 && (
                <div className="space-y-6">
                    <div className="card p-6">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <UploadCloud className="w-5 h-5 text-brand-400" />
                            Phase 1: Upload File ke Server
                        </h2>
                        <p className="text-gray-400 text-sm mb-4">
                            File akan disimpan di server terlebih dahulu. Anda bisa menutup browser setelah upload selesai.
                        </p>

                        {/* File Upload Area */}
                        {!file ? (
                            <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-brand-500 transition-colors">
                                <FileSpreadsheet className="w-12 h-12 text-gray-500 mb-4" />
                                <p className="text-gray-300 font-medium">Drop file atau klik untuk memilih</p>
                                <p className="text-sm text-gray-500 mt-1">CSV, XLSX, XLS (max {MAX_FILE_SIZE_MB}MB)</p>
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
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                            <FileSpreadsheet className="w-6 h-6 text-brand-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{file.name}</p>
                                            <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                                        </div>
                                    </div>
                                    {!uploading && (
                                        <button onClick={resetUpload} className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                                            <X className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>

                                {/* Upload Progress */}
                                {uploading && (
                                    <div className="space-y-4">
                                        {/* Circular Progress */}
                                        <div className="flex flex-col items-center py-4">
                                            <div className="relative w-28 h-28">
                                                <svg className="w-28 h-28 transform -rotate-90">
                                                    <circle
                                                        cx="56"
                                                        cy="56"
                                                        r="48"
                                                        stroke="currentColor"
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        className="text-gray-800"
                                                    />
                                                    <circle
                                                        cx="56"
                                                        cy="56"
                                                        r="48"
                                                        stroke="currentColor"
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        strokeDasharray={`${2 * Math.PI * 48}`}
                                                        strokeDashoffset={`${2 * Math.PI * 48 * (1 - uploadProgress / 100)}`}
                                                        strokeLinecap="round"
                                                        className="text-brand-500 transition-all duration-300"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-2xl font-bold text-white">
                                                        {uploadProgress}%
                                                    </span>
                                                    <span className="text-xs text-gray-500">Uploading</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Linear Progress Bar */}
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">Uploading ke server...</span>
                                                <span className="text-white font-medium">{formatFileSize(file.size * uploadProgress / 100)} / {formatFileSize(file.size)}</span>
                                            </div>
                                            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-300 rounded-full"
                                                    style={{ width: `${uploadProgress}%` }}
                                                />
                                            </div>
                                        </div>

                                        <p className="text-xs text-gray-500 text-center">
                                            💡 Jangan tutup browser sampai upload selesai
                                        </p>
                                    </div>
                                )}

                                {/* Upload Button */}
                                {!uploading && !uploadedFileId && (
                                    <button
                                        onClick={handleUploadToVPS}
                                        className="btn-primary flex items-center gap-2 w-full justify-center"
                                    >
                                        <Upload className="w-5 h-5" />
                                        Upload ke Server
                                    </button>
                                )}

                                {/* Success Message */}
                                {uploadedFileId && (
                                    <div className="p-4 bg-green-950/30 border border-green-500/30 rounded-lg">
                                        <div className="flex items-center gap-2 text-green-400">
                                            <CheckCircle className="w-5 h-5" />
                                            <span className="font-medium">File berhasil diupload!</span>
                                        </div>
                                        <p className="text-sm text-gray-400 mt-2">
                                            Klik "Phase 2" untuk memproses file ke database.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Phase 2: Process to Database */}
            {currentPhase === 2 && (
                <div className="space-y-6">
                    {/* Active Processing Tasks (for reconnection) */}
                    {activeTasks.length > 0 && (
                        <div className="card p-6 border border-brand-500/30 bg-brand-500/5">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                                <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                                Proses Aktif ({activeTasks.length})
                            </h2>
                            <div className="space-y-4">
                                {activeTasks.map((task) => {
                                    const taskStatus = activeTaskStatuses[task.taskId] || task;
                                    const percent = taskStatus.totalRows > 0
                                        ? Math.round((taskStatus.processedRows / taskStatus.totalRows) * 100)
                                        : 0;
                                    return (
                                        <div key={task.taskId} className="p-4 bg-gray-800/50 rounded-lg space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <FileSpreadsheet className="w-6 h-6 text-brand-400" />
                                                    <div>
                                                        <p className="font-medium text-white text-sm">{task.fileName}</p>
                                                        <p className="text-xs text-gray-500">
                                                            → {task.database}.{task.table}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-2xl font-bold text-brand-400">{percent}%</span>
                                            </div>
                                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-300 rounded-full"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>{taskStatus.processedRows?.toLocaleString() || 0} / {taskStatus.totalRows?.toLocaleString() || 0} baris</span>
                                                <span>
                                                    ✓ {taskStatus.insertedRows?.toLocaleString() || 0} inserted
                                                    {taskStatus.updatedRows > 0 && ` • ↻ ${taskStatus.updatedRows?.toLocaleString()} updated`}
                                                    {taskStatus.skippedRows > 0 && ` • ○ ${taskStatus.skippedRows?.toLocaleString()} skipped`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-4 text-center">
                                💡 Proses berjalan di server. Browser dapat ditutup kapan saja.
                            </p>
                        </div>
                    )}

                    {/* Pending Files List */}
                    <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Clock className="w-5 h-5 text-yellow-400" />
                                File Pending ({pendingFiles.length})
                            </h2>
                            <button
                                onClick={loadPendingFiles}
                                className="btn-secondary p-2"
                                title="Refresh"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>

                        {pendingFiles.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Tidak ada file pending</p>
                                <button
                                    onClick={() => setCurrentPhase(1)}
                                    className="text-brand-400 hover:underline mt-2"
                                >
                                    Upload file baru
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {pendingFiles.map((pf) => (
                                    <div
                                        key={pf.fileId}
                                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${selectedPendingFile?.fileId === pf.fileId
                                            ? 'bg-brand-500/20 border border-brand-500/30'
                                            : 'bg-gray-800/50 hover:bg-gray-800'
                                            }`}
                                        onClick={() => setSelectedPendingFile(pf)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <FileSpreadsheet className="w-8 h-8 text-brand-400" />
                                            <div>
                                                <p className="font-medium text-white text-sm">{pf.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {formatFileSize(pf.size)} • {formatDate(pf.uploadedAt)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {pf.status === 'processing' && (
                                                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                                                    Processing...
                                                </span>
                                            )}
                                            {pf.status === 'pending' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeletePendingFile(pf.fileId); }}
                                                    className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Database/Table Selection */}
                    <div className="card p-6 space-y-6">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <HardDrive className="w-5 h-5 text-brand-400" />
                            Phase 2: Proses ke Database
                        </h2>

                        {selectedPendingFile && (
                            <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg">
                                <span className="text-sm text-gray-400">File dipilih: </span>
                                <span className="text-brand-400 font-medium">{selectedPendingFile.name}</span>
                            </div>
                        )}

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
                                    disabled={processing}
                                >
                                    <option value="">Pilih database...</option>
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
                                <div className="flex gap-2">
                                    <select
                                        value={selectedTable}
                                        onChange={(e) => setSelectedTable(e.target.value)}
                                        className="select-dark w-full"
                                        disabled={!selectedDb || processing}
                                    >
                                        <option value="">Pilih table...</option>
                                        {tables.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleDownloadTemplate}
                                        disabled={!selectedDb || !selectedTable}
                                        className="btn-secondary px-4 flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                                        title="Download template"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Batch Size
                            </label>
                            <input
                                type="number"
                                value={batchSize}
                                onChange={(e) => setBatchSize(parseInt(e.target.value) || 5000)}
                                min={100}
                                max={10000}
                                className="input-dark w-48"
                                disabled={processing}
                            />
                        </div>

                        {/* Duplicate Handling */}
                        <div className="space-y-4 pt-4 border-t border-gray-800">
                            <h3 className="text-sm font-medium text-gray-300">Duplicate Prevention</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Mode</label>
                                    <select
                                        value={duplicateMode}
                                        onChange={(e) => setDuplicateMode(e.target.value)}
                                        className="select-dark w-full"
                                        disabled={processing}
                                    >
                                        <option value="skip">Skip duplicates</option>
                                        <option value="update">Update duplicates</option>
                                        <option value="error">Error on duplicates</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Check Fields</label>
                                    {primaryKeys.length > 0 && (
                                        <div className="mb-2 p-2 bg-brand-500/10 border border-brand-500/30 rounded text-xs">
                                            <span className="text-brand-400">PRIMARY KEY: </span>
                                            <span className="text-gray-300">{primaryKeys.join(', ')}</span>
                                        </div>
                                    )}
                                    <select
                                        multiple
                                        value={duplicateCheckFields}
                                        onChange={(e) => setDuplicateCheckFields(Array.from(e.target.selectedOptions, opt => opt.value))}
                                        className="select-dark w-full h-20"
                                        disabled={processing || tableColumns.length === 0}
                                    >
                                        {tableColumns.map(col => (
                                            <option key={col.name} value={col.name}>
                                                {col.name} ({col.type}){col.key === 'PRI' ? ' 🔑' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Process Button */}
                        <button
                            onClick={() => handleProcessToDatabase(selectedPendingFile?.fileId)}
                            disabled={processing || !selectedPendingFile || !selectedDb || !selectedTable}
                            className="btn-primary flex items-center gap-2 w-full justify-center disabled:opacity-50"
                        >
                            {processing ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    Proses ke Database
                                </>
                            )}
                        </button>

                        <p className="text-xs text-gray-500 text-center">
                            💡 Browser dapat ditutup setelah proses dimulai. Data akan tetap diproses di server.
                        </p>
                    </div>

                    {/* Progress */}
                    {(processing || status) && (
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
                                    {status?.status === 'completed' ? 'Selesai!' :
                                        status?.status === 'error' ? 'Gagal' : 'Memproses...'}
                                </span>
                            </div>

                            {status && (
                                <>
                                    {/* Large Percentage Display */}
                                    <div className="flex flex-col items-center py-6">
                                        <div className="relative w-32 h-32">
                                            {/* Background circle */}
                                            <svg className="w-32 h-32 transform -rotate-90">
                                                <circle
                                                    cx="64"
                                                    cy="64"
                                                    r="56"
                                                    stroke="currentColor"
                                                    strokeWidth="8"
                                                    fill="transparent"
                                                    className="text-gray-800"
                                                />
                                                <circle
                                                    cx="64"
                                                    cy="64"
                                                    r="56"
                                                    stroke="currentColor"
                                                    strokeWidth="8"
                                                    fill="transparent"
                                                    strokeDasharray={`${2 * Math.PI * 56}`}
                                                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - progressPercent / 100)}`}
                                                    strokeLinecap="round"
                                                    className={`transition-all duration-500 ${status.status === 'completed' ? 'text-green-500' :
                                                        status.status === 'error' ? 'text-red-500' : 'text-brand-500'
                                                        }`}
                                                />
                                            </svg>
                                            {/* Percentage text in center */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className={`text-2xl font-bold ${status.status === 'completed' ? 'text-green-400' :
                                                    status.status === 'error' ? 'text-red-400' : 'text-white'
                                                    }`}>
                                                    {progressPercent}%
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {status.status === 'completed' ? 'Complete' :
                                                        status.status === 'error' ? 'Error' :
                                                            status.phase === 'parsing' ? 'Parsing file...' : 'Inserting...'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Linear Progress Bar */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-400">Progress</span>
                                            <span className="text-white font-medium">
                                                {status.processedRows?.toLocaleString()} / {status.totalRows?.toLocaleString()} rows
                                            </span>
                                        </div>
                                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 rounded-full ${status.status === 'completed' ? 'bg-green-500' :
                                                    status.status === 'error' ? 'bg-red-500' : 'bg-gradient-to-r from-brand-600 to-brand-400'
                                                    }`}
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                    </div>

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
                                    </div>

                                    {status?.errors?.length > 0 && (
                                        <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-lg">
                                            <p className="text-sm font-medium text-red-400 mb-2">Errors:</p>
                                            {status.errors.map((err, i) => (
                                                <p key={i} className="text-sm text-red-300">{err.error}</p>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {status?.status === 'completed' && (
                                <button onClick={resetUpload} className="btn-secondary w-full">
                                    Upload File Lain
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Error Display */}
            {uploadError && (
                <div className="card p-6 border-2 border-red-500/50 bg-red-950/20">
                    <div className="flex items-start gap-4">
                        <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-red-400">{uploadError.message}</h3>
                            <p className="text-gray-300 text-sm mt-1">{uploadError.details}</p>
                        </div>
                        <button onClick={() => setUploadError(null)} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UploadData;

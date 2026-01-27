import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { useConnection } from '../contexts/ConnectionContext';
import ConnectionSelector from '../components/ConnectionSelector';
import { databaseAPI, schemaAPI, lookupAPI } from '../services/api';
import {
    FileSpreadsheet,
    Loader2,
    Database,
    Table2,
    ArrowRight,
    Download,
    CheckCircle,
    Upload
} from 'lucide-react';

const BatchLookup = () => {
    const toast = useToast();
    const { selectedConnection } = useConnection();

    // Steps
    const [step, setStep] = useState(1); // 1: Upload, 2: Config, 3: Processing

    // Data
    const [file, setFile] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [excelColumns, setExcelColumns] = useState([]);

    // Config
    const [databases, setDatabases] = useState([]);
    const [tables, setTables] = useState([]);
    const [selectedDb, setSelectedDb] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [dbColumns, setDbColumns] = useState([]);

    const [sourceCol, setSourceCol] = useState(''); // Excel col
    const [targetCol, setTargetCol] = useState(''); // DB col
    const [returnCols, setReturnCols] = useState([]); // Array of strings

    // Processing
    const [processing, setProcessing] = useState(false);

    // Initial load
    useEffect(() => {
        if (selectedConnection) {
            loadDatabases();
        }
    }, [selectedConnection]);

    // Load tables when DB changes
    useEffect(() => {
        if (selectedDb && selectedConnection) {
            loadTables(selectedDb);
        }
    }, [selectedDb, selectedConnection]);

    // Load columns when Table changes
    useEffect(() => {
        if (selectedDb && selectedTable && selectedConnection) {
            loadStructure();
        }
    }, [selectedDb, selectedTable, selectedConnection]);

    const loadDatabases = async () => {
        try {
            const res = await databaseAPI.list(selectedConnection.id);
            setDatabases(res.data);
        } catch (error) {
            // Silent error or toast?
        }
    };

    const loadTables = async (db) => {
        try {
            const res = await databaseAPI.getTables(db, selectedConnection.id);
            setTables(res.data);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to load tables');
        }
    };

    const loadStructure = async () => {
        try {
            const res = await databaseAPI.getStructure(selectedDb, selectedTable, selectedConnection.id);
            setDbColumns(res.data.columns);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to load structure');
        }
    };

    const handleFileUpload = async (e) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        setFile(uploadedFile);
        setAnalyzing(true);
        try {
            // Reuse schemaAPI.analyzeFile to get columns
            const res = await schemaAPI.analyzeFile(uploadedFile);
            // res.data.columns is array of { name: '...', type: '...' }
            setExcelColumns(res.data.columns.map(c => c.name));
            setStep(2);
            toast.success(`Analyzed ${res.data.totalRows} rows`);
        } catch (error) {
            toast.error('Failed to analyze file');
            setFile(null);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleProcess = async () => {
        if (!file || !selectedDb || !selectedTable || !sourceCol || !targetCol || returnCols.length === 0) {
            toast.error('Please complete all configuration');
            return;
        }

        setProcessing(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('connectionId', selectedConnection.id);
            formData.append('database', selectedDb);
            formData.append('table', selectedTable);
            formData.append('sourceColumn', sourceCol);
            formData.append('targetColumn', targetCol);
            formData.append('returnColumns', JSON.stringify(returnCols));

            const response = await lookupAPI.process(formData);

            // Download Blob
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `lookup_result_${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            toast.success('Lookup complete! Downloading file...');
            setStep(1);
            setFile(null);
        } catch (error) {
            console.error(error);
            const msg = error.response?.data instanceof Blob
                ? 'Processing failed' // Can't read JSON from Blob easily
                : (error.response?.data?.error || 'Processing failed');
            toast.error(msg);
        } finally {
            setProcessing(false);
        }
    };

    const toggleReturnCol = (colName) => {
        if (returnCols.includes(colName)) {
            setReturnCols(returnCols.filter(c => c !== colName));
        } else {
            setReturnCols([...returnCols, colName]);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Batch Lookup</h1>
                    <p className="text-gray-400 mt-1">Enrich Excel data using database lookups</p>
                </div>
                <div className="w-full md:w-72">
                    <ConnectionSelector />
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-4 mb-8">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-brand-400' : 'text-gray-600'}`}>
                    <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold border-current">1</div>
                    <span>Upload</span>
                </div>
                <div className="h-0.5 w-12 bg-gray-800" />
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-brand-400' : 'text-gray-600'}`}>
                    <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold border-current">2</div>
                    <span>Configure</span>
                </div>
                <div className="h-0.5 w-12 bg-gray-800" />
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-brand-400' : 'text-gray-600'}`}>
                    <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold border-current">3</div>
                    <span>Process</span>
                </div>
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="card p-8 border-dashed border-2 border-gray-700 hover:border-brand-500 transition-colors text-center">
                    <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="file-upload"
                        disabled={analyzing}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
                            {analyzing ? (
                                <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
                            ) : (
                                <Upload className="w-8 h-8 text-gray-400" />
                            )}
                        </div>
                        <div>
                            <p className="text-lg font-medium text-white">Click to upload Excel file</p>
                            <p className="text-sm text-gray-500 mt-1">Supports .xlsx, .xls, .csv</p>
                        </div>
                    </label>
                </div>
            )}

            {/* Step 2: Configure */}
            {step === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Source Config */}
                    <div className="card p-6 space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-green-400" /> Source File
                        </h3>
                        <div className="p-3 bg-gray-800/50 rounded text-sm text-gray-300">
                            {file?.name}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Lookup Column (Excel)</label>
                            <select
                                value={sourceCol}
                                onChange={e => setSourceCol(e.target.value)}
                                className="select-dark w-full"
                            >
                                <option value="">Select column...</option>
                                {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Target Config */}
                    <div className="card p-6 space-y-4">
                        <h3 className="font-semibold text-white flex items-center gap-2">
                            <Database className="w-5 h-5 text-brand-400" /> Target Database
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Database</label>
                                <select
                                    value={selectedDb}
                                    onChange={e => { setSelectedDb(e.target.value); setSelectedTable(''); }}
                                    className="select-dark w-full"
                                >
                                    <option value="">Select...</option>
                                    {databases.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Table</label>
                                <select
                                    value={selectedTable}
                                    onChange={e => setSelectedTable(e.target.value)}
                                    className="select-dark w-full"
                                    disabled={!selectedDb}
                                >
                                    <option value="">Select...</option>
                                    {tables.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {selectedTable && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Match Column (Database)</label>
                                <select
                                    value={targetCol}
                                    onChange={e => setTargetCol(e.target.value)}
                                    className="select-dark w-full"
                                >
                                    <option value="">Select column...</option>
                                    {dbColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Return Columns */}
                    {selectedTable && (
                        <div className="card p-6 md:col-span-2">
                            <h3 className="font-semibold text-white mb-4">Columns to Append</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {dbColumns.map(col => (
                                    <label key={col.name} className="flex items-center gap-2 p-2 rounded bg-gray-800/30 hover:bg-gray-800 cursor-pointer transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={returnCols.includes(col.name)}
                                            onChange={() => toggleReturnCol(col.name)}
                                            className="rounded border-gray-600 text-brand-500 focus:ring-brand-500"
                                        />
                                        <span className="text-sm text-gray-300 truncate" title={col.name}>{col.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="md:col-span-2 flex justify-end gap-4 pt-4">
                        <button onClick={() => { setStep(1); setFile(null); }} className="btn-ghost">
                            Cancel
                        </button>
                        <button
                            onClick={handleProcess}
                            disabled={!sourceCol || !targetCol || returnCols.length === 0 || processing}
                            className="btn-primary px-8 py-3 text-lg flex items-center gap-2"
                        >
                            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            Run Lookup
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchLookup;

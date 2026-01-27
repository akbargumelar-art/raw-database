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
    Upload,
    Eye
} from 'lucide-react';

const BatchLookup = () => {
    const toast = useToast();
    const { selectedConnection } = useConnection();

    // Steps
    const [step, setStep] = useState(1); // 1: Upload, 2: Config, 3: Preview

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

    const [sourceCol, setSourceCol] = useState('');
    const [targetCol, setTargetCol] = useState('');
    const [returnCols, setReturnCols] = useState([]);

    // Processing & Preview
    const [processing, setProcessing] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [fileKey, setFileKey] = useState('');

    useEffect(() => {
        if (selectedConnection) {
            loadDatabases();
        }
    }, [selectedConnection]);

    useEffect(() => {
        if (selectedDb && selectedConnection) {
            loadTables(selectedDb);
        }
    }, [selectedDb, selectedConnection]);

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
            // handle error
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
            const res = await schemaAPI.analyzeFile(uploadedFile);
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

            // Set Preview Data
            setPreviewData(response.data.preview);
            setTotalRows(response.data.totalRows);
            setFileKey(response.data.fileKey);
            setStep(3); // Go to preview

            toast.success('Lookup complete! Review results below.');
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.error || 'Processing failed';
            toast.error(msg);
        } finally {
            setProcessing(false);
        }
    };

    const handleDownload = async () => {
        if (!fileKey) return;
        try {
            const response = await lookupAPI.download(fileKey);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `lookup_result_${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            toast.success('File downloaded');
        } catch (error) {
            toast.error('Download failed');
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
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
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
                {['Upload', 'Configure', 'Preview'].map((label, idx) => (
                    <div key={label} className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 ${step >= idx + 1 ? 'text-brand-400' : 'text-gray-600'}`}>
                            <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold border-current">{idx + 1}</div>
                            <span>{label}</span>
                        </div>
                        {idx < 2 && <div className="h-0.5 w-12 bg-gray-800" />}
                    </div>
                ))}
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
                            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
                            Preview Results
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Preview */}
            {step === 3 && (
                <div className="space-y-6">
                    <div className="card p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white">Preview Results</h3>
                                <p className="text-gray-400 text-sm">Showing first 50 rows of {totalRows}</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setStep(2)} className="btn-ghost">
                                    Back to Config
                                </button>
                                <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                                    <Download className="w-5 h-5" />
                                    Download Full Result
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-800 rounded-lg">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-200 uppercase bg-gray-800">
                                    <tr>
                                        {previewData.length > 0 && Object.keys(previewData[0]).map(key => (
                                            <th key={key} className="px-6 py-3 whitespace-nowrap">
                                                {key}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.map((row, i) => (
                                        <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                                            {Object.values(row).map((val, j) => (
                                                <td key={j} className="px-6 py-4 whitespace-nowrap">
                                                    {val === null ? 'NULL' : String(val)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchLookup;

import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { databaseAPI, schemaAPI } from '../services/api';
import {
    Table2,
    Plus,
    Trash2,
    Upload,
    ChevronUp,
    ChevronDown,
    GripVertical,
    Check,
    X,
    Loader2,
    FileSpreadsheet,
    Key,
    Edit2,
    Save
} from 'lucide-react';

const DATA_TYPES = [
    'INT', 'BIGINT', 'TINYINT', 'SMALLINT',
    'VARCHAR(50)', 'VARCHAR(100)', 'VARCHAR(255)',
    'TEXT', 'LONGTEXT',
    'DATE', 'DATETIME', 'TIMESTAMP',
    'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
    'BOOLEAN', 'ENUM', 'JSON'
];

const DatabaseDesigner = () => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('create');

    // Common state
    const [databases, setDatabases] = useState([]);
    const [tables, setTables] = useState([]);
    const [selectedDb, setSelectedDb] = useState('');
    const [selectedTable, setSelectedTable] = useState('');

    // Create table state
    const [tableName, setTableName] = useState('');
    const [columns, setColumns] = useState([
        { name: 'id', type: 'INT', nullable: false, primaryKey: true, autoIncrement: true }
    ]);
    const [creating, setCreating] = useState(false);

    // Edit structure state
    const [structure, setStructure] = useState([]);
    const [loadingStructure, setLoadingStructure] = useState(false);
    const [editingCol, setEditingCol] = useState(null);
    const [editColData, setEditColData] = useState({});

    // File analysis state
    const [analyzing, setAnalyzing] = useState(false);

    useEffect(() => {
        loadDatabases();
    }, []);

    useEffect(() => {
        if (selectedDb) {
            loadTables(selectedDb);
        }
    }, [selectedDb]);

    useEffect(() => {
        if (selectedDb && selectedTable && activeTab === 'edit') {
            loadStructure();
        }
    }, [selectedDb, selectedTable, activeTab]);

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

    const loadStructure = async () => {
        if (!selectedDb || !selectedTable) return;
        setLoadingStructure(true);
        try {
            const res = await databaseAPI.getStructure(selectedDb, selectedTable);
            setStructure(res.data.columns);
        } catch (error) {
            toast.error('Failed to load structure');
        } finally {
            setLoadingStructure(false);
        }
    };

    // File Analysis
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setAnalyzing(true);
        try {
            const res = await schemaAPI.analyzeFile(file);
            setColumns(res.data.columns.map((col, idx) => ({
                ...col,
                primaryKey: idx === 0,
                autoIncrement: idx === 0 && col.type === 'INT'
            })));
            setTableName(file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
            toast.success(`Analyzed ${res.data.totalRows} rows, ${res.data.columns.length} columns`);
        } catch (error) {
            toast.error('Failed to analyze file');
        } finally {
            setAnalyzing(false);
        }
    };

    // Column management for Create
    const addColumn = () => {
        setColumns([...columns, { name: '', type: 'VARCHAR(255)', nullable: true, primaryKey: false }]);
    };

    const updateColumn = (index, field, value) => {
        const newCols = [...columns];
        newCols[index][field] = value;
        setColumns(newCols);
    };

    const removeColumn = (index) => {
        setColumns(columns.filter((_, i) => i !== index));
    };

    const moveColumn = (index, direction) => {
        const newCols = [...columns];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= newCols.length) return;
        [newCols[index], newCols[newIndex]] = [newCols[newIndex], newCols[index]];
        setColumns(newCols);
    };

    // Create table
    const handleCreateTable = async () => {
        if (!selectedDb || !tableName.trim()) {
            toast.error('Select database and enter table name');
            return;
        }
        if (columns.some(c => !c.name.trim())) {
            toast.error('All columns must have names');
            return;
        }

        setCreating(true);
        try {
            await schemaAPI.createTable(selectedDb, tableName, columns);
            toast.success(`Table '${tableName}' created successfully`);
            setTableName('');
            setColumns([{ name: 'id', type: 'INT', nullable: false, primaryKey: true, autoIncrement: true }]);
            loadTables(selectedDb);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to create table');
        } finally {
            setCreating(false);
        }
    };

    // Edit column
    const startEditColumn = (col) => {
        setEditingCol(col.name);
        setEditColData({ ...col });
    };

    const saveEditColumn = async () => {
        try {
            await schemaAPI.editColumn(selectedDb, selectedTable, editingCol, {
                newName: editColData.name,
                type: editColData.type,
                nullable: editColData.nullable
            });
            toast.success('Column updated');
            setEditingCol(null);
            loadStructure();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to update column');
        }
    };

    const deleteColumn = async (colName) => {
        if (!confirm(`Delete column '${colName}'?`)) return;
        try {
            await schemaAPI.deleteColumn(selectedDb, selectedTable, colName);
            toast.success('Column deleted');
            loadStructure();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to delete column');
        }
    };

    const reorderColumn = async (col, direction) => {
        const idx = structure.findIndex(c => c.name === col.name);
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= structure.length) return;

        const afterColumn = direction === 'up'
            ? (newIdx === 0 ? null : structure[newIdx - 1].name)
            : structure[newIdx].name;

        try {
            await schemaAPI.reorderColumn(selectedDb, selectedTable, col.name, col.type, afterColumn);
            toast.success('Column reordered');
            loadStructure();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to reorder column');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Database Designer</h1>
                <p className="text-gray-400 mt-1">Create and edit table schemas</p>
            </div>

            {/* Database Selection */}
            <div className="card p-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">Database</label>
                <select
                    value={selectedDb}
                    onChange={(e) => { setSelectedDb(e.target.value); setSelectedTable(''); }}
                    className="select-dark w-full max-w-md"
                >
                    <option value="">Select database...</option>
                    {databases.map(db => (
                        <option key={db} value={db}>{db}</option>
                    ))}
                </select>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b border-gray-800">
                {['create', 'edit'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 font-medium transition-colors relative ${activeTab === tab
                                ? 'text-brand-400'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                    >
                        {tab === 'create' ? 'Create Table' : 'Edit Structure'}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
                        )}
                    </button>
                ))}
            </div>

            {/* Create Tab */}
            {activeTab === 'create' && selectedDb && (
                <div className="space-y-6">
                    {/* File Upload */}
                    <div className="card p-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className="w-12 h-12 rounded-lg bg-brand-500/20 flex items-center justify-center">
                                <FileSpreadsheet className="w-6 h-6 text-brand-400" />
                            </div>
                            <div>
                                <p className="font-medium text-white">Import from CSV/Excel</p>
                                <p className="text-sm text-gray-500">Auto-detect column names and types</p>
                            </div>
                            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                            {analyzing && <Loader2 className="w-5 h-5 animate-spin text-brand-400 ml-auto" />}
                        </label>
                    </div>

                    {/* Table Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Table Name</label>
                        <input
                            type="text"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            placeholder="Enter table name"
                            className="input-dark w-full max-w-md"
                        />
                    </div>

                    {/* Columns */}
                    <div className="card overflow-hidden">
                        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                            <h3 className="font-medium text-white">Columns</h3>
                            <button onClick={addColumn} className="btn-ghost text-sm flex items-center gap-1">
                                <Plus className="w-4 h-4" /> Add Column
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3">Name</th>
                                        <th className="p-3">Type</th>
                                        <th className="p-3 text-center">Primary Key</th>
                                        <th className="p-3 text-center">Nullable</th>
                                        <th className="p-3 text-center">Auto Inc.</th>
                                        <th className="p-3 w-20"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {columns.map((col, idx) => (
                                        <tr key={idx} className="border-b border-gray-800/50">
                                            <td className="p-2">
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => moveColumn(idx, 'up')} disabled={idx === 0} className="text-gray-500 hover:text-white disabled:opacity-30">
                                                        <ChevronUp className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => moveColumn(idx, 'down')} disabled={idx === columns.length - 1} className="text-gray-500 hover:text-white disabled:opacity-30">
                                                        <ChevronDown className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={col.name}
                                                    onChange={(e) => updateColumn(idx, 'name', e.target.value)}
                                                    className="input-dark w-full text-sm"
                                                    placeholder="column_name"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <select
                                                    value={col.type}
                                                    onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                                                    className="select-dark w-full text-sm"
                                                >
                                                    {DATA_TYPES.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={col.primaryKey}
                                                    onChange={(e) => updateColumn(idx, 'primaryKey', e.target.checked)}
                                                    className="rounded border-gray-600"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={col.nullable}
                                                    onChange={(e) => updateColumn(idx, 'nullable', e.target.checked)}
                                                    className="rounded border-gray-600"
                                                />
                                            </td>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={col.autoIncrement}
                                                    onChange={(e) => updateColumn(idx, 'autoIncrement', e.target.checked)}
                                                    className="rounded border-gray-600"
                                                    disabled={col.type !== 'INT' && col.type !== 'BIGINT'}
                                                />
                                            </td>
                                            <td className="p-2">
                                                <button
                                                    onClick={() => removeColumn(idx)}
                                                    disabled={columns.length <= 1}
                                                    className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 disabled:opacity-30"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <button
                        onClick={handleCreateTable}
                        disabled={creating || !tableName}
                        className="btn-primary flex items-center gap-2"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create Table
                    </button>
                </div>
            )}

            {/* Edit Tab */}
            {activeTab === 'edit' && selectedDb && (
                <div className="space-y-6">
                    {/* Table Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Table</label>
                        <select
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="select-dark w-full max-w-md"
                        >
                            <option value="">Select table...</option>
                            {tables.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    {/* Structure */}
                    {selectedTable && (
                        <div className="card overflow-hidden">
                            <div className="p-4 border-b border-gray-800">
                                <h3 className="font-medium text-white">Table Structure: {selectedTable}</h3>
                            </div>
                            {loadingStructure ? (
                                <div className="p-8 text-center">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400" />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                                                <th className="p-3 w-10">Order</th>
                                                <th className="p-3">Column</th>
                                                <th className="p-3">Type</th>
                                                <th className="p-3">Key</th>
                                                <th className="p-3">Nullable</th>
                                                <th className="p-3">Default</th>
                                                <th className="p-3 w-32">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {structure.map((col, idx) => (
                                                <tr key={col.name} className="border-b border-gray-800/50">
                                                    <td className="p-2">
                                                        <div className="flex gap-1">
                                                            <button onClick={() => reorderColumn(col, 'up')} disabled={idx === 0} className="p-1 text-gray-500 hover:text-white disabled:opacity-30">
                                                                <ChevronUp className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => reorderColumn(col, 'down')} disabled={idx === structure.length - 1} className="p-1 text-gray-500 hover:text-white disabled:opacity-30">
                                                                <ChevronDown className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="p-2">
                                                        {editingCol === col.name ? (
                                                            <input
                                                                type="text"
                                                                value={editColData.name}
                                                                onChange={(e) => setEditColData({ ...editColData, name: e.target.value })}
                                                                className="input-dark text-sm w-full"
                                                            />
                                                        ) : (
                                                            <span className="text-white">{col.name}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2">
                                                        {editingCol === col.name ? (
                                                            <select
                                                                value={editColData.type}
                                                                onChange={(e) => setEditColData({ ...editColData, type: e.target.value })}
                                                                className="select-dark text-sm"
                                                            >
                                                                {DATA_TYPES.map(t => (
                                                                    <option key={t} value={t}>{t}</option>
                                                                ))}
                                                                <option value={col.type}>{col.type}</option>
                                                            </select>
                                                        ) : (
                                                            <span className="text-gray-400 text-sm">{col.type}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2">
                                                        {col.key === 'PRI' && (
                                                            <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs flex items-center gap-1 w-fit">
                                                                <Key className="w-3 h-3" /> PK
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-2 text-gray-400 text-sm">
                                                        {col.nullable ? 'Yes' : 'No'}
                                                    </td>
                                                    <td className="p-2 text-gray-500 text-sm">
                                                        {col.default || '-'}
                                                    </td>
                                                    <td className="p-2">
                                                        {editingCol === col.name ? (
                                                            <div className="flex gap-1">
                                                                <button onClick={saveEditColumn} className="p-1 rounded hover:bg-green-500/20 text-green-400">
                                                                    <Save className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => setEditingCol(null)} className="p-1 rounded hover:bg-gray-700 text-gray-400">
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => startEditColumn(col)} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => deleteColumn(col.name)} className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DatabaseDesigner;

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useConnection } from '../contexts/ConnectionContext';
import { databaseAPI, dataAPI } from '../services/api';
import ConnectionSelector from '../components/ConnectionSelector';
import {
    Database,
    Table2,
    Search,
    Filter,
    Download,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Edit2,
    Trash2,
    Plus,
    X,
    Save,
    Code,
    Play,
    Loader2,
    Calendar
} from 'lucide-react';

const DataExplorer = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { isAdmin } = useAuth();
    const { selectedConnection } = useConnection();

    // Selection state
    const [databases, setDatabases] = useState([]);
    const [tables, setTables] = useState([]);
    const [selectedDb, setSelectedDb] = useState(searchParams.get('database') || '');
    const [selectedTable, setSelectedTable] = useState(searchParams.get('table') || '');

    // Data state
    const [data, setData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(false);

    // Filter state
    const [search, setSearch] = useState('');
    const [searchColumn, setSearchColumn] = useState('');
    const [dateColumn, setDateColumn] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortBy, setSortBy] = useState('');
    const [sortOrder, setSortOrder] = useState('ASC');

    // Edit state
    const [editingRow, setEditingRow] = useState(null);
    const [editData, setEditData] = useState({});

    // SQL Mode
    const [sqlMode, setSqlMode] = useState(false);
    const [sqlQuery, setSqlQuery] = useState('');
    const [sqlResult, setSqlResult] = useState(null);
    const [sqlLoading, setSqlLoading] = useState(false);

    // Column visibility
    const [visibleColumns, setVisibleColumns] = useState([]);
    const [showColumnPicker, setShowColumnPicker] = useState(false);

    useEffect(() => {
        if (selectedConnection) {
            loadDatabases();
        }
    }, [selectedConnection]);

    useEffect(() => {
        if (selectedDb && selectedConnection) {
            loadTables(selectedDb);
            setSearchParams({ database: selectedDb, ...(selectedTable && { table: selectedTable }) });
        }
    }, [selectedDb, selectedConnection]);

    useEffect(() => {
        if (selectedDb && selectedTable) {
            loadData();
            setSearchParams({ database: selectedDb, table: selectedTable });
        }
    }, [selectedDb, selectedTable, pagination.page, sortBy, sortOrder]);

    useEffect(() => {
        if (columns.length > 0 && visibleColumns.length === 0) {
            setVisibleColumns(columns.map(c => c.name));
        }
    }, [columns]);

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

    const loadData = async () => {
        if (!selectedDb || !selectedTable) return;
        setLoading(true);
        try {
            const res = await dataAPI.get(selectedDb, selectedTable, {
                page: pagination.page,
                limit: pagination.limit,
                search,
                searchColumn: searchColumn || undefined,
                dateColumn: dateColumn || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                sortBy: sortBy || undefined,
                sortOrder,
                connectionId: selectedConnection?.id
            });
            setData(res.data.data);
            setColumns(res.data.columns);
            setPagination(res.data.pagination);
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        setPagination(p => ({ ...p, page: 1 }));
        loadData();
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortBy(column);
            setSortOrder('ASC');
        }
    };

    const handleExport = async () => {
        try {
            const res = await dataAPI.export(selectedDb, selectedTable, {
                search,
                searchColumn: searchColumn || undefined,
                dateColumn: dateColumn || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                connectionId: selectedConnection?.id
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedTable}_export.xlsx`;
            a.click();
            toast.success('Export complete');
        } catch (error) {
            toast.error('Export failed');
        }
    };

    const handleEdit = (row) => {
        setEditingRow(row);
        setEditData({ ...row });
    };

    const handleSaveEdit = async () => {
        const primaryKey = columns.find(c => c.key === 'PRI')?.name || 'id';
        try {
            await dataAPI.update(selectedDb, selectedTable, editData[primaryKey], {
                primaryKey,
                ...editData
            }, selectedConnection?.id);
            toast.success('Row updated');
            setEditingRow(null);
            loadData();
        } catch (error) {
            toast.error('Update failed');
        }
    };

    const handleDelete = async (row) => {
        const primaryKey = columns.find(c => c.key === 'PRI')?.name || 'id';
        if (!confirm('Delete this row?')) return;
        try {
            await dataAPI.delete(selectedDb, selectedTable, row[primaryKey], primaryKey, selectedConnection?.id);
            toast.success('Row deleted');
            loadData();
        } catch (error) {
            toast.error('Delete failed');
        }
    };

    const handleSqlExecute = async () => {
        if (!sqlQuery.trim()) return;
        setSqlLoading(true);
        try {
            const res = await dataAPI.query(selectedDb, sqlQuery, true, selectedConnection?.id);
            setSqlResult(res.data);
            toast.success(res.data.type === 'select' ? `${res.data.rowCount} rows` : `${res.data.affectedRows} rows affected`);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Query failed');
            setSqlResult({ error: error.response?.data?.error || 'Query failed' });
        } finally {
            setSqlLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Data Explorer</h1>
                    <p className="text-gray-400 mt-1">Browse and manage your data</p>
                </div>
                {isAdmin() && selectedDb && (
                    <button
                        onClick={() => setSqlMode(!sqlMode)}
                        className={`btn-ghost flex items-center gap-2 ${sqlMode ? 'text-brand-400' : ''}`}
                    >
                        <Code className="w-5 h-5" />
                        SQL Mode
                    </button>
                )}
            </div>

            {/* Connection Selector */}
            <ConnectionSelector className="max-w-md" />

            {/* Database & Table Selection */}
            <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Database</label>
                    <select
                        value={selectedDb}
                        onChange={(e) => { setSelectedDb(e.target.value); setSelectedTable(''); }}
                        className="select-dark w-full"
                    >
                        <option value="">Select database...</option>
                        {databases.map(db => (
                            <option key={db} value={db}>{db}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-400 mb-2">Table</label>
                    <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="select-dark w-full"
                        disabled={!selectedDb}
                    >
                        <option value="">Select table...</option>
                        {tables.map(table => (
                            <option key={table} value={table}>{table}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* SQL Mode */}
            {sqlMode && isAdmin() && selectedDb && (
                <div className="card p-4 space-y-4">
                    <textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        placeholder="Enter SQL query..."
                        className="input-dark w-full h-32 font-mono text-sm"
                    />
                    <div className="flex gap-3">
                        <button onClick={handleSqlExecute} disabled={sqlLoading} className="btn-primary flex items-center gap-2">
                            {sqlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Execute
                        </button>
                    </div>
                    {sqlResult && (
                        <div className="border-t border-gray-800 pt-4">
                            {sqlResult.error ? (
                                <p className="text-red-400">{sqlResult.error}</p>
                            ) : sqlResult.type === 'select' ? (
                                <div className="overflow-x-auto">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                {sqlResult.data[0] && Object.keys(sqlResult.data[0]).map(key => (
                                                    <th key={key}>{key}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sqlResult.data.map((row, i) => (
                                                <tr key={i}>
                                                    {Object.values(row).map((val, j) => (
                                                        <td key={j}>{String(val ?? '')}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-green-400">{sqlResult.affectedRows} rows affected</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Filters */}
            {selectedTable && !sqlMode && (
                <div className="card p-4 space-y-4">
                    <div className="flex gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search..."
                                className="input-dark w-full"
                            />
                        </div>
                        <select
                            value={searchColumn}
                            onChange={(e) => setSearchColumn(e.target.value)}
                            className="select-dark"
                        >
                            <option value="">All columns</option>
                            {columns.map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleSearch}
                            className="btn-primary px-6 flex items-center gap-2"
                            title="Search"
                        >
                            <Search className="w-4 h-4" />
                            <span>Search</span>
                        </button>
                    </div>

                    <div className="flex gap-4 flex-wrap items-end">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Date Column</label>
                            <select
                                value={dateColumn}
                                onChange={(e) => setDateColumn(e.target.value)}
                                className="select-dark text-sm"
                            >
                                <option value="">None</option>
                                {columns.filter(c => c.type.includes('date') || c.type.includes('time')).map(c => (
                                    <option key={c.name} value={c.name}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        {dateColumn && (
                            <>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">From</label>
                                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-dark text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">To</label>
                                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-dark text-sm" />
                                </div>
                                {loading && dateFrom && dateTo && (
                                    <div className="flex items-center gap-2 text-xs text-yellow-400">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>Filtering large dataset...</span>
                                    </div>
                                )}
                            </>
                        )}
                        <div className="ml-auto flex gap-2">
                            <button onClick={() => setShowColumnPicker(!showColumnPicker)} className="btn-ghost text-sm">
                                <Filter className="w-4 h-4" />
                            </button>
                            <button onClick={handleExport} className="btn-secondary text-sm flex items-center gap-2">
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                            <button onClick={loadData} className="btn-ghost">
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Column Picker */}
                    {showColumnPicker && (
                        <div className="border-t border-gray-800 pt-4">
                            <p className="text-sm font-medium text-gray-300 mb-2">Visible Columns</p>
                            <div className="flex flex-wrap gap-2">
                                {columns.map(c => (
                                    <label key={c.name} className="flex items-center gap-2 px-3 py-1 rounded bg-gray-800 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(c.name)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setVisibleColumns([...visibleColumns, c.name]);
                                                } else {
                                                    setVisibleColumns(visibleColumns.filter(v => v !== c.name));
                                                }
                                            }}
                                            className="rounded border-gray-600"
                                        />
                                        <span className="text-sm text-gray-300">{c.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Data Table */}
            {selectedTable && !sqlMode && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {columns.filter(c => visibleColumns.includes(c.name)).map(col => (
                                        <th key={col.name} onClick={() => handleSort(col.name)} className="cursor-pointer hover:bg-gray-700/50">
                                            <div className="flex items-center gap-2">
                                                {col.name}
                                                {sortBy === col.name && (
                                                    <ChevronDown className={`w-4 h-4 transition-transform ${sortOrder === 'DESC' ? 'rotate-180' : ''}`} />
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={visibleColumns.length + 1} className="text-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400" />
                                        </td>
                                    </tr>
                                ) : data.length === 0 ? (
                                    <tr>
                                        <td colSpan={visibleColumns.length + 1} className="text-center py-8 text-gray-500">
                                            No data found
                                        </td>
                                    </tr>
                                ) : data.map((row, idx) => (
                                    <tr key={idx}>
                                        {columns.filter(c => visibleColumns.includes(c.name)).map(col => (
                                            <td key={col.name}>
                                                {editingRow === row ? (
                                                    <input
                                                        type="text"
                                                        value={editData[col.name] ?? ''}
                                                        onChange={(e) => setEditData({ ...editData, [col.name]: e.target.value })}
                                                        className="input-dark text-sm py-1 px-2 w-full"
                                                    />
                                                ) : (
                                                    <span className="truncate max-w-xs block">{String(row[col.name] ?? '')}</span>
                                                )}
                                            </td>
                                        ))}
                                        <td>
                                            <div className="flex gap-1">
                                                {editingRow === row ? (
                                                    <>
                                                        <button onClick={handleSaveEdit} className="p-1 rounded hover:bg-green-500/20 text-green-400">
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => setEditingRow(null)} className="p-1 rounded hover:bg-gray-700 text-gray-400">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => handleEdit(row)} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(row)} className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between p-4 border-t border-gray-800">
                        <p className="text-sm text-gray-400">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                disabled={pagination.page <= 1}
                                className="btn-ghost disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 py-2 text-sm text-gray-300">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <button
                                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="btn-ghost disabled:opacity-50"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataExplorer;

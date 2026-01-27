import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConnection } from '../contexts/ConnectionContext';
import { databaseAPI } from '../services/api';
import ConnectionSelector from '../components/ConnectionSelector';
import {
    Database,
    Table2,
    Upload,
    ArrowRight,
    Server,
    Layers,
    TrendingUp,
    Activity
} from 'lucide-react';

const Dashboard = () => {
    const { user } = useAuth();
    const { selectedConnection } = useConnection();
    const [dbStats, setDbStats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (selectedConnection) {
            loadDashboardStats();
        }
    }, [selectedConnection]);

    const loadDashboardStats = async () => {
        try {
            const res = await databaseAPI.getStats(selectedConnection.id);
            setDbStats(res.data);
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate summary statistics
    const calculateStats = () => {
        const total = dbStats.length;
        const now = new Date();

        const todayDbs = dbStats.filter(db => {
            if (!db.lastUpdate) return false;
            const updateDate = new Date(db.lastUpdate);
            return updateDate.toDateString() === now.toDateString();
        });

        const last7DaysDbs = dbStats.filter(db => {
            if (!db.lastUpdate) return false;
            const updateDate = new Date(db.lastUpdate);
            const diffDays = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        });

        const last30DaysDbs = dbStats.filter(db => {
            if (!db.lastUpdate) return false;
            const updateDate = new Date(db.lastUpdate);
            const diffDays = Math.floor((now - updateDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        });

        return {
            total,
            today: todayDbs.length,
            todayDbs: todayDbs.map(db => db.database),
            last7Days: last7DaysDbs.length,
            last7DaysDbs: last7DaysDbs.map(db => db.database),
            last30Days: last30DaysDbs.length,
            last30DaysDbs: last30DaysDbs.map(db => db.database)
        };
    };

    const stats = calculateStats();

    const SummaryCard = ({ icon: Icon, label, count, total, color, databases = [] }) => {
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
            <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
                        <Icon className="w-6 h-6 text-white" />
                    </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white">{count}/{total}</p>
                    <span className="text-lg text-brand-400 font-semibold">({percentage}%)</span>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
                {/* Database names */}
                {databases.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                        <p className="text-xs text-gray-500 mb-2">Databases:</p>
                        <div className="flex flex-wrap gap-1">
                            {databases.map(dbName => (
                                <Link
                                    key={dbName}
                                    to={`/explorer?database=${dbName}`}
                                    className="text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 hover:text-brand-400 transition-colors"
                                >
                                    {dbName}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const QuickAction = ({ icon: Icon, label, description, to, color }) => (
        <Link
            to={to}
            className="card p-5 hover:border-gray-700 transition-all duration-200 group flex items-start gap-4"
        >
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
                <h3 className="font-medium text-white group-hover:text-brand-400 transition-colors">
                    {label}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{description}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-brand-400 transition-colors mt-1" />
        </Link>
    );

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Welcome back, {user?.username}
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Here's your database activity summary.
                    </p>
                </div>
                <div className="w-full md:w-72">
                    <ConnectionSelector />
                </div>
            </div>

            {/* Summary Stats */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">Database Update Activity</h2>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="card p-6">
                                <div className="skeleton h-12 w-12 rounded-xl mb-4" />
                                <div className="skeleton h-4 w-24 mb-2" />
                                <div className="skeleton h-8 w-32" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <SummaryCard
                            icon={Database}
                            label="Total Databases"
                            count={stats.total}
                            total={stats.total}
                            color="bg-gradient-to-br from-brand-500 to-brand-600"
                            databases={dbStats.map(db => db.database)}
                        />
                        <SummaryCard
                            icon={Activity}
                            label="Updated Today"
                            count={stats.today}
                            total={stats.total}
                            color="bg-gradient-to-br from-green-500 to-green-600"
                            databases={stats.todayDbs}
                        />
                        <SummaryCard
                            icon={TrendingUp}
                            label="Updated Last 7 Days"
                            count={stats.last7Days}
                            total={stats.total}
                            color="bg-gradient-to-br from-blue-500 to-blue-600"
                            databases={stats.last7DaysDbs}
                        />
                        <SummaryCard
                            icon={TrendingUp}
                            label="Updated Last 30 Days"
                            count={stats.last30Days}
                            total={stats.total}
                            color="bg-gradient-to-br from-purple-500 to-purple-600"
                            databases={stats.last30DaysDbs}
                        />
                    </div>
                )}

                <div className="mt-4">
                    <Link
                        to="/databases"
                        className="text-brand-400 hover:text-brand-300 text-sm flex items-center gap-1"
                    >
                        View detailed activity for all databases <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <QuickAction
                        icon={Table2}
                        label="Create New Table"
                        description="Design a new table schema with our visual builder"
                        to="/designer"
                        color="bg-brand-500/20"
                    />
                    <QuickAction
                        icon={Upload}
                        label="Upload Data"
                        description="Import CSV or Excel files with batch processing"
                        to="/upload"
                        color="bg-green-500/20"
                    />
                    <QuickAction
                        icon={Layers}
                        label="Explore Data"
                        description="Browse, search, and filter your data"
                        to="/explorer"
                        color="bg-blue-500/20"
                    />
                    <QuickAction
                        icon={Server}
                        label="Manage Databases"
                        description="View detailed activity and manage connections"
                        to="/databases"
                        color="bg-purple-500/20"
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
    LayoutDashboard,
    Database,
    Table2,
    Upload,
    Users,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
    Server,
    FileSpreadsheet
} from 'lucide-react';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/databases', icon: Database, label: 'Databases' },
    { path: '/designer', icon: Table2, label: 'Schema Designer' },
    { path: '/explorer', icon: Database, label: 'Data Explorer' },
    { path: '/upload', icon: Upload, label: 'Upload Data' },
    { path: '/lookup', icon: FileSpreadsheet, label: 'Batch Lookup' },
    { path: '/servers', icon: Server, label: 'Database Servers' },
];

const adminItems = [
    { path: '/users', icon: Users, label: 'User Management' },
];

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const NavItem = ({ item }) => (
        <NavLink
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
        ${isActive
                    ? 'bg-brand-500/20 text-brand-400 border-l-2 border-brand-500'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-100'
                }`
            }
        >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="font-medium">{item.label}</span>}
        </NavLink>
    );

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-6 border-b border-gray-800">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                    <Database className="w-5 h-5 text-white" />
                </div>
                {!collapsed && (
                    <div>
                        <h1 className="text-lg font-bold text-white">Raw Data</h1>
                        <p className="text-xs text-gray-500">Data Management</p>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                    <NavItem key={item.path} item={item} />
                ))}

                {isAdmin() && (
                    <>
                        <div className="my-4 border-t border-gray-800" />
                        <p className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase ${collapsed ? 'hidden' : ''}`}>
                            Admin
                        </p>
                        {adminItems.map(item => (
                            <NavItem key={item.path} item={item} />
                        ))}
                    </>
                )}
            </nav>

            {/* User Section */}
            <div className="p-4 border-t border-gray-800">
                <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                            {user?.username?.charAt(0).toUpperCase()}
                        </span>
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-100 truncate">{user?.username}</p>
                            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                        title="Logout"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Collapse Button (Desktop) */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
        </>
    );

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 text-gray-100"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/60 z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <button
                    onClick={() => setMobileOpen(false)}
                    className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-800 text-gray-400"
                >
                    <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col h-full">{sidebarContent}</div>
            </aside>

            {/* Desktop Sidebar */}
            <aside
                className={`hidden lg:flex flex-col relative bg-gray-900 border-r border-gray-800 transition-all duration-300 ${collapsed ? 'w-20' : 'w-72'
                    }`}
            >
                {sidebarContent}
            </aside>
        </>
    );
};

export default Sidebar;

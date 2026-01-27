import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
    return (
        <div className="flex h-screen bg-gray-950">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="p-4 lg:p-8 pt-16 lg:pt-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;

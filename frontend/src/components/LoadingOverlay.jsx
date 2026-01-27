import { useLoading } from '../contexts/LoadingContext';
import { Loader2 } from 'lucide-react';

const LoadingOverlay = () => {
    const { isLoading } = useLoading();

    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm transition-all duration-300">
            <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl animate-fade-in">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-gray-800 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="flex flex-col items-center">
                    <h3 className="text-lg font-semibold text-white">Processing...</h3>
                    <p className="text-sm text-gray-400">Please wait while we complete your request</p>
                </div>
            </div>
        </div>
    );
};

export default LoadingOverlay;

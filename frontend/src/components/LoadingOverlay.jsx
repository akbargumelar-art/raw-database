import { useLoading } from '../contexts/LoadingContext';
import { Loader2 } from 'lucide-react';

const LoadingOverlay = () => {
    // DISABLED: Using custom progress indicators instead of global overlay
    // This prevents the popup from blocking custom progress UIs
    return null;

    // Original code kept for reference:
    // const { isLoading } = useLoading();
    // if (!isLoading) return null;
    // return (
    //     <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm transition-all duration-300">
    //         ...
    //     </div>
    // );
};

export default LoadingOverlay;

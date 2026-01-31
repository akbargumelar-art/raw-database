import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const LoadingContext = createContext();

export const useLoading = () => useContext(LoadingContext);

export const LoadingProvider = ({ children }) => {
    const [loadingCount, setLoadingCount] = useState(0);

    const showLoading = () => setLoadingCount(c => c + 1);
    const hideLoading = () => setLoadingCount(c => Math.max(0, c - 1));

    useEffect(() => {
        // Request interceptor
        const requestInterceptor = api.interceptors.request.use(
            (config) => {
                // Skip loading overlay if skipLoading config is set
                if (!config.skipLoading) {
                    showLoading();
                }
                return config;
            },
            (error) => {
                hideLoading();
                return Promise.reject(error);
            }
        );

        // Response interceptor
        const responseInterceptor = api.interceptors.response.use(
            (response) => {
                // Skip hiding if it was never shown
                if (!response.config.skipLoading) {
                    hideLoading();
                }
                return response;
            },
            (error) => {
                if (!error.config?.skipLoading) {
                    hideLoading();
                }
                return Promise.reject(error);
            }
        );

        // Cleanup
        return () => {
            api.interceptors.request.eject(requestInterceptor);
            api.interceptors.response.eject(responseInterceptor);
        };
    }, []);

    return (
        <LoadingContext.Provider value={{ isLoading: loadingCount > 0, showLoading, hideLoading }}>
            {children}
        </LoadingContext.Provider>
    );
};

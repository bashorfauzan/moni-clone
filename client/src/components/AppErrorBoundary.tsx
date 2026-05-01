import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
    children: ReactNode;
};

type State = {
    hasError: boolean;
    message: string;
};

class AppErrorBoundary extends Component<Props, State> {
    state: State = {
        hasError: false,
        message: ''
    };

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            message: error.message || 'Terjadi error saat membuka aplikasi.'
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('AppErrorBoundary caught startup error:', error, errorInfo);
    }

    handleReload = () => {
        if (typeof window === 'undefined') return;
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-slate-50 text-slate-900">
                <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-500">Aplikasi Gagal Dimuat</p>
                    <h1 className="mt-3 text-xl font-bold text-slate-900">NOVA perlu dimuat ulang</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        {this.state.message || 'Terjadi kendala saat membuka aplikasi di perangkat ini.'}
                    </p>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-bold text-white"
                    >
                        Muat Ulang
                    </button>
                </div>
            </div>
        );
    }
}

export default AppErrorBoundary;

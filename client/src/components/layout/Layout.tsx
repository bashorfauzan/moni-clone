import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, PieChart, Target, Menu, Plus, TrendingUp } from 'lucide-react';
import { useTransaction } from '../../context/TransactionContext';
import TransactionModal from '../TransactionModal';

const Layout = () => {
    const location = useLocation();
    const { openModal } = useTransaction();

    const navItems = [
        { path: '/', label: 'Beranda', mobileLabel: 'Home', icon: <HomeIcon size={20} /> },
        { path: '/reports', label: 'Laporan', mobileLabel: 'Lapor', icon: <PieChart size={20} /> },
        { path: '/investment', label: 'Investasi', mobileLabel: 'Invest', icon: <TrendingUp size={20} /> },
        { path: '/targets', label: 'Target', mobileLabel: 'Target', icon: <Target size={20} /> },
        { path: '/menu', label: 'Menu', mobileLabel: 'Menu', icon: <Menu size={20} /> },
    ];

    return (
        <div className="min-h-screen text-slate-900 pb-32 sm:pb-36 font-sans border-t-[0.5px] border-transparent transition-colors duration-300">
            <main className="mx-auto w-full max-w-6xl overflow-x-hidden">
                <Outlet />
            </main>

            <TransactionModal />

            {/* Floating Action Button (FAB) */}
            <button
                onClick={() => openModal()}
                className="fixed bottom-[104px] sm:bottom-[112px] right-5 sm:right-8 w-14 h-14 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-full shadow-[0_8px_24px_-6px_rgba(37,99,235,0.5)] flex items-center justify-center text-white active:scale-95 transition-all z-50 hover:shadow-2xl hover:-translate-y-1"
            >
                <Plus size={28} strokeWidth={3} />
            </button>

            {/* Shared Bottom Navigation */}
            <nav className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md sm:max-w-xl bg-white/85 backdrop-blur-2xl border border-white/60 rounded-3xl h-[72px] flex items-center justify-between shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] px-6 sm:px-8 z-40">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="relative min-w-0 flex flex-col items-center justify-center transition-all group"
                        >
                            <div className={`transition-all duration-300 ${isActive ? 'text-blue-600 -translate-y-0.5' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                {item.icon}
                            </div>
                            <span className={`mt-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold transition-all duration-300 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                <span className="sm:hidden">{item.mobileLabel}</span>
                                <span className="hidden sm:inline">{item.label}</span>
                            </span>
                            {isActive && (
                                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600" />
                            )}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
};

export default Layout;

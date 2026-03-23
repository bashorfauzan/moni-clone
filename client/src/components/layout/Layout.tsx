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
        <div className="min-h-screen text-slate-900 pb-28 sm:pb-24 font-sans border-t-[0.5px] border-transparent transition-colors duration-300">
            <main className="mx-auto w-full max-w-6xl overflow-x-hidden">
                <Outlet />
            </main>

            <TransactionModal />

            {/* Floating Action Button (FAB) */}
            <button
                onClick={() => openModal()}
                className="fixed bottom-[88px] sm:bottom-24 right-4 sm:right-6 w-14 h-14 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-full shadow-lg shadow-blue-500/30 flex items-center justify-center text-white active:scale-95 transition-transform z-50 hover:shadow-xl"
            >
                <Plus size={28} strokeWidth={3} />
            </button>

            {/* Shared Bottom Navigation */}
            <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1rem)] max-w-md sm:max-w-xl bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[28px] h-[68px] sm:h-16 flex items-center justify-between shadow-2xl px-6 sm:px-8 z-40">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`min-w-0 flex flex-col items-center justify-center transition-colors ${location.pathname === item.path ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {item.icon}
                        <span className="mt-1 text-[9px] sm:text-[10px] uppercase tracking-tight font-bold">
                            <span className="sm:hidden">{item.mobileLabel}</span>
                            <span className="hidden sm:inline">{item.label}</span>
                        </span>
                    </Link>
                ))}
            </nav>
        </div>
    );
};

export default Layout;

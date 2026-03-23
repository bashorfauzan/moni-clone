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

            {/* Shared Bottom Navigation */}
            <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1rem)] max-w-md sm:max-w-xl bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[28px] h-[68px] sm:h-16 flex items-center justify-around shadow-2xl px-2 sm:px-4 z-50">
                {navItems.slice(0, 2).map((item) => (
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

                <div className="relative -top-3 sm:-top-3 shrink-0">
                    <button
                        onClick={() => openModal()}
                        className="w-14 h-14 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-full shadow-lg shadow-blue-500/20 border-4 border-white flex items-center justify-center text-white active:rotate-45 transition-transform"
                    >
                        <Plus size={28} strokeWidth={3} />
                    </button>
                </div>

                {navItems.slice(2).map((item) => (
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

import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, PieChart, Target, Menu, Plus, TrendingUp } from 'lucide-react';
import { useTransaction } from '../../context/TransactionContext';
import TransactionModal from '../TransactionModal';

const Layout = () => {
    const location = useLocation();
    const { openModal } = useTransaction();

    const navItems = [
        { path: '/', label: 'Beranda', icon: <HomeIcon size={20} /> },
        { path: '/reports', label: 'Laporan', icon: <PieChart size={20} /> },
        { path: '/investment', label: 'Investasi', icon: <TrendingUp size={20} /> },
        { path: '/targets', label: 'Target', icon: <Target size={20} /> },
        { path: '/menu', label: 'Menu', icon: <Menu size={20} /> },
    ];

    return (
        <div className="min-h-screen text-slate-900 pb-24 font-sans border-t-[0.5px] border-transparent transition-colors duration-300">
            <main className="mx-auto w-full max-w-6xl overflow-x-hidden">
                <Outlet />
            </main>

            <TransactionModal />

            {/* Shared Bottom Navigation */}
            <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md sm:max-w-xl bg-white/95 backdrop-blur-xl border border-slate-200 rounded-3xl h-16 flex items-center justify-around shadow-2xl px-4 z-50">
                {navItems.slice(0, 2).map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col items-center transition-colors ${location.pathname === item.path ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {item.icon}
                        <span className="text-[10px] uppercase tracking-tighter font-bold mt-1">{item.label}</span>
                    </Link>
                ))}

                <div className="relative -top-3">
                    <button
                        onClick={() => openModal()}
                        className="w-14 h-14 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-full shadow-lg shadow-blue-500/20 border-4 border-white flex items-center justify-center text-white active:rotate-45 transition-transform"
                    >
                        <Plus size={28} strokeWidth={3} />
                    </button>
                </div>

                {navItems.slice(2).map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col items-center transition-colors ${location.pathname === item.path ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                            }`}
                    >
                        {item.icon}
                        <span className="text-[10px] uppercase tracking-tighter font-bold mt-1">{item.label}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );
};

export default Layout;

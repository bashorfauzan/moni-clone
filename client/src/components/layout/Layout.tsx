import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home as HomeIcon, PieChart, Target, Menu, Plus, TrendingUp, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, BarChart2 } from 'lucide-react';
import { useTransaction } from '../../context/TransactionContext';
import TransactionModal from '../TransactionModal';

const Layout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { openModal } = useTransaction();
    const [fabOpen, setFabOpen] = useState(false);
    const hideGlobalFab = location.pathname === '/investment';

    const navItems = [
        { path: '/', label: 'Home', mobileLabel: 'Home', icon: <HomeIcon size={20} /> },
        { path: '/reports', label: 'Cashflow', mobileLabel: 'Cash', icon: <PieChart size={20} /> },
        { path: '/investment', label: 'Investasi', mobileLabel: 'Invest', icon: <TrendingUp size={20} /> },
        { path: '/targets', label: 'Target', mobileLabel: 'Target', icon: <Target size={20} /> },
        { path: '/menu', label: 'Setting', mobileLabel: 'Setting', icon: <Menu size={20} /> },
    ];

    const fabActions = [
        {
            label: 'Pengeluaran',
            icon: <ArrowUpRight size={20} />,
            gradient: 'from-rose-500 to-red-400',
            shadow: 'rgba(244,63,94,0.4)',
            onClick: () => { openModal('EXPENSE'); setFabOpen(false); },
        },
        {
            label: 'Pemasukan',
            icon: <ArrowDownLeft size={20} />,
            gradient: 'from-emerald-500 to-green-400',
            shadow: 'rgba(16,185,129,0.4)',
            onClick: () => { openModal('INCOME'); setFabOpen(false); },
        },
        {
            label: 'Transfer',
            icon: <ArrowRightLeft size={20} />,
            gradient: 'from-blue-500 to-cyan-400',
            shadow: 'rgba(59,130,246,0.4)',
            onClick: () => { openModal('TRANSFER'); setFabOpen(false); },
        },
        {
            label: 'Investasi',
            icon: <TrendingUp size={20} />,
            gradient: 'from-amber-500 to-orange-400',
            shadow: 'rgba(245,158,11,0.4)',
            onClick: () => { openModal('INVESTMENT'); setFabOpen(false); },
        },
        {
            label: 'Order Saham',
            icon: <BarChart2 size={20} />,
            gradient: 'from-indigo-500 to-violet-400',
            shadow: 'rgba(99,102,241,0.4)',
            onClick: () => { navigate('/stocks?action=buy'); setFabOpen(false); },
        },
        {
            label: 'Order IPO',
            icon: <BarChart2 size={20} />,
            gradient: 'from-violet-500 to-purple-400',
            shadow: 'rgba(139,92,246,0.4)',
            onClick: () => { navigate('/stocks/ipo?newOrder=true'); setFabOpen(false); },
        },
    ];

    return (
        <div className="min-h-screen text-slate-900 pb-32 sm:pb-36 font-sans border-t-[0.5px] border-transparent transition-colors duration-300">
            <main className="mx-auto w-full max-w-6xl overflow-x-hidden">
                <Outlet />
            </main>

            <TransactionModal />

            {!hideGlobalFab && (
                <>
                    {/* Backdrop */}
                    <div
                        className={`fixed inset-0 z-[45] transition-all duration-300 ${fabOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                        style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}
                        onClick={() => setFabOpen(false)}
                    />

                    {/* Speed Dial Actions */}
                    <div className="fixed bottom-[176px] sm:bottom-[188px] right-5 sm:right-8 z-50 flex flex-col-reverse gap-3 items-end">
                        {fabActions.map((action, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 transition-all duration-300"
                                style={{
                                    transitionDelay: fabOpen ? `${idx * 40}ms` : `${(fabActions.length - 1 - idx) * 30}ms`,
                                    opacity: fabOpen ? 1 : 0,
                                    transform: fabOpen ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.85)',
                                    pointerEvents: fabOpen ? 'auto' : 'none',
                                }}
                            >
                                <span className="bg-white/95 text-slate-800 text-sm font-semibold px-3.5 py-1.5 rounded-2xl shadow-lg border border-white/60 whitespace-nowrap backdrop-blur-sm">
                                    {action.label}
                                </span>
                                <button
                                    onClick={action.onClick}
                                    className={`w-12 h-12 bg-gradient-to-br ${action.gradient} rounded-full flex items-center justify-center text-white active:scale-90 transition-transform`}
                                    style={{ boxShadow: `0 6px 20px -4px ${action.shadow}` }}
                                >
                                    {action.icon}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Floating Action Button (FAB) */}
                    <button
                        onClick={() => setFabOpen((prev) => !prev)}
                        className="fixed bottom-[104px] sm:bottom-[112px] right-5 sm:right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-emerald-500 text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.5)] transition-all hover:-translate-y-1 hover:shadow-2xl active:scale-95"
                        style={{ transform: `rotate(${fabOpen ? '45deg' : '0deg'})` }}
                    >
                        <Plus size={28} strokeWidth={3} className={`transition-transform duration-300 ${fabOpen ? 'rotate-45' : 'rotate-0'}`} />
                    </button>
                </>
            )}

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
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
};

export default Layout;

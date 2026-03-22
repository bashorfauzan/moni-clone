import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Lock, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { session } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [registered, setRegistered] = useState(false);

    useEffect(() => {
        if (session) navigate('/', { replace: true });
        if (searchParams.get('registered') === '1') setRegistered(true);
    }, [session, navigate, searchParams]);

    const isEmail = identifier.includes('@');

    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!supabase) {
            setError('Konfigurasi Supabase tidak ditemukan.');
            return;
        }

        setLoading(true);
        try {
            const email = isEmail ? identifier : `${identifier.replace(/[^0-9]/g, '')}@app.local`;
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            navigate('/', { replace: true });
        } catch (err: any) {
            const msg = err.message || '';
            if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
                setError('Email/No. Telepon atau password salah.');
            } else if (msg.includes('Email not confirmed')) {
                setError('Email belum dikonfirmasi. Cek kotak masuk email Anda.');
            } else {
                setError(msg || 'Login gagal. Coba lagi.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 relative overflow-hidden">
            {/* decorative blurs */}
            <div className="absolute top-[-10%] right-[-8%] w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
            <div className="absolute bottom-[-14%] left-[-8%] w-96 h-96 rounded-full blur-3xl opacity-15" style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

            <div className="w-full max-w-sm relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black italic bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent select-none" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                        Moni Clone
                    </h1>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Selamat datang kembali 👋</p>
                </div>

                {/* Registered success banner */}
                {registered && (
                    <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 text-emerald-400 text-sm font-medium text-center">
                        Registrasi berhasil! Silakan masuk.
                    </div>
                )}

                {/* Card */}
                <div className="rounded-3xl p-6 sm:p-8" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {/* Identifier */}
                        <div>
                            <label className="block text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Email atau No. Telepon</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    {isEmail ? <Mail size={16} /> : <Phone size={16} />}
                                </span>
                                <input
                                    id="login-identifier"
                                    type="text"
                                    value={identifier}
                                    onChange={e => setIdentifier(e.target.value)}
                                    placeholder="email@contoh.com atau 08xxxxxxxxxx"
                                    required
                                    autoComplete="username"
                                    className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Password</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    <Lock size={16} />
                                </span>
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Masukkan password"
                                    required
                                    autoComplete="current-password"
                                    className="w-full pl-10 pr-12 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all"
                                />
                                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3 text-rose-400 text-sm font-medium">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            id="login-submit"
                            type="submit"
                            disabled={loading || !identifier || !password}
                            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 10px 25px -8px rgba(99,102,241,0.5)' }}
                        >
                            <LogIn size={16} />
                            {loading ? 'Masuk...' : 'Masuk'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-5 space-y-2">
                    <p className="text-slate-500 text-sm">
                        Belum punya akun?{' '}
                        <Link to="/register" className="text-blue-400 font-bold hover:text-blue-300 transition-colors">
                            Daftar sekarang
                        </Link>
                    </p>
                    <p className="text-slate-600 text-xs">
                        Lupa password?{' '}
                        <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-400 underline underline-offset-2 transition-colors">
                            Hubungi Admin
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;

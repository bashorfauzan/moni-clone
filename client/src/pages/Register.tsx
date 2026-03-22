import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Lock, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Register = () => {
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const isEmail = identifier.includes('@');

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Password tidak cocok. Coba lagi.');
            return;
        }
        if (password.length < 6) {
            setError('Password minimal 6 karakter.');
            return;
        }

        if (!supabase) {
            setError('Konfigurasi Supabase tidak ditemukan.');
            return;
        }

        setLoading(true);
        try {
            const email = isEmail ? identifier : `${identifier.replace(/[^0-9]/g, '')}@app.local`;
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            navigate('/login?registered=1');
        } catch (err: any) {
            setError(err.message || 'Registrasi gagal. Coba lagi.');
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
                        SPEND
                    </h1>
                    <p className="text-slate-400 text-sm mt-2 font-medium">Buat akun baru</p>
                </div>

                {/* Card */}
                <div className="rounded-3xl p-6 sm:p-8" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <form onSubmit={handleRegister} className="space-y-4">
                        {/* Email / Phone field */}
                        <div>
                            <label className="block text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Email atau No. Telepon</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    {isEmail ? <Mail size={16} /> : <Phone size={16} />}
                                </span>
                                <input
                                    id="register-identifier"
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
                                    id="register-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Minimal 6 karakter"
                                    required
                                    autoComplete="new-password"
                                    className="w-full pl-10 pr-12 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all"
                                />
                                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-[11px] text-slate-400 uppercase font-bold tracking-widest mb-2">Konfirmasi Password</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    <Lock size={16} />
                                </span>
                                <input
                                    id="register-confirm-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Ulangi password"
                                    required
                                    autoComplete="new-password"
                                    className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-all"
                                />
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
                            id="register-submit"
                            type="submit"
                            disabled={loading || !identifier || !password || !confirmPassword}
                            className="w-full py-3.5 rounded-2xl font-bold text-sm text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 10px 25px -8px rgba(99,102,241,0.5)' }}
                        >
                            <LogIn size={16} />
                            {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-5 space-y-2">
                    <p className="text-slate-500 text-sm">
                        Sudah punya akun?{' '}
                        <Link to="/login" className="text-blue-400 font-bold hover:text-blue-300 transition-colors">
                            Masuk
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

export default Register;

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
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_22%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(160deg,_#08111f_0%,_#10203a_52%,_#07111f_100%)] px-4 py-6 sm:px-6 sm:py-10 relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-8%] w-80 h-80 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
            <div className="absolute bottom-[-14%] left-[-8%] w-96 h-96 rounded-full blur-3xl opacity-15" style={{ background: 'radial-gradient(circle, #10b981, transparent)' }} />

            <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl items-center justify-center">
                <div className="grid w-full items-stretch gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                    <section className="hidden lg:flex flex-col justify-between rounded-[36px] border border-white/10 bg-white/6 p-8 backdrop-blur-xl">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-200">NOVA APP</p>
                            <h1 className="mt-4 max-w-md text-4xl font-black italic leading-tight text-white">
                                Bangun workspace keuangan yang rapi sejak akun pertama dibuat.
                            </h1>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                                Setelah daftar, Anda bisa langsung setup anggota, kategori, rekening, backup data, dan jalur notifikasi otomatis dari satu aplikasi.
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Setup</p>
                                <p className="mt-2 text-lg font-bold text-white">Cepat</p>
                            </div>
                            <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Rekening</p>
                                <p className="mt-2 text-lg font-bold text-white">Terkelola</p>
                            </div>
                            <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Laporan</p>
                                <p className="mt-2 text-lg font-bold text-white">Siap Pakai</p>
                            </div>
                        </div>
                    </section>

                    <div className="w-full max-w-md justify-self-center lg:max-w-none lg:self-center">
                        <div className="mb-6 text-center lg:hidden">
                            <h1 className="text-3xl font-black italic bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent select-none">
                                NOVA
                            </h1>
                            <p className="mt-2 text-sm font-medium text-slate-300">Buat akun baru</p>
                        </div>

                        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                            <div className="mb-6">
                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Buat Akun</p>
                                <h2 className="mt-2 text-2xl font-bold text-white">Mulai workspace keuangan Anda</h2>
                                <p className="mt-2 text-sm text-slate-400">Daftar dengan email atau nomor telepon, lalu lanjutkan ke setup awal aplikasi.</p>
                            </div>

                            <form onSubmit={handleRegister} className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Email atau No. Telepon</label>
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
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-10 pr-4 text-sm font-medium text-white placeholder-slate-600 transition-all focus:bg-white/8 focus:outline-none focus:border-blue-500/60"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Password</label>
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
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-10 pr-12 text-sm font-medium text-white placeholder-slate-600 transition-all focus:outline-none focus:border-blue-500/60"
                                        />
                                        <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Konfirmasi Password</label>
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
                                            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-10 pr-4 text-sm font-medium text-white placeholder-slate-600 transition-all focus:outline-none focus:border-blue-500/60"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">
                                        {error}
                                    </div>
                                )}

                                <button
                                    id="register-submit"
                                    type="submit"
                                    disabled={loading || !identifier || !password || !confirmPassword}
                                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ background: loading ? 'rgba(59,130,246,0.5)' : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 10px 25px -8px rgba(99,102,241,0.5)' }}
                                >
                                    <LogIn size={16} />
                                    {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
                                </button>
                            </form>

                            <div className="mt-6 space-y-2 border-t border-white/8 pt-5 text-center">
                                <p className="text-sm text-slate-400">
                                    Sudah punya akun?{' '}
                                    <Link to="/login" className="font-bold text-blue-300 transition-colors hover:text-blue-200">
                                        Masuk
                                    </Link>
                                </p>
                                <p className="text-xs text-slate-500">
                                    Lupa password?{' '}
                                    <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="text-slate-400 underline underline-offset-2 transition-colors hover:text-slate-300">
                                        Hubungi Admin
                                    </a>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const normalizeIdentifierToEmail = (identifier: unknown) => {
    const raw = String(identifier ?? '').trim();
    if (!raw) return '';
    if (raw.includes('@')) return raw.toLowerCase();

    const digits = raw.replace(/[^0-9]/g, '');
    return digits ? `${digits}@app.local` : '';
};

const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Supabase admin environment belum lengkap.');
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
};

router.post('/register', async (req, res) => {
    const { identifier, password } = req.body as {
        identifier?: string;
        password?: string;
    };

    const email = normalizeIdentifierToEmail(identifier);

    if (!email) {
        return res.status(400).json({ error: 'Email atau nomor telepon wajib diisi.' });
    }

    if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        const metadata = email.endsWith('@app.local')
            ? { phoneIdentifier: String(identifier).replace(/[^0-9]/g, '') }
            : {};

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: String(password),
            email_confirm: true,
            user_metadata: metadata
        });

        if (error) {
            const message = error.message || '';
            if (message.toLowerCase().includes('already') || message.toLowerCase().includes('exists')) {
                return res.status(409).json({ error: 'Akun sudah terdaftar. Silakan masuk.' });
            }

            return res.status(400).json({ error: message || 'Registrasi gagal.' });
        }

        if (data.user?.id) {
            const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
                password: String(password),
                email_confirm: true
            });

            if (passwordError) {
                return res.status(500).json({ error: passwordError.message || 'Gagal menyiapkan password akun.' });
            }
        }

        return res.status(201).json({
            ok: true,
            userId: data.user?.id ?? null
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Registrasi gagal.';
        return res.status(500).json({ error: message });
    }
});

export default router;

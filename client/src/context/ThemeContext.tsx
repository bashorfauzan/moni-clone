import { createContext, useState, useContext, useEffect, type ReactNode } from 'react';
import { readNumberStorage, readStorage, removeStorage, writeStorage } from '../lib/storage';

// Preset colors for the UI
export const THEME_PRESETS = [
    { name: 'Putih Bersih', color: '#ffffff', textColor: '#0f172a' },
    { name: 'Biru Lembut', color: '#f0f9ff', textColor: '#0f172a' },
    { name: 'Krem Minimalis', color: '#fefce8', textColor: '#0f172a' },
    { name: 'Abu Terang', color: '#f8fafc', textColor: '#0f172a' },
    { name: 'Hijau Mint', color: '#f0fdf4', textColor: '#0f172a' },
    { name: 'Peach Soft', color: '#fff1f2', textColor: '#0f172a' },
    { name: 'Lavender Air', color: '#f5f3ff', textColor: '#0f172a' },
    { name: 'Sky Mist', color: '#ecfeff', textColor: '#0f172a' },
    { name: 'Sand Warm', color: '#fffbeb', textColor: '#0f172a' },
    { name: 'Slate Calm', color: '#f1f5f9', textColor: '#0f172a' },
    { name: 'Forest Deep', color: '#1f3b2d', textColor: '#f8fafc' },
    { name: 'Navy Luxe', color: '#16213e', textColor: '#f8fafc' },
    { name: 'Berry Rich', color: '#4c1d95', textColor: '#f8fafc' },
    { name: 'Terracotta', color: '#7c2d12', textColor: '#f8fafc' },
    { name: 'Graphite', color: '#1e293b', textColor: '#f8fafc' },
];

interface ThemeContextType {
    bgColor: string;
    bgImage: string | null;
    heroColor: string;
    heroCardImage: string | null;
    bgOverlay: number;
    bgBlur: number;
    heroImageMode: 'app-only' | 'app-and-hero';
    appScale: number;
    setBgColor: (color: string) => void;
    setBgImage: (image: string | null) => void;
    setHeroColor: (color: string) => void;
    setHeroCardImage: (image: string | null) => void;
    setBgOverlay: (value: number) => void;
    setBgBlur: (value: number) => void;
    setHeroImageMode: (value: 'app-only' | 'app-and-hero') => void;
    setAppScale: (scale: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [bgColor, setBgColorState] = useState(() => readStorage('app-bg-color', '#ffffff') || '#ffffff');
    const [bgImage, setBgImageState] = useState<string | null>(() => readStorage('app-bg-image'));
    const [heroColor, setHeroColorState] = useState(() => readStorage('app-hero-color', '#16213e') || '#16213e');
    const [heroCardImage, setHeroCardImageState] = useState<string | null>(() => readStorage('app-hero-card-image'));
    const [bgOverlay, setBgOverlayState] = useState(() => readNumberStorage('app-bg-overlay', 0.24));
    const [bgBlur, setBgBlurState] = useState(() => readNumberStorage('app-bg-blur', 0));
    const [appScale, setAppScaleState] = useState(() => readNumberStorage('app-scale', 1.0));
    const [heroImageMode, setHeroImageModeState] = useState<'app-only' | 'app-and-hero'>(() => {
        const saved = readStorage('app-hero-image-mode');
        return saved === 'app-and-hero' ? 'app-and-hero' : 'app-only';
    });
    const safeSetItem = (key: string, value: string) => {
        try {
            const saved = writeStorage(key, value);
            if (saved) return;
            throw new Error('Storage write blocked');
        } catch (e: any) {
            console.error('Storage limit reached or blocked', e);
            if (e.name === 'QuotaExceededError') {
                alert('Gagal menyimpan gambar: Ruang penyimpanan PWA (LocalStorage) di HP kamu sudah penuh. Coba gunakan gambar lain yang ukurannya lebih kecil atau bersihkan cache browser.');
            }
        }
    };

    const setBgColor = (color: string) => {
        setBgColorState(color);
        safeSetItem('app-bg-color', color);
    };

    const setBgImage = (image: string | null) => {
        setBgImageState(image);
        if (image) {
            safeSetItem('app-bg-image', image);
        } else {
            removeStorage('app-bg-image');
        }
    };

    const setHeroColor = (color: string) => {
        setHeroColorState(color);
        safeSetItem('app-hero-color', color);
    };

    const setHeroCardImage = (image: string | null) => {
        setHeroCardImageState(image);
        if (image) {
            safeSetItem('app-hero-card-image', image);
        } else {
            removeStorage('app-hero-card-image');
        }
    };

    const setBgOverlay = (value: number) => {
        setBgOverlayState(value);
        safeSetItem('app-bg-overlay', String(value));
    };

    const setBgBlur = (value: number) => {
        setBgBlurState(value);
        safeSetItem('app-bg-blur', String(value));
    };

    const setHeroImageMode = (value: 'app-only' | 'app-and-hero') => {
        setHeroImageModeState(value);
        safeSetItem('app-hero-image-mode', value);
    };

    const setAppScale = (scale: number) => {
        setAppScaleState(scale);
        safeSetItem('app-scale', String(scale));
    };
    useEffect(() => {
        // Apply root font-size scaling for standard layout rem values
        document.documentElement.style.fontSize = `${appScale * 16}px`;
        
        // Inject the physical CSS variable to the root so Tailwind can pick it up
        document.documentElement.style.setProperty('--app-bg', bgColor);
        document.documentElement.style.setProperty('--app-bg-image', bgImage ? `url("${bgImage}")` : 'none');
        document.documentElement.style.setProperty('--app-bg-overlay-opacity', String(bgOverlay));
        document.documentElement.style.setProperty('--app-bg-blur', `${bgBlur}px`);
        document.documentElement.style.setProperty(
            '--hero-image',
            heroCardImage
                ? `url("${heroCardImage}")`
                : (bgImage && heroImageMode === 'app-and-hero' ? `url("${bgImage}")` : 'none')
        );
        // Add a slight darkened version for active states or borders if needed
        document.documentElement.style.setProperty('--app-bg-darker', darkenColor(bgColor, 5));
        const palette = deriveThemePalette(heroColor);
        document.documentElement.style.setProperty('--theme-hero-start', palette.heroStart);
        document.documentElement.style.setProperty('--theme-hero-end', palette.heroEnd);
        document.documentElement.style.setProperty('--theme-hero-glow', palette.heroGlow);
        document.documentElement.style.setProperty('--theme-accent', palette.accent);
        document.documentElement.style.setProperty('--theme-accent-soft', palette.accentSoft);
        document.documentElement.style.setProperty('--theme-surface', palette.surface);
        document.documentElement.style.setProperty('--theme-border', palette.border);
        document.documentElement.style.setProperty('--theme-ink', palette.ink);
        document.documentElement.style.setProperty('--theme-muted', palette.muted);
    }, [bgColor, bgImage, heroColor, heroCardImage, bgOverlay, bgBlur, heroImageMode, appScale]);

    return (
        <ThemeContext.Provider value={{
            bgColor,
            bgImage,
            heroColor,
            heroCardImage,
            bgOverlay,
            bgBlur,
            heroImageMode,
            appScale,
            setBgColor,
            setBgImage,
            setHeroColor,
            setHeroCardImage,
            setBgOverlay,
            setBgBlur,
            setHeroImageMode,
            setAppScale
        }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

// Helper to slightly darken a hex color
function darkenColor(hex: string, percent: number): string {
    // Strip #
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    const num = parseInt(hex, 16);
    let r = (num >> 16) - Math.round(255 * percent / 100);
    let g = ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100);
    let b = (num & 0x0000FF) - Math.round(255 * percent / 100);

    r = r < 0 ? 0 : r;
    g = g < 0 ? 0 : g;
    b = b < 0 ? 0 : b;

    return `#${(g | (b << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
    let normalized = hex.replace(/^#/, '');
    if (normalized.length === 3) {
        normalized = normalized.split('').map((c) => c + c).join('');
    }

    const num = parseInt(normalized, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function rgbToHsl(r: number, g: number, b: number) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case nr:
                h = (ng - nb) / d + (ng < nb ? 6 : 0);
                break;
            case ng:
                h = (nb - nr) / d + 2;
                break;
            default:
                h = (nr - ng) / d + 4;
                break;
        }

        h /= 6;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function hslToHex(h: number, s: number, l: number) {
    const normalizedH = (((h % 360) + 360) % 360) / 360;
    const normalizedS = clamp(s, 0, 100) / 100;
    const normalizedL = clamp(l, 0, 100) / 100;

    if (normalizedS === 0) {
        const gray = Math.round(normalizedL * 255).toString(16).padStart(2, '0');
        return `#${gray}${gray}${gray}`;
    }

    const hueToRgb = (p: number, q: number, t: number) => {
        let nextT = t;
        if (nextT < 0) nextT += 1;
        if (nextT > 1) nextT -= 1;
        if (nextT < 1 / 6) return p + (q - p) * 6 * nextT;
        if (nextT < 1 / 2) return q;
        if (nextT < 2 / 3) return p + (q - p) * (2 / 3 - nextT) * 6;
        return p;
    };

    const q = normalizedL < 0.5
        ? normalizedL * (1 + normalizedS)
        : normalizedL + normalizedS - normalizedL * normalizedS;
    const p = 2 * normalizedL - q;

    const r = Math.round(hueToRgb(p, q, normalizedH + 1 / 3) * 255).toString(16).padStart(2, '0');
    const g = Math.round(hueToRgb(p, q, normalizedH) * 255).toString(16).padStart(2, '0');
    const b = Math.round(hueToRgb(p, q, normalizedH - 1 / 3) * 255).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}

function deriveThemePalette(bgColor: string) {
    const { r, g, b } = hexToRgb(bgColor);
    const base = rgbToHsl(r, g, b);
    const neutralTheme = base.s < 8;
    const hue = neutralTheme ? 222 : base.h;

    return {
        heroStart: hslToHex(hue - 6, neutralTheme ? 58 : 72, 24),
        heroEnd: hslToHex(hue + 18, neutralTheme ? 62 : 56, 18),
        heroGlow: hslToHex(hue + 28, 72, 58),
        accent: hslToHex(hue + 10, 78, 56),
        accentSoft: hslToHex(hue + 6, 55, 92),
        surface: hslToHex(hue + 4, 28, 97),
        border: hslToHex(hue + 2, 24, 87),
        ink: hslToHex(hue + 2, 35, 18),
        muted: hslToHex(hue + 4, 18, 54),
    };
}

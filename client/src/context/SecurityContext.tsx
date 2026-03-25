import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ShieldAlert, X } from 'lucide-react';

// Basic string hashing function (Not cryptographically secure but sufficient for local PWA PIN MVP)
function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

interface SecurityContextType {
    isSecurityEnabled: boolean;
    isBiometricEnabled: boolean;
    setupSecurity: (pin: string) => void;
    removeSecurity: () => void;
    setupBiometric: () => Promise<boolean>;
    removeBiometric: () => void;
    verifySecurity: (reason: string) => Promise<boolean>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const useSecurity = () => {
    const context = useContext(SecurityContext);
    if (!context) throw new Error('useSecurity must be used within SecurityProvider');
    return context;
};

export const SecurityProvider = ({ children }: { children: ReactNode }) => {
    const [pinHash, setPinHash] = useState<string | null>(() => localStorage.getItem('app-pin-hash'));
    const [biometricEnabled, setBiometricEnabled] = useState<boolean>(() => localStorage.getItem('app-biometric') === 'true');
    const [bioCredentialId, setBioCredentialId] = useState<string | null>(() => localStorage.getItem('app-bio-cred-id'));
    
    // Lock screen states
    const [isLocked, setIsLocked] = useState(false);
    const [lockReason, setLockReason] = useState('Autentikasi diperlukan');
    const [resolveAuth, setResolveAuth] = useState<((val: boolean) => void) | null>(null);
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState(false);

    const isSecurityEnabled = !!pinHash;

    useEffect(() => {
        // App open lock check
        if (isSecurityEnabled) {
            const lastActive = sessionStorage.getItem('last-active');
            const now = Date.now();
            const ACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
            
            if (!lastActive || (now - parseInt(lastActive, 10)) > ACTIVE_TIMEOUT) {
                // Should lock the app on startup / after timeout
                verifySecurity('Buka Kunci Aplikasi').catch(() => {});
            }
        }

        const updateActivity = () => {
            sessionStorage.setItem('last-active', Date.now().toString());
        };
        
        window.addEventListener('click', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('scroll', updateActivity);

        return () => {
            window.removeEventListener('click', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('scroll', updateActivity);
        };
    }, [isSecurityEnabled]);

    const setupSecurity = (pin: string) => {
        const hash = hashString(pin);
        localStorage.setItem('app-pin-hash', hash);
        setPinHash(hash);
    };

    const removeSecurity = () => {
        localStorage.removeItem('app-pin-hash');
        localStorage.removeItem('app-biometric');
        localStorage.removeItem('app-bio-cred-id');
        setPinHash(null);
        setBiometricEnabled(false);
        setBioCredentialId(null);
    };

    const setupBiometric = async (): Promise<boolean> => {
        if (!window.PublicKeyCredential) {
            alert('Perangkat/Browser ini tidak mendukung biometrik (WebAuthn).');
            return false;
        }

        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);

            const publicKey: PublicKeyCredentialCreationOptions = {
                challenge,
                rp: {
                    name: "NOVA Finance",
                    id: window.location.hostname
                },
                user: {
                    id: userId,
                    name: "nova-user",
                    displayName: "NOVA User"
                },
                pubKeyCredParams: [
                    { alg: -7, type: "public-key" }, // ES256
                    { alg: -257, type: "public-key" } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required"
                },
                timeout: 60000,
            };

            const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
            
            if (credential) {
                // Convert credential rawId to base64
                const credentialIdBuf = credential.rawId;
                const credentialIdArray = new Uint8Array(credentialIdBuf);
                let credentialIdBase64 = '';
                for (let i = 0; i < credentialIdArray.byteLength; i++) {
                    credentialIdBase64 += String.fromCharCode(credentialIdArray[i]);
                }
                const b64 = window.btoa(credentialIdBase64);
                
                localStorage.setItem('app-bio-cred-id', b64);
                localStorage.setItem('app-biometric', 'true');
                setBioCredentialId(b64);
                setBiometricEnabled(true);
                return true;
            }
            return false;
        } catch (error) {
            console.error(error);
            alert('Gagal mendaftar biometrik. Pastikan perangkat memiliki PIN/Fingerprint/FaceID.');
            return false;
        }
    };

    const removeBiometric = () => {
        localStorage.removeItem('app-biometric');
        localStorage.removeItem('app-bio-cred-id');
        setBiometricEnabled(false);
        setBioCredentialId(null);
    };

    const promptBiometric = async (): Promise<boolean> => {
        if (!biometricEnabled || !bioCredentialId || !window.PublicKeyCredential) return false;

        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const credentialIdBase64 = bioCredentialId;
            const binaryString = window.atob(credentialIdBase64);
            const credentialIdArray = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                credentialIdArray[i] = binaryString.charCodeAt(i);
            }

            const publicKey: PublicKeyCredentialRequestOptions = {
                challenge,
                rpId: window.location.hostname,
                allowCredentials: [{
                    type: 'public-key',
                    id: credentialIdArray
                }],
                userVerification: 'required',
                timeout: 60000
            };

            const credential = await navigator.credentials.get({ publicKey });
            return !!credential;
        } catch (error) {
            console.error("Biometric prompt cancelled or failed", error);
            return false;
        }
    };

    const verifySecurity = (reason: string): Promise<boolean> => {
        return new Promise((resolve) => {
            if (!isSecurityEnabled) {
                resolve(true);
                return;
            }

            // Show lock screen
            setLockReason(reason);
            setPinInput('');
            setPinError(false);
            setResolveAuth(() => resolve);
            setIsLocked(true);

            // Attempt biometric if enabled
            if (biometricEnabled) {
                setTimeout(async () => {
                    const success = await promptBiometric();
                    if (success) {
                        setIsLocked(false);
                        resolve(true);
                        setResolveAuth(null);
                    }
                }, 100); // slight delay to allow rendering
            }
        });
    };

    // Handle PIN Pad Input
    const pressKey = (key: string) => {
        if (pinInput.length < 6) {
            const newVal = pinInput + key;
            setPinInput(newVal);
            setPinError(false);

            if (newVal.length === 6) {
                // Verify
                if (hashString(newVal) === pinHash) {
                    // Success
                    setIsLocked(false);
                    if (resolveAuth) resolveAuth(true);
                    setResolveAuth(null);
                    sessionStorage.setItem('last-active', Date.now().toString());
                } else {
                    // Fail
                    setPinError(true);
                    setTimeout(() => setPinInput(''), 400); // Shake and clear
                }
            }
        }
    };

    const deleteKey = () => {
        if (pinInput.length > 0) {
            setPinInput(pinInput.slice(0, -1));
            setPinError(false);
        }
    };

    const cancelAuth = () => {
        if (lockReason === 'Buka Kunci Aplikasi') {
            // Can't cancel app lock. It will stay overlayed.
            return;
        }
        setIsLocked(false);
        if (resolveAuth) resolveAuth(false);
        setResolveAuth(null);
    };

    return (
        <SecurityContext.Provider value={{
            isSecurityEnabled,
            isBiometricEnabled: biometricEnabled,
            setupSecurity,
            removeSecurity,
            setupBiometric,
            removeBiometric,
            verifySecurity
        }}>
            {children}

            {/* Global Lock Screen Overlay */}
            {isLocked && (
                <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 sm:p-8 animate-in fade-in duration-200">
                    <div className="w-full max-w-sm flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center mb-6">
                            <ShieldAlert size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">{lockReason}</h2>
                        <p className="text-slate-400 text-sm text-center mb-8">
                            Masukkan PIN 6-digit Anda {biometricEnabled && 'atau gunakan biometrik ' }untuk melanjutkan.
                        </p>

                        {/* PIN Dots */}
                        <div className={`flex gap-3 mb-10 ${pinError ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                            {[...Array(6)].map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                                        i < pinInput.length 
                                            ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)] scale-110' 
                                            : 'bg-slate-700/50'
                                    } ${pinError ? 'bg-red-500' : ''}`}
                                />
                            ))}
                        </div>

                        {/* PIN Pad */}
                        <div className="w-full grid grid-cols-3 gap-3 sm:gap-4 px-4 sm:px-6">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                <button
                                    key={num}
                                    onClick={() => pressKey(num.toString())}
                                    className="aspect-square rounded-full bg-white/5 hover:bg-white/10 text-white text-2xl font-bold flex items-center justify-center transition-colors active:scale-95"
                                >
                                    {num}
                                </button>
                            ))}
                            <div className="aspect-square" />
                            <button
                                onClick={() => pressKey('0')}
                                className="aspect-square rounded-full bg-white/5 hover:bg-white/10 text-white text-2xl font-bold flex items-center justify-center transition-colors active:scale-95"
                            >
                                0
                            </button>
                            <button
                                onClick={deleteKey}
                                className="aspect-square rounded-full text-white/60 hover:text-white flex items-center justify-center transition-colors active:scale-95"
                            >
                                <X size={28} />
                            </button>
                        </div>

                        {biometricEnabled && (
                            <button
                                onClick={promptBiometric}
                                className="mt-8 text-rose-400 font-bold text-sm tracking-widest uppercase hover:text-rose-300"
                            >
                                Gunakan Biometrik
                            </button>
                        )}
                        
                        {lockReason !== 'Buka Kunci Aplikasi' && (
                            <button
                                onClick={cancelAuth}
                                className="mt-6 text-slate-500 font-bold text-xs tracking-widest uppercase hover:text-slate-400"
                            >
                                Batal
                            </button>
                        )}
                    </div>
                </div>
            )}
            
            {/* Inject shake animation CSS if not present */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
            `}} />
        </SecurityContext.Provider>
    );
};

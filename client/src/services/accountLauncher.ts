import type { Account } from './masterData';

declare global {
    interface Window {
        NovaNativeBridge?: {
            openAccountApp?: (payload: {
                id: string;
                name: string;
                packageName?: string | null;
                deepLink?: string | null;
                storeUrl?: string | null;
            }) => boolean | string | Promise<boolean | string>;
        };
    }
}

export const ACCOUNT_APP_PRESETS = [
    {
        key: 'bni',
        label: 'BNI Mobile Banking',
        packageName: 'id.co.bni.wondr',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.co.bni.wondr'
    },
    {
        key: 'brimo',
        label: 'BRImo',
        packageName: 'id.co.bri.brimo',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.co.bri.brimo'
    },
    {
        key: 'livin',
        label: 'Livin by Mandiri',
        packageName: 'id.bmri.livin',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.bmri.livin'
    },
    {
        key: 'bca',
        label: 'BCA mobile',
        packageName: 'com.bca',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.bca'
    },
    {
        key: 'seabank',
        label: 'SeaBank',
        packageName: 'com.seabank.seabank',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.seabank.seabank'
    },
    {
        key: 'jago',
        label: 'Bank Jago',
        packageName: 'com.jago.digitalBanking',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.jago.digitalBanking'
    },
    {
        key: 'blu',
        label: 'blu by BCA Digital',
        packageName: 'id.blubybcadigital.digitalbank',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.blubybcadigital.digitalbank'
    },
    {
        key: 'bsi',
        label: 'BSI Mobile',
        packageName: 'com.bsm.activity2',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.bsm.activity2'
    },
    {
        key: 'jenius',
        label: 'Jenius',
        packageName: 'com.btpn.dc',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.btpn.dc'
    },
    {
        key: 'dana',
        label: 'DANA',
        packageName: 'id.dana',
        deepLink: 'dana://',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.dana'
    },
    {
        key: 'ovo',
        label: 'OVO',
        packageName: 'ovo.id',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=ovo.id'
    },
    {
        key: 'gopay',
        label: 'GoPay',
        packageName: 'com.gojek.app',
        deepLink: 'gojek://home',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.gojek.app'
    },
    {
        key: 'shopeepay',
        label: 'ShopeePay',
        packageName: 'com.shopee.id',
        deepLink: 'shopeeid://',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.shopee.id'
    },
    {
        key: 'flip',
        label: 'Flip',
        packageName: 'id.flip',
        deepLink: 'flip://',
        storeUrl: 'https://play.google.com/store/apps/details?id=id.flip'
    },
    {
        key: 'ajaib',
        label: 'Ajaib',
        packageName: 'ajaib.alpha',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=ajaib.alpha'
    },
    {
        key: 'stockbit',
        label: 'Stockbit',
        packageName: 'com.stockbit.android',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.stockbit.android'
    },
    {
        key: 'bibit',
        label: 'Bibit',
        packageName: 'com.bibit.id',
        deepLink: '',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.bibit.id'
    }
] as const;

const hasLaunchConfig = (account: Pick<Account, 'appPackageName' | 'appDeepLink' | 'appStoreUrl'>) =>
    Boolean(account.appPackageName || account.appDeepLink || account.appStoreUrl);

export const canLaunchAccountApp = (account: Pick<Account, 'appPackageName' | 'appDeepLink' | 'appStoreUrl'>) =>
    hasLaunchConfig(account);

export const launchAccountApp = async (account: Account) => {
    if (!hasLaunchConfig(account)) {
        return {
            ok: false,
            message: 'Aplikasi untuk rekening ini belum dikonfigurasi.'
        };
    }

    const nativeBridge = window.NovaNativeBridge?.openAccountApp;
    if (nativeBridge) {
        const result = await nativeBridge({
            id: account.id,
            name: account.name,
            packageName: account.appPackageName,
            deepLink: account.appDeepLink,
            storeUrl: account.appStoreUrl
        });

        if (result === false) {
            return {
                ok: false,
                message: 'Bridge native menolak membuka aplikasi.'
            };
        }

        return { ok: true };
    }

    if (account.appDeepLink) {
        const { appDeepLink, appStoreUrl } = account;
        const visibleAtStart = document.visibilityState;

        window.location.href = appDeepLink;

        window.setTimeout(() => {
            if (document.visibilityState === visibleAtStart && appStoreUrl) {
                const shouldOpenStore = window.confirm('Aplikasi tidak terbuka. Buka halaman instalasi aplikasi?');
                if (shouldOpenStore) {
                    window.open(appStoreUrl, '_blank', 'noopener,noreferrer');
                }
            }
        }, 1200);

        return { ok: true };
    }

    if (account.appStoreUrl) {
        const shouldOpenStore = window.confirm('Deep link belum tersedia. Buka halaman instalasi aplikasi?');
        if (shouldOpenStore) {
            window.open(account.appStoreUrl, '_blank', 'noopener,noreferrer');
            return { ok: true };
        }
    }

    return {
        ok: false,
        message: 'Browser tidak bisa membuka aplikasi hanya dari package name. Fitur ini akan optimal pada APK/native bridge.'
    };
};

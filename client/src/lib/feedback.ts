export type AppToastDetail = {
    type?: 'success' | 'error';
    message: string;
};

export const APP_TOAST_EVENT = 'nova:toast';

export const announceToast = (detail: AppToastDetail) => {
    window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }));
};

export const announceSuccess = (message: string) => {
    announceToast({ type: 'success', message });
};

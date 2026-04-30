const ACCOUNT_HINT_ALIASES: Record<string, string> = {
    brimo: 'bri',
    mybca: 'bca',
    livin: 'mandiri',
    wondr: 'bni'
};

export const canonicalizeAccountAlias = (value?: string | null) => {
    if (!value) return '';
    const normalized = value.toLowerCase().trim();
    return ACCOUNT_HINT_ALIASES[normalized] ?? normalized;
};

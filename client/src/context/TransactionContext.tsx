import { createContext, useContext, useState, type ReactNode } from 'react';

type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

export interface TransactionModalPayload {
    amount?: number;
    description?: string;
    type?: TransactionType;
    ownerId?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    notificationInboxId?: string;
    pendingTransactionId?: string;
}

interface TransactionContextType {
    isModalOpen: boolean;
    modalType: TransactionType;
    modalPayload?: TransactionModalPayload;
    editTransactionId?: string;
    openModal: (type?: TransactionType, payload?: TransactionModalPayload) => void;
    openEditModal: (id: string, type?: TransactionType, payload?: TransactionModalPayload) => void;
    closeModal: () => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider = ({ children }: { children: ReactNode }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<TransactionType>('EXPENSE');
    const [modalPayload, setModalPayload] = useState<TransactionModalPayload | undefined>(undefined);
    const [editTransactionId, setEditTransactionId] = useState<string | undefined>(undefined);

    const openModal = (type: TransactionType = 'EXPENSE', payload?: TransactionModalPayload) => {
        setModalType(type);
        setModalPayload(payload);
        setEditTransactionId(undefined);
        setIsModalOpen(true);
    };

    const openEditModal = (id: string, type: TransactionType = 'EXPENSE', payload?: TransactionModalPayload) => {
        setModalType(type);
        setEditTransactionId(id);
        setModalPayload(payload);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalPayload(undefined);
        setEditTransactionId(undefined);
    };

    return (
        <TransactionContext.Provider value={{ isModalOpen, modalType, modalPayload, editTransactionId, openModal, openEditModal, closeModal }}>
            {children}
        </TransactionContext.Provider>
    );
};

export const useTransaction = () => {
    const context = useContext(TransactionContext);
    if (!context) throw new Error('useTransaction must be used within TransactionProvider');
    return context;
};

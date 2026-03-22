import { createContext, useContext, useState, type ReactNode } from 'react';

type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'INVESTMENT';

interface TransactionContextType {
    isModalOpen: boolean;
    modalType: TransactionType;
    openModal: (type?: TransactionType) => void;
    closeModal: () => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export const TransactionProvider = ({ children }: { children: ReactNode }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<TransactionType>('EXPENSE');

    const openModal = (type: TransactionType = 'EXPENSE') => {
        setModalType(type);
        setIsModalOpen(true);
    };

    const closeModal = () => setIsModalOpen(false);

    return (
        <TransactionContext.Provider value={{ isModalOpen, modalType, openModal, closeModal }}>
            {children}
        </TransactionContext.Provider>
    );
};

export const useTransaction = () => {
    const context = useContext(TransactionContext);
    if (!context) throw new Error('useTransaction must be used within TransactionProvider');
    return context;
};

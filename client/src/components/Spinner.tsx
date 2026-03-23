const Spinner = ({ message = "Memuat..." }: { message?: string }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-5">
            <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 bg-transparent"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-[spin_0.8s_ease-in-out_infinite] blur-[1px]"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-[spin_0.8s_ease-in-out_infinite] shadow-[0_0_20px_rgba(37,99,235,0.4)]"></div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 animate-pulse ml-2">
                {message}
            </p>
        </div>
    );
};

export default Spinner;

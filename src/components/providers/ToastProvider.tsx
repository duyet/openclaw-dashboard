"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastTone = "error" | "success" | "info";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "error") => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = ++nextIdRef.current;
      setToasts((prev) => [...prev, { id, message: trimmed, tone }]);
      timersRef.current[id] = setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] flex w-[360px] max-w-[90vw] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm shadow-lg",
                "animate-in slide-in-from-bottom-2 fade-in duration-200",
                toast.tone === "error" &&
                  "border-rose-200 bg-white text-rose-700",
                toast.tone === "success" &&
                  "border-emerald-200 bg-white text-emerald-700",
                toast.tone === "info" &&
                  "border-blue-200 bg-white text-blue-700"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0 text-current opacity-50 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

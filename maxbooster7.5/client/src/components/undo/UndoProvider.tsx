import React from "react";
import {
  UndoProvider as ContextProvider,
  UndoProviderProps as ContextProviderProps,
} from "@/contexts/UndoContext";
import { UndoToast } from "./UndoToast";

export interface UndoProviderProps extends ContextProviderProps {
  showToast?: boolean;
  toastPosition?: "top" | "bottom";
  toastAutoHideDuration?: number;
}

export function UndoProvider({
  children,
  showToast = true,
  toastPosition = "bottom",
  toastAutoHideDuration = 5000,
  ...contextProps
}: UndoProviderProps) {
  return (
    <ContextProvider {...contextProps}>
      {children}
      {showToast && (
        <UndoToast
          autoHideDuration={toastAutoHideDuration}
          className={
            toastPosition === "top" ? "top-4 bottom-auto" : "bottom-4 top-auto"
          }
        />
      )}
    </ContextProvider>
  );
}

export default UndoProvider;

/**
 * Stub file for staff-excel-export-context - staff functionality removed
 */

import { createContext, useContext, type ReactNode } from "react";

export interface StaffExcelExportContextValue {
  isExporting: boolean;
  startExport: () => void;
}

const StaffExcelExportContext = createContext<StaffExcelExportContextValue | null>(null);

export function StaffExcelExportProvider({ children }: { children: ReactNode }) {
  return (
    <StaffExcelExportContext.Provider value={{ isExporting: false, startExport: () => {} }}>
      {children}
    </StaffExcelExportContext.Provider>
  );
}

export function useStaffExcelExport() {
  const ctx = useContext(StaffExcelExportContext);
  if (!ctx) throw new Error("useStaffExcelExport must be used inside StaffExcelExportProvider");
  return ctx;
}

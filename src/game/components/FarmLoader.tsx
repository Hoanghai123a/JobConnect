/**
 * FarmLoader - Phase 1
 * Simple loader component
 */

import { useEffect } from "react";

interface FarmLoaderProps {
  onLoaded: () => void;
  children: React.ReactNode;
}

export const FarmLoader = ({ onLoaded, children }: FarmLoaderProps) => {
  useEffect(() => {
    // Simulate loading (instant for Phase 1)
    onLoaded();
  }, [onLoaded]);

  return <>{children}</>;
};

import { ReactNode } from "react";
import { AppHeader, BottomNav } from "@/components/layout/BottomNav";
import { cn } from "@/lib/utils";

export function PageContainer({
  title,
  subtitle,
  right,
  back = true,
  children,
  showNav = false,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  children: ReactNode;
  showNav?: boolean;
  className?: string;
}) {
  return (
    <div className="pb-nav">
      <AppHeader title={title} subtitle={subtitle} right={right} back={back} />
      <main className={cn("space-y-3 px-4 pt-3", className)}>{children}</main>
      {showNav && <BottomNav />}
    </div>
  );
}

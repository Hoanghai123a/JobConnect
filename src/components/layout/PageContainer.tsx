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
  desktopWidth = "default",
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  children: ReactNode;
  showNav?: boolean;
  className?: string;
  desktopWidth?: "default" | "wide" | "full";
}) {
  const desktopWidthClass = {
    default: "desktop:max-w-[90rem]",
    wide: "desktop:max-w-[110rem]",
    full: "desktop:max-w-none",
  }[desktopWidth];

  return (
    <div className="pb-nav desktop:pb-8">
      <AppHeader title={title} subtitle={subtitle} right={right} back={back} />
      <main
        className={cn(
          "space-y-3 px-4 pt-3 desktop:mx-auto desktop:w-full desktop:px-8 desktop:pt-6",
          desktopWidthClass,
          className,
        )}
      >
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}

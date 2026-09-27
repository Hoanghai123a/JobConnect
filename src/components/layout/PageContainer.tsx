import { ReactNode } from "react";
import { AppHeader, BottomNav } from "@/components/layout/BottomNav";
import { cn } from "@/lib/utils";

export type MobilePageScaffoldProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  children: ReactNode;
  showNavigation?: boolean;
  className?: string;
  bottomAction?: ReactNode;
};

export function MobilePageScaffold({
  title,
  subtitle,
  right,
  back = true,
  children,
  showNavigation = false,
  className,
  bottomAction,
}: MobilePageScaffoldProps) {
  return (
    <div className={cn(bottomAction ? "page-action-shell" : "pb-nav")}>
      <AppHeader title={title} subtitle={subtitle} right={right} back={back} />
      <main
        className={cn(
          "mobile-page space-y-4 px-4 pt-4",
          bottomAction && "page-action-main",
          className,
        )}
      >
        {children}
      </main>
      {bottomAction && <div className="sticky-form-actions">{bottomAction}</div>}
      {showNavigation && <BottomNav />}
    </div>
  );
}

export function PageContainer(props: MobilePageScaffoldProps & { showNav?: boolean }) {
  const { showNav, ...rest } = props;
  return <MobilePageScaffold {...rest} showNavigation={showNav} />;
}

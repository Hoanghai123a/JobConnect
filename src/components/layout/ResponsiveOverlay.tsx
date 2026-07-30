import { type ComponentProps, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ResponsiveOverlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  presentation = "sheet",
  className,
  contentProps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  presentation?: "sheet" | "full" | "dialog";
  className?: string;
  contentProps?: Omit<ComponentProps<typeof DialogContent>, "children">;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...contentProps}
        data-responsive-overlay="true"
        data-presentation={presentation}
        className={cn(
          "flex flex-col overflow-hidden",
          presentation === "full" && "mobile:h-[96dvh]",
          className,
        )}
      >
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <DialogFooter className="shrink-0">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

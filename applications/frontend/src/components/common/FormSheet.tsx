import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "../ui/drawer";
import { useIsMobile } from "../ui/use-mobile";

/**
 * A form container: a near-full-height bottom sheet on phones, a centred dialog on larger screens.
 * The body scrolls and the footer (actions) stays pinned so it's reachable with the keyboard open.
 */
export function FormSheet({
  title,
  description,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const onOpenChange = (open: boolean) => !open && onClose();

  const body = (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          {footer}
        </div>
      )}
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92dvh] rounded-t-2xl bg-white data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 pb-3 pt-2">
            <div className="min-w-0">
              <DrawerTitle className="text-lg font-semibold text-gray-900">{title}</DrawerTitle>
              <DrawerDescription className={description ? "text-sm text-gray-500" : "sr-only"}>
                {description ?? title}
              </DrawerDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 sm:max-w-2xl">
        <div className="shrink-0 border-b border-gray-200 px-6 py-4 pr-12">
          <DialogTitle className="text-lg font-semibold text-gray-900">{title}</DialogTitle>
          <DialogDescription className={description ? "mt-1 text-sm text-gray-500" : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Footer buttons in one row: they share the width on phones (keeping the footer short above the
 * keyboard) and sit right-aligned on larger screens. Put the primary action last.
 */
export function FormSheetActions({ message, children }: { message?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {message}
      <div className="flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
    </div>
  );
}

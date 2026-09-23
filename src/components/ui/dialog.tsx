import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Maximize2, Minimize2 } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, forwardedRef) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const startYRef = React.useRef<number | null>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  // merge refs
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      // @ts-ignore
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [forwardedRef],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    // only on mobile (match sm breakpoint) – but allow always, CSS hides handle on desktop
    startYRef.current = e.clientY;
    setIsDragging(true);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    if (delta > 0) {
      setDragOffset(delta);
    } else if (!isFullscreen && delta < 0) {
      // pulling up when collapsed -> expand affordance (full delta for threshold)
      setDragOffset(delta * 0.5);
    } else if (isFullscreen && delta < 0) {
      setDragOffset(0);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const offset = dragOffset;
    // pull down significant -> close or exit fullscreen
    if (offset > 90) {
      if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        // trigger Radix close via the Close button
        const closeBtn = innerRef.current?.querySelector<HTMLButtonElement>("[data-dialog-close-btn]");
        closeBtn?.click();
      }
    } else if (offset < -60 && !isFullscreen) {
      // pull up significant -> expand to fullscreen
      setIsFullscreen(true);
    }
    setDragOffset(0);
    startYRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  // reset drag on open change (when unmounted remount resets, but also handle quickly)
  React.useEffect(() => {
    if (dragOffset === 0) return;
  }, [dragOffset]);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        className={cn(
          // base + mobile bottom-sheet
          "fixed z-50 flex flex-col bg-card border shadow-xl overflow-hidden",
          // mobile: bottom sheet, dynamic height to content, max-h constrained
          "inset-x-0 bottom-0 w-full rounded-t-[16px] border-t",
          "h-auto max-h-[85dvh]",
          // desktop: centered modal
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:w-full sm:max-h-[90vh] sm:rounded-xl sm:border sm:border-border/50 sm:shadow-xl",
          // animations: mobile slide from bottom, desktop zoom + fade
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
          "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
          "sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
          "duration-300 ease-out",
          // fullscreen overrides (mobile only)
          isFullscreen &&
            "max-h-[100dvh] h-[100dvh] rounded-t-none sm:max-h-[90vh] sm:h-auto sm:rounded-xl",
          className,
        )}
        style={
          dragOffset
            ? {
                transform: `translateY(${isDragging ? dragOffset : 0}px)`,
                transition: isDragging ? "none" : "transform 0.3s ease",
              }
            : isDragging
              ? { transition: "none" }
              : undefined
        }
        {...props}
      >
        {/* Drag handle + fullscreen toggle — mobile only */}
        <div
          className="flex shrink-0 flex-col items-center gap-0 sm:hidden"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* handle bar */}
          <div className="flex w-full justify-center py-3 touch-none select-none">
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        </div>

        {/* Fullscreen toggle button — mobile only, next to close */}
        <button
          type="button"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          onClick={() => setIsFullscreen((v) => !v)}
          className="absolute right-12 top-3.5 flex items-center justify-center rounded-md p-1.5 opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:hidden"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {/* Scrollable content area — dynamic height, grows to fit children */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 sm:px-6 sm:pb-6 sm:pt-6 scrollbar-thin [&::-webkit-scrollbar]:w-1.5">
          {/* extra top padding on mobile to account for drag handle */}
          <div className="sm:hidden h-1" />
          {children}
        </div>

        <DialogPrimitive.Close
          data-dialog-close-btn
          className="absolute right-4 top-3.5 rounded-md p-1.5 opacity-60 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:top-4"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-left mb-4", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // spaced apart on both mobile and desktop — buttons pushed to opposite ends
      "flex flex-row flex-wrap justify-between gap-3 pt-4",
      "[&>button]:flex-1 [&>button]:min-w-[120px]",
      "sm:flex-nowrap sm:justify-between sm:gap-3 sm:[&>button]:flex-1 sm:[&>button]:min-w-[120px]",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };

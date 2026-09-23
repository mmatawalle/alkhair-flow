import * as React from "react";
import { MoreVertical } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

export type MobileAction = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
};

export interface MobileListItemProps {
  /** Main avatar content – initials or letter, e.g. "A" or first char. */
  avatarFallback: string;
  /** Small supporting icon rendered as badge on avatar corner */
  supportingIcon?: React.ReactNode;
  /** Primary heading */
  heading: React.ReactNode;
  /** Secondary caption under heading */
  caption?: React.ReactNode;
  /** Optional extra meta line (small) below caption */
  meta?: React.ReactNode;
  /** Right side secondary info e.g. badge/amount; shown before menu on desktop-like peek */
  trailing?: React.ReactNode;
  /** Actions shown in bottom-sheet and accessible via side menu */
  actions: MobileAction[];
  /** Optional className for row */
  className?: string;
  /** Optional footer slot (extra row content like stats) */
  footer?: React.ReactNode;
}

/** Single row: avatar + supporting icon, heading + caption, side action menu → bottom sheet */
export function MobileListItem({
  avatarFallback,
  supportingIcon,
  heading,
  caption,
  meta,
  trailing,
  actions,
  className,
  footer,
}: MobileListItemProps) {
  const [open, setOpen] = React.useState(false);

  const hasActions = actions.length > 0;

  return (
    <div className={`flex items-center gap-3 rounded-lg border border-border bg-card p-3 ${className || ""}`}>
      {/* Avatar with supporting icon badge */}
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/15 text-primary font-semibold text-sm">
            {avatarFallback.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {supportingIcon && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card shadow-sm text-muted-foreground">
            <span className="h-3 w-3 [&>svg]:h-3 [&>svg]:w-3 flex items-center justify-center">
              {supportingIcon}
            </span>
          </span>
        )}
      </div>

      {/* Heading / caption */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">{heading}</p>
        {caption && <p className="truncate text-xs leading-4 text-muted-foreground">{caption}</p>}
        {meta && <div className="truncate text-xs leading-4 text-muted-foreground/90">{meta}</div>}
        {footer && <div className="mt-1">{footer}</div>}
      </div>

      {/* Trailing inline (e.g. amount/badge) – visible but not crowding */}
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}

      {/* Side action menu → Bottom Sheet */}
      {hasActions && (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader className="text-left pb-2">
              <DrawerTitle className="text-sm font-semibold">Actions</DrawerTitle>
            </DrawerHeader>
            <div className="px-2 pb-6">
              <ul className="flex flex-col">
                {actions.map((a) => (
                  <li key={a.id}>
                    <button
                      disabled={a.disabled}
                      onClick={() => {
                        setOpen(false);
                        // small delay so drawer can animate closed before action
                        setTimeout(() => a.onClick(), 80);
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-muted active:bg-muted ${
                        a.variant === "destructive" ? "text-destructive hover:bg-destructive/10" : "text-foreground"
                      } disabled:opacity-50 disabled:pointer-events-none`}
                    >
                      {a.icon && <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4 flex items-center justify-center">{a.icon}</span>}
                      <span>{a.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

export function MobileList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-2 md:hidden ${className || ""}`}>{children}</div>;
}

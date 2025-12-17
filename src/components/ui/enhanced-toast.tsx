import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X, CheckCircle, XCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Progress } from './progress';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      'top-0 sm:bottom-0',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        success:
          'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
        warning:
          'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100',
        info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100',
        loading: 'border-primary/20 bg-primary/5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const variantIcons = {
  default: null,
  destructive: XCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>,
    VariantProps<typeof toastVariants> {
  showProgress?: boolean;
  duration?: number;
  onAction?: () => void;
  actionLabel?: string;
  onUndo?: () => void;
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  ToastProps
>(({ className, variant, showProgress, duration = 5000, children, ...props }, ref) => {
  const [progress, setProgress] = React.useState(100);
  const Icon = variant ? variantIcons[variant] : null;

  React.useEffect(() => {
    if (!showProgress || duration === Infinity) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev - 100 / (duration / 100);
        return next < 0 ? 0 : next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [showProgress, duration]);

  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), 'flex-col', className)}
      duration={duration}
      {...props}
    >
      <div className="flex items-start gap-3 w-full">
        {Icon && (
          <div className="flex-shrink-0 mt-0.5">
            <Icon
              className={cn(
                'h-5 w-5',
                variant === 'loading' && 'animate-spin',
                variant === 'success' && 'text-green-600 dark:text-green-400',
                variant === 'destructive' && 'text-destructive',
                variant === 'warning' && 'text-yellow-600 dark:text-yellow-400',
                variant === 'info' && 'text-blue-600 dark:text-blue-400'
              )}
              aria-hidden="true"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
      {showProgress && (
        <div className="w-full mt-3 -mb-1">
          <Progress
            value={progress}
            className="h-1"
            aria-label={`Toast will close in ${Math.ceil((progress / 100) * (duration / 1000))} seconds`}
          />
        </div>
      )}
    </ToastPrimitives.Root>
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
      className
    )}
    toast-close=""
    aria-label="Close notification"
    {...props}
  >
    <X className="h-4 w-4" aria-hidden="true" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

interface ToastActionsProps {
  children: React.ReactNode;
  className?: string;
}

function ToastActions({ children, className }: ToastActionsProps) {
  return (
    <div className={cn('flex items-center gap-2 mt-3', className)}>
      {children}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

function ToastActionButton({ label, onClick, variant = 'outline', size = 'sm' }: ActionButtonProps) {
  return (
    <Button variant={variant} size={size} onClick={onClick} className="min-h-[32px]">
      {label}
    </Button>
  );
}

function ToastUndoButton({ onClick, label = 'Undo' }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="min-h-[32px] font-medium">
      {label}
    </Button>
  );
}

type EnhancedToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type EnhancedToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  ToastActions,
  ToastActionButton,
  ToastUndoButton,
};

export function useEnhancedToast() {
  const toastQueue = React.useRef<Map<string, number>>(new Map());
  const maxToasts = 5;

  const manageQueue = React.useCallback((id: string) => {
    const queue = toastQueue.current;
    queue.set(id, Date.now());

    if (queue.size > maxToasts) {
      const oldestId = Array.from(queue.entries())
        .sort(([, a], [, b]) => a - b)[0]?.[0];
      if (oldestId) {
        queue.delete(oldestId);
      }
    }

    return () => {
      queue.delete(id);
    };
  }, []);

  return { manageQueue, maxToasts };
}

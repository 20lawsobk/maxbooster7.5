import { useToast } from '@/hooks/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { CheckCircle, XCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * TODO: Add function documentation
 */
export function Toaster() {
  const { toasts } = useToast();

  const getIcon = (variant?: string) => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />;
      case 'destructive':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />;
      case 'warning':
        return (
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
        );
      case 'info':
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />;
      case 'loading':
        return <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />;
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const icon = getIcon(props.variant);
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-3 flex-1">
              {icon && <div className="flex-shrink-0 mt-0.5">{icon}</div>}
              <div className="grid gap-1 flex-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

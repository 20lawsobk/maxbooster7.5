import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden transform-gpu',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:scale-105 active:scale-100 dark:bg-blue-600 dark:text-white dark:shadow-md dark:shadow-blue-500/40 dark:hover:bg-blue-500 dark:hover:shadow-lg',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg hover:scale-105 active:scale-100 dark:bg-destructive dark:text-white',
        outline:
          'border-2 border-input bg-background hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:border-primary/50 active:scale-95 dark:border-blue-500 dark:bg-blue-500/10 dark:text-white dark:hover:border-blue-400 dark:hover:bg-blue-500/20 dark:hover:text-white',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-md hover:scale-105 active:scale-100 dark:bg-purple-600 dark:text-white dark:hover:bg-purple-500 dark:shadow-sm dark:shadow-purple-500/30',
        ghost: 'hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:scale-95 dark:text-white dark:hover:text-white dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline hover:text-primary/80 active:text-primary/60 dark:text-blue-400 dark:hover:text-blue-300',
        premium:
          'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 hover:shadow-xl hover:scale-105 active:scale-100 dark:shadow-lg dark:shadow-purple-500/30',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-10 rounded-md px-4 py-2',
        lg: 'h-12 rounded-md px-8 py-3',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

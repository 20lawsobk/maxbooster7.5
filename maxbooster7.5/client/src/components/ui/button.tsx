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
          'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:scale-105 active:scale-100 dark:bg-blue-600 dark:text-white dark:shadow-md dark:shadow-blue-500/40 dark:hover:bg-blue-500 dark:hover:shadow-lg',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:scale-105 active:scale-100 dark:bg-red-600 dark:text-white dark:hover:bg-red-500',
        outline:
          'border-2 border-blue-500 bg-transparent text-blue-600 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md active:scale-95 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:border-blue-300 dark:hover:bg-blue-500/20 dark:hover:text-blue-200',
        secondary:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 hover:shadow-md hover:scale-105 active:scale-100 dark:bg-purple-600 dark:text-white dark:hover:bg-purple-500 dark:shadow-sm dark:shadow-purple-500/30',
        ghost: 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:shadow-sm active:scale-95 dark:text-gray-200 dark:hover:text-white dark:hover:bg-white/10',
        link: 'text-blue-600 underline-offset-4 hover:underline hover:text-blue-700 active:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300',
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

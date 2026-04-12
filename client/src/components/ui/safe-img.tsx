import { useState, useEffect, type ImgHTMLAttributes } from 'react';
import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';

const FALLBACK_SRC = '/placeholder.svg';

interface SafeImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  /**
   * URL of a fallback image to show if `src` fails to load.
   * Defaults to the app's placeholder.svg.
   */
  fallbackSrc?: string;
  /**
   * When true, renders a music-note icon placeholder instead of a broken
   * image when both src and fallbackSrc fail.
   */
  iconFallback?: boolean;
  /**
   * Extra class applied to the icon fallback wrapper div.
   */
  fallbackClassName?: string;
  /**
   * Controls native lazy-loading.  Defaults to "lazy" so off-screen images
   * don't block the initial render.  Use "eager" for above-the-fold hero images.
   */
  loading?: 'lazy' | 'eager' | 'auto';
  /**
   * Controls decoding hint.  Defaults to "async" so the browser can decode
   * off the main thread without stalling layout.
   */
  decoding?: 'async' | 'sync' | 'auto';
}

/**
 * A drop-in replacement for <img> that:
 * - Always shows a fallback when the src fails to load
 * - Reverts to the app placeholder on secondary failure
 * - Optionally shows an icon placeholder instead of a broken-image icon
 * - Updates cleanly when `src` changes (resets error state)
 */
export function SafeImg({
  src,
  alt,
  fallbackSrc = FALLBACK_SRC,
  iconFallback = false,
  fallbackClassName,
  className,
  loading = 'lazy',
  decoding = 'async',
  ...props
}: SafeImgProps) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src);
  const [failed, setFailed] = useState(false);
  const [finalFailed, setFinalFailed] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setFailed(false);
    setFinalFailed(false);
  }, [src]);

  if (finalFailed && iconFallback) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          fallbackClassName,
          className
        )}
        aria-label={alt}
        role="img"
      >
        <Music className="w-1/3 h-1/3 opacity-40" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => {
        if (!failed) {
          setFailed(true);
          setImgSrc(fallbackSrc);
        } else {
          setFinalFailed(true);
        }
      }}
      {...props}
    />
  );
}

export default SafeImg;

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, PartyPopper, Rocket } from "lucide-react";

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isReleased: boolean;
}

interface CountdownTimerProps {
  releaseDate: Date | string;
  title?: string;
  artworkUrl?: string;
  compact?: boolean;
  className?: string;
}

export function CountdownTimer({
  releaseDate,
  title,
  artworkUrl,
  compact = false,
  className = "",
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isReleased: false,
  });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();
      const release = new Date(releaseDate);
      const diff = release.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, isReleased: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds, isReleased: false });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [releaseDate]);

  if (timeRemaining.isReleased) {
    return (
      <Card className={`bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20 ${className}`}>
        <CardContent className="p-6 flex items-center justify-center gap-3">
          <PartyPopper className="h-8 w-8 text-green-500 animate-bounce" />
          <div className="text-center">
            <p className="text-2xl font-bold text-green-500">Released!</p>
            {title && <p className="text-sm text-muted-foreground">{title} is now live</p>}
          </div>
          <PartyPopper className="h-8 w-8 text-green-500 animate-bounce" />
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m
        </span>
      </div>
    );
  }

  const TimeUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
          <span className="text-2xl sm:text-3xl font-bold text-primary">{String(value).padStart(2, "0")}</span>
        </div>
        <div className="absolute -top-1 -right-1">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
      </div>
      <span className="text-xs sm:text-sm text-muted-foreground mt-2 uppercase tracking-wider">{label}</span>
    </div>
  );

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="relative">
        {artworkUrl && (
          <div className="absolute inset-0 opacity-10">
            <img src={artworkUrl} alt="" className="w-full h-full object-cover blur-xl" />
          </div>
        )}
        <CardContent className="p-6 sm:p-8 relative">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Rocket className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              Countdown Active
            </Badge>
          </div>

          {title && <h3 className="text-xl font-bold text-center mb-6">{title}</h3>}

          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <TimeUnit value={timeRemaining.days} label="Days" />
            <span className="text-2xl sm:text-3xl font-bold text-muted-foreground self-start mt-4">:</span>
            <TimeUnit value={timeRemaining.hours} label="Hours" />
            <span className="text-2xl sm:text-3xl font-bold text-muted-foreground self-start mt-4">:</span>
            <TimeUnit value={timeRemaining.minutes} label="Mins" />
            <span className="text-2xl sm:text-3xl font-bold text-muted-foreground self-start mt-4">:</span>
            <TimeUnit value={timeRemaining.seconds} label="Secs" />
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Release Date: {new Date(releaseDate).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </CardContent>
      </div>
    </Card>
  );
}

export default CountdownTimer;

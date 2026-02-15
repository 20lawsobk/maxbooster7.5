import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar as CalendarIcon, Clock, AlertCircle, Info } from 'lucide-react';
import { format, addDays, addWeeks, isBefore, startOfDay } from 'date-fns';

interface ReleaseDateSchedulerProps {
  selectedDate: Date | null;
  onChange: (date: Date | null) => void;
  minWeeksAhead?: number;
}

/**
 * TODO: Add function documentation
 */
export function ReleaseDateScheduler({
  selectedDate,
  onChange,
  minWeeksAhead = 2,
}: ReleaseDateSchedulerProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Calculate minimum date (2 weeks from today for editorial consideration)
  const today = startOfDay(new Date());
  const minDate = addWeeks(today, minWeeksAhead);

  const isDateValid = (date: Date | null): boolean => {
    if (!date) return false;
    return !isBefore(startOfDay(date), minDate);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date && isDateValid(date)) {
      onChange(date);
      setIsCalendarOpen(false);
    }
  };

  const quickDates = [
    {
      label: '2 Weeks',
      date: addWeeks(today, 2),
      description: 'Minimum for editorial',
    },
    {
      label: '4 Weeks',
      date: addWeeks(today, 4),
      description: 'Recommended for playlisting',
    },
    {
      label: '6 Weeks',
      date: addWeeks(today, 6),
      description: 'Best for marketing campaigns',
    },
    {
      label: '8 Weeks',
      date: addWeeks(today, 8),
      description: 'Premium editorial consideration',
    },
  ];

  const getDayOfWeek = (date: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Release Date
        </CardTitle>
        <CardDescription>
          Schedule your release date. Earlier submissions get better playlist consideration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Editorial Consideration Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Spotify Editorial Playlisting:</strong> Submit at least 2 weeks before release
            for editorial review. 4+ weeks is recommended for maximum consideration.
          </AlertDescription>
        </Alert>

        {/* Selected Date Display */}
        <div className="space-y-2">
          <Label>Selected Release Date</Label>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`w-full justify-start text-left font-normal ${
                  !selectedDate && 'text-muted-foreground'
                }`}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  <div className="flex items-center gap-2">
                    <span>{format(selectedDate, 'MMMM dd, yyyy')}</span>
                    <span className="text-muted-foreground">({getDayOfWeek(selectedDate)})</span>
                  </div>
                ) : (
                  <span>Select release date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate || undefined}
                onSelect={handleDateSelect}
                disabled={(date) => isBefore(startOfDay(date), minDate)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {selectedDate && (
            <div className="flex items-start gap-2 text-sm">
              {isDateValid(selectedDate) ? (
                <>
                  <Clock className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-green-600 font-medium">
                      Great!{' '}
                      {Math.ceil(
                        (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                      )}{' '}
                      days advance notice
                    </p>
                    <p className="text-muted-foreground">
                      {Math.ceil(
                        (selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)
                      )}{' '}
                      weeks for editorial review
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-destructive">
                    Release date must be at least {minWeeksAhead} weeks from today
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Quick Date Selection */}
        <div className="space-y-2">
          <Label>Quick Selection</Label>
          <div className="grid grid-cols-2 gap-2">
            {quickDates.map((quick) => (
              <button
                key={quick.label}
                type="button"
                className={`p-3 border-2 rounded-lg text-left transition-colors ${
                  selectedDate &&
                  format(selectedDate, 'yyyy-MM-dd') === format(quick.date, 'yyyy-MM-dd')
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
                onClick={() => onChange(quick.date)}
              >
                <div className="font-medium text-sm">{quick.label}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {format(quick.date, 'MMM dd, yyyy')}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{quick.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Friday Release Recommendation */}
        {selectedDate && getDayOfWeek(selectedDate) !== 'Friday' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Tip:</strong> Most releases go live on Fridays (industry standard for new
              music). Consider{' '}
              {format(addDays(selectedDate, (5 - selectedDate.getDay() + 7) % 7), 'MMMM dd')}
              instead?
            </AlertDescription>
          </Alert>
        )}

        {/* Distribution Timeline */}
        {selectedDate && isDateValid(selectedDate) && (
          <div className="space-y-2">
            <Label>Distribution Timeline</Label>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                <div>
                  <p className="font-medium">Today: Submit release</p>
                  <p className="text-muted-foreground text-xs">
                    Upload tracks, artwork, and metadata
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {format(addDays(today, 1), 'MMM dd')}: Processing begins
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Quality check and delivery to DSPs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {format(addWeeks(today, 1), 'MMM dd')}: Available on platforms
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Pre-save links and artist tools active
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 bg-primary/10 rounded">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    {format(selectedDate, 'MMM dd')}: Release goes live! 🎉
                  </p>
                  <p className="text-muted-foreground text-xs">Available to stream worldwide</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

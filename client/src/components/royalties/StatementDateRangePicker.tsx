import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Calendar as CalendarIcon,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from "date-fns";

export interface StatementPeriod {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
  earnings: number;
  status: "available" | "processing" | "no_data";
}

interface StatementDateRangePickerProps {
  statements: StatementPeriod[];
  selectedPeriod?: StatementPeriod | null;
  onPeriodSelect: (period: StatementPeriod) => void;
  onDownload: (period: StatementPeriod) => void;
  onGenerate?: (startDate: Date, endDate: Date) => void;
  isLoading?: boolean;
  currency?: string;
}

type PresetPeriod =
  | "current_month"
  | "last_month"
  | "current_quarter"
  | "last_quarter"
  | "current_year"
  | "last_year"
  | "custom";

export function StatementDateRangePicker({
  statements,
  selectedPeriod,
  onPeriodSelect,
  onDownload,
  onGenerate,
  isLoading = false,
  currency = "USD",
}: StatementDateRangePickerProps) {
  const [presetPeriod, setPresetPeriod] =
    useState<PresetPeriod>("current_month");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [isStartCalendarOpen, setIsStartCalendarOpen] = useState(false);
  const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false);

  const presets = useMemo(() => {
    const now = new Date();
    return {
      current_month: {
        label: "Current Month",
        startDate: startOfMonth(now),
        endDate: endOfMonth(now),
      },
      last_month: {
        label: "Last Month",
        startDate: startOfMonth(subMonths(now, 1)),
        endDate: endOfMonth(subMonths(now, 1)),
      },
      current_quarter: {
        label: "Current Quarter",
        startDate: startOfQuarter(now),
        endDate: endOfQuarter(now),
      },
      last_quarter: {
        label: "Last Quarter",
        startDate: startOfQuarter(subMonths(now, 3)),
        endDate: endOfQuarter(subMonths(now, 3)),
      },
      current_year: {
        label: "Current Year",
        startDate: startOfYear(now),
        endDate: endOfYear(now),
      },
      last_year: {
        label: "Last Year",
        startDate: startOfYear(subMonths(now, 12)),
        endDate: endOfYear(subMonths(now, 12)),
      },
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const handlePresetChange = (preset: PresetPeriod) => {
    setPresetPeriod(preset);
    if (preset !== "custom" && presets[preset as keyof typeof presets]) {
      const { startDate, endDate } = presets[preset as keyof typeof presets];
      const matchingStatement = statements.find(
        (s) =>
          s.startDate.getTime() === startDate.getTime() &&
          s.endDate.getTime() === endDate.getTime(),
      );

      if (matchingStatement) {
        onPeriodSelect(matchingStatement);
      } else if (onGenerate) {
        onGenerate(startDate, endDate);
      }
    }
  };

  const handleCustomDateSelect = () => {
    if (customStartDate && customEndDate && onGenerate) {
      onGenerate(customStartDate, customEndDate);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { className: string; label: string }> = {
      available: {
        className: "bg-green-500/20 text-green-500",
        label: "Available",
      },
      processing: {
        className: "bg-amber-500/20 text-amber-500",
        label: "Processing",
      },
      no_data: {
        className: "bg-muted text-muted-foreground",
        label: "No Data",
      },
    };
    const config = badges[status] || badges.no_data;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const navigatePeriod = (direction: "prev" | "next") => {
    if (!selectedPeriod) return;

    const currentIndex = statements.findIndex(
      (s) => s.id === selectedPeriod.id,
    );
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex >= 0 && newIndex < statements.length) {
      onPeriodSelect(statements[newIndex]);
    }
  };

  return (
    <Card className="glassmorphism" data-testid="statement-date-picker">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" />
          Statement Period
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Period</label>
            <Select
              value={presetPeriod}
              onValueChange={(value: PresetPeriod) => handlePresetChange(value)}
            >
              <SelectTrigger data-testid="select-period-preset">
                <SelectValue placeholder="Select a period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="current_quarter">Current Quarter</SelectItem>
                <SelectItem value="last_quarter">Last Quarter</SelectItem>
                <SelectItem value="current_year">Current Year</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {presetPeriod === "custom" && (
            <div className="flex gap-4" data-testid="custom-date-range">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover
                  open={isStartCalendarOpen}
                  onOpenChange={setIsStartCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-start-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate
                        ? format(customStartDate, "MMM d, yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customStartDate}
                      onSelect={(date) => {
                        setCustomStartDate(date);
                        setIsStartCalendarOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover
                  open={isEndCalendarOpen}
                  onOpenChange={setIsEndCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-end-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate
                        ? format(customEndDate, "MMM d, yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customEndDate}
                      onSelect={(date) => {
                        setCustomEndDate(date);
                        setIsEndCalendarOpen(false);
                      }}
                      disabled={(date) =>
                        customStartDate ? date < customStartDate : false
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleCustomDateSelect}
                  disabled={!customStartDate || !customEndDate || isLoading}
                  data-testid="button-generate-statement"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    "Generate"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedPeriod && (
          <div
            className="p-4 rounded-lg bg-muted/30"
            data-testid="selected-period-info"
          >
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigatePeriod("prev")}
                disabled={
                  statements.findIndex((s) => s.id === selectedPeriod.id) === 0
                }
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {format(selectedPeriod.startDate, "MMM d, yyyy")} -{" "}
                  {format(selectedPeriod.endDate, "MMM d, yyyy")}
                </p>
                <p className="text-2xl font-bold">{selectedPeriod.label}</p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigatePeriod("next")}
                disabled={
                  statements.findIndex((s) => s.id === selectedPeriod.id) ===
                  statements.length - 1
                }
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedPeriod.status)}
                {selectedPeriod.status === "available" && (
                  <span className="text-lg font-semibold">
                    {formatCurrency(selectedPeriod.earnings)}
                  </span>
                )}
              </div>

              {selectedPeriod.status === "available" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownload(selectedPeriod)}
                  data-testid="button-download-statement"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}

              {selectedPeriod.status === "no_data" && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <AlertCircle className="w-4 h-4" />
                  No earnings in this period
                </div>
              )}
            </div>
          </div>
        )}

        {statements.length > 0 && (
          <div className="space-y-2" data-testid="statement-list">
            <h4 className="text-sm font-medium text-muted-foreground">
              Recent Statements
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {statements.slice(0, 6).map((statement) => (
                <div
                  key={statement.id}
                  onClick={() => onPeriodSelect(statement)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedPeriod?.id === statement.id
                      ? "bg-primary/10 border border-primary"
                      : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  data-testid={`statement-item-${statement.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{statement.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(statement.startDate, "MMM d")} -{" "}
                        {format(statement.endDate, "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {statement.status === "available" && (
                      <p className="font-semibold">
                        {formatCurrency(statement.earnings)}
                      </p>
                    )}
                    {getStatusBadge(statement.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

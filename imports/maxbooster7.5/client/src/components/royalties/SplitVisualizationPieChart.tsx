import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Users, AlertCircle, CheckCircle } from "lucide-react";

interface SplitParticipant {
  id: string;
  name: string;
  role: string;
  email?: string;
  percentage: number;
  avatar?: string;
  status?: "pending" | "accepted" | "declined";
}

interface SplitVisualizationPieChartProps {
  participants: SplitParticipant[];
  totalAmount?: number;
  currency?: string;
  showLegend?: boolean;
  showValidation?: boolean;
  onParticipantClick?: (participant: SplitParticipant) => void;
}

const COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

export function SplitVisualizationPieChart({
  participants,
  totalAmount = 0,
  currency = "USD",
  showLegend = true,
  showValidation = true,
  onParticipantClick,
}: SplitVisualizationPieChartProps) {
  const totalPercentage = useMemo(() => {
    return participants.reduce((sum, p) => sum + p.percentage, 0);
  }, [participants]);

  const isValid = Math.abs(totalPercentage - 100) < 0.01;

  const segments = useMemo(() => {
    let currentAngle = -90;
    return participants.map((participant, index) => {
      const angle = (participant.percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      const largeArc = angle > 180 ? 1 : 0;

      const x1 = 50 + 45 * Math.cos(startRad);
      const y1 = 50 + 45 * Math.sin(startRad);
      const x2 = 50 + 45 * Math.cos(endRad);
      const y2 = 50 + 45 * Math.sin(endRad);

      const midAngle = (startAngle + endAngle) / 2;
      const midRad = (midAngle * Math.PI) / 180;
      const labelX = 50 + 30 * Math.cos(midRad);
      const labelY = 50 + 30 * Math.sin(midRad);

      return {
        participant,
        color: COLORS[index % COLORS.length],
        path: `M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArc} 1 ${x2} ${y2} Z`,
        labelX,
        labelY,
        percentage: participant.percentage,
      };
    });
  }, [participants]);

  const formatAmount = (percentage: number) => {
    const amount = (totalAmount * percentage) / 100;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "accepted":
        return (
          <Badge className="bg-green-500/20 text-green-500 text-xs">
            Accepted
          </Badge>
        );
      case "declined":
        return (
          <Badge className="bg-red-500/20 text-red-500 text-xs">Declined</Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-500/20 text-amber-500 text-xs">
            Pending
          </Badge>
        );
      default:
        return null;
    }
  };

  if (participants.length === 0) {
    return (
      <Card className="glassmorphism">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Royalty Split
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p>No collaborators added</p>
            <p className="text-sm">Add collaborators to visualize the split</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glassmorphism" data-testid="split-pie-chart">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Royalty Split
          </CardTitle>
          {showValidation && (
            <div
              className={`flex items-center gap-2 text-sm ${isValid ? "text-green-500" : "text-red-500"}`}
            >
              {isValid ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Valid (100%)</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>{totalPercentage.toFixed(1)}%</span>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-shrink-0">
            <svg
              viewBox="0 0 100 100"
              className="w-48 h-48 mx-auto"
              data-testid="pie-chart-svg"
            >
              {segments.map((segment, index) => (
                <g key={segment.participant.id}>
                  <path
                    d={segment.path}
                    fill={segment.color}
                    stroke="currentColor"
                    strokeWidth="0.5"
                    className="cursor-pointer transition-opacity hover:opacity-80 stroke-background"
                    onClick={() => onParticipantClick?.(segment.participant)}
                    data-testid={`pie-segment-${index}`}
                  />
                  {segment.percentage >= 10 && (
                    <text
                      x={segment.labelX}
                      y={segment.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-white text-[6px] font-semibold pointer-events-none"
                    >
                      {segment.percentage.toFixed(0)}%
                    </text>
                  )}
                </g>
              ))}
              <circle cx="50" cy="50" r="20" className="fill-background" />
              <text
                x="50"
                y="48"
                textAnchor="middle"
                className="fill-foreground text-[8px] font-semibold"
              >
                {participants.length}
              </text>
              <text
                x="50"
                y="56"
                textAnchor="middle"
                className="fill-muted-foreground text-[4px]"
              >
                collaborators
              </text>
            </svg>
          </div>

          {showLegend && (
            <div className="flex-1 space-y-3" data-testid="pie-chart-legend">
              {segments.map((segment) => (
                <div
                  key={segment.participant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onParticipantClick?.(segment.participant)}
                  data-testid={`legend-item-${segment.participant.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {segment.participant.name}
                        </p>
                        {getStatusBadge(segment.participant.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {segment.participant.role}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {segment.percentage.toFixed(2)}%
                    </p>
                    {totalAmount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatAmount(segment.percentage)}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {totalAmount > 0 && (
                <div className="pt-3 border-t flex items-center justify-between">
                  <span className="font-medium">Total</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency,
                    }).format(totalAmount)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

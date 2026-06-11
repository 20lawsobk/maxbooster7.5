import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Check,
  X,
  Info,
  Crown,
  Shield,
  Music,
  Clock,
  Infinity as InfinityIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LicenseType {
  id: string;
  name: string;
  type: "non-exclusive" | "exclusive" | "unlimited" | "custom";
  price: number;
  streams: number | "unlimited";
  copies: number | "unlimited";
  radioStations: number | "unlimited";
  musicVideos: number | "unlimited";
  duration: string;
  allowsBroadcast: boolean;
  allowsProfit: boolean;
  allowsSync: boolean;
  stemAccess?: boolean;
  highlighted?: boolean;
  savings?: number;
}

interface LicenseComparisonCardProps {
  licenses: LicenseType[];
  selectedLicense?: string;
  onSelectLicense: (licenseId: string) => void;
  onPurchase?: (license: LicenseType) => void;
  beatTitle?: string;
  beatPrice?: number;
  className?: string;
  compact?: boolean;
}

const defaultLicenses: LicenseType[] = [
  {
    id: "basic",
    name: "Basic Lease",
    type: "non-exclusive",
    price: 29.99,
    streams: 100000,
    copies: 5000,
    radioStations: 2,
    musicVideos: 1,
    duration: "1 year",
    allowsBroadcast: false,
    allowsProfit: true,
    allowsSync: false,
  },
  {
    id: "premium",
    name: "Premium Lease",
    type: "non-exclusive",
    price: 99.99,
    streams: 500000,
    copies: 25000,
    radioStations: 10,
    musicVideos: 3,
    duration: "2 years",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    highlighted: true,
    savings: 30,
  },
  {
    id: "unlimited",
    name: "Unlimited Lease",
    type: "unlimited",
    price: 199.99,
    streams: "unlimited",
    copies: "unlimited",
    radioStations: "unlimited",
    musicVideos: "unlimited",
    duration: "Lifetime",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    stemAccess: true,
  },
  {
    id: "exclusive",
    name: "Exclusive Rights",
    type: "exclusive",
    price: 999.99,
    streams: "unlimited",
    copies: "unlimited",
    radioStations: "unlimited",
    musicVideos: "unlimited",
    duration: "Lifetime (Full Ownership)",
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    stemAccess: true,
  },
];

const formatNumber = (value: number | "unlimited"): string => {
  if (value === "unlimited") return "Unlimited";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

function FeatureRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: boolean | number | string;
  tooltip?: string;
}) {
  const displayValue = () => {
    if (typeof value === "boolean") {
      return value ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <X className="w-4 h-4 text-muted-foreground" />
      );
    }
    if (value === "unlimited") {
      return <InfinityIcon className="w-4 h-4 text-purple-500" />;
    }
    return <span className="font-medium">{formatNumber(value as number)}</span>;
  };

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {displayValue()}
    </div>
  );
}

export function LicenseComparisonCard({
  licenses = defaultLicenses,
  selectedLicense,
  onSelectLicense,
  onPurchase,
  beatTitle,
  beatPrice,
  className,
  compact = false,
}: LicenseComparisonCardProps) {
  const [expandedLicense, setExpandedLicense] = useState<string | null>(null);

  const getLicenseIcon = (type: string) => {
    switch (type) {
      case "exclusive":
        return Crown;
      case "unlimited":
        return InfinityIcon;
      case "non-exclusive":
        return Music;
      default:
        return Shield;
    }
  };

  const getLicenseBadgeColor = (type: string) => {
    switch (type) {
      case "exclusive":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "unlimited":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    }
  };

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Choose Your License</CardTitle>
          {beatTitle && <CardDescription>For "{beatTitle}"</CardDescription>}
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedLicense}
            onValueChange={onSelectLicense}
            className="space-y-2"
          >
            {licenses.map((license) => {
              const Icon = getLicenseIcon(license.type);
              return (
                <div
                  key={license.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedLicense === license.id
                      ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                      : "border-transparent bg-muted/50 hover:bg-muted",
                  )}
                  onClick={() => onSelectLicense(license.id)}
                >
                  <RadioGroupItem value={license.id} id={license.id} />
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={license.id}
                        className="font-medium cursor-pointer"
                      >
                        {license.name}
                      </Label>
                      {license.highlighted && (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-green-100 text-green-800"
                        >
                          Popular
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {license.duration}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">
                      ${license.price.toFixed(2)}
                    </span>
                    {license.savings && (
                      <p className="text-xs text-green-600">
                        Save {license.savings}%
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          {selectedLicense && onPurchase && (
            <Button
              className="w-full mt-4 bg-gradient-to-r from-purple-600 to-indigo-600"
              onClick={() => {
                const license = licenses.find((l) => l.id === selectedLicense);
                if (license) onPurchase(license);
              }}
            >
              Purchase License
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {beatTitle && (
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">Choose Your License</h2>
          <p className="text-muted-foreground">For "{beatTitle}"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {licenses.map((license) => {
          const Icon = getLicenseIcon(license.type);
          const isSelected = selectedLicense === license.id;
          const isExpanded = expandedLicense === license.id;

          return (
            <Card
              key={license.id}
              className={cn(
                "relative overflow-hidden transition-all cursor-pointer",
                isSelected
                  ? "ring-2 ring-purple-500 shadow-lg"
                  : "hover:shadow-md",
                license.highlighted &&
                  "border-purple-300 dark:border-purple-700",
              )}
              onClick={() => onSelectLicense(license.id)}
            >
              {license.highlighted && (
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
              )}

              {license.savings && (
                <Badge className="absolute top-3 right-3 bg-green-500">
                  {license.savings}% OFF
                </Badge>
              )}

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      getLicenseBadgeColor(license.type),
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{license.name}</CardTitle>
                    <Badge variant="outline" className="text-xs mt-1">
                      {license.type.replace("-", " ")}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    ${license.price.toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">
                    .{(license.price % 1).toFixed(2).slice(2)}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{license.duration}</span>
                </div>

                <Separator />

                <div className="space-y-1">
                  <FeatureRow
                    label="Streams"
                    value={license.streams}
                    tooltip="Maximum audio streams allowed"
                  />
                  <FeatureRow
                    label="Copies"
                    value={license.copies}
                    tooltip="Physical or digital copies you can sell"
                  />
                  <FeatureRow
                    label="Music Videos"
                    value={license.musicVideos}
                    tooltip="Number of music videos allowed"
                  />
                  <FeatureRow
                    label="Radio Stations"
                    value={license.radioStations}
                    tooltip="Number of radio stations that can play"
                  />
                </div>

                <Collapsible
                  open={isExpanded}
                  onOpenChange={() =>
                    setExpandedLicense(isExpanded ? null : license.id)
                  }
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isExpanded ? "Show Less" : "More Details"}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 ml-2" />
                      ) : (
                        <ChevronDown className="w-4 h-4 ml-2" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 mt-2">
                    <FeatureRow
                      label="Broadcast Rights"
                      value={license.allowsBroadcast}
                      tooltip="TV and major media broadcast rights"
                    />
                    <FeatureRow
                      label="Sync Licensing"
                      value={license.allowsSync}
                      tooltip="Use in films, TV, ads, and games"
                    />
                    <FeatureRow
                      label="Profit Rights"
                      value={license.allowsProfit}
                      tooltip="Keep 100% of your royalties"
                    />
                    {license.stemAccess && (
                      <FeatureRow
                        label="Stem Access"
                        value={true}
                        tooltip="Access to individual track stems"
                      />
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Button
                  className={cn(
                    "w-full mt-2",
                    isSelected
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600"
                      : "bg-muted hover:bg-muted/80",
                  )}
                  variant={isSelected ? "default" : "secondary"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLicense(license.id);
                    if (onPurchase) onPurchase(license);
                  }}
                >
                  {isSelected ? "Selected" : "Select License"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default LicenseComparisonCard;

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: string[];
  isPremium?: boolean;
}

interface Split {
  name: string;
  percentage: number;
  role: string;
}

interface ContractBuilderProps {
  template: ContractTemplate;
  initialVariables?: Record<string, any>;
  onPreview: (content: string) => void;
  onSubmit: (variables: Record<string, any>) => void;
  isSubmitting?: boolean;
}

export function ContractBuilder({
  template,
  initialVariables = {},
  onPreview,
  onSubmit,
  isSubmitting,
}: ContractBuilderProps) {
  const { toast } = useToast();
  const [variables, setVariables] =
    useState<Record<string, any>>(initialVariables);
  const [splits, setSplits] = useState<Split[]>([
    { name: "", percentage: 100, role: "Artist" },
  ]);
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/contracts/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          templateId: template.id,
          variables: template.variables.includes("splits")
            ? { ...variables, splits }
            : variables,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setValidation({
        valid: data.valid,
        errors: data.errors || [],
        warnings: data.warnings || [],
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/contracts/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          templateId: template.id,
          variables: template.variables.includes("splits")
            ? { ...variables, splits }
            : variables,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.content) {
        onPreview(data.content);
      }
    },
  });

  useEffect(() => {
    if (Object.keys(variables).length > 0) {
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
      validationTimerRef.current = setTimeout(() => {
        validateMutation.mutate();
        validationTimerRef.current = null;
      }, 500);
      return () => {
        if (validationTimerRef.current) {
          clearTimeout(validationTimerRef.current);
          validationTimerRef.current = null;
        }
      };
    }
  }, [variables, splits]);

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleSplitChange = (
    index: number,
    field: keyof Split,
    value: string | number,
  ) => {
    setSplits((prev) => {
      const newSplits = [...prev];
      newSplits[index] = { ...newSplits[index], [field]: value };
      return newSplits;
    });
  };

  const addSplit = () => {
    setSplits((prev) => [
      ...prev,
      { name: "", percentage: 0, role: "Contributor" },
    ]);
  };

  const removeSplit = (index: number) => {
    if (splits.length > 1) {
      setSplits((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const totalSplitPercentage =
    Math.round(
      splits.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0) * 100,
    ) / 100;

  const handleSubmit = () => {
    if (validationTimerRef.current || validateMutation.isPending) {
      toast({
        title: "Validating…",
        description:
          "Please wait a moment while we check your contract details.",
      });
      return;
    }
    if (validation?.errors && validation.errors.length > 0) {
      toast({
        title: "Validation Errors",
        description: "Please fix all errors before creating the contract.",
        variant: "destructive",
      });
      return;
    }
    onSubmit(
      template.variables.includes("splits")
        ? { ...variables, splits }
        : variables,
    );
  };

  const getVariableLabel = (variable: string) => {
    return variable
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();
  };

  const getVariableType = (
    variable: string,
  ): "text" | "number" | "textarea" | "date" => {
    if (
      variable.includes("Price") ||
      variable.includes("Fee") ||
      variable.includes("Amount") ||
      variable.includes("Rate") ||
      variable.includes("Percentage") ||
      variable.includes("Limit") ||
      variable.includes("Hours")
    ) {
      return "number";
    }
    if (variable.includes("Date")) {
      return "date";
    }
    if (
      variable.includes("description") ||
      variable.includes("terms") ||
      variable.includes("Terms")
    ) {
      return "textarea";
    }
    return "text";
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{template.name}</CardTitle>
            {template.isPremium && <Badge variant="secondary">Premium</Badge>}
          </div>
          <CardDescription>{template.description}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-medium">Contract Details</h3>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {template.variables
                .filter((v) => v !== "splits")
                .map((variable) => {
                  const type = getVariableType(variable);
                  return (
                    <div key={variable} className="space-y-2">
                      <Label htmlFor={variable}>
                        {getVariableLabel(variable)}
                      </Label>
                      {type === "textarea" ? (
                        <Textarea
                          id={variable}
                          value={variables[variable] || ""}
                          onChange={(e) =>
                            handleVariableChange(variable, e.target.value)
                          }
                          rows={3}
                          placeholder={`Enter ${getVariableLabel(variable).toLowerCase()}`}
                        />
                      ) : type === "number" ? (
                        <Input
                          id={variable}
                          type="number"
                          value={variables[variable] || ""}
                          onChange={(e) =>
                            handleVariableChange(variable, e.target.value)
                          }
                          placeholder="0"
                        />
                      ) : type === "date" ? (
                        <Input
                          id={variable}
                          type="date"
                          value={variables[variable] || ""}
                          onChange={(e) =>
                            handleVariableChange(variable, e.target.value)
                          }
                        />
                      ) : (
                        <Input
                          id={variable}
                          value={variables[variable] || ""}
                          onChange={(e) =>
                            handleVariableChange(variable, e.target.value)
                          }
                          placeholder={`Enter ${getVariableLabel(variable).toLowerCase()}`}
                        />
                      )}
                    </div>
                  );
                })}

              {template.variables.includes("splits") && (
                <div className="space-y-3 pt-4">
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label>Royalty Splits</Label>
                    <Badge
                      variant={
                        totalSplitPercentage === 100 ? "default" : "destructive"
                      }
                    >
                      Total: {totalSplitPercentage}%
                    </Badge>
                  </div>

                  {splits.map((split, index) => (
                    <Card key={index} className="p-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={split.name}
                            onChange={(e) =>
                              handleSplitChange(index, "name", e.target.value)
                            }
                            placeholder="Name"
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Percentage</Label>
                          <Input
                            type="number"
                            value={split.percentage}
                            onChange={(e) =>
                              handleSplitChange(
                                index,
                                "percentage",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="%"
                            className="h-8"
                            min={0}
                            max={100}
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <Label className="text-xs">Role</Label>
                            <Input
                              value={split.role}
                              onChange={(e) =>
                                handleSplitChange(index, "role", e.target.value)
                              }
                              placeholder="Role"
                              className="h-8"
                            />
                          </div>
                          {splits.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeSplit(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addSplit}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Participant
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">Validation Status</h3>

          <Card
            className={cn(
              "p-4",
              validation?.valid === true &&
                "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
              validation?.valid === false &&
                "border-red-500/50 bg-red-50/50 dark:bg-red-950/20",
              validation === null && "bg-muted/50",
            )}
          >
            {validation === null ? (
              <p className="text-sm text-muted-foreground">
                Fill in the contract details to validate
              </p>
            ) : validation.valid ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">All fields are valid</span>
              </div>
            ) : (
              <div className="space-y-2">
                {validation.errors.map((error, i) => (
                  <div key={i} className="flex items-start gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                ))}
              </div>
            )}

            {validation?.warnings && validation.warnings.length > 0 && (
              <div className="mt-3 pt-3 border-t space-y-2">
                {validation.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-amber-600"
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              <Eye className="h-4 w-4 mr-2" />
              {previewMutation.isPending ? "Generating..." : "Preview"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting || validation?.valid === false}
            >
              {isSubmitting ? "Creating..." : "Create Contract"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

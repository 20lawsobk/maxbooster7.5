// @ts-nocheck
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

export type TemplateType =
  | "release"
  | "post"
  | "listing"
  | "report"
  | "track"
  | "campaign"
  | "workflow";

export interface Template {
  id: string;
  name: string;
  description?: string;
  type: TemplateType;
  data: Record<string, any>;
  isDefault: boolean;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  tags?: string[];
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  type: TemplateType;
  data: Record<string, any>;
  isShared?: boolean;
  tags?: string[];
}

export interface ApplyTemplateResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface UseTemplateOptions {
  type?: TemplateType;
  onSuccess?: (template: Template) => void;
  onError?: (error: Error) => void;
}

export interface UseTemplateResult {
  templates: Template[];
  isLoading: boolean;
  error: Error | null;
  createTemplate: (input: CreateTemplateInput) => Promise<Template>;
  updateTemplate: (
    id: string,
    input: Partial<CreateTemplateInput>,
  ) => Promise<Template>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: (
    templateId: string,
    projectTitles: string[],
  ) => Promise<ApplyTemplateResult>;
  duplicateTemplate: (id: string, newName: string) => Promise<Template>;
  getTemplate: (id: string) => Template | undefined;
  saveAsTemplate: (
    name: string,
    type: TemplateType,
    items: unknown[],
  ) => Promise<Template>;
  isCreating: boolean;
  isApplying: boolean;
}

function normalizeTemplate(template: any): Template {
  return {
    id: template.id,
    name: template.name,
    description: template.description || undefined,
    type: template.category as TemplateType,
    data: template.templateData || {},
    isDefault: Boolean(template.isBuiltIn),
    isShared: Boolean(template.isBuiltIn),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    usageCount: template.usageCount || 0,
    tags: template.tags || template.templateData?.tags || [],
  };
}

function toStudioTemplatePayload(input: CreateTemplateInput) {
  return {
    name: input.name,
    description: input.description,
    category: input.type,
    templateData: input.data,
    tags: input.tags || [],
  };
}

function toStudioTemplateUpdatePayload(input: Partial<CreateTemplateInput>) {
  if (input.data !== undefined) {
    throw new Error(
      "Editing template configuration is not supported; create a new template instead",
    );
  }
  if (input.isShared !== undefined) {
    throw new Error("Template sharing settings cannot be changed");
  }
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.type !== undefined && { category: input.type }),
    ...(input.tags !== undefined && { tags: input.tags }),
  };
}

export function useTemplate(
  options: UseTemplateOptions = {},
): UseTemplateResult {
  const { type, onSuccess, onError } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isApplying, setIsApplying] = useState(false);

  const queryKey = type
    ? ["/api/studio/templates", type]
    : ["/api/studio/templates"];

  const {
    data: templates = [],
    isLoading,
    error,
  } = useQuery<Template[]>({
    queryKey,
    queryFn: async () => {
      const endpoint = type
        ? `/api/studio/templates?category=${encodeURIComponent(type)}`
        : "/api/studio/templates";
      const result = await apiRequest("GET", endpoint);
      return (result.templates || []).map(normalizeTemplate);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const result = await apiRequest(
        "POST",
        "/api/studio/templates",
        toStudioTemplatePayload(input),
      );
      return normalizeTemplate(result);
    },
    onSuccess: (template) => {
      queryClient?.invalidateQueries({ queryKey: ["/api/studio/templates"] });
      toast({
        title: "Template created",
        description: `"${template.name}" has been saved`,
      });
      onSuccess?.(template);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create template",
        description: error.message,
        variant: "destructive",
      });
      onError?.(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateTemplateInput>;
    }) => {
      const result = await apiRequest(
        "PATCH",
        `/api/studio/templates/${id}`,
        toStudioTemplateUpdatePayload(input),
      );
      return normalizeTemplate(result);
    },
    onSuccess: (template) => {
      queryClient?.invalidateQueries({ queryKey: ["/api/studio/templates"] });
      toast({
        title: "Template updated",
        description: `"${template.name}" has been updated`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/studio/templates/${id}`);
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/studio/templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTemplate = useCallback(
    async (input: CreateTemplateInput): Promise<Template> => {
      return createMutation?.mutateAsync(input);
    },
    [createMutation],
  );

  const updateTemplate = useCallback(
    async (
      id: string,
      input: Partial<CreateTemplateInput>,
    ): Promise<Template> => {
      return updateMutation?.mutateAsync({ id, input });
    },
    [updateMutation],
  );

  const deleteTemplate = useCallback(
    async (id: string): Promise<void> => {
      return deleteMutation?.mutateAsync(id);
    },
    [deleteMutation],
  );

  const applyTemplate = useCallback(
    async (
      templateId: string,
      projectTitles: string[],
    ): Promise<ApplyTemplateResult> => {
      setIsApplying(true);
      try {
        if (projectTitles.length === 0) {
          throw new Error("Provide at least one project title");
        }
        const settled = await Promise.allSettled(
          projectTitles.map((title) =>
            apiRequest(
              "POST",
              `/api/studio/templates/${templateId}/create-project`,
              { title },
            ),
          ),
        );
        const result: ApplyTemplateResult = {
          success: settled.flatMap((entry, index) =>
            entry.status === "fulfilled" ? [projectTitles[index]] : [],
          ),
          failed: settled.flatMap((entry, index) =>
            entry.status === "rejected"
              ? [
                  {
                    id: projectTitles[index],
                    error:
                      entry.reason instanceof Error
                        ? entry.reason.message
                        : "Failed to create project from template",
                  },
                ]
              : [],
          ),
        };

        if (result?.failed?.length === 0) {
          toast({
            title: "Template applied",
            description: `Applied to ${result?.success.length} item(s)`,
          });
        } else {
          toast({
            title: "Template partially applied",
            description: `${result?.success.length} succeeded, ${result?.failed.length} failed`,
            variant: "destructive",
          });
        }

        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        queryClient.invalidateQueries({
          queryKey: ["/api/studio/templates"],
        });
        return result;
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error("Failed to apply template");
        toast({
          title: "Failed to apply template",
          description: err.message,
          variant: "destructive",
        });
        throw err;
      } finally {
        setIsApplying(false);
      }
    },
    [queryClient, toast],
  );

  const duplicateTemplate = useCallback(
    async (id: string, newName: string): Promise<Template> => {
      const template = templates?.find((t: any) => t?.id === id);
      if (!template) throw new Error("Template not found");

      return createTemplate({
        name: newName,
        description: template.description,
        type: template.type,
        data: template.data,
        isShared: false,
        tags: template.tags,
      });
    },
    [templates, createTemplate],
  );

  const getTemplate = useCallback(
    (id: string): Template | undefined => {
      return templates?.find((t: any) => t?.id === id);
    },
    [templates],
  );

  const saveAsTemplate = useCallback(
    async (
      name: string,
      templateType: TemplateType,
      items: unknown[],
    ): Promise<Template> => {
      const commonFields = extractCommonFields(items);

      return createTemplate({
        name,
        type: templateType,
        data: commonFields,
        description: `Created from ${items?.length} selected item(s)`,
      });
    },
    [createTemplate],
  );

  return {
    templates,
    isLoading,
    error: error as Error | null,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
    duplicateTemplate,
    getTemplate,
    saveAsTemplate,
    isCreating: createMutation.isPending,
    isApplying,
  };
}

function extractCommonFields(items: unknown[]): Record<string, any> {
  if (items?.length === 0) return {};
  if (items?.length === 1) return { ...items[0] };

  const common: Record<string, any> = {};
  const firstItem = items[0];

  for (const key of Object.keys(firstItem)) {
    if (key === "id" || key === "createdAt" || key === "updatedAt") continue;

    const firstValue = firstItem[key];
    const allSame = items?.every(
      (item) => JSON.stringify(item[key]) === JSON.stringify(firstValue),
    );

    if (allSame) {
      common[key] = firstValue;
    }
  }

  return common;
}

export function useTemplateLibrary() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allTemplates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/studio/templates"],
    queryFn: async () => {
      const result = await apiRequest("GET", "/api/studio/templates");
      return (result.templates || []).map(normalizeTemplate);
    },
  });

  const templatesByType = allTemplates?.reduce<Record<TemplateType, Template[]>>(
    (acc: any, template: any) => {
      if (!acc[template?.type]) {
        acc[template.type] = [];
      }
      acc[template?.type].push(template);
      return acc;
    },
    {} as Record<TemplateType, Template[]>,
  );

  const defaultTemplates = allTemplates?.filter((t: any) => t?.isDefault);
  const sharedTemplates = allTemplates?.filter((t: any) => t?.isShared);
  const recentTemplates = [...allTemplates]
    .sort(
      (a, b) =>
        new Date(b?.updatedAt).getTime() - new Date(a?.updatedAt).getTime(),
    )
    .slice(0, 5);
  const popularTemplates = [...allTemplates]
    .sort((a, b) => b?.usageCount - a?.usageCount)
    .slice(0, 5);

  const importTemplate = async (file: File): Promise<Template> => {
    const raw = await file.text();
    let imported: CreateTemplateInput;
    try {
      imported = JSON.parse(raw) as CreateTemplateInput;
    } catch {
      throw new Error("The selected file is not valid template JSON");
    }
    if (
      !imported.name ||
      !imported.type ||
      !imported.data ||
      typeof imported.data !== "object"
    ) {
      throw new Error("The template file is missing required fields");
    }
    const result = normalizeTemplate(
      await apiRequest(
        "POST",
        "/api/studio/templates",
        toStudioTemplatePayload(imported),
      ),
    );

    queryClient?.invalidateQueries({ queryKey: ["/api/studio/templates"] });
    toast({
      title: "Template imported",
      description: `"${result.name}" has been imported`,
    });
    return result;
  };

  const exportTemplate = async (id: string): Promise<void> => {
    const template = allTemplates.find((item) => item.id === id);
    if (!template) throw new Error("Template not found");
    const blob = new Blob([JSON.stringify({
      name: template.name,
      description: template.description,
      type: template.type,
      data: template.data,
      tags: template.tags,
    }, null, 2)], { type: "application/json" });
    const url = URL?.createObjectURL(blob);
    const a = document?.createElement("a");
    a.href = url;
    a.download = `template-${id}.json`;
    a?.click();
    URL?.revokeObjectURL(url);
  };

  return {
    allTemplates,
    templatesByType,
    defaultTemplates,
    sharedTemplates,
    recentTemplates,
    popularTemplates,
    isLoading,
    importTemplate,
    exportTemplate,
  };
}

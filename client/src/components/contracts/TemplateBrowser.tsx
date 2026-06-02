import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Users,
  Shield,
  Music,
  DollarSign,
  Search,
  Crown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: string[];
  isPremium?: boolean;
}

interface TemplateBrowserProps {
  templates: ContractTemplate[];
  categories: string[];
  onSelect: (template: ContractTemplate) => void;
}

const categoryIcons: Record<string, React.ElementType> = {
  "Beat Licenses": Music,
  Legal: Shield,
  Collaboration: Users,
  Royalties: DollarSign,
  Licensing: FileText,
  Production: Sparkles,
};

const categoryDescriptions: Record<string, string> = {
  "Beat Licenses": "License agreements for beats and instrumentals",
  Legal: "NDAs, work-for-hire, and other legal documents",
  Collaboration: "Agreements for working with session musicians and engineers",
  Royalties: "Split sheets and royalty distribution agreements",
  Licensing: "Sync licensing and media use agreements",
  Production: "Producer agreements and production contracts",
};

export function TemplateBrowser({
  templates,
  categories,
  onSelect,
}: TemplateBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || FileText;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="all" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              All
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                className="flex items-center gap-1"
              >
                {getCategoryIcon(category)}
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <TabsContent value="all" className="mt-4">
          <div className="space-y-4">
            {categories.map((category) => {
              const categoryTemplates = filteredTemplates.filter(
                (t) => t.category === category,
              );
              if (categoryTemplates.length === 0) return null;

              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-3">
                    {getCategoryIcon(category)}
                    <h3 className="font-medium">{category}</h3>
                    <Badge variant="outline" className="ml-2">
                      {categoryTemplates.length}
                    </Badge>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {categoryTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onSelect={onSelect}
                        getCategoryIcon={getCategoryIcon}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {categories.map((category) => (
          <TabsContent key={category} value={category} className="mt-4">
            {categoryDescriptions[category] && (
              <p className="text-sm text-muted-foreground mb-4">
                {categoryDescriptions[category]}
              </p>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              {filteredTemplates
                .filter((t) => t.category === category)
                .map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={onSelect}
                    getCategoryIcon={getCategoryIcon}
                  />
                ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {filteredTemplates.length === 0 && (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium">No templates found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search or filter
          </p>
        </Card>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onSelect,
  getCategoryIcon,
}: {
  template: ContractTemplate;
  onSelect: (template: ContractTemplate) => void;
  getCategoryIcon: (category: string) => React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer hover:border-primary/50 transition-all hover:shadow-md",
        template.isPremium && "border-amber-500/30",
      )}
      onClick={() => onSelect(template)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {getCategoryIcon(template.category)}
            {template.name}
          </CardTitle>
          {template.isPremium && (
            <Badge
              variant="outline"
              className="text-amber-600 border-amber-500/50"
            >
              <Crown className="h-3 w-3 mr-1" />
              Pro
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs line-clamp-2 mt-1">
          {template.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="p-4 pt-2">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-muted-foreground">
            {template.variables.length} fields
          </span>
          <Button size="sm" variant="ghost" className="h-7">
            Use Template
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

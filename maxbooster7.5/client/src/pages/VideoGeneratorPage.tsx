import { useLocation } from "wouter";
import { ServerVideoGenerator } from "@/components/content/ServerVideoGenerator";
import { useToast } from "@/hooks/use-toast";
import { Video } from "lucide-react";

function useSearchParams() {
  const [location] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  return new URLSearchParams(search);
}

export default function VideoGeneratorPage() {
  const { toast } = useToast();
  const params = useSearchParams();

  const platform = params.get("platform") || "tiktok";
  const topic = params.get("topic") || "";
  const tone = params.get("tone") || "energetic";
  const artistName = params.get("artist_name") || "";
  const hook = params.get("hook") || "";
  const body = params.get("body") || "";
  const cta = params.get("cta") || "";
  const template = params.get("template") || "";
  const rawBg = params.get("bg_color") || "";
  const rawAc = params.get("accent_color") || "";

  // Normalise colors — ContentGenerator strips the '#', so add it back
  const normColor = (c: string) => {
    if (!c) return "";
    return c.startsWith("#") ? c : `#${c}`;
  };

  const bgColor = normColor(rawBg);
  const accentColor = normColor(rawAc);

  const handleVideoGenerated = (url: string) => {
    toast({
      title: "Video ready!",
      description: "Your promotional video has been generated.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Video className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">AI Video Studio</h1>
        </div>
        <ServerVideoGenerator
          platform={platform}
          topic={topic}
          tone={tone}
          goal="growth"
          artistName={artistName}
          initialHook={hook}
          initialBody={body}
          initialCta={cta}
          initialTemplate={template}
          initialBgColor={bgColor}
          initialAccentColor={accentColor}
          onVideoGenerated={handleVideoGenerated}
        />
      </div>
    </div>
  );
}

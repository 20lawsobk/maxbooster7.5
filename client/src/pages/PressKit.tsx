import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, uploadWithProgress } from "@/lib/queryClient";
import {
  Loader2,
  Plus,
  Trash2,
  Globe,
  Share2,
  Download,
  Eye,
  EyeOff,
  FileImage,
  User,
  Mail,
  Copy,
  Check,
  Instagram,
  Twitter,
  Youtube,
  Facebook,
  Music,
  Newspaper,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function PressKit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPreview, setIsPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const getPublicUrl = (slug?: string) =>
    slug ? `${window.location.origin}/epk/${slug}` : null;

  const handleShare = async () => {
    const url = getPublicUrl(pressKit?.slug);
    if (!url) {
      toast({
        title: "Not published",
        description: "Enable public visibility and save a custom slug first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast({
        title: "Link copied!",
        description: "Share this link with promoters and press.",
      });
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  const { data: pressKit, isLoading } = useQuery({
    queryKey: ["/api/press-kit"],
  });

  const updatePressKitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PUT", "/api/press-kit", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/press-kit"] });
      toast({
        title: "Success",
        description: "Press kit updated successfully",
      });
    },
  });

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    // Process complex fields
    const genres = (data.genres as string)
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const socialLinks = {
      instagram: data.instagram,
      twitter: data.twitter,
      youtube: data.youtube,
      facebook: data.facebook,
      spotify: data.spotify,
    };

    updatePressKitMutation.mutate({
      ...data,
      genres,
      socialLinks,
      isPublic: pressKit?.isPublic ?? false,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "press-kit");

      const res = (await uploadWithProgress(
        "/api/storage/upload",
        formData,
      )) as Record<string, unknown>;
      const photoUrl = res.file.url;

      const currentPhotos = (pressKit?.photos as unknown[]) || [];
      updatePressKitMutation.mutate({
        ...pressKit,
        photos: [...currentPhotos, { url: photoUrl, caption: "" }],
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Could not upload photo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    const currentPhotos = [...(pressKit?.photos as unknown[])];
    currentPhotos.splice(index, 1);
    updatePressKitMutation.mutate({ ...pressKit, photos: currentPhotos });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Press Kit (EPK)
            </h1>
            <p className="text-muted-foreground">
              Build and manage your professional Electronic Press Kit.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsPreview(!isPreview)}>
              {isPreview ? (
                <EyeOff className="mr-2 h-4 w-4" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              {isPreview ? "Edit Mode" : "Preview EPK"}
            </Button>
            {pressKit?.isPublic && pressKit?.slug && (
              <Button variant="outline" asChild>
                <a
                  href={`/epk/${pressKit.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  View Live
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button
              onClick={handleShare}
              variant={pressKit?.isPublic ? "default" : "outline"}
            >
              {copiedUrl ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              {copiedUrl ? "Copied!" : "Copy EPK Link"}
            </Button>
          </div>
        </div>

        {isPreview ? (
          <div className="space-y-8 bg-card rounded-lg border p-8 shadow-sm print:shadow-none print:border-none">
            {/* Public Preview Mode */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-full md:w-1/3">
                <div className="aspect-square bg-muted rounded-lg overflow-hidden flex items-center justify-center border">
                  {pressKit?.photos?.[0]?.url ? (
                    <img
                      src={pressKit.photos[0].url}
                      alt={pressKit.artistName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-20 w-20 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="w-full md:w-2/3 space-y-4">
                <h2 className="text-4xl font-bold">
                  {pressKit?.artistName || "Artist Name"}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {pressKit?.genres?.map((g: string) => (
                    <Badge key={g} variant="secondary">
                      {g}
                    </Badge>
                  ))}
                </div>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  {pressKit?.shortBio || "No short bio provided."}
                </p>
                <div className="flex gap-4">
                  {pressKit?.socialLinks?.instagram && (
                    <a href={pressKit.socialLinks.instagram} target="_blank">
                      <Instagram className="h-6 w-6" />
                    </a>
                  )}
                  {pressKit?.socialLinks?.twitter && (
                    <a href={pressKit.socialLinks.twitter} target="_blank">
                      <Twitter className="h-6 w-6" />
                    </a>
                  )}
                  {pressKit?.socialLinks?.youtube && (
                    <a href={pressKit.socialLinks.youtube} target="_blank">
                      <Youtube className="h-6 w-6" />
                    </a>
                  )}
                  {pressKit?.socialLinks?.spotify && (
                    <a href={pressKit.socialLinks.spotify} target="_blank">
                      <Music className="h-6 w-6" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-12 mt-12">
              <div className="md:col-span-2 space-y-8">
                <section>
                  <h3 className="text-2xl font-semibold mb-4 border-b pb-2">
                    Biography
                  </h3>
                  <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {pressKit?.bio || "No full biography provided."}
                  </p>
                </section>

                <section>
                  <h3 className="text-2xl font-semibold mb-4 border-b pb-2">
                    Photos
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {pressKit?.photos?.map(
                      (p: Record<string, unknown>, i: number) => (
                        <img
                          key={i}
                          src={p.url}
                          alt={`Press ${i}`}
                          className="rounded-lg border aspect-video object-cover"
                        />
                      ),
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <section>
                  <h3 className="text-xl font-semibold mb-4 border-b pb-2">
                    Booking & Contact
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Contact:</span>
                      <a
                        href={`mailto:${pressKit?.contactEmail}`}
                        className="text-sm text-primary underline"
                      >
                        {pressKit?.contactEmail}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Booking:</span>
                      <a
                        href={`mailto:${pressKit?.bookingEmail}`}
                        className="text-sm text-primary underline"
                      >
                        {pressKit?.bookingEmail}
                      </a>
                    </div>
                    {pressKit?.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={pressKit.website}
                          target="_blank"
                          className="text-sm text-primary underline"
                        >
                          {pressKit.website}
                        </a>
                      </div>
                    )}
                  </div>
                </section>

                {pressKit?.technicalRider && (
                  <section>
                    <h3 className="text-xl font-semibold mb-4 border-b pb-2">
                      Technical Assets
                    </h3>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const blob = new Blob([pressKit.technicalRider!], {
                          type: "text/plain",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "technical-rider.txt";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" /> Download Technical
                      Rider
                    </Button>
                  </section>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6 pt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Artist Information</CardTitle>
                    <CardDescription>
                      Essential details about your musical project.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="artistName">Artist/Band Name</Label>
                        <Input
                          id="artistName"
                          name="artistName"
                          defaultValue={pressKit?.artistName}
                          placeholder="Enter your stage name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="genres">Genres (comma separated)</Label>
                        <Input
                          id="genres"
                          name="genres"
                          defaultValue={pressKit?.genres?.join(", ")}
                          placeholder="Indie Rock, Dream Pop"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shortBio">
                        Short Pitch (One sentence)
                      </Label>
                      <Input
                        id="shortBio"
                        name="shortBio"
                        defaultValue={pressKit?.shortBio}
                        placeholder="Electronic duo from Seattle crafting melancholic soundscapes."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio">Full Biography</Label>
                      <Textarea
                        id="bio"
                        name="bio"
                        defaultValue={pressKit?.bio}
                        placeholder="Tell your story..."
                        className="min-h-[200px]"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">
                        General Contact Email
                      </Label>
                      <Input
                        id="contactEmail"
                        name="contactEmail"
                        type="email"
                        defaultValue={pressKit?.contactEmail}
                        placeholder="hello@artist.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bookingEmail">Booking Email</Label>
                      <Input
                        id="bookingEmail"
                        name="bookingEmail"
                        type="email"
                        defaultValue={pressKit?.bookingEmail}
                        placeholder="booking@artist.com"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="website">Official Website URL</Label>
                      <Input
                        id="website"
                        name="website"
                        type="url"
                        defaultValue={pressKit?.website}
                        placeholder="https://artist.com"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="media" className="space-y-6 pt-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Press Photos</CardTitle>
                      <CardDescription>
                        Upload high-resolution photos for promoters and press.
                      </CardDescription>
                    </div>
                    <div className="relative">
                      <Input
                        type="file"
                        id="photo-upload"
                        className="hidden"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        disabled={uploading}
                      />
                      <Label
                        htmlFor="photo-upload"
                        className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ${uploading ? "opacity-50" : ""}`}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Upload Photo
                      </Label>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {pressKit?.photos?.map(
                        (photo: Record<string, unknown>, index: number) => (
                          <div
                            key={index}
                            className="group relative aspect-square rounded-md overflow-hidden border"
                          >
                            <img
                              src={photo.url}
                              alt="Press"
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removePhoto(index)}
                              className="absolute top-2 right-2 p-1.5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ),
                      )}
                      {(!pressKit?.photos || pressKit.photos.length === 0) && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                          <FileImage className="h-12 w-12 mb-2 opacity-20" />
                          <p>No press photos uploaded yet.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="links" className="space-y-6 pt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Social Media & Streaming</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Instagram className="h-4 w-4" /> Instagram
                      </Label>
                      <Input
                        name="instagram"
                        defaultValue={pressKit?.socialLinks?.instagram}
                        placeholder="https://instagram.com/yourname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Twitter className="h-4 w-4" /> Twitter / X
                      </Label>
                      <Input
                        name="twitter"
                        defaultValue={pressKit?.socialLinks?.twitter}
                        placeholder="https://twitter.com/yourname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Youtube className="h-4 w-4" /> YouTube
                      </Label>
                      <Input
                        name="youtube"
                        defaultValue={pressKit?.socialLinks?.youtube}
                        placeholder="https://youtube.com/@yourchannel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Facebook className="h-4 w-4" /> Facebook
                      </Label>
                      <Input
                        name="facebook"
                        defaultValue={pressKit?.socialLinks?.facebook}
                        placeholder="https://facebook.com/yourpage"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="flex items-center gap-2">
                        <Music className="h-4 w-4" /> Spotify Artist Profile
                      </Label>
                      <Input
                        name="spotify"
                        defaultValue={pressKit?.socialLinks?.spotify}
                        placeholder="https://open.spotify.com/artist/..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="performance" className="space-y-6 pt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Live Performance Requirements</CardTitle>
                    <CardDescription>
                      Details for venues and festival organizers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="technicalRider">
                        Technical Rider / Stage Plot
                      </Label>
                      <Textarea
                        id="technicalRider"
                        name="technicalRider"
                        defaultValue={pressKit?.technicalRider}
                        placeholder="List your input list, monitor requirements, and stage needs..."
                        className="min-h-[150px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hospitality">Hospitality Rider</Label>
                      <Textarea
                        id="hospitality"
                        name="hospitality"
                        defaultValue={pressKit?.hospitality}
                        placeholder="Food/drink requirements, dressing room needs..."
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="p-4 bg-muted/30 rounded-lg border border-dashed space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Public Visibility</p>
                    <p className="text-xs text-muted-foreground">
                      When on, your EPK is viewable via a public link.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={pressKit?.isPublic ?? false}
                  onCheckedChange={(checked) =>
                    updatePressKitMutation.mutate({
                      ...pressKit,
                      isPublic: checked,
                    })
                  }
                />
              </div>

              {/* Custom Slug / URL */}
              <div className="space-y-1.5">
                <Label htmlFor="slug" className="text-xs font-medium">
                  Custom URL Slug
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center flex-1 border rounded-md overflow-hidden bg-background/60">
                    <span className="text-xs text-muted-foreground px-3 py-2 border-r bg-muted/30 whitespace-nowrap">
                      {window.location.origin}/epk/
                    </span>
                    <Input
                      id="slug"
                      name="slug"
                      defaultValue={pressKit?.slug}
                      placeholder="your-artist-name"
                      className="border-0 rounded-none h-9 text-sm font-mono focus-visible:ring-0"
                      pattern="[a-z0-9-]+"
                      title="Lowercase letters, numbers, and hyphens only"
                      onChange={(e) => {
                        e.target.value = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-");
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers and hyphens only. Will be applied
                  when you save.
                </p>
              </div>

              {pressKit?.isPublic && pressKit?.slug && (
                <div className="flex items-center gap-2 bg-background/60 rounded-md px-3 py-2 border">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-primary font-mono flex-1 truncate">
                    {getPublicUrl(pressKit.slug)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1.5"
                    onClick={handleShare}
                  >
                    {copiedUrl ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedUrl ? "Copied" : "Copy"}
                  </Button>
                </div>
              )}
              {pressKit?.isPublic && !pressKit?.slug && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <Newspaper className="h-3.5 w-3.5" />
                  Set a slug above and save to generate your public link.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-4 pb-12">
              <Button type="button" variant="ghost">
                Cancel Changes
              </Button>
              <Button type="submit" disabled={updatePressKitMutation.isPending}>
                {updatePressKitMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Press Kit
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}

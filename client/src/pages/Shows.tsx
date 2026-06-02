import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon,
  Plus,
  Ticket,
  MapPin,
  Clock,
  DollarSign,
  Users,
  MoreVertical,
  Edit,
  Trash2,
  CalendarDays,
  List as ListIcon,
  Music,
  ExternalLink,
  Radio,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  format,
  isPast,
  isFuture,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import type { Show, Setlist } from "@shared/schema";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Shows() {
  useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [setlistCreateDialog, setSetlistCreateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [pendingDeleteShowId, setPendingDeleteShowId] = useState<string | null>(
    null,
  );
  const [editingShow, setEditingShow] = useState<Show | null>(null);

  const [newShow, setNewShow] = useState({
    name: "",
    venue: "",
    city: "",
    country: "US",
    date: "",
    capacity: 0,
    ticketUrl: "",
    notes: "",
  });

  const [newSetlist, setNewSetlist] = useState({
    name: "",
    tracks: [] as { title: string; duration: string; notes: string }[],
  });
  const [newTrack, setNewTrack] = useState({
    title: "",
    duration: "",
    notes: "",
  });
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: showsData, isLoading } = useQuery<Show[]>({
    queryKey: ["/api/shows"],
  });

  const { data: statsData } = useQuery<{
    totalShows: number;
    totalRevenue: number;
    avgTicketsSold: number;
  }>({
    queryKey: ["/api/shows/stats"],
  });

  const createShowMutation = useMutation({
    mutationFn: async (data: typeof newShow) => {
      const res = await apiRequest("POST", "/api/shows", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows/stats"] });
      setShowCreateDialog(false);
      setNewShow({
        name: "",
        venue: "",
        city: "",
        country: "US",
        date: "",
        capacity: 0,
        ticketUrl: "",
        notes: "",
      });
      toast({
        title: "Show created",
        description: "Your performance has been scheduled.",
      });
    },
  });

  const deleteShowMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows/stats"] });
      toast({
        title: "Show deleted",
        description: "The show has been removed from your calendar.",
      });
    },
  });

  const { data: setlistsData = [] } = useQuery<Setlist[]>({
    queryKey: ["/api/shows/setlists"],
  });

  const createSetlistMutation = useMutation({
    mutationFn: async (data: typeof newSetlist) => {
      const res = await apiRequest("POST", "/api/shows/setlists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows/setlists"] });
      setSetlistCreateDialog(false);
      setNewSetlist({ name: "", tracks: [] });
      setNewTrack({ title: "", duration: "", notes: "" });
      toast({
        title: "Setlist created",
        description: "Your setlist is ready for performance.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create setlist.",
        variant: "destructive",
      });
    },
  });

  const deleteSetlistMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shows/setlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows/setlists"] });
      toast({ title: "Setlist deleted" });
    },
  });

  const upcomingShows =
    showsData?.filter((s) => isFuture(new Date(s.date))) || [];
  const pastShows = showsData?.filter((s) => isPast(new Date(s.date))) || [];

  return (
    <AppLayout title="Shows & Tour Management">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Ticket className="h-8 w-8 text-primary" />
              Shows & Tour
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your live performances, ticket sales, and setlists.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted p-1 rounded-lg">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <ListIcon className="h-4 w-4 mr-2" />
                List
              </Button>
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("calendar")}
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                Calendar
              </Button>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Show
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Show</DialogTitle>
                  <DialogDescription>
                    Enter the details for your upcoming performance.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Show Name / Tour Stop</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Summer Festival 2024"
                      value={newShow.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setNewShow({ ...newShow, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="venue">Venue</Label>
                      <Input
                        id="venue"
                        placeholder="Club Name"
                        value={newShow.venue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewShow({ ...newShow, venue: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="City"
                        value={newShow.city}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewShow({ ...newShow, city: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date & Time</Label>
                      <Input
                        id="date"
                        type="datetime-local"
                        value={newShow.date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewShow({ ...newShow, date: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="capacity">Capacity</Label>
                      <Input
                        id="capacity"
                        type="number"
                        value={newShow.capacity}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setNewShow({
                            ...newShow,
                            capacity: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticketUrl">Ticket URL</Label>
                    <Input
                      id="ticketUrl"
                      placeholder="https://..."
                      value={newShow.ticketUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setNewShow({ ...newShow, ticketUrl: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createShowMutation.mutate(newShow)}
                    disabled={
                      !newShow.name ||
                      !newShow.date ||
                      createShowMutation.isPending
                    }
                  >
                    {createShowMutation.isPending ? "Adding..." : "Add Show"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Upcoming Shows
              </CardTitle>
              <CalendarIcon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingShows.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${statsData?.totalRevenue?.toLocaleString() || "0"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Attendance
              </CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(statsData?.avgTicketsSold || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {viewMode === "calendar" && (
          <div className="space-y-4">
            {/* Calendar Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {format(calendarMonth, "MMMM yyyy")}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCalendarMonth(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Day Headers */}
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 border border-b-0 rounded-t-lg overflow-hidden min-w-[480px]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day) => (
                    <div
                      key={day}
                      className="px-2 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 text-center border-r last:border-r-0"
                    >
                      {day}
                    </div>
                  ),
                )}
              </div>

              {/* Calendar Grid */}
              {(() => {
                const monthStart = startOfMonth(calendarMonth);
                const monthEnd = endOfMonth(calendarMonth);
                const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
                const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
                const days = eachDayOfInterval({
                  start: calStart,
                  end: calEnd,
                });

                return (
                  <div className="grid grid-cols-7 border rounded-b-lg overflow-hidden min-w-[480px]">
                    {days.map((day, i) => {
                      const dayShows =
                        showsData?.filter((s) =>
                          isSameDay(new Date(s.date), day),
                        ) || [];
                      const isToday = isSameDay(day, new Date());
                      const isCurrentMonth = isSameMonth(day, calendarMonth);
                      return (
                        <div
                          key={i}
                          className={[
                            "min-h-[90px] p-1.5 border-r border-b last:border-r-0 text-xs",
                            !isCurrentMonth ? "bg-muted/20 opacity-50" : "",
                            isToday
                              ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                              : "",
                            (i + 1) % 7 === 0 ? "border-r-0" : "",
                          ].join(" ")}
                        >
                          <div
                            className={[
                              "font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full text-xs",
                              isToday
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {format(day, "d")}
                          </div>
                          <div className="space-y-0.5">
                            {dayShows.map((show) => (
                              <div
                                key={show.id}
                                className="rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate cursor-pointer hover:opacity-80"
                                style={{
                                  background: isPast(new Date(show.date))
                                    ? "#374151"
                                    : "#3b82f615",
                                  color: isPast(new Date(show.date))
                                    ? "#9ca3af"
                                    : "#3b82f6",
                                  border: `1px solid ${isPast(new Date(show.date)) ? "#374151" : "#3b82f630"}`,
                                }}
                                title={`${show.name} @ ${show.venue}`}
                                onClick={() => setEditingShow(show)}
                              >
                                <div className="truncate">{show.name}</div>
                                <div className="truncate text-muted-foreground">
                                  {format(new Date(show.date), "h:mm a")}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/30" />
                Upcoming
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[#374151] border border-[#374151]" />
                Past
              </div>
            </div>
          </div>
        )}

        <Tabs
          defaultValue="upcoming"
          className="space-y-4"
          style={{ display: viewMode === "calendar" ? "none" : undefined }}
        >
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past Shows</TabsTrigger>
            <TabsTrigger value="setlists">Setlists</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : upcomingShows.length === 0 ? (
              <Card className="p-12 text-center">
                <Ticket className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-medium">No upcoming shows</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  You haven't scheduled any upcoming shows yet. Time to hit the
                  stage!
                </p>
                <Button
                  className="mt-6"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule First Show
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingShows.map((show) => (
                  <Card
                    key={show.id}
                    className="overflow-hidden border-l-4 border-l-primary"
                  >
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-xl">{show.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {show.venue}, {show.city}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-primary/5">
                          Upcoming
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarIcon className="h-4 w-4" />
                          {format(new Date(show.date), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {format(new Date(show.date), "h:mm a")}
                        </div>
                      </div>

                      {show.capacity && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              Tickets Sold
                            </span>
                            <span>
                              {show.ticketsSold} / {show.capacity}
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-primary h-full transition-all"
                              style={{
                                width: `${Math.min(100, ((show.ticketsSold || 0) / show.capacity) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="bg-muted/30 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        onClick={() =>
                          setLocation(
                            `/show?id=${show.id}&name=${encodeURIComponent(show.name)}`,
                          )
                        }
                      >
                        <Radio className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                        Go Live
                      </Button>
                      {show.ticketUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={show.ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingShow(show)}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Show
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setPendingDeleteShowId(show.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Show
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past">
            <div className="space-y-4">
              {pastShows.map((show) => (
                <Card
                  key={show.id}
                  className="flex flex-col md:flex-row items-center p-4 gap-4 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="bg-muted h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CalendarIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="font-bold">{show.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {show.venue} • {show.city} •{" "}
                      {format(new Date(show.date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Revenue
                      </p>
                      <p className="font-bold text-green-600">
                        ${show.revenue?.toLocaleString() || "0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Attendance
                      </p>
                      <p className="font-bold">{show.ticketsSold}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingDeleteShowId(show.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </Card>
              ))}
              {pastShows.length === 0 && (
                <p className="text-center py-12 text-muted-foreground">
                  No past shows found.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="setlists">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {setlistsData.length} setlist
                  {setlistsData.length !== 1 ? "s" : ""}
                </p>
                <Dialog
                  open={setlistCreateDialog}
                  onOpenChange={setSetlistCreateDialog}
                >
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Setlist
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Setlist</DialogTitle>
                      <DialogDescription>
                        Build a setlist for your upcoming performance.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1">
                        <Label htmlFor="setlist-name">Setlist Name</Label>
                        <Input
                          id="setlist-name"
                          placeholder="e.g. Summer Tour 2025 Main Set"
                          value={newSetlist.name}
                          onChange={(e) =>
                            setNewSetlist((s) => ({
                              ...s,
                              name: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tracks</Label>
                        {newSetlist.tracks.length > 0 && (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                            {newSetlist.tracks.map((t, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between px-3 py-2 rounded-md bg-muted text-sm"
                              >
                                <span className="font-medium">{t.title}</span>
                                <div className="flex items-center gap-2">
                                  {t.duration && (
                                    <span className="text-muted-foreground text-xs">
                                      {t.duration}
                                    </span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() =>
                                      setNewSetlist((s) => ({
                                        ...s,
                                        tracks: s.tracks.filter(
                                          (_, j) => j !== i,
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Track title"
                            value={newTrack.title}
                            onChange={(e) =>
                              setNewTrack((t) => ({
                                ...t,
                                title: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newTrack.title.trim()) {
                                setNewSetlist((s) => ({
                                  ...s,
                                  tracks: [...s.tracks, { ...newTrack }],
                                }));
                                setNewTrack({
                                  title: "",
                                  duration: "",
                                  notes: "",
                                });
                              }
                            }}
                          />
                          <Input
                            placeholder="Duration"
                            className="w-24"
                            value={newTrack.duration}
                            onChange={(e) =>
                              setNewTrack((t) => ({
                                ...t,
                                duration: e.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              if (!newTrack.title.trim()) return;
                              setNewSetlist((s) => ({
                                ...s,
                                tracks: [...s.tracks, { ...newTrack }],
                              }));
                              setNewTrack({
                                title: "",
                                duration: "",
                                notes: "",
                              });
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Press Enter or click + to add a track
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setSetlistCreateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createSetlistMutation.mutate(newSetlist)}
                        disabled={
                          !newSetlist.name.trim() ||
                          createSetlistMutation.isPending
                        }
                      >
                        {createSetlistMutation.isPending
                          ? "Creating…"
                          : "Create Setlist"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {setlistsData.length === 0 ? (
                <Card className="p-12 text-center">
                  <Music className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <h3 className="text-xl font-medium">No setlists yet</h3>
                  <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                    Create your first setlist to organize tracks for your live
                    performances.
                  </p>
                  <Button
                    className="mt-6"
                    onClick={() => setSetlistCreateDialog(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Setlist
                  </Button>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {setlistsData.map((sl) => {
                    const tracks =
                      (sl.tracks as { title: string; duration?: string }[]) ||
                      [];
                    return (
                      <Card key={sl.id} className="flex flex-col">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">
                                {sl.name}
                              </CardTitle>
                              <CardDescription>
                                {tracks.length} track
                                {tracks.length !== 1 ? "s" : ""}
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                deleteSetlistMutation.mutate(sl.id)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                          {tracks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No tracks added yet.
                            </p>
                          ) : (
                            <ol className="space-y-1">
                              {tracks.slice(0, 5).map((t, i) => (
                                <li
                                  key={i}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-4 text-right">
                                      {i + 1}.
                                    </span>
                                    {t.title}
                                  </span>
                                  {t.duration && (
                                    <span className="text-xs text-muted-foreground">
                                      {t.duration}
                                    </span>
                                  )}
                                </li>
                              ))}
                              {tracks.length > 5 && (
                                <li className="text-xs text-muted-foreground pl-6">
                                  +{tracks.length - 5} more tracks
                                </li>
                              )}
                            </ol>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!pendingDeleteShowId}
          onOpenChange={(open) => !open && setPendingDeleteShowId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Show</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this show? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDeleteShowId) {
                    deleteShowMutation.mutate(pendingDeleteShowId);
                    setPendingDeleteShowId(null);
                  }
                }}
              >
                Delete Show
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Show Dialog */}
        {editingShow && (
          <Dialog
            open={!!editingShow}
            onOpenChange={(open) => !open && setEditingShow(null)}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Show</DialogTitle>
                <DialogDescription>
                  Update the details for this performance.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Show Name</Label>
                  <Input
                    value={editingShow.name}
                    onChange={(e) =>
                      setEditingShow({ ...editingShow, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Venue</Label>
                    <Input
                      value={editingShow.venue || ""}
                      onChange={(e) =>
                        setEditingShow({
                          ...editingShow,
                          venue: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={editingShow.city || ""}
                      onChange={(e) =>
                        setEditingShow({ ...editingShow, city: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={
                      editingShow.date
                        ? new Date(editingShow.date).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setEditingShow({ ...editingShow, date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ticket URL</Label>
                  <Input
                    value={editingShow.ticketUrl || ""}
                    placeholder="https://..."
                    onChange={(e) =>
                      setEditingShow({
                        ...editingShow,
                        ticketUrl: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingShow(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await apiRequest(
                        "PATCH",
                        `/api/shows/${editingShow.id}`,
                        {
                          name: editingShow.name,
                          venue: editingShow.venue,
                          city: editingShow.city,
                          date: editingShow.date,
                          ticketUrl: editingShow.ticketUrl,
                        },
                      );
                      queryClient.invalidateQueries({
                        queryKey: ["/api/shows"],
                      });
                      setEditingShow(null);
                      toast({
                        title: "Show updated",
                        description: "Your show details have been saved.",
                      });
                    } catch {
                      toast({
                        title: "Error",
                        description: "Failed to update show.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AppLayout>
  );
}

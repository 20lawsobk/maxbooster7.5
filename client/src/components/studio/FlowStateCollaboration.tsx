import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  MessageSquare,
  Send,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Settings,
  Link,
  Copy,
  Check,
  Circle,
  MousePointer2,
  Eye,
  EyeOff,
  Crown,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'active' | 'idle' | 'away' | 'offline';
  cursor?: { x: number; y: number; trackId?: string };
  color: string;
  isRecording?: boolean;
  lastActive: Date;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  content: string;
  timestamp: Date;
  type: 'message' | 'system' | 'action';
}

interface FlowStateCollaborationProps {
  projectId?: string;
  currentUserId?: string;
  className?: string;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', 
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#06b6d4'
];

export function FlowStateCollaboration({
  projectId = 'project-123',
  currentUserId = 'user-1',
  className
}: FlowStateCollaborationProps) {
  const { toast } = useToast();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([
    {
      id: 'user-1',
      name: 'You',
      email: 'you@example.com',
      role: 'owner',
      status: 'active',
      color: COLORS[0],
      cursor: { x: 450, y: 200 },
      lastActive: new Date()
    },
    {
      id: 'user-2',
      name: 'Alex Producer',
      email: 'alex@example.com',
      avatar: '',
      role: 'editor',
      status: 'active',
      color: COLORS[1],
      cursor: { x: 650, y: 180, trackId: 'track-2' },
      isRecording: true,
      lastActive: new Date()
    },
    {
      id: 'user-3',
      name: 'Sam Mixer',
      email: 'sam@example.com',
      role: 'editor',
      status: 'idle',
      color: COLORS[2],
      cursor: { x: 300, y: 250, trackId: 'track-4' },
      lastActive: new Date(Date.now() - 300000)
    },
    {
      id: 'user-4',
      name: 'Jordan Artist',
      email: 'jordan@example.com',
      role: 'viewer',
      status: 'away',
      color: COLORS[3],
      lastActive: new Date(Date.now() - 900000)
    }
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      userId: 'user-2',
      userName: 'Alex Producer',
      userColor: COLORS[1],
      content: 'Hey, I think the kick needs more punch around 60Hz',
      timestamp: new Date(Date.now() - 120000),
      type: 'message'
    },
    {
      id: 'm2',
      userId: 'system',
      userName: 'System',
      userColor: '#666',
      content: 'Sam Mixer joined the session',
      timestamp: new Date(Date.now() - 60000),
      type: 'system'
    },
    {
      id: 'm3',
      userId: 'user-3',
      userName: 'Sam Mixer',
      userColor: COLORS[2],
      content: 'On it! Also checking the sidechain compression',
      timestamp: new Date(Date.now() - 30000),
      type: 'message'
    }
  ]);

  const [newMessage, setNewMessage] = useState('');
  const [showCursors, setShowCursors] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [shareLink, setShareLink] = useState(`${window.location.origin}/collab/${projectId}`);
  const [linkCopied, setLinkCopied] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = () => {
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: `m${Date.now()}`,
      userId: currentUserId,
      userName: 'You',
      userColor: COLORS[0],
      content: newMessage,
      timestamp: new Date(),
      type: 'message'
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');
  };

  const inviteCollaborator = () => {
    if (!inviteEmail.trim()) return;

    toast({
      title: 'Invitation sent',
      description: `${inviteEmail} has been invited as ${inviteRole}`
    });
    setInviteEmail('');
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    toast({ title: 'Link copied to clipboard' });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const changeRole = (userId: string, newRole: Collaborator['role']) => {
    setCollaborators(prev => prev.map(c =>
      c.id === userId ? { ...c, role: newRole } : c
    ));
    const user = collaborators.find(c => c.id === userId);
    toast({ title: `${user?.name}'s role changed to ${newRole}` });
  };

  const removeCollaborator = (userId: string) => {
    const user = collaborators.find(c => c.id === userId);
    setCollaborators(prev => prev.filter(c => c.id !== userId));
    
    const systemMessage: ChatMessage = {
      id: `m${Date.now()}`,
      userId: 'system',
      userName: 'System',
      userColor: '#666',
      content: `${user?.name} was removed from the session`,
      timestamp: new Date(),
      type: 'system'
    };
    setMessages(prev => [...prev, systemMessage]);
  };

  const getStatusColor = (status: Collaborator['status']): string => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'away': return 'bg-orange-500';
      case 'offline': return 'bg-zinc-500';
    }
  };

  const getRoleIcon = (role: Collaborator['role']) => {
    switch (role) {
      case 'owner': return <Crown className="w-3 h-3 text-yellow-400" />;
      case 'editor': return <MousePointer2 className="w-3 h-3 text-blue-400" />;
      case 'viewer': return <Eye className="w-3 h-3 text-zinc-400" />;
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activeCollaborators = collaborators.filter(c => c.status !== 'offline');

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-lg">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="font-semibold">Real-Time Collaboration</h2>
            <p className="text-xs text-zinc-500">
              {activeCollaborators.length} active collaborators
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Presence Avatars */}
          <div className="flex -space-x-2 mr-2">
            {activeCollaborators.slice(0, 4).map(collab => (
              <div key={collab.id} className="relative">
                <Avatar className="w-8 h-8 border-2 border-zinc-950">
                  <AvatarImage src={collab.avatar} />
                  <AvatarFallback style={{ backgroundColor: collab.color }}>
                    {collab.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950",
                  getStatusColor(collab.status)
                )} />
              </div>
            ))}
            {activeCollaborators.length > 4 && (
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs border-2 border-zinc-950">
                +{activeCollaborators.length - 4}
              </div>
            )}
          </div>
          <Badge variant="outline" className="text-violet-400 border-violet-400/30">
            Live Session
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Collaborators */}
        <div className="w-72 border-r border-zinc-800 flex flex-col">
          <Tabs defaultValue="people" className="flex-1 flex flex-col">
            <TabsList className="m-2 bg-zinc-900">
              <TabsTrigger value="people" className="flex-1">
                <Users className="w-4 h-4 mr-1" />
                People
              </TabsTrigger>
              <TabsTrigger value="invite" className="flex-1">
                <UserPlus className="w-4 h-4 mr-1" />
                Invite
              </TabsTrigger>
            </TabsList>

            <TabsContent value="people" className="flex-1 overflow-auto m-0 p-2">
              <div className="space-y-2">
                {collaborators.map(collab => (
                  <Card
                    key={collab.id}
                    className="bg-zinc-900 border-zinc-800 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={collab.avatar} />
                          <AvatarFallback style={{ backgroundColor: collab.color }}>
                            {collab.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-900",
                          getStatusColor(collab.status)
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {collab.name}
                            {collab.id === currentUserId && ' (You)'}
                          </span>
                          {getRoleIcon(collab.role)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {collab.role}
                          </Badge>
                          {collab.isRecording && (
                            <Badge className="bg-red-500/20 text-red-400 text-xs animate-pulse">
                              Recording
                            </Badge>
                          )}
                        </div>
                        {collab.cursor?.trackId && (
                          <p className="text-xs text-zinc-500 mt-1">
                            Working on: {collab.cursor.trackId}
                          </p>
                        )}
                      </div>
                    </div>

                    {collab.id !== currentUserId && collab.role !== 'owner' && (
                      <div className="flex gap-1 mt-2 pt-2 border-t border-zinc-800">
                        <Select
                          value={collab.role}
                          onValueChange={(v) => changeRole(collab.id, v as Collaborator['role'])}
                        >
                          <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-400"
                          onClick={() => removeCollaborator(collab.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="invite" className="m-0 p-4 space-y-4">
              {/* Invite by Email */}
              <div className="space-y-2">
                <Label className="text-sm">Invite by Email</Label>
                <Input
                  type="email"
                  placeholder="collaborator@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-zinc-900 border-zinc-700"
                />
                <div className="flex gap-2">
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'editor' | 'viewer')}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Can Edit</SelectItem>
                      <SelectItem value="viewer">View Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={inviteCollaborator} disabled={!inviteEmail.trim()}>
                    <Send className="w-4 h-4 mr-1" />
                    Invite
                  </Button>
                </div>
              </div>

              {/* Share Link */}
              <div className="space-y-2 pt-4 border-t border-zinc-800">
                <Label className="text-sm">Share Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={shareLink}
                    readOnly
                    className="bg-zinc-900 border-zinc-700 text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={copyShareLink}
                  >
                    {linkCopied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">
                  Anyone with this link can join as viewer
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Settings */}
          <div className="p-3 border-t border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Show Cursors</Label>
              <Switch checked={showCursors} onCheckedChange={setShowCursors} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Show Chat</Label>
              <Switch checked={showChat} onCheckedChange={setShowChat} />
            </div>
          </div>
        </div>

        {/* Main Area - Workspace Preview + Chat */}
        <div className="flex-1 flex flex-col">
          {/* Workspace Preview with Cursors */}
          <div className="flex-1 relative bg-zinc-900 m-4 rounded-lg overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
            
            {/* Mock timeline tracks */}
            <div className="absolute inset-4 space-y-2">
              {['Vocals', 'Drums', 'Bass', 'Keys', 'Guitar'].map((name, idx) => (
                <div
                  key={name}
                  className="h-12 bg-zinc-800/50 rounded flex items-center px-3 gap-2"
                >
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    ['bg-pink-500', 'bg-orange-500', 'bg-purple-500', 'bg-blue-500', 'bg-amber-500'][idx]
                  )} />
                  <span className="text-xs text-zinc-400">{name}</span>
                  <div className="flex-1 mx-4 h-6 bg-zinc-700/50 rounded" />
                </div>
              ))}
            </div>

            {/* Collaborator Cursors */}
            {showCursors && collaborators.filter(c => c.cursor && c.id !== currentUserId && c.status === 'active').map(collab => (
              <motion.div
                key={collab.id}
                className="absolute pointer-events-none z-10"
                animate={{
                  x: collab.cursor?.x || 0,
                  y: collab.cursor?.y || 0
                }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                <div className="relative">
                  <MousePointer2
                    className="w-5 h-5 -rotate-12"
                    style={{ color: collab.color, fill: collab.color }}
                  />
                  <div
                    className="absolute top-5 left-3 px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                    style={{ backgroundColor: collab.color }}
                  >
                    {collab.name}
                    {collab.isRecording && (
                      <span className="ml-1 inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            <div className="absolute bottom-4 left-4 text-xs text-zinc-500">
              Live collaboration workspace preview
            </div>
          </div>

          {/* Chat Panel */}
          {showChat && (
            <div className="h-64 border-t border-zinc-800 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                <h4 className="text-sm font-medium">Session Chat</h4>
                <Badge variant="secondary" className="text-xs">
                  {messages.length} messages
                </Badge>
              </div>

              <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn(
                        msg.type === 'system' && "text-center text-xs text-zinc-500"
                      )}
                    >
                      {msg.type === 'message' ? (
                        <div className="flex items-start gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: msg.userColor }}
                          >
                            {msg.userName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{msg.userName}</span>
                              <span className="text-xs text-zinc-500">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-zinc-300">{msg.content}</p>
                          </div>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-3 border-t border-zinc-800 flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  className="bg-zinc-900 border-zinc-700"
                />
                <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateCollaboration;

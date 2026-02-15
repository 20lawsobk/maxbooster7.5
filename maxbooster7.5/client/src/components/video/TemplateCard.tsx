import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Star, Lock, Sparkles } from 'lucide-react';
import type { TemplateMetadata } from '@/lib/video/templates';

interface TemplateCardProps {
  template: TemplateMetadata;
  isSelected?: boolean;
  onSelect: (template: TemplateMetadata) => void;
}

export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      announcement: 'bg-blue-500/20 text-blue-400',
      event: 'bg-purple-500/20 text-purple-400',
      content: 'bg-green-500/20 text-green-400',
      engagement: 'bg-orange-500/20 text-orange-400',
      comparison: 'bg-pink-500/20 text-pink-400',
    };
    return colors[category] || 'bg-gray-500/20 text-gray-400';
  };

  const getGradient = (type: string) => {
    const gradients: Record<string, string> = {
      release: 'from-indigo-600 via-purple-600 to-pink-600',
      tour: 'from-orange-500 via-red-500 to-pink-500',
      bts: 'from-emerald-500 via-teal-500 to-cyan-500',
      quote: 'from-violet-500 via-purple-500 to-fuchsia-500',
      countdown: 'from-blue-500 via-indigo-500 to-purple-500',
      split: 'from-rose-500 via-pink-500 to-fuchsia-500',
      teaser: 'from-amber-500 via-orange-500 to-red-500',
    };
    return gradients[type] || 'from-gray-500 via-gray-600 to-gray-700';
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Card
        className={`relative cursor-pointer overflow-hidden transition-all duration-300 group ${
          isSelected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/20'
            : 'hover:shadow-xl hover:shadow-black/20'
        }`}
        onClick={() => onSelect(template)}
      >
        <div className={`relative h-40 bg-gradient-to-br ${getGradient(template.type)} overflow-hidden`}>
          <div className="absolute inset-0 bg-black/20" />
          
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              whileHover={{ scale: 1.1 }}
            >
              <Play className="w-8 h-8 text-white ml-1" />
            </motion.div>
          </div>

          <div className="absolute top-3 left-3 flex gap-2">
            {template.isNew && (
              <Badge className="bg-emerald-500 text-white text-xs px-2 py-0.5">
                <Sparkles className="w-3 h-3 mr-1" />
                New
              </Badge>
            )}
            {template.isPremium && (
              <Badge className="bg-amber-500 text-black text-xs px-2 py-0.5">
                <Lock className="w-3 h-3 mr-1" />
                Pro
              </Badge>
            )}
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs text-white font-medium">{template.popularity}%</span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground line-clamp-1">{template.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant="secondary" className={getCategoryColor(template.category)}>
              {template.category}
            </Badge>
            <span className="text-xs text-muted-foreground">{template.defaultDuration}s</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {template.supportedAspectRatios.slice(0, 3).map((ratio) => (
              <span
                key={ratio}
                className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {ratio}
              </span>
            ))}
            {template.supportedAspectRatios.length > 3 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                +{template.supportedAspectRatios.length - 3}
              </span>
            )}
          </div>
        </div>

        {isSelected && (
          <motion.div
            className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </Card>
    </motion.div>
  );
}

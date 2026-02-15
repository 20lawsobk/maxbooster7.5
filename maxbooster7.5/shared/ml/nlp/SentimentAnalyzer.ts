/**
 * Sentiment Analysis Service for Max Booster
 * 100% in-house implementation - no external APIs
 * Features: lexicon-based analysis, aspect-based sentiment, emotion detection, toxicity detection
 */

export type Emotion = 'happy' | 'sad' | 'angry' | 'excited' | 'calm';
export type SentimentLabel = 'positive' | 'negative' | 'neutral';
export type ToxicityLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  confidence: number;
  breakdown: {
    positiveWords: string[];
    negativeWords: string[];
    neutralWords: string[];
    negations: string[];
  };
}

export interface AspectSentiment {
  aspect: string;
  label: SentimentLabel;
  score: number;
  confidence: number;
  mentions: string[];
}

export interface EmotionResult {
  primary: Emotion;
  scores: Record<Emotion, number>;
  confidence: number;
  emotionalIntensity: number;
}

export interface ToxicityResult {
  isToxic: boolean;
  level: ToxicityLevel;
  score: number;
  confidence: number;
  flaggedTerms: string[];
  categories: {
    profanity: number;
    harassment: number;
    hate: number;
    threat: number;
    spam: number;
  };
}

export interface FullAnalysisResult {
  sentiment: SentimentResult;
  emotions: EmotionResult;
  toxicity: ToxicityResult;
  aspects: AspectSentiment[];
  overallConfidence: number;
}

const AFINN_LEXICON: Record<string, number> = {
  'abandon': -2, 'abandoned': -2, 'abandons': -2, 'abuse': -3, 'abused': -3,
  'abuses': -3, 'abusive': -3, 'accept': 1, 'accepted': 1, 'accepting': 1,
  'accomplish': 2, 'accomplished': 2, 'ache': -2, 'aching': -2, 'admire': 3,
  'admired': 3, 'adore': 3, 'adored': 3, 'adoring': 3, 'adorable': 3,
  'advance': 1, 'advanced': 1, 'adventure': 2, 'afraid': -2, 'against': -1,
  'aggravate': -2, 'aggravated': -2, 'aggressive': -2, 'agony': -3, 'agree': 1,
  'agreed': 1, 'agreeable': 2, 'alarmed': -2, 'alert': -1, 'alone': -2,
  'amazed': 2, 'amazing': 4, 'ambitious': 2, 'amused': 2, 'amusing': 2,
  'anger': -3, 'angry': -3, 'anguish': -3, 'animated': 1, 'annoy': -2,
  'annoyed': -2, 'annoying': -2, 'antagonistic': -2, 'anxious': -2, 'apathy': -2,
  'apologize': -1, 'appalled': -2, 'appreciate': 2, 'appreciated': 2, 'appreciation': 2,
  'apprehensive': -2, 'approve': 2, 'approved': 2, 'ardent': 2, 'arrogant': -2,
  'ashamed': -2, 'ass': -4, 'asshole': -4, 'astonished': 2, 'attracted': 1,
  'attractive': 2, 'awesome': 4, 'awful': -3, 'awkward': -2, 'bad': -3,
  'badly': -3, 'balanced': 1, 'bastard': -5, 'battle': -1, 'beaten': -2,
  'beautiful': 3, 'beauty': 3, 'beloved': 3, 'benefit': 2, 'benefited': 2,
  'benefits': 2, 'best': 3, 'better': 2, 'big': 1, 'bitch': -5,
  'bitter': -2, 'bizarre': -2, 'blame': -2, 'blamed': -2, 'blast': 1,
  'bleak': -2, 'bless': 2, 'blessed': 3, 'blessing': 3, 'blind': -1,
  'block': -1, 'blocked': -1, 'bloody': -3, 'blunder': -2, 'bold': 2,
  'bored': -2, 'boring': -3, 'bother': -2, 'bothered': -2, 'brave': 2,
  'break': -1, 'breakthrough': 3, 'breathtaking': 5, 'bright': 2, 'brilliant': 4,
  'broke': -1, 'broken': -2, 'brutal': -3, 'bullshit': -4, 'bully': -3,
  'burden': -2, 'calm': 2, 'calming': 2, 'can\'t': -1, 'cancel': -1,
  'cancelled': -1, 'capable': 1, 'captivating': 3, 'care': 2, 'careful': 2,
  'careless': -2, 'caring': 2, 'casual': 0, 'celebrate': 3, 'celebrated': 3,
  'celebration': 3, 'certain': 1, 'challenge': 1, 'challenged': -1, 'champion': 2,
  'change': 0, 'chaos': -2, 'chaotic': -2, 'charm': 2, 'charming': 3,
  'cheat': -3, 'cheated': -3, 'cheater': -3, 'cheer': 2, 'cheerful': 2,
  'cheers': 2, 'cherish': 2, 'cherished': 2, 'chill': 1, 'chilling': -1,
  'classic': 2, 'clean': 2, 'clear': 1, 'clever': 2, 'clueless': -2,
  'cold': -1, 'collapse': -2, 'comfortable': 2, 'commit': 1, 'committed': 1,
  'compelling': 2, 'competent': 2, 'complain': -2, 'complained': -2, 'complete': 1,
  'complex': 0, 'compliment': 2, 'concerned': -1, 'condemn': -2, 'confidence': 2,
  'confident': 2, 'conflict': -2, 'confuse': -2, 'confused': -2, 'confusing': -2,
  'congratulate': 2, 'congratulations': 3, 'connect': 1, 'connected': 1, 'conquer': 2,
  'content': 2, 'convince': 1, 'convinced': 1, 'cool': 1, 'corrupt': -3,
  'coward': -2, 'cowardly': -2, 'crap': -3, 'crash': -2, 'crashed': -2,
  'crazy': 1, 'create': 1, 'creative': 2, 'creepy': -2, 'crisis': -3,
  'critical': -2, 'criticize': -2, 'criticized': -2, 'cruel': -3, 'crush': -1,
  'crushed': -2, 'cry': -2, 'crying': -2, 'curious': 1, 'curse': -2,
  'cute': 2, 'damn': -2, 'damage': -2, 'damaged': -2, 'danger': -2,
  'dangerous': -2, 'daring': 2, 'dark': -1, 'dead': -3, 'deadly': -3,
  'dear': 2, 'death': -3, 'deceive': -3, 'deceived': -3, 'decent': 2,
  'dedication': 2, 'defeat': -2, 'defeated': -2, 'defend': 1, 'delay': -1,
  'delayed': -1, 'delicate': 1, 'delicious': 3, 'delight': 3, 'delighted': 3,
  'delightful': 3, 'demand': -1, 'denied': -2, 'deny': -2, 'depressed': -3,
  'depressing': -3, 'depression': -3, 'deserve': 2, 'deserved': 2, 'desire': 1,
  'despair': -3, 'desperate': -3, 'destroy': -3, 'destroyed': -3, 'destruction': -3,
  'determined': 2, 'devastated': -3, 'devastating': -3, 'devoted': 2, 'die': -3,
  'died': -3, 'different': 0, 'difficult': -1, 'dignity': 2, 'dirty': -2,
  'disabled': -1, 'disappear': -1, 'disappointed': -2, 'disappointing': -2, 'disappointment': -2,
  'disaster': -3, 'disastrous': -3, 'disbelief': -2, 'discomfort': -2, 'discouraged': -2,
  'discover': 2, 'discovered': 2, 'discovery': 2, 'disgrace': -3, 'disgraced': -3,
  'disgust': -3, 'disgusted': -3, 'disgusting': -3, 'dishonest': -3, 'dislike': -2,
  'disliked': -2, 'dismiss': -1, 'dismissed': -1, 'disorder': -2, 'disrespect': -2,
  'dissatisfied': -2, 'distress': -2, 'distressed': -2, 'disturb': -2, 'disturbed': -2,
  'disturbing': -2, 'divine': 3, 'dominate': -1, 'dominated': -1, 'doom': -3,
  'doomed': -3, 'dope': 3, 'doubt': -1, 'doubted': -1, 'doubtful': -1,
  'downer': -2, 'dread': -2, 'dream': 1, 'dreams': 1, 'dreamy': 2,
  'drop': 1, 'drown': -2, 'drowned': -2, 'dull': -2, 'dumb': -3,
  'dump': -1, 'dumped': -2, 'dynamic': 2, 'eager': 2, 'ease': 2,
  'easy': 1, 'ecstatic': 4, 'effective': 2, 'efficient': 2, 'effort': 1,
  'elegant': 3, 'embarrass': -2, 'embarrassed': -2, 'embarrassing': -2, 'embrace': 1,
  'emotion': 1, 'emotional': 1, 'empathy': 2, 'empower': 2, 'empowered': 2,
  'empowering': 2, 'empty': -1, 'encourage': 2, 'encouraged': 2, 'encouraging': 2,
  'endure': 1, 'enemy': -2, 'energetic': 2, 'energy': 2, 'engage': 1,
  'engaged': 1, 'engaging': 2, 'enjoy': 2, 'enjoyed': 2, 'enjoying': 2,
  'enjoyment': 2, 'enlighten': 2, 'enlightened': 2, 'enormous': 1, 'enrage': -3,
  'enraged': -3, 'enthusiasm': 3, 'enthusiastic': 3, 'envious': -2, 'envy': -2,
  'epic': 3, 'equal': 1, 'error': -2, 'escape': 0, 'essential': 2,
  'eternal': 2, 'evil': -3, 'exaggerate': -1, 'excellent': 3, 'excite': 3,
  'excited': 3, 'excitement': 3, 'exciting': 3, 'exclude': -1, 'excluded': -2,
  'exclusive': 2, 'excuse': -1, 'exhaust': -2, 'exhausted': -2, 'exhausting': -2,
  'expect': 1, 'expected': 1, 'expensive': -1, 'experience': 1, 'expert': 2,
  'explode': -1, 'exploit': -2, 'exploited': -2, 'explore': 1, 'exposed': -1,
  'extraordinary': 3, 'extreme': 1, 'fabulous': 4, 'fail': -2, 'failed': -2,
  'failure': -2, 'fair': 2, 'faith': 2, 'faithful': 2, 'fake': -3,
  'fall': -1, 'fallen': -1, 'false': -2, 'fame': 1, 'famous': 2,
  'fanatic': -2, 'fantastic': 4, 'fascinate': 3, 'fascinated': 3, 'fascinating': 3,
  'fast': 1, 'fat': -2, 'fatal': -3, 'fault': -2, 'favor': 2,
  'favorite': 2, 'favourite': 2, 'fear': -2, 'fearful': -2, 'fearless': 2,
  'fed up': -3, 'feel': 0, 'feeling': 0, 'festive': 2, 'fierce': 1,
  'fight': -1, 'fighting': -1, 'filthy': -3, 'final': 0, 'fine': 2,
  'fire': 3, 'firm': 1, 'fit': 1, 'fix': 1, 'fixed': 1,
  'flame': -1, 'flatter': 2, 'flaw': -2, 'flawed': -2, 'flawless': 3,
  'flexible': 1, 'flourish': 2, 'flourishing': 2, 'flow': 1, 'focus': 1,
  'focused': 1, 'fool': -2, 'foolish': -2, 'force': -1, 'forced': -2,
  'forgave': 1, 'forget': -1, 'forgive': 1, 'forgiven': 1, 'forgotten': -1,
  'fortunate': 2, 'forward': 1, 'foul': -3, 'fragile': -1, 'freak': -2,
  'free': 2, 'freedom': 2, 'fresh': 2, 'friend': 1, 'friendly': 2,
  'friendship': 2, 'frighten': -2, 'frightened': -2, 'frightening': -3, 'frustrated': -2,
  'frustrating': -2, 'frustration': -2, 'fuck': -5, 'fucked': -5, 'fucking': -5,
  'fulfil': 2, 'fulfilled': 2, 'fulfilling': 2, 'full': 1, 'fun': 3,
  'funny': 2, 'furious': -3, 'gain': 2, 'gained': 2, 'generous': 2,
  'genius': 4, 'gentle': 2, 'genuine': 2, 'giant': 1, 'gift': 2,
  'gifted': 2, 'glad': 2, 'glamorous': 2, 'glory': 2, 'glorious': 3,
  'glow': 2, 'glowing': 2, 'god': 1, 'gold': 2, 'golden': 2,
  'good': 3, 'gorgeous': 4, 'grace': 2, 'graceful': 2, 'grand': 2,
  'grateful': 3, 'gratitude': 3, 'grave': -2, 'great': 3, 'greatest': 4,
  'greed': -3, 'greedy': -3, 'grief': -3, 'grieve': -3, 'grim': -2,
  'grin': 1, 'gross': -2, 'grow': 1, 'growth': 2, 'grudge': -2,
  'guarantee': 1, 'guard': 0, 'guess': 0, 'guide': 1, 'guilt': -3,
  'guilty': -3, 'happy': 3, 'harm': -2, 'harmed': -2, 'harmful': -2,
  'harmony': 2, 'harsh': -2, 'hassle': -2, 'hate': -4, 'hated': -4,
  'hateful': -4, 'hating': -4, 'hatred': -4, 'haunt': -2, 'haunted': -2,
  'heal': 2, 'healed': 2, 'healing': 2, 'health': 2, 'healthy': 2,
  'heart': 2, 'heartbreak': -3, 'heartbreaking': -3, 'heartbroken': -3, 'heartfelt': 3,
  'heartless': -3, 'heat': 3, 'heaven': 3, 'heavenly': 3, 'heavy': -1,
  'hell': -3, 'help': 2, 'helpful': 2, 'helpless': -2, 'hero': 3,
  'heroic': 3, 'hesitant': -1, 'hesitate': -1, 'hidden': -1, 'high': 1,
  'highlight': 2, 'hilarious': 3, 'hit': 2, 'hold': 0, 'hollow': -1,
  'holy': 2, 'home': 1, 'homeless': -2, 'honest': 2, 'honor': 2,
  'hope': 2, 'hopeful': 2, 'hopeless': -2, 'horrible': -3, 'horrify': -3,
  'horrified': -3, 'horrifying': -3, 'horror': -3, 'hostile': -2, 'hot': 2,
  'hug': 2, 'huge': 1, 'humble': 2, 'humiliate': -3, 'humiliated': -3,
  'humiliating': -3, 'humor': 2, 'humorous': 2, 'hungry': -1, 'hunt': -1,
  'hurray': 3, 'hurt': -2, 'hurtful': -2, 'hurting': -2, 'hypocrite': -3,
  'ice': 0, 'iconic': 3, 'idea': 1, 'ideal': 2, 'idiotic': -3,
  'ignore': -1, 'ignored': -2, 'ignorant': -2, 'ill': -2, 'illegal': -3,
  'illness': -2, 'illuminate': 2, 'illusion': -1, 'imagine': 1, 'immature': -2,
  'immense': 2, 'immoral': -3, 'impact': 1, 'impactful': 2, 'impatient': -1,
  'imperfect': -1, 'importance': 1, 'important': 2, 'impossible': -1, 'impress': 2,
  'impressed': 2, 'impressive': 3, 'improve': 2, 'improved': 2, 'improvement': 2,
  'incredible': 4, 'independent': 1, 'indifferent': -1, 'inferior': -2, 'influence': 1,
  'influential': 2, 'inhuman': -3, 'injure': -2, 'injured': -2, 'injury': -2,
  'injustice': -3, 'innocent': 1, 'innovation': 2, 'innovative': 2, 'insane': 2,
  'insecure': -2, 'insecurity': -2, 'insight': 2, 'insightful': 2, 'inspire': 3,
  'inspired': 3, 'inspiring': 3, 'insult': -2, 'insulted': -2, 'insulting': -2,
  'integrity': 2, 'intelligent': 2, 'intense': 1, 'intensity': 1, 'interest': 1,
  'interested': 1, 'interesting': 2, 'intimate': 1, 'intrigue': 2, 'intriguing': 2,
  'invincible': 2, 'invisible': -1, 'ironic': 0, 'irrational': -2, 'irrelevant': -1,
  'irresponsible': -2, 'irritate': -2, 'irritated': -2, 'irritating': -2, 'isolated': -2,
  'jealous': -2, 'jealousy': -2, 'jerk': -3, 'joke': 1, 'joking': 1,
  'jolly': 2, 'journey': 1, 'joy': 3, 'joyful': 3, 'joyous': 3,
  'judge': -1, 'judged': -1, 'jump': 0, 'just': 1, 'justice': 2,
  'keen': 1, 'keep': 0, 'key': 1, 'kick': 1, 'kid': 0,
  'kill': -3, 'killed': -3, 'killer': -3, 'killing': -3, 'kind': 2,
  'kindness': 2, 'king': 2, 'kiss': 2, 'knowledge': 2, 'lack': -2,
  'lacking': -2, 'lame': -2, 'lament': -2, 'late': -1, 'laugh': 2,
  'laughing': 2, 'laughter': 2, 'launch': 1, 'law': 0, 'lazy': -2,
  'lead': 1, 'leader': 2, 'leadership': 2, 'learn': 1, 'learning': 1,
  'leave': -1, 'left': -1, 'legacy': 2, 'legend': 3, 'legendary': 4,
  'liar': -3, 'liberate': 2, 'liberated': 2, 'liberty': 2, 'lie': -3,
  'lies': -3, 'life': 1, 'lift': 1, 'light': 2, 'like': 2,
  'liked': 2, 'limit': -1, 'limited': -1, 'listen': 1, 'lit': 3,
  'live': 2, 'lively': 2, 'living': 1, 'load': -1, 'lonely': -2,
  'loneliness': -2, 'long': 0, 'longing': -1, 'look': 0, 'loose': -1,
  'loser': -3, 'loss': -2, 'lost': -2, 'loud': 0, 'lousy': -2,
  'love': 3, 'loved': 3, 'lovely': 3, 'lover': 2, 'loving': 3,
  'low': -1, 'loyal': 2, 'loyalty': 2, 'luck': 2, 'lucky': 3,
  'lunatic': -3, 'lust': -1, 'luxury': 2, 'mad': -3, 'madness': -3,
  'magic': 3, 'magical': 3, 'magnificent': 4, 'majestic': 3, 'major': 1,
  'manipulate': -2, 'manipulated': -2, 'manipulative': -2, 'marvel': 3, 'marvelous': 4,
  'master': 2, 'masterpiece': 4, 'matter': 0, 'mature': 1, 'meaningful': 2,
  'meaningless': -2, 'mediocre': -1, 'meh': -1, 'mellow': 1, 'melodic': 2,
  'memorable': 2, 'memory': 1, 'mental': 0, 'mercy': 2, 'merit': 2,
  'merry': 2, 'mess': -2, 'messy': -2, 'mild': 0, 'mind': 0,
  'mindful': 2, 'miracle': 3, 'miraculous': 3, 'miserable': -3, 'misery': -3,
  'miss': -1, 'missed': -1, 'missing': -1, 'mistake': -2, 'mistaken': -2,
  'misunderstand': -2, 'misunderstood': -2, 'mock': -2, 'mocked': -2, 'modern': 1,
  'modest': 1, 'moment': 1, 'monster': -2, 'mood': 0, 'moody': -1,
  'moral': 1, 'moron': -3, 'motivate': 2, 'motivated': 2, 'motivation': 2,
  'move': 0, 'moved': 2, 'moving': 2, 'murder': -5, 'murdered': -5,
  'mysterious': 1, 'mystery': 1, 'nag': -2, 'naive': -1, 'nasty': -3,
  'natural': 1, 'naughty': -1, 'negative': -2, 'neglect': -2, 'neglected': -2,
  'nervous': -1, 'never': -1, 'new': 1, 'nice': 2, 'nightmare': -3,
  'noble': 2, 'nobody': -1, 'noise': -1, 'noisy': -1, 'nonsense': -2,
  'normal': 0, 'nostalgia': 1, 'nostalgic': 1, 'nothing': -1, 'notice': 0,
  'notorious': -2, 'numb': -1, 'nuisance': -2, 'nuts': -2, 'obsess': -2,
  'obsessed': -2, 'obsession': -2, 'obstacle': -2, 'odd': -1, 'offend': -2,
  'offended': -2, 'offensive': -2, 'okay': 1, 'old': 0, 'open': 1,
  'opportunity': 2, 'oppose': -1, 'opposed': -1, 'opposite': 0, 'optimism': 2,
  'optimistic': 2, 'order': 0, 'ordinary': 0, 'original': 2, 'outbreak': -2,
  'outrage': -3, 'outraged': -3, 'outrageous': -3, 'outstanding': 4, 'overcome': 2,
  'overwhelm': -1, 'overwhelmed': -2, 'overwhelming': -1, 'owe': -1, 'own': 0,
  'pain': -2, 'painful': -2, 'panic': -3, 'paradise': 3, 'paranoid': -2,
  'pardon': 1, 'passion': 3, 'passionate': 3, 'past': 0, 'patience': 2,
  'patient': 2, 'pay': 0, 'peace': 2, 'peaceful': 2, 'peak': 2,
  'peculiar': 0, 'penalty': -2, 'perfect': 3, 'perfection': 3, 'perfectly': 3,
  'perform': 1, 'performance': 1, 'peril': -2, 'permission': 1, 'perseverance': 2,
  'persist': 1, 'persistent': 1, 'perspective': 1, 'pessimistic': -2, 'phenomenal': 4,
  'piss': -3, 'pissed': -3, 'pity': -2, 'plague': -3, 'plain': 0,
  'plan': 0, 'play': 1, 'playful': 2, 'pleasant': 2, 'please': 1,
  'pleased': 2, 'pleasing': 2, 'pleasure': 3, 'pledge': 1, 'plenty': 1,
  'plot': 0, 'poison': -3, 'poisonous': -3, 'polite': 2, 'pollute': -2,
  'polluted': -2, 'poor': -2, 'popular': 2, 'positive': 2, 'possess': 0,
  'possibility': 1, 'possible': 1, 'potential': 1, 'power': 2, 'powerful': 3,
  'powerless': -2, 'practical': 1, 'praise': 3, 'praised': 3, 'pray': 1,
  'prayer': 1, 'precious': 2, 'prefer': 1, 'premium': 2, 'prepare': 1,
  'prepared': 1, 'presence': 1, 'present': 1, 'preserve': 1, 'pressure': -1,
  'prestige': 2, 'prestigious': 2, 'pretend': -1, 'pretty': 2, 'prevent': 0,
  'pride': 2, 'prime': 2, 'prince': 1, 'princess': 1, 'principle': 1,
  'priority': 1, 'prison': -2, 'private': 0, 'privilege': 2, 'privileged': 2,
  'prize': 2, 'problem': -2, 'problematic': -2, 'productive': 2, 'professional': 2,
  'profound': 2, 'progress': 2, 'promise': 1, 'promised': 1, 'promising': 2,
  'promote': 1, 'promoted': 1, 'proper': 1, 'prospect': 1, 'prosper': 2,
  'prosperous': 2, 'protect': 2, 'protected': 2, 'protection': 2, 'proud': 2,
  'prove': 1, 'proven': 1, 'provoke': -2, 'provoked': -2, 'punish': -2,
  'punished': -2, 'punishment': -2, 'pure': 2, 'purpose': 2, 'pursue': 1,
  'push': 0, 'quality': 2, 'quarrel': -2, 'queen': 1, 'question': 0,
  'quick': 1, 'quiet': 1, 'quit': -1, 'quote': 0, 'race': 0,
  'racism': -4, 'racist': -4, 'radiant': 3, 'rage': -3, 'raise': 1,
  'random': 0, 'rapid': 1, 'rare': 1, 'rash': -1, 'raw': 1,
  'reach': 1, 'react': 0, 'reaction': 0, 'ready': 1, 'real': 2,
  'realistic': 1, 'reality': 0, 'realize': 1, 'reason': 1, 'reasonable': 2,
  'rebel': 0, 'rebellion': -1, 'recognize': 1, 'recognized': 1, 'recommend': 2,
  'recommended': 2, 'recover': 2, 'recovered': 2, 'recovery': 2, 'reduce': 0,
  'refined': 2, 'reflect': 1, 'reflection': 1, 'refreshing': 2, 'refuse': -1,
  'refused': -1, 'regret': -2, 'regretful': -2, 'reject': -2, 'rejected': -2,
  'rejection': -2, 'rejoice': 3, 'relax': 2, 'relaxed': 2, 'relaxing': 2,
  'release': 1, 'reliable': 2, 'relief': 2, 'relieved': 2, 'remarkable': 3,
  'remember': 1, 'remind': 0, 'remorse': -2, 'remote': 0, 'renew': 1,
  'renewed': 1, 'rent': 0, 'repay': 0, 'repeat': 0, 'replace': 0,
  'reply': 0, 'report': 0, 'represent': 0, 'reputation': 1, 'rescue': 2,
  'resent': -2, 'resentful': -2, 'resentment': -2, 'reserve': 0, 'resist': -1,
  'resolve': 1, 'resolved': 1, 'resource': 1, 'respect': 2, 'respected': 2,
  'respectful': 2, 'respond': 0, 'response': 0, 'responsible': 2, 'rest': 1,
  'restore': 2, 'restored': 2, 'restrict': -1, 'restricted': -1, 'result': 0,
  'retire': 0, 'reveal': 1, 'revenge': -2, 'review': 0, 'revive': 2,
  'revolution': 1, 'revolutionary': 2, 'reward': 2, 'rewarding': 2, 'rich': 2,
  'ridicule': -2, 'ridiculous': -2, 'right': 1, 'rigid': -1, 'riot': -2,
  'rise': 2, 'rising': 2, 'risk': -1, 'risky': -1, 'rival': -1,
  'rob': -2, 'robbed': -2, 'rock': 2, 'romantic': 2, 'rotten': -3,
  'rough': -1, 'rude': -2, 'ruin': -2, 'ruined': -2, 'rule': 0,
  'rumor': -1, 'run': 0, 'rush': 0, 'ruthless': -3, 'sabotage': -2,
  'sacred': 2, 'sacrifice': 1, 'sad': -2, 'sadness': -2, 'safe': 2,
  'safety': 2, 'saint': 2, 'sake': 0, 'salvation': 2, 'same': 0,
  'sane': 1, 'satisfaction': 2, 'satisfactory': 2, 'satisfied': 2, 'satisfy': 2,
  'satisfying': 2, 'savage': -2, 'save': 2, 'saved': 2, 'scandal': -3,
  'scare': -2, 'scared': -2, 'scary': -2, 'scream': -2, 'screaming': -2,
  'screw': -2, 'screwed': -3, 'search': 0, 'secret': 0, 'secure': 2,
  'security': 2, 'seduce': -1, 'seductive': 1, 'selfish': -3, 'sell': 0,
  'sensation': 2, 'sensational': 3, 'sense': 1, 'sensitive': 1, 'sentiment': 1,
  'sentimental': 1, 'separate': 0, 'serene': 2, 'serenity': 3, 'serious': 0,
  'servant': 0, 'serve': 1, 'service': 1, 'setback': -2, 'settle': 1,
  'severe': -2, 'sexy': 1, 'shade': -1, 'shake': -1, 'shaken': -1,
  'shallow': -2, 'shame': -2, 'shameful': -3, 'shape': 0, 'share': 1,
  'shared': 1, 'sharp': 1, 'shatter': -2, 'shattered': -2, 'shelter': 1,
  'shield': 1, 'shift': 0, 'shine': 2, 'shining': 2, 'shiny': 1,
  'shock': -2, 'shocked': -2, 'shocking': -2, 'shit': -4, 'shitty': -4,
  'shoot': -1, 'short': 0, 'shortage': -2, 'shout': -1, 'show': 0,
  'shut': -1, 'shy': -1, 'sick': -2, 'sickness': -2, 'sight': 1,
  'sign': 0, 'signal': 0, 'significance': 2, 'significant': 2, 'silence': 0,
  'silent': 0, 'silly': 0, 'simple': 1, 'sin': -2, 'sincere': 2,
  'sincerity': 2, 'single': 0, 'sink': -1, 'sister': 0, 'situation': 0,
  'skill': 2, 'skilled': 2, 'slap': -2, 'slaughter': -4, 'slave': -3,
  'slavery': -3, 'sleep': 0, 'sleepy': -1, 'slick': 1, 'slip': -1,
  'slow': -1, 'slut': -5, 'small': 0, 'smart': 2, 'smash': 2,
  'smell': 0, 'smile': 2, 'smiling': 2, 'smoke': 0, 'smooth': 2,
  'snap': -1, 'sneak': -1, 'sneaky': -2, 'snob': -2, 'snobbish': -2,
  'social': 0, 'soft': 1, 'solid': 2, 'solution': 2, 'solve': 2,
  'solved': 2, 'someday': 0, 'something': 0, 'song': 1, 'soon': 0,
  'sophisticated': 2, 'sore': -1, 'sorrow': -2, 'sorrowful': -2, 'sorry': -1,
  'soul': 1, 'soulful': 2, 'sound': 1, 'source': 0, 'space': 0,
  'spark': 2, 'sparkle': 2, 'sparkling': 2, 'special': 2, 'spectacular': 4,
  'speechless': 1, 'speed': 1, 'spend': 0, 'spicy': 1, 'spin': 0,
  'spirit': 2, 'spiritual': 2, 'spite': -2, 'splendid': 3, 'split': -1,
  'spoil': -2, 'spoiled': -2, 'spontaneous': 1, 'sport': 0, 'spot': 0,
  'spread': 0, 'spring': 1, 'stability': 2, 'stable': 1, 'stage': 0,
  'stain': -1, 'stale': -2, 'standard': 0, 'star': 2, 'starve': -3,
  'starving': -3, 'state': 0, 'status': 0, 'stay': 0, 'steady': 1,
  'steal': -2, 'stellar': 3, 'step': 0, 'stereotype': -2, 'stick': 0,
  'stiff': -1, 'still': 0, 'stimulate': 1, 'stimulating': 2, 'stink': -2,
  'stinks': -2, 'stock': 0, 'stop': -1, 'storm': -1, 'story': 1,
  'straight': 0, 'strain': -1, 'strange': 0, 'stranger': -1, 'strategic': 1,
  'strategy': 1, 'stream': 1, 'strength': 2, 'strengthen': 2, 'stress': -2,
  'stressed': -2, 'stressful': -2, 'strict': -1, 'strike': -1, 'striking': 2,
  'strive': 1, 'strong': 2, 'stronger': 2, 'strongest': 3, 'struggle': -2,
  'struggling': -2, 'stubborn': -1, 'stuck': -2, 'stun': 1, 'stunning': 4,
  'stupid': -3, 'stupidity': -3, 'style': 1, 'stylish': 2, 'subject': 0,
  'sublime': 3, 'submit': 0, 'subtle': 1, 'succeed': 3, 'succeeded': 3,
  'success': 3, 'successful': 3, 'suck': -3, 'sucks': -3, 'sudden': -1,
  'suffer': -2, 'suffered': -2, 'suffering': -2, 'sufficient': 1, 'suggest': 0,
  'suicide': -5, 'suitable': 1, 'sulk': -2, 'sum': 0, 'super': 3,
  'superb': 4, 'superficial': -2, 'superior': 2, 'support': 2, 'supported': 2,
  'supportive': 2, 'suppose': 0, 'suppress': -1, 'sure': 1, 'surface': 0,
  'surge': 1, 'surprise': 2, 'surprised': 2, 'surprising': 2, 'surrender': -1,
  'surround': 0, 'survive': 2, 'survived': 2, 'survivor': 2, 'suspect': -1,
  'suspense': 1, 'suspicious': -2, 'sustain': 1, 'sustained': 1, 'swear': -2,
  'sweet': 2, 'swift': 1, 'symbol': 0, 'sympathy': 2, 'system': 0,
  'taboo': -2, 'tactic': 0, 'tactical': 0, 'take': 0, 'talent': 3,
  'talented': 3, 'talk': 0, 'tame': 0, 'target': 0, 'task': 0,
  'taste': 1, 'tasteful': 2, 'tasteless': -2, 'tasty': 2, 'taught': 0,
  'teach': 1, 'teacher': 1, 'team': 1, 'tear': -2, 'tears': -2,
  'tease': -1, 'tedious': -2, 'temper': -2, 'tempt': 0, 'temptation': -1,
  'tender': 2, 'tense': -2, 'tension': -2, 'terrible': -3, 'terrific': 4,
  'terrified': -3, 'terrifying': -3, 'terror': -3, 'terrorist': -4, 'test': 0,
  'thank': 2, 'thankful': 2, 'thanks': 2, 'therapy': 1, 'thick': 0,
  'thin': 0, 'thing': 0, 'think': 0, 'thorough': 2, 'thought': 0,
  'thoughtful': 2, 'thoughtless': -2, 'threat': -2, 'threaten': -2, 'threatened': -2,
  'threatening': -2, 'thrill': 3, 'thrilled': 3, 'thrilling': 3, 'thrive': 2,
  'thriving': 2, 'throw': 0, 'thug': -2, 'thunder': 0, 'tick': -1,
  'tidy': 1, 'tight': 1, 'time': 0, 'timeless': 3, 'tiny': 0,
  'tip': 1, 'tire': -1, 'tired': -2, 'tiring': -2, 'title': 0,
  'toast': 1, 'together': 1, 'tolerance': 2, 'tolerant': 2, 'tolerate': 0,
  'tone': 0, 'tool': 0, 'top': 2, 'topic': 0, 'torment': -3,
  'torn': -2, 'torture': -4, 'tortured': -4, 'total': 0, 'totally': 0,
  'touch': 1, 'touched': 2, 'touching': 2, 'tough': -1, 'tour': 1,
  'toxic': -3, 'trace': 0, 'track': 1, 'tradition': 1, 'traditional': 1,
  'tragedy': -3, 'tragic': -3, 'trail': 0, 'train': 0, 'trained': 1,
  'training': 1, 'trait': 0, 'traitor': -3, 'transform': 1, 'transformation': 2,
  'transition': 0, 'trap': -2, 'trapped': -2, 'trash': -3, 'trauma': -3,
  'traumatic': -3, 'travel': 1, 'treasure': 2, 'treasured': 2, 'treat': 1,
  'treated': 1, 'treatment': 0, 'tremendous': 3, 'trend': 1, 'trendy': 1,
  'trial': -1, 'tribe': 0, 'tribute': 2, 'trick': -1, 'tricky': -1,
  'trigger': -1, 'triumph': 3, 'triumphant': 3, 'trivial': -1, 'trophy': 2,
  'trouble': -2, 'troubled': -2, 'troubling': -2, 'true': 2, 'truly': 2,
  'trust': 2, 'trusted': 2, 'trustworthy': 2, 'truth': 2, 'truthful': 2,
  'try': 0, 'tune': 1, 'turmoil': -2, 'turn': 0, 'twist': -1,
  'type': 0, 'typical': 0, 'tyranny': -3, 'ugly': -3, 'ultimate': 2,
  'ultimately': 0, 'unable': -2, 'unacceptable': -2, 'unaware': -1, 'unbearable': -2,
  'unbelievable': 2, 'uncertain': -1, 'uncertainty': -1, 'uncomfortable': -2, 'unconditional': 2,
  'unconscious': -1, 'underestimate': -1, 'understand': 2, 'understanding': 2, 'understood': 2,
  'undervalue': -2, 'undervalued': -2, 'undeserved': -2, 'undesirable': -2, 'unexpected': 0,
  'unfair': -2, 'unfaithful': -3, 'unfamiliar': -1, 'unfinished': -1, 'unforgettable': 3,
  'unfortunate': -2, 'unfortunately': -1, 'unfriendly': -2, 'ungrateful': -3, 'unhappy': -2,
  'unhealthy': -2, 'unified': 1, 'union': 1, 'unique': 2, 'unite': 1,
  'united': 1, 'unity': 2, 'universal': 1, 'universe': 1, 'unjust': -2,
  'unknown': -1, 'unlawful': -2, 'unlikely': -1, 'unlock': 1, 'unlucky': -2,
  'unnecessary': -1, 'unpleasant': -2, 'unpopular': -2, 'unpredictable': -1, 'unreal': 2,
  'unrealistic': -1, 'unreasonable': -2, 'unreliable': -2, 'unsafe': -2, 'unsatisfied': -2,
  'unselfish': 2, 'unstable': -2, 'unstoppable': 3, 'unsuccessful': -2, 'unsure': -1,
  'unusual': 0, 'unwanted': -2, 'unwell': -2, 'unworthy': -2, 'up': 1,
  'update': 0, 'upgrade': 1, 'uplifting': 3, 'upset': -2, 'upside': 1,
  'urge': 0, 'urgent': -1, 'use': 0, 'useful': 2, 'useless': -2,
  'usual': 0, 'utilize': 1, 'utter': 0, 'vacation': 2, 'vague': -1,
  'vain': -2, 'valid': 1, 'validate': 2, 'validated': 2, 'valuable': 2,
  'value': 2, 'valued': 2, 'vanish': -1, 'vanity': -2, 'variety': 1,
  'vast': 1, 'vengeance': -3, 'versatile': 2, 'version': 0, 'versus': 0,
  'very': 0, 'vibe': 2, 'vibes': 2, 'vibrant': 2, 'vicious': -3,
  'victim': -2, 'victimize': -3, 'victimized': -3, 'victor': 2, 'victory': 3,
  'view': 0, 'vile': -3, 'villain': -2, 'violate': -3, 'violated': -3,
  'violence': -3, 'violent': -3, 'viral': 2, 'virtue': 2, 'virtuous': 2,
  'visible': 0, 'vision': 2, 'visionary': 2, 'visit': 0, 'vital': 2,
  'vivid': 2, 'voice': 1, 'volatile': -2, 'volunteer': 2, 'vote': 0,
  'vulnerable': -1, 'wait': -1, 'wake': 0, 'walk': 0, 'want': 0,
  'war': -3, 'warm': 2, 'warmth': 2, 'warn': -1, 'warning': -2,
  'warrior': 1, 'waste': -2, 'wasted': -2, 'wasteful': -2, 'watch': 0,
  'wave': 1, 'weak': -2, 'weakness': -2, 'wealth': 2, 'wealthy': 2,
  'weapon': -2, 'wear': 0, 'weary': -2, 'weather': 0, 'wedding': 2,
  'weed': -1, 'weep': -2, 'weeping': -2, 'weird': -1, 'welcome': 2,
  'welfare': 1, 'well': 2, 'wellbeing': 2, 'whine': -2, 'whining': -2,
  'wholesome': 3, 'wicked': -2, 'wide': 0, 'wild': 1, 'will': 0,
  'willing': 1, 'win': 3, 'winner': 3, 'winning': 3, 'wisdom': 2,
  'wise': 2, 'wish': 1, 'witch': -1, 'withdraw': -1, 'withdrawn': -2,
  'witness': 0, 'woe': -2, 'wonder': 2, 'wonderful': 4, 'wondrous': 3,
  'won\'t': -1, 'word': 0, 'work': 0, 'working': 0, 'world': 0,
  'worried': -2, 'worry': -2, 'worrying': -2, 'worse': -3, 'worship': 2,
  'worst': -4, 'worth': 2, 'worthless': -3, 'worthwhile': 2, 'worthy': 2,
  'would': 0, 'wound': -2, 'wounded': -2, 'wow': 4, 'wrap': 0,
  'wrath': -3, 'wreck': -2, 'wrecked': -2, 'write': 0, 'wrong': -2,
  'wronged': -2, 'yay': 3, 'yeah': 1, 'yearn': 0, 'yearning': -1,
  'yell': -2, 'yelling': -2, 'yes': 1, 'yesterday': 0, 'yield': 0,
  'young': 1, 'youth': 1, 'youthful': 2, 'zeal': 2, 'zealous': 1,
  'zen': 2, 'zero': -1, 'zest': 2, 'zombie': -2, 'zone': 0,
};

const MUSIC_SENTIMENT_LEXICON: Record<string, number> = {
  'banger': 5, 'slaps': 4, 'fire': 4, 'heat': 4, 'lit': 4,
  'dope': 4, 'sick': 3, 'fresh': 3, 'tight': 3, 'groovy': 3,
  'catchy': 3, 'melodic': 3, 'harmonic': 2, 'soulful': 3, 'emotional': 2,
  'vibing': 3, 'vibes': 3, 'vibe': 2, 'chill': 2, 'mellow': 2,
  'smooth': 2, 'crisp': 2, 'clean': 2, 'polished': 2, 'professional': 2,
  'anthemic': 3, 'uplifting': 3, 'inspiring': 3, 'moving': 2, 'touching': 2,
  'hypnotic': 2, 'infectious': 2, 'irresistible': 3, 'addictive': 2, 'memorable': 2,
  'iconic': 4, 'legendary': 4, 'classic': 3, 'timeless': 3, 'groundbreaking': 4,
  'innovative': 3, 'creative': 2, 'original': 2, 'unique': 2, 'experimental': 1,
  'masterpiece': 5, 'masterful': 4, 'flawless': 4, 'perfect': 4, 'impeccable': 4,
  'brilliant': 4, 'genius': 4, 'phenomenal': 4, 'incredible': 4, 'amazing': 4,
  'outstanding': 4, 'exceptional': 4, 'excellent': 3, 'superb': 4, 'magnificent': 4,
  'hit': 3, 'bop': 3, 'jam': 3, 'tune': 2, 'track': 1,
  'beat': 1, 'drop': 2, 'bass': 1, 'synth': 1, 'vocal': 1,
  'verse': 1, 'chorus': 1, 'hook': 2, 'bridge': 1, 'outro': 1,
  'intro': 1, 'remix': 1, 'cover': 1, 'sample': 1, 'loop': 1,
  'vocals': 1, 'singing': 1, 'rapping': 1, 'flow': 2,
  'bars': 2, 'lyrics': 1, 'rhyme': 1, 'rhymes': 1, 'wordplay': 2,
  'delivery': 1, 'performance': 1, 'energy': 2, 'presence': 1, 'charisma': 2,
  'talented': 3, 'gifted': 3, 'skilled': 2, 'versatile': 2, 'range': 1,
  'corny': -3, 'wack': -4, 'trash': -4, 'garbage': -4, 'mid': -2,
  'boring': -3, 'generic': -2, 'repetitive': -2, 'overproduced': -2, 'underproduced': -2,
  'muddy': -2, 'muffled': -2, 'distorted': -1, 'clipping': -2, 'offkey': -3,
  'offbeat': -2, 'out of tune': -3, 'pitchy': -3, 'flat': -2, 'sharp': -1,
  'autotuned': -1, 'overused': -2, 'cliche': -2, 'unoriginal': -3, 'derivative': -2,
  'forgettable': -3, 'unmemorable': -3, 'mediocre': -2, 'average': -1, 'meh': -2,
  'disappointing': -3, 'letdown': -3, 'underwhelming': -3, 'overhyped': -2, 'overrated': -2,
  'sellout': -3, 'fake': -3, 'phony': -3, 'manufactured': -2, 'soulless': -4,
  'uninspired': -3, 'lazy': -3, 'effortless': -2, 'rushed': -2, 'unfinished': -2,
  'amateurish': -3, 'unprofessional': -3, 'messy': -2, 'cluttered': -2, 'chaotic': -1,
  'platinum': 3, 'gold': 2, 'certified': 2, 'chart-topping': 3, 'billboard': 2,
  'grammy': 4, 'award': 2, 'nominated': 2, 'winning': 3, 'record-breaking': 4,
  'viral': 3, 'trending': 2, 'blowing up': 3, 'buzzing': 2, 'hype': 2,
  'goat': 5, 'legend': 4, 'icon': 4, 'pioneer': 3, 'trailblazer': 3,
  'prodigy': 4, 'virtuoso': 4, 'maestro': 4, 'ace': 3, 'beast': 3,
  'king': 3, 'queen': 3, 'prince': 2, 'princess': 2, 'royalty': 3,
  'underrated': 2, 'slept on': 2, 'hidden gem': 3, 'gem': 2, 'diamond': 3,
  'mumble': -2, 'mumbling': -2, 'unclear': -2, 'inaudible': -3, 'noise': -2,
  'commercial': -1, 'mainstream': 0, 'underground': 1, 'indie': 1,
  'raw': 2, 'authentic': 3, 'real': 2, 'genuine': 2, 'honest': 2,
  'deep': 2, 'meaningful': 3, 'profound': 3, 'thought-provoking': 3, 'conscious': 2,
  'storytelling': 2, 'narrative': 1, 'concept': 2, 'thematic': 1, 'cohesive': 2,
  'production': 1, 'producer': 1, 'produced': 1, 'mixed': 1, 'mastered': 1,
  'collab': 2, 'feature': 1, 'featuring': 1, 'ft': 1, 'duo': 1,
  'collaboration': 2, 'collabo': 2, 'link-up': 2, 'team-up': 2, 'joint': 1,
};

const EMOTION_LEXICON: Record<Emotion, string[]> = {
  happy: [
    'happy', 'joy', 'joyful', 'excited', 'thrilled', 'delighted', 'cheerful',
    'content', 'pleased', 'satisfied', 'grateful', 'blessed', 'wonderful',
    'amazing', 'fantastic', 'great', 'awesome', 'love', 'loving', 'loved',
    'celebrate', 'celebrating', 'party', 'fun', 'enjoy', 'enjoying', 'smile',
    'smiling', 'laugh', 'laughing', 'bright', 'sunny', 'beautiful', 'perfect',
    'bliss', 'blissful', 'euphoric', 'euphoria', 'ecstatic', 'elated', 'upbeat',
    'positive', 'optimistic', 'hopeful', 'radiant', 'glowing', 'vibrant', 'lit',
    'fire', 'banger', 'slaps', 'vibes', 'vibing', 'dope', 'fresh', 'bop',
  ],
  sad: [
    'sad', 'unhappy', 'depressed', 'depressing', 'melancholy', 'melancholic',
    'sorrowful', 'sorrow', 'grief', 'grieving', 'mourning', 'mourn', 'crying',
    'cry', 'tears', 'tearful', 'heartbroken', 'heartbreak', 'lonely', 'loneliness',
    'alone', 'isolated', 'empty', 'hopeless', 'despair', 'despairing', 'miserable',
    'misery', 'pain', 'painful', 'hurt', 'hurting', 'suffering', 'suffer',
    'blue', 'down', 'gloomy', 'gloom', 'dark', 'darkness', 'lost', 'broken',
    'shattered', 'devastated', 'devastation', 'tragic', 'tragedy', 'unfortunate',
    'regret', 'regretful', 'sorry', 'miss', 'missing', 'missed', 'nostalgia',
  ],
  angry: [
    'angry', 'anger', 'mad', 'furious', 'rage', 'raging', 'enraged', 'outraged',
    'outrage', 'frustrated', 'frustration', 'irritated', 'irritation', 'annoyed',
    'annoyance', 'aggravated', 'aggravation', 'hostile', 'hostility', 'hate',
    'hating', 'hatred', 'despise', 'loathe', 'loathing', 'disgust', 'disgusted',
    'disgusting', 'resentful', 'resentment', 'bitter', 'bitterness', 'vengeful',
    'vengeance', 'revenge', 'wrathful', 'wrath', 'fierce', 'violent', 'violence',
    'brutal', 'brutality', 'cruel', 'cruelty', 'savage', 'vicious', 'nasty',
    'aggressive', 'aggression', 'hostile', 'pissed', 'livid', 'seething',
    'fuck', 'fucking', 'shit', 'damn', 'hell', 'bullshit', 'crap',
  ],
  excited: [
    'excited', 'exciting', 'excitement', 'thrilled', 'thrilling', 'exhilarated',
    'exhilarating', 'energized', 'energetic', 'pumped', 'hyped', 'hype', 'stoked',
    'amped', 'eager', 'anticipation', 'anticipating', 'cant wait', 'looking forward',
    'enthusiastic', 'enthusiasm', 'passionate', 'passion', 'fired up', 'electrified',
    'electric', 'dynamic', 'vibrant', 'alive', 'awake', 'alert', 'ready', 'prepared',
    'inspired', 'inspiration', 'motivated', 'motivation', 'driven', 'determined',
    'ambitious', 'adventurous', 'daring', 'bold', 'brave', 'courageous', 'fearless',
    'lets go', 'lets goooo', 'omg', 'yay', 'woohoo', 'amazing', 'incredible', 'wow',
    'insane', 'crazy', 'wild', 'unreal', 'unbelievable', 'mind-blowing', 'epic',
  ],
  calm: [
    'calm', 'calming', 'peaceful', 'peace', 'serene', 'serenity', 'tranquil',
    'tranquility', 'relaxed', 'relaxing', 'soothing', 'soothe', 'gentle', 'soft',
    'quiet', 'still', 'stillness', 'balanced', 'balance', 'centered', 'grounded',
    'zen', 'meditative', 'meditation', 'mindful', 'mindfulness', 'contemplative',
    'reflective', 'thoughtful', 'composed', 'collected', 'cool', 'steady', 'stable',
    'patient', 'patience', 'tolerant', 'understanding', 'accepting', 'forgiving',
    'mellow', 'chill', 'chilled', 'chilling', 'laid-back', 'easygoing', 'content',
    'comfortable', 'cozy', 'warm', 'safe', 'secure', 'assured', 'confident',
    'lowkey', 'smooth', 'easy', 'flow', 'flowing', 'ambient', 'atmospheric',
  ],
};

const TOXICITY_LEXICON = {
  profanity: [
    'fuck', 'fucking', 'fucked', 'fucker', 'shit', 'shitty', 'bullshit',
    'ass', 'asshole', 'bitch', 'bastard', 'damn', 'damned', 'crap',
    'piss', 'pissed', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut',
    'motherfucker', 'motherfucking', 'wtf', 'stfu', 'ffs', 'lmfao',
  ],
  harassment: [
    'idiot', 'stupid', 'dumb', 'moron', 'imbecile', 'retard', 'retarded',
    'loser', 'pathetic', 'worthless', 'useless', 'trash', 'garbage',
    'disgusting', 'ugly', 'fat', 'skinny', 'freak', 'weirdo', 'creep',
    'creepy', 'stalker', 'pervert', 'sicko', 'psycho', 'crazy', 'insane',
    'lunatic', 'nutjob', 'failure', 'nobody', 'nothing', 'fake', 'fraud',
  ],
  hate: [
    'hate', 'hating', 'hatred', 'racist', 'racism', 'sexist', 'sexism',
    'homophobic', 'homophobia', 'transphobic', 'transphobia', 'bigot',
    'bigotry', 'nazi', 'fascist', 'supremacist', 'xenophobic', 'xenophobia',
    'misogynist', 'misogyny', 'antisemitic', 'antisemitism', 'islamophobic',
    'islamophobia', 'ableist', 'ableism', 'discrimination', 'discriminate',
  ],
  threat: [
    'kill', 'killing', 'murder', 'die', 'death', 'dead', 'hurt', 'harm',
    'attack', 'destroy', 'destroy', 'eliminate', 'exterminate', 'execute',
    'shoot', 'stab', 'beat', 'punch', 'hit', 'slap', 'burn', 'torture',
    'threat', 'threaten', 'threatening', 'revenge', 'vengeance', 'payback',
    'gonna get you', 'watch your back', 'youre dead', 'i will find you',
  ],
  spam: [
    'buy now', 'click here', 'free money', 'make money fast', 'get rich',
    'limited time', 'act now', 'subscribe', 'follow for follow', 'f4f',
    'promo', 'promotion', 'dm me', 'check bio', 'link in bio', 'giveaway',
    'winner', 'congratulations', 'selected', 'claim', 'prize', 'lottery',
  ],
};

const ASPECT_KEYWORDS: Record<string, string[]> = {
  'track_quality': [
    'production', 'mix', 'master', 'sound', 'quality', 'audio', 'recording',
    'beat', 'instrumental', 'melody', 'harmony', 'arrangement', 'composition',
    'bass', 'drums', 'synth', 'guitar', 'piano', 'strings', 'brass',
  ],
  'artist_performance': [
    'performance', 'vocal', 'vocals', 'singing', 'voice', 'rapping', 'flow',
    'delivery', 'lyrics', 'bars', 'rhymes', 'wordplay', 'storytelling',
    'energy', 'presence', 'charisma', 'emotion', 'feeling', 'passion',
  ],
  'originality': [
    'original', 'unique', 'creative', 'innovative', 'experimental', 'fresh',
    'new', 'different', 'groundbreaking', 'pioneering', 'distinctive', 'style',
    'sound', 'approach', 'vision', 'artistic', 'concept', 'idea',
  ],
  'commercial_appeal': [
    'catchy', 'hook', 'chorus', 'radio', 'mainstream', 'commercial', 'hit',
    'chart', 'billboard', 'platinum', 'gold', 'streaming', 'plays', 'views',
    'viral', 'trending', 'popular', 'appeal', 'accessible', 'mass',
  ],
  'emotional_impact': [
    'emotional', 'moving', 'touching', 'powerful', 'deep', 'meaningful',
    'profound', 'heartfelt', 'soulful', 'inspiring', 'uplifting', 'relatable',
    'authentic', 'genuine', 'honest', 'real', 'raw', 'vulnerable', 'intense',
  ],
  'production_value': [
    'produced', 'producer', 'production', 'engineered', 'mixed', 'mastered',
    'polished', 'clean', 'crisp', 'professional', 'studio', 'equipment',
    'software', 'hardware', 'plugins', 'effects', 'processing', 'technique',
  ],
};

const NEGATION_WORDS = [
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
  'none', 'nor', 'cannot', 'cant', 'can\'t', 'won\'t', 'wont', 'wouldn\'t',
  'wouldnt', 'shouldn\'t', 'shouldnt', 'couldn\'t', 'couldnt', 'doesn\'t',
  'doesnt', 'don\'t', 'dont', 'didn\'t', 'didnt', 'isn\'t', 'isnt',
  'aren\'t', 'arent', 'wasn\'t', 'wasnt', 'weren\'t', 'werent', 'hasn\'t',
  'hasnt', 'haven\'t', 'havent', 'hadn\'t', 'hadnt', 'barely', 'hardly',
  'scarcely', 'rarely', 'seldom', 'without', 'lack', 'lacking', 'absence',
];

const INTENSIFIERS: Record<string, number> = {
  'very': 1.5, 'really': 1.5, 'extremely': 2, 'incredibly': 2, 'absolutely': 2,
  'totally': 1.5, 'completely': 1.8, 'utterly': 2, 'entirely': 1.5, 'highly': 1.5,
  'so': 1.3, 'too': 1.3, 'super': 1.5, 'mega': 1.7, 'ultra': 1.7,
  'hella': 1.5, 'mad': 1.5, 'crazy': 1.5, 'insanely': 2, 'ridiculously': 1.8,
  'exceptionally': 1.8, 'remarkably': 1.5, 'tremendously': 1.8, 'massively': 1.7,
  'wildly': 1.6, 'genuinely': 1.3, 'truly': 1.4, 'literally': 1.5, 'seriously': 1.4,
  'lowkey': 0.7, 'kinda': 0.7, 'kind of': 0.7, 'sort of': 0.7, 'somewhat': 0.7,
  'slightly': 0.5, 'a bit': 0.6, 'a little': 0.6, 'fairly': 0.8, 'pretty': 0.9,
  'quite': 0.9, 'rather': 0.8, 'moderately': 0.8, 'mildly': 0.6, 'partially': 0.6,
};

export class SentimentAnalyzer {
  private combinedLexicon: Map<string, number>;
  private emotionLexicon: Map<string, Emotion[]>;
  private toxicityPatterns: Map<string, string>;
  private aspectPatterns: Map<string, RegExp>;
  private lastAnalysis: FullAnalysisResult | null = null;

  constructor() {
    this.combinedLexicon = new Map();
    this.emotionLexicon = new Map();
    this.toxicityPatterns = new Map();
    this.aspectPatterns = new Map();
    this.initializeLexicons();
  }

  private initializeLexicons(): void {
    for (const [word, score] of Object.entries(AFINN_LEXICON)) {
      this.combinedLexicon.set(word.toLowerCase(), score);
    }

    for (const [word, score] of Object.entries(MUSIC_SENTIMENT_LEXICON)) {
      const existing = this.combinedLexicon.get(word.toLowerCase());
      if (existing === undefined || Math.abs(score) > Math.abs(existing)) {
        this.combinedLexicon.set(word.toLowerCase(), score);
      }
    }

    for (const [emotion, words] of Object.entries(EMOTION_LEXICON)) {
      for (const word of words) {
        const existing = this.emotionLexicon.get(word.toLowerCase()) || [];
        existing.push(emotion as Emotion);
        this.emotionLexicon.set(word.toLowerCase(), existing);
      }
    }

    for (const [category, words] of Object.entries(TOXICITY_LEXICON)) {
      for (const word of words) {
        this.toxicityPatterns.set(word.toLowerCase(), category);
      }
    }

    for (const [aspect, keywords] of Object.entries(ASPECT_KEYWORDS)) {
      const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
      this.aspectPatterns.set(aspect, pattern);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);
  }

  private findNegationWindow(tokens: string[], index: number): boolean {
    const windowSize = 3;
    const start = Math.max(0, index - windowSize);
    for (let i = start; i < index; i++) {
      if (NEGATION_WORDS.includes(tokens[i])) {
        return true;
      }
    }
    return false;
  }

  private getIntensifier(tokens: string[], index: number): number {
    if (index > 0) {
      const prevToken = tokens[index - 1];
      const twoBack = index > 1 ? `${tokens[index - 2]} ${prevToken}` : '';
      
      if (INTENSIFIERS[twoBack]) {
        return INTENSIFIERS[twoBack];
      }
      if (INTENSIFIERS[prevToken]) {
        return INTENSIFIERS[prevToken];
      }
    }
    return 1;
  }

  public analyzeSentiment(text: string): SentimentResult {
    const tokens = this.tokenize(text);
    const positiveWords: string[] = [];
    const negativeWords: string[] = [];
    const neutralWords: string[] = [];
    const negations: string[] = [];
    
    let totalScore = 0;
    let wordCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (NEGATION_WORDS.includes(token)) {
        negations.push(token);
        continue;
      }

      const baseScore = this.combinedLexicon.get(token);
      if (baseScore !== undefined) {
        wordCount++;
        const isNegated = this.findNegationWindow(tokens, i);
        const intensifier = this.getIntensifier(tokens, i);
        
        let adjustedScore = baseScore * intensifier;
        if (isNegated) {
          adjustedScore *= -0.8;
        }
        
        totalScore += adjustedScore;
        
        if (adjustedScore > 0) {
          positiveWords.push(token);
        } else if (adjustedScore < 0) {
          negativeWords.push(token);
        } else {
          neutralWords.push(token);
        }
      }
    }

    const normalizedScore = wordCount > 0 ? totalScore / Math.sqrt(wordCount) : 0;
    const clampedScore = Math.max(-1, Math.min(1, normalizedScore / 5));
    
    let label: SentimentLabel;
    if (clampedScore > 0.1) {
      label = 'positive';
    } else if (clampedScore < -0.1) {
      label = 'negative';
    } else {
      label = 'neutral';
    }

    const confidence = this.calculateSentimentConfidence(wordCount, tokens.length, Math.abs(clampedScore));

    return {
      label,
      score: clampedScore,
      confidence,
      breakdown: {
        positiveWords,
        negativeWords,
        neutralWords,
        negations,
      },
    };
  }

  private calculateSentimentConfidence(
    sentimentWordCount: number,
    totalTokens: number,
    scoreIntensity: number
  ): number {
    if (totalTokens === 0) return 0;

    const coverage = Math.min(1, sentimentWordCount / Math.max(5, totalTokens * 0.3));
    const intensityFactor = Math.min(1, scoreIntensity * 2);
    const volumeFactor = Math.min(1, sentimentWordCount / 5);

    return (coverage * 0.4 + intensityFactor * 0.35 + volumeFactor * 0.25);
  }

  public detectEmotions(text: string): EmotionResult {
    const tokens = this.tokenize(text);
    const scores: Record<Emotion, number> = {
      happy: 0,
      sad: 0,
      angry: 0,
      excited: 0,
      calm: 0,
    };

    let matchedTokens = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const emotions = this.emotionLexicon.get(token);
      
      if (emotions) {
        matchedTokens++;
        const isNegated = this.findNegationWindow(tokens, i);
        const intensifier = this.getIntensifier(tokens, i);
        
        for (const emotion of emotions) {
          let increment = intensifier;
          
          if (isNegated) {
            const opposites: Record<Emotion, Emotion> = {
              happy: 'sad',
              sad: 'happy',
              angry: 'calm',
              excited: 'calm',
              calm: 'excited',
            };
            scores[opposites[emotion]] += increment * 0.5;
          } else {
            scores[emotion] += increment;
          }
        }
      }
    }

    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
    const normalizedScores: Record<Emotion, number> = {} as Record<Emotion, number>;
    
    for (const emotion of Object.keys(scores) as Emotion[]) {
      normalizedScores[emotion] = totalScore > 0 ? scores[emotion] / totalScore : 0.2;
    }

    const maxEmotion = (Object.entries(normalizedScores) as [Emotion, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    const emotionalIntensity = Math.min(1, totalScore / Math.max(5, tokens.length * 0.2));
    const confidence = matchedTokens > 0 
      ? Math.min(1, matchedTokens / Math.max(3, tokens.length * 0.15))
      : 0;

    return {
      primary: maxEmotion,
      scores: normalizedScores,
      confidence,
      emotionalIntensity,
    };
  }

  public detectToxicity(text: string): ToxicityResult {
    const lowerText = text.toLowerCase();
    const tokens = this.tokenize(text);
    const flaggedTerms: string[] = [];
    const categoryScores = {
      profanity: 0,
      harassment: 0,
      hate: 0,
      threat: 0,
      spam: 0,
    };

    for (const token of tokens) {
      const category = this.toxicityPatterns.get(token);
      if (category && category in categoryScores) {
        flaggedTerms.push(token);
        categoryScores[category as keyof typeof categoryScores]++;
      }
    }

    for (const [phrase, category] of Array.from(this.toxicityPatterns.entries())) {
      if (phrase.includes(' ') && lowerText.includes(phrase)) {
        if (!flaggedTerms.includes(phrase)) {
          flaggedTerms.push(phrase);
          categoryScores[category as keyof typeof categoryScores]++;
        }
      }
    }

    const weightedScore = 
      categoryScores.profanity * 0.3 +
      categoryScores.harassment * 0.6 +
      categoryScores.hate * 1.0 +
      categoryScores.threat * 1.0 +
      categoryScores.spam * 0.2;

    const normalizedScore = Math.min(1, weightedScore / 5);
    
    let level: ToxicityLevel;
    if (normalizedScore < 0.1) level = 'none';
    else if (normalizedScore < 0.3) level = 'low';
    else if (normalizedScore < 0.5) level = 'moderate';
    else if (normalizedScore < 0.7) level = 'high';
    else level = 'severe';

    const isToxic = normalizedScore >= 0.3;
    const confidence = flaggedTerms.length > 0 
      ? Math.min(1, 0.5 + flaggedTerms.length * 0.1)
      : 0.8;

    const normalizedCategories = {
      profanity: Math.min(1, categoryScores.profanity / 3),
      harassment: Math.min(1, categoryScores.harassment / 2),
      hate: Math.min(1, categoryScores.hate / 1),
      threat: Math.min(1, categoryScores.threat / 1),
      spam: Math.min(1, categoryScores.spam / 3),
    };

    return {
      isToxic,
      level,
      score: normalizedScore,
      confidence,
      flaggedTerms,
      categories: normalizedCategories,
    };
  }

  public analyzeAspects(text: string): AspectSentiment[] {
    const results: AspectSentiment[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    for (const [aspect, pattern] of Array.from(this.aspectPatterns.entries())) {
      const mentions: string[] = [];
      let aspectSentimentSum = 0;
      let aspectCount = 0;

      for (const sentence of sentences) {
        const matches = sentence.match(pattern);
        if (matches) {
          mentions.push(...matches);
          const sentimentResult = this.analyzeSentiment(sentence);
          aspectSentimentSum += sentimentResult.score;
          aspectCount++;
        }
      }

      if (mentions.length > 0) {
        const avgScore = aspectCount > 0 ? aspectSentimentSum / aspectCount : 0;
        
        let label: SentimentLabel;
        if (avgScore > 0.1) label = 'positive';
        else if (avgScore < -0.1) label = 'negative';
        else label = 'neutral';

        const confidence = Math.min(1, mentions.length / 3 * 0.5 + 0.5);

        results.push({
          aspect: aspect.replace(/_/g, ' '),
          label,
          score: avgScore,
          confidence,
          mentions: Array.from(new Set(mentions)).slice(0, 5),
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  public analyze(text: string): FullAnalysisResult {
    const sentiment = this.analyzeSentiment(text);
    const emotions = this.detectEmotions(text);
    const toxicity = this.detectToxicity(text);
    const aspects = this.analyzeAspects(text);

    const overallConfidence = (
      sentiment.confidence * 0.35 +
      emotions.confidence * 0.25 +
      toxicity.confidence * 0.2 +
      (aspects.length > 0 ? aspects.reduce((sum, a) => sum + a.confidence, 0) / aspects.length * 0.2 : 0.2)
    );

    this.lastAnalysis = {
      sentiment,
      emotions,
      toxicity,
      aspects,
      overallConfidence,
    };

    return this.lastAnalysis;
  }

  public getConfidence(): number {
    if (!this.lastAnalysis) {
      return 0;
    }
    return this.lastAnalysis.overallConfidence;
  }

  public getLastAnalysis(): FullAnalysisResult | null {
    return this.lastAnalysis;
  }

  public addCustomTerm(term: string, score: number, category?: 'sentiment' | 'emotion' | 'toxicity', emotion?: Emotion): void {
    const normalizedTerm = term.toLowerCase();
    
    if (category === 'sentiment' || !category) {
      this.combinedLexicon.set(normalizedTerm, score);
    }
    
    if (category === 'emotion' && emotion) {
      const existing = this.emotionLexicon.get(normalizedTerm) || [];
      if (!existing.includes(emotion)) {
        existing.push(emotion);
        this.emotionLexicon.set(normalizedTerm, existing);
      }
    }
  }

  public batchAnalyze(texts: string[]): FullAnalysisResult[] {
    return texts.map(text => this.analyze(text));
  }

  public getAggregatedSentiment(texts: string[]): {
    averageScore: number;
    distribution: Record<SentimentLabel, number>;
    dominantSentiment: SentimentLabel;
  } {
    const results = texts.map(text => this.analyzeSentiment(text));
    const distribution: Record<SentimentLabel, number> = {
      positive: 0,
      negative: 0,
      neutral: 0,
    };

    let totalScore = 0;
    for (const result of results) {
      distribution[result.label]++;
      totalScore += result.score;
    }

    const averageScore = results.length > 0 ? totalScore / results.length : 0;
    const dominantSentiment = (Object.entries(distribution) as [SentimentLabel, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    for (const label of Object.keys(distribution) as SentimentLabel[]) {
      distribution[label] = distribution[label] / results.length;
    }

    return {
      averageScore,
      distribution,
      dominantSentiment,
    };
  }
}

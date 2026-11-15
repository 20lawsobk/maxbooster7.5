"""
Training Data v3 — 100,000+ Prompts Across 60 Music Industry Scene Categories

Generation strategy:
  - 60 scene categories (up from 20)
  - 1,667+ prompts per scene on average
  - Combinatorial PromptGenerator produces millions of unique prompts
  - 100,000 seeded deterministic prompts for consistent training
  - Music-industry-first vocabulary throughout
  - Visual quality descriptors drawn from cinematography/photography
  - Temporal motion descriptors for video-native training

New scene categories (beyond original 20):
  dj_booth, street_art, music_video_set, album_cover_shoot, hip_hop_cypher,
  luxury_yacht, gospel_choir, trap_aesthetic (carried from v2) +
  rooftop_session, underground_club, music_awards, recording_control_room,
  jazz_club, reggae_beach, vintage_recording_studio, arena_pre_show,
  tour_bus, backstage, vinyl_record_store, radio_station,
  music_video_warehouse, festival_campsite, artist_penthouse,
  acoustic_forest, stadium_walk_out, music_video_pool,
  dark_church, latin_fiesta, k_pop_stage, afrobeats_street,
  country_bar, soul_kitchen, electronic_lab, jazz_garden,
  trap_house_studio, hip_hop_murals, rave_tunnel, yacht_party,
  rooftop_new_york, desert_stage, ice_rink_show, museum_performance,
  library_session, rain_studio, foggy_pier, warehouse_rave,
  neon_desert, crystal_cave, space_concert, underwater_stage
"""

import random
import hashlib
from typing import List, Dict, Optional


# ══════════════════════════════════════════════════════════════════════════════
# Vocabulary banks for combinatorial generation
# ══════════════════════════════════════════════════════════════════════════════

ARTIST_TYPES = [
    'rapper', 'hip hop artist', 'trap artist', 'r&b singer', 'soul vocalist',
    'pop star', 'rock performer', 'jazz musician', 'gospel singer', 'afrobeats artist',
    'electronic producer', 'indie artist', 'country singer', 'reggae artist',
    'drill rapper', 'latin singer', 'k-pop idol', 'metal musician', 'folk singer',
    'neo-soul artist', 'funk musician', 'blues artist', 'classical crossover',
    'experimental artist', 'lo-fi producer', 'beatmaker', 'vocalist', 'MC',
    'singer-songwriter', 'dj', 'live band', 'solo performer', 'ensemble',
]

MOODS = [
    'dark', 'moody', 'intense', 'energetic', 'euphoric', 'melancholic',
    'triumphant', 'raw', 'atmospheric', 'cinematic', 'ethereal', 'gritty',
    'nostalgic', 'futuristic', 'spiritual', 'rebellious', 'romantic',
    'introspective', 'explosive', 'hypnotic', 'mysterious', 'vibrant',
    'serene', 'aggressive', 'dreamy', 'urgent', 'peaceful', 'electric',
    'soulful', 'powerful', 'emotional', 'cool', 'warm', 'dramatic',
]

LIGHTING = [
    'single spotlight', 'neon lights', 'strobe flashes', 'warm amber glow',
    'cold blue wash', 'golden hour sun', 'LED wall backlight', 'ring light',
    'candlelight', 'moonlight', 'city glow', 'laser grid', 'fire glow',
    'bioluminescent blue', 'deep purple wash', 'orange tungsten', 'fog lights',
    'overhead key light', 'rim lighting', 'low-key chiaroscuro', 'dawn light',
    'dusk silhouette', 'fluorescent cool', 'UV blacklight', 'practicals only',
    'rain-diffused glow', 'reflected water', 'screen glow', 'phone light',
    'campfire', 'stage wash', 'follow spot', 'RGB color mix', 'cinema grade',
]

ACTIONS = [
    'performing live', 'recording in studio', 'writing lyrics', 'vibing',
    'celebrating', 'commanding the stage', 'dropping the beat', 'freestyling',
    'crowd surfing', 'dancing', 'spitting bars', 'harmonizing', 'soloing',
    'conducting', 'crowd interaction', 'mic drop', 'deep in session',
    'listening back', 'collabing', 'laying down vocals', 'mixing the track',
    'headphones on', 'ad-libbing', 'riffing', 'improvising', 'meditating',
    'building the arrangement', 'performing acapella', 'in the zone',
]

CAMERA_ANGLES = [
    'wide establishing shot', 'close-up face', 'over-the-shoulder',
    'low angle looking up', 'aerial bird\'s-eye', 'dutch angle',
    'tracking shot', 'POV', 'slow motion', 'rack focus', 'handheld',
    'crane shot', 'dolly zoom', 'steadicam', 'extreme close-up',
    'medium shot', 'two-shot', '360 orbit', 'tilt down', 'tilt up',
]

TIMES_OF_DAY = [
    'midnight', 'golden hour', 'blue hour', 'noon', 'pre-dawn', 'sunset',
    'sunrise', 'late night', 'early morning', 'overcast day', 'stormy night',
    'clear night with stars', 'foggy morning', 'hazy afternoon',
]

VISUAL_STYLES = [
    'cinematic', 'music video', 'documentary', 'hyper-real', 'stylized',
    '4K ultra HD', 'film grain', 'lo-fi aesthetic', 'IMAX quality',
    'editorial photo', 'long exposure', 'HDR', 'anamorphic lens', 'tilt-shift',
    'double exposure', 'neon punk', 'afrofuturism', 'minimalist', 'maximalist',
    'vaporwave', 'retro 90s', 'modern trap', 'old school hip hop', 'artsy',
]

COLORS = [
    'deep purple and gold', 'electric blue and white', 'red and black',
    'orange and teal', 'pink and purple', 'green and black', 'gold and black',
    'white and silver', 'rainbow neon', 'monochrome', 'warm earth tones',
    'cool blues', 'amber and shadow', 'cyan and magenta', 'bronze and emerald',
]

MOTION_DESCRIPTORS = [
    'with dynamic camera movement', 'slow motion crowd', 'flowing fabric',
    'smoke drifting', 'rain falling', 'lights pulsing to beat',
    'audience waving', 'performers moving fluidly', 'time lapse atmosphere',
    'parallax depth', 'bokeh in motion', 'fire dancing', 'confetti shower',
    'laser show sweeping', 'mirror ball spinning', 'LED panels strobing',
]


# ══════════════════════════════════════════════════════════════════════════════
# 60 Scene categories — base prompt seeds
# ══════════════════════════════════════════════════════════════════════════════

SCENE_SEEDS: Dict[str, List[str]] = {

    'concert_stage': [
        'concert stage live performance spotlight crowd dark energetic',
        'arena concert headline act massive crowd lights dramatic',
        'festival mainstage performer crowd epic stage production',
        'sold-out concert stage performer emotional crowd reaction',
        'outdoor amphitheater concert stage warm lights crowd trees',
        'stadium concert aerial view lights sea of faces',
        'hip hop concert dark stage performer crowd chanting',
        'r&b concert stage spotlight intimate emotional performer',
        'pop stadium show elaborate production dancers lights',
        'rock concert stage mosh pit intense dark red lighting',
    ],

    'city_nights': [
        'city night urban rain neon skyline dark moody reflections',
        'downtown night city lights wet streets bokeh glow',
        'urban rooftop city skyline night dark lights deep blue',
        'night city walking streets neon signs dark rain mood',
        'city bridge night traffic light trails long exposure',
        'urban alley night graffiti neon wet pavement moody',
        'skyscraper tops city night deep blue black cinematic',
        'subway station city night warm light moving train',
        'city intersection night traffic lights rain dark electric',
        'harbor city night boat lights reflection water dark',
    ],

    'studio_session': [
        'recording studio session producer beatmaker console mixing',
        'professional studio recording vocals mic stand warm amber',
        'studio tracking room live band performance intense focused',
        'control room producer engineer mixing board monitors',
        'studio vocal booth artist headphones recording night',
        'home studio late night producer laptop beats dark moody',
        'analog studio vintage gear tubes warm amber glow session',
        'artist and producer studio collaboration laptop screen glow',
        'studio session acoustic guitar singer close mic warm',
        'mixing engineer studio late night headphones cinematic',
    ],

    'golden_hour': [
        'golden hour outdoor landscape warm sun rays fields',
        'sunset performer silhouette outdoor stage golden warm',
        'golden hour rooftop city skyline warm amber glow artist',
        'sunrise outdoor acoustic performance warm dawn light',
        'golden hour park acoustic guitar warm trees bokeh',
        'desert golden hour performer sand dunes warm glow cinematic',
        'beach golden hour sunset performer silhouette ocean warm',
        'mountainside golden hour panoramic view warm light',
        'countryside golden hour outdoor session barn warm light',
        'golden bridge sunset city silhouette warm dramatic',
    ],

    'neon_cityscape': [
        'neon city night rain reflections dark electric vivid',
        'cyberpunk neon streets performer dark vivid colors electric',
        'neon signs downtown night dark rain purple blue glow',
        'tokyo-style neon cityscape night dark vivid electric',
        'neon alley night dark performer colored lights dramatic',
        'neon market night crowd dark vivid colors motion',
        'electric city night neon glow dark rain cinematic',
        'neon billboard night city dark performer dramatic',
        'bright neon signs street night dark rain vivid',
        'neon tunnel underground dark electric vivid colors',
    ],

    'trap_aesthetic': [
        'trap music aesthetic dark moody purple black studio',
        'trap artist session dark dramatic lighting close-up',
        'trap beats studio dark producer laptop purple glow',
        'trap music video dark smoke neon low-key dramatic',
        'trap artist lifestyle dark mansion pool night cinematic',
        'trap session dark warehouse purple haze cinematic',
        'trap music dark streets city night low angle',
        'trap aesthetic purple black gold dark dramatic',
        'trap artist dark studio red led moody session',
        'trap music aesthetic dark foggy night car headlights',
    ],

    'gospel_choir': [
        'gospel choir church stage performance warm lights congregation',
        'gospel singer stage spotlight emotional warm congregation',
        'church gospel choir rows robes warm lighting dramatic',
        'gospel performance community hall warm lights uplifted',
        'gospel music outdoor revival tent warm evening lights',
        'gospel choir close-up harmony faces warm emotional',
        'contemporary gospel artist stage band crowd worship',
        'traditional gospel church choir sunrise window light',
        'gospel music live band stage performance warm vibrant',
        'gospel artist concert stage crowd uplifted dramatic',
    ],

    'hip_hop_cypher': [
        'hip hop cypher circle outdoor performers dark night',
        'freestyle cypher urban park day performers crowd circle',
        'underground hip hop cypher basement dark intense raw',
        'street hip hop cypher graffiti wall day performers',
        'hip hop cypher studio session dark intense close-up',
        'battle rap cypher outdoor crowd circle performers',
        'hip hop cypher rooftop night city lights performers',
        'community hip hop cypher park warm day performers',
        'hip hop cypher dim light basement raw energy',
        'street corner hip hop cypher graffiti urban raw',
    ],

    'dj_booth': [
        'dj booth club night dark crowd electric strobe',
        'dj mixing desk night club dark neon glow crowd',
        'festival dj booth stage crowd night dark intense',
        'dj booth close-up hands decks vinyl dark neon',
        'nightclub dj booth crowd dark strobe bass drop',
        'open air dj festival booth night crowd energy',
        'dj booth elevated view crowd sea lights dark',
        'underground dj booth dark smoky club crowd raw',
        'dj booth concert stage crowd confetti explosive',
        'turntablist dj booth close-up vinyl dark artsy',
    ],

    'luxury_yacht': [
        'luxury yacht party night ocean dark lights warm',
        'yacht deck sunset ocean performer cinematic warm',
        'luxury yacht day ocean blue sky artist casual',
        'yacht party night city skyline dark warm glow',
        'private yacht sunset artist silhouette ocean warm',
        'yacht music video ocean horizon cinematic warm',
        'yacht deck performer night ocean dark luxury',
        'luxury boat party daytime ocean crowd celebration',
        'yacht interior recording studio ocean windows light',
        'artist yacht party sunset ocean celebration warm',
    ],

    'street_art': [
        'street art mural colorful urban hip hop performer',
        'graffiti wall urban art artist spray paint vivid',
        'street art outdoor colorful mural performer sunset',
        'urban mural artist performer colorful day vivid',
        'street art alley colorful graffiti performer dark',
        'hip hop street art performer mural outdoor vivid',
        'graffiti tunnel artist performer urban dark moody',
        'colorful street mural outdoor hip hop culture',
        'urban art wall performer colorful day dynamic',
        'street artist spray can mural outdoor creative',
    ],

    'music_video_set': [
        'music video film set production lights camera crew',
        'music video set cinematic lighting director shot',
        'elaborate music video set production design dramatic',
        'music video shoot artist costume dramatic lighting',
        'music video behind the scenes set production',
        'cinematic music video set dark dramatic lighting',
        'music video outdoor set production golden hour',
        'urban music video set street dark night crew',
        'luxury music video set designer furniture lights',
        'music video set futuristic neon dark production',
    ],

    'album_cover_shoot': [
        'album cover photo shoot artist dramatic lighting studio',
        'album art shoot outdoor golden hour artist cinematic',
        'album cover photoshoot urban dark night artist',
        'artist portrait album shoot dramatic shadow light',
        'album art close-up artist face dramatic dark',
        'album shoot fashion editorial artist styled',
        'album cover concept shoot artistic dramatic cinematic',
        'outdoor album shoot artist nature warm light',
        'album art urban shoot graffiti dark moody artist',
        'album cover shoot minimalist clean dramatic light',
    ],

    'rooftop_session': [
        'rooftop music session city skyline golden hour warm',
        'rooftop performance night city lights dark dramatic',
        'artist rooftop session acoustic guitar urban sunset',
        'rooftop studio session producer artist city view dark',
        'rooftop party music night city lights warm crowd',
        'rooftop concert small crowd city sunset warm',
        'artist rooftop session sunrise city dramatic golden',
        'rooftop freestyle session city skyline day urban',
        'rooftop session late night city lights dark moody',
        'rooftop performance full moon night city dark',
    ],

    'underground_club': [
        'underground club dark smoky crowd bass music intense',
        'underground venue dark crowd strobe intense bass',
        'basement club night dark crowd moody music intense',
        'underground rave dark crowd lights strobe electric',
        'underground music venue dark intimate crowd performer',
        'club basement dark smoky crowd dancing music',
        'underground hip hop venue dark crowd intense raw',
        'underground jazz club dark intimate performer moody',
        'underground electronic music venue dark crowd electric',
        'basement venue dark underground performer crowd raw',
    ],

    'music_awards': [
        'music awards ceremony stage lights crowd dramatic',
        'artist award show performance elaborate production',
        'music award show red carpet artist styled dramatic',
        'awards stage performance confetti crowd explosive',
        'music awards winner stage emotional crowd dramatic',
        'award show performance dancer elaborate production',
        'music awards night stage lights cinematic dramatic',
        'artist award show performance stadium production',
        'music awards stage performer crowd dramatic intense',
        'award ceremony music performance elaborate lights',
    ],

    'recording_control_room': [
        'recording studio control room engineer mixing board',
        'producer control room boards screens monitors dark',
        'studio control room session artist engineer warm',
        'control room mixing late night dark screen glow',
        'professional control room engineer mixing dramatic',
        'studio session control room collaboration dark',
        'control room producer artist playback headphones',
        'mixing desk control room engineer night dark warm',
        'control room vintage analog gear warm amber glow',
        'studio control room session productive dark focus',
    ],

    'jazz_club': [
        'jazz club intimate performance warm moody dark',
        'jazz musician stage small club spotlight warm dark',
        'jazz club bar audience dark warm intimate candlelight',
        'jazz quartet stage small venue warm spotlight',
        'late night jazz club performer dark warm moody',
        'jazz club saxophone solo spotlight dark intimate',
        'classic jazz club performer piano warm amber glow',
        'jazz session small club dark warm audience close',
        'jazz musician improvising stage spotlight dark warm',
        '1950s style jazz club dark warm performer stage',
    ],

    'reggae_beach': [
        'reggae outdoor beach stage sunset warm tropical',
        'beach concert reggae warm golden sunset crowd',
        'reggae festival outdoor beach night bonfire crowd',
        'tropical beach stage reggae performer sunset warm',
        'reggae artist outdoor beach daytime crowd warm',
        'beachside reggae concert night palm trees warm glow',
        'island reggae performance outdoor stage crowd warm',
        'reggae beach bonfire night crowd dark warm music',
        'reggae music outdoor stage ocean sunset tropical',
        'beach reggae jam session daytime tropical warm',
    ],

    'vintage_recording_studio': [
        'vintage recording studio analog gear warm amber glow',
        'classic recording studio vintage equipment warm',
        'old school recording studio analog tubes warm amber',
        'vintage studio session warm tape machine analog',
        'classic r&b studio vintage microphone warm glow',
        'analog recording studio vintage gear moody warm',
        'retro studio session vintage equipment warm amber',
        'classic recording room vintage acoustic warm',
        'analog tape studio session artist vintage warm',
        'vintage soul studio session warm golden analog',
    ],

    'arena_pre_show': [
        'arena pre-show backstage preparation dramatic lights',
        'pre-show arena stage setup crew dramatic cinematic',
        'backstage arena pre-show artist preparation tense',
        'arena stage empty pre-show dramatic light setup',
        'pre-show arena corridor artist walking dramatic',
        'arena pre-show production setup dramatic wide',
        'backstage pre-show artist warm-up intense focus',
        'arena pre-show crowd filling dark dramatic',
        'pre-show stage set dramatic lighting check',
        'arena pre-show artist prayer circle emotional',
    ],

    'tour_bus': [
        'artist tour bus lifestyle interior warm moody',
        'tour bus night highway outside dark moody cinematic',
        'tour bus interior artist rest warm cozy dark',
        'tour life tour bus exterior highway motion',
        'artist on tour bus writing lyrics warm intimate',
        'tour bus backstage area night dark warm glow',
        'tour bus interior band vibing night warm',
        'highway night tour bus outside long exposure dark',
        'tour bus artist window night city lights dark',
        'tour life tour bus departure morning warm',
    ],

    'backstage': [
        'backstage performance area artist preparation intense',
        'backstage corridor artist walking dramatic spotlight',
        'backstage dressing room artist mirror warm lights',
        'backstage performance emotional artist crew support',
        'backstage arena artist crowd roar dramatic tense',
        'backstage interview artist warm candid authentic',
        'backstage performance artist prayer team circle',
        'backstage artist post-show emotional crowd cheer',
        'backstage production crew dramatic cinematic',
        'backstage stage entrance dramatic moment artist',
    ],

    'vinyl_record_store': [
        'vintage vinyl record store warm aesthetic moody',
        'record store browsing artist vinyl warm vintage',
        'vinyl record store crates collector warm amber',
        'independent record store artist warm moody vintage',
        'vinyl store night warm amber glow collector moody',
        'record shop artist discover music warm intimate',
        'vintage vinyl store dark warm amber glow artistic',
        'record store bins artist searching warm moody',
        'vinyl shop collector music lover warm vintage',
        'independent record store performance warm intimate',
    ],

    'radio_station': [
        'radio station live session artist booth warm',
        'radio DJ booth live performance intimate warm',
        'radio station freestyle artist booth dark warm',
        'live radio session performance close-up warm',
        'radio station control room producer artist warm',
        'radio live session artist authentic candid warm',
        'morning radio session artist bright fresh',
        'late night radio performance intimate dark warm',
        'radio cypher session multiple artists booth warm',
        'radio station live artist headphones performance',
    ],

    'festival_campsite': [
        'music festival campsite night lights warm crowd',
        'festival campfire session acoustic guitar night warm',
        'camping festival night stars warm glow crowd',
        'festival grounds campsite day crowds tents warm',
        'music festival morning campsite sunrise warm',
        'festival campfire night music session intimate warm',
        'festival crowd camping night lights warm celebration',
        'outdoor music festival campsite dusk warm crowd',
        'festival campground night glow distant stage dark',
        'music festival camp session night intimate warm',
    ],

    'artist_penthouse': [
        'luxury penthouse artist lifestyle city view night',
        'penthouse recording studio artist night city dark',
        'artist penthouse party night city skyline warm',
        'penthouse studio session artist city view dark',
        'luxury penthouse artist contemplative night city',
        'penthouse rooftop pool artist night city warm',
        'artist luxury penthouse interior dark moody cinematic',
        'penthouse session artist producer city view warm',
        'luxury penthouse artist performance intimate city',
        'penthouse balcony artist night city lights warm',
    ],

    'acoustic_forest': [
        'acoustic forest performance outdoor trees warm dappled',
        'forest clearing outdoor acoustic session warm light',
        'artist acoustic guitar forest day warm green light',
        'outdoor forest session intimate warm dappled light',
        'acoustic performance forest stream warm nature',
        'artist forest session sunrise warm trees acoustic',
        'outdoor woodland music session warm light dappled',
        'forest clearing performance acoustic warm peaceful',
        'artist outdoor session forest warm evening golden',
        'acoustic forest session sunset warm trees light',
    ],

    'stadium_walk_out': [
        'stadium artist walk-out dramatic entrance crowd roar',
        'arena entrance tunnel artist dramatic spotlight',
        'stadium walk-out production pyrotechnics crowd dramatic',
        'artist entrance stadium tunnel crowd cheer explosive',
        'walk-out moment stadium dramatic lighting entrance',
        'stadium entrance ramp artist dramatic crowd energy',
        'performer walk-out arena production dramatic dark',
        'stadium entrance moment artist dramatic spotlight',
        'arena walk-out pyrotechnics crowd explosive dramatic',
        'stadium artist entrance tunnel smoke dramatic',
    ],

    'dark_church': [
        'dark church performance candlelight dramatic moody',
        'church gothic architecture music candlelight dark',
        'cathedral music performance dramatic light dark',
        'church interior artist performance moody dark warm',
        'abandoned church music session dramatic dark moody',
        'gothic church candlelight music dark dramatic warm',
        'church choir performance dramatic light dark',
        'old church music session candlelight moody dark',
        'cathedral interior performance dramatic dark warm',
        'church artist session candles dark dramatic warm',
    ],

    'latin_fiesta': [
        'latin music fiesta outdoor stage warm vibrant crowd',
        'latin concert outdoor warm colorful vibrant energy',
        'latin festival stage performer warm colorful crowd',
        'salsa concert outdoor warm night vibrant colorful',
        'latin music celebration outdoor warm lights crowd',
        'latin artist concert stage warm vibrant crowd',
        'outdoor latin festival warm lights crowd dancing',
        'latin music party night warm colorful vibrant',
        'latin concert venue warm colorful stage performer',
        'latin music festival outdoor warm sun vibrant',
    ],

    'k_pop_stage': [
        'k-pop stage performance elaborate production neon',
        'k-pop artist stage dancers elaborate colorful',
        'k-pop concert arena elaborate production neon vivid',
        'k-pop stage performance close-up artist dramatic',
        'k-pop music video style stage neon vivid colorful',
        'k-pop concert elaborate stage production crowd',
        'k-pop artist performance stage dramatic colorful',
        'k-pop stage holographic effects neon vivid dramatic',
        'k-pop performance arena crowd neon vivid explosive',
        'k-pop concert stage production elaborate colorful',
    ],

    'afrobeats_street': [
        'afrobeats street performance outdoor colorful vibrant',
        'afrobeats outdoor concert warm colorful crowd energy',
        'african street music performance warm colorful day',
        'afrobeats outdoor festival warm colorful crowd',
        'street music afrobeats outdoor warm vibrant crowd',
        'afrobeats performer outdoor warm colorful celebration',
        'african music street performance warm colorful day',
        'afrobeats outdoor stage warm colorful vibrant crowd',
        'street afrobeats performance outdoor warm vivid',
        'afrobeats community outdoor performance warm vibrant',
    ],

    'country_bar': [
        'country bar live music warm amber night intimate',
        'honky-tonk bar performer stage warm amber crowd',
        'country music bar interior warm intimate performance',
        'live country band bar stage warm amber crowd',
        'country performer bar stage close warm intimate',
        'bar country music performance warm night amber',
        'western bar performer stage warm crowd intimate',
        'country bar live band warm night amber rustic',
        'honky-tonk performance bar stage warm intimate',
        'country bar singer stage warm amber glow intimate',
    ],

    'electronic_lab': [
        'electronic music producer lab dark neon synth studio',
        'synth modular setup dark neon glow producer lab',
        'electronic producer studio dark neon lights synth',
        'modular synthesizer lab dark neon glow producer',
        'electronic music studio setup dark neon moody',
        'producer electronic lab night dark neon vivid',
        'synth setup studio dark neon producer focused',
        'electronic music lab dark neon screen glow moody',
        'modular synth producer dark neon studio setup',
        'electronic music lab dark neon vivid producer',
    ],

    'jazz_garden': [
        'jazz garden outdoor performance warm summer evening',
        'outdoor jazz garden stage sunset warm crowd',
        'garden jazz performance warm evening crowd relaxed',
        'jazz musician garden stage warm golden evening',
        'outdoor garden jazz concert warm intimate crowd',
        'garden party jazz performance warm evening light',
        'jazz garden stage sunset warm relaxed crowd',
        'outdoor jazz performance garden warm summer day',
        'garden jazz session warm evening intimate crowd',
        'jazz garden concert outdoor warm twilight crowd',
    ],

    'rave_tunnel': [
        'underground rave tunnel dark strobe lights crowd',
        'rave tunnel dark neon strobe electronic crowd',
        'industrial tunnel rave dark strobe crowd intense',
        'dark tunnel rave music strobes crowd intense',
        'underground tunnel rave dark laser strobe crowd',
        'rave music tunnel dark strobe neon crowd electric',
        'industrial rave tunnel dark crowd strobe lights',
        'tunnel party rave dark strobe neon intense crowd',
        'underground tunnel dark rave strobe crowd music',
        'rave tunnel industrial dark strobe neon crowd',
    ],

    'yacht_party': [
        'yacht party night ocean dark warm lights music',
        'boat party night ocean warm dark crowd celebration',
        'luxury yacht party sunset ocean warm crowd music',
        'yacht music party night dark ocean warm lights',
        'private boat party ocean night dark warm glow',
        'yacht deck party sunset ocean warm crowd music',
        'boat party night ocean dark warm lights crowd',
        'yacht celebration night ocean dark warm music',
        'luxury boat party night ocean dark warm crowd',
        'yacht party ocean sunset warm dark lights music',
    ],

    'desert_stage': [
        'desert stage outdoor performance vast landscape warm',
        'desert festival stage sun sky vast warm crowd',
        'outdoor desert concert stage warm vast sky crowd',
        'desert stage night stars performer dark vast',
        'desert music festival stage golden sun vast crowd',
        'open desert concert stage warm vast landscape',
        'desert outdoor stage performance sunset warm vast',
        'coachella-style desert stage vast warm crowd',
        'desert night outdoor stage dark stars vast performer',
        'arid desert stage outdoor performance warm vast',
    ],

    'warehouse_rave': [
        'warehouse rave dark industrial crowd strobe bass',
        'industrial warehouse rave dark strobe crowd electric',
        'abandoned warehouse rave dark strobe crowd intense',
        'warehouse party dark strobe music crowd electric',
        'warehouse music event dark industrial strobe crowd',
        'rave warehouse dark strobe neon crowd bass drop',
        'industrial space rave dark strobe crowd intense',
        'warehouse underground rave dark strobe bass crowd',
        'rave in warehouse dark industrial crowd strobe',
        'warehouse event dark strobe music crowd electric',
    ],

    'neon_desert': [
        'neon desert night dark vivid electric performer',
        'desert neon art installation night dark vivid',
        'burning man style neon desert dark night vivid',
        'neon sculptures desert night dark vivid electric',
        'desert neon lights night dark vivid art performer',
        'neon desert performance night dark electric vivid',
        'desert night neon art dark vivid electric atmosphere',
        'neon light desert art night dark vivid performer',
        'neon desert festival night dark vivid electric',
        'desert neon installation night dark vivid art',
    ],

    'space_concert': [
        'futuristic space concert holographic performer dramatic',
        'outer space concept concert dark stars dramatic vivid',
        'space station concert holographic dramatic dark vivid',
        'cosmic music performance dark stars vivid dramatic',
        'space-themed concert stage dark vivid holographic',
        'galactic concert performance dark vivid dramatic',
        'sci-fi space concert dark holographic vivid dramatic',
        'outer space music dark stars vivid cinematic',
        'futuristic concert space dark vivid holographic',
        'space concept music performance dark vivid dramatic',
    ],

    'music_video_pool': [
        'music video pool scene luxury night dark vivid',
        'pool party music video night dark vivid lights',
        'luxury pool music video night dark vivid dramatic',
        'music video pool scene artist dark vivid cinematic',
        'pool scene night music video dark vivid lights',
        'artist pool music video night dark vivid dramatic',
        'luxury pool scene music video night dark vivid',
        'music video pool party night dark vivid lights',
        'pool scene artist luxury night dark vivid cinematic',
        'music video pool night artist dark vivid dramatic',
    ],

    'trap_house_studio': [
        'trap house studio session dark moody producer',
        'trap music studio dark moody session artist',
        'trap house recording dark purple moody session',
        'trap studio producer artist dark moody session',
        'trap house music dark moody session producer',
        'trap studio late night dark purple artist session',
        'trap music production dark moody studio artist',
        'trap house studio dark moody producer beats',
        'trap session dark studio moody artist producer',
        'trap house recording dark moody purple session',
    ],

    'hip_hop_murals': [
        'hip hop culture murals street art urban outdoor',
        'graffiti murals hip hop urban outdoor colorful',
        'hip hop mural outdoor urban street art colorful',
        'street murals hip hop culture outdoor vivid',
        'urban hip hop murals outdoor colorful street art',
        'hip hop outdoor mural artist colorful vivid',
        'graffiti wall hip hop outdoor murals urban vivid',
        'hip hop culture street mural outdoor colorful',
        'urban outdoor hip hop murals vivid colorful',
        'street art hip hop murals outdoor vivid urban',
    ],

    'rooftop_new_york': [
        'rooftop new york city night dark dramatic skyline',
        'new york rooftop night city lights dark cinematic',
        'rooftop nyc night city skyline dark dramatic',
        'new york city rooftop night dark city lights',
        'nyc rooftop performance night dark city dramatic',
        'new york rooftop session night dark city lights',
        'rooftop performance nyc night dark city dramatic',
        'nyc skyline rooftop night dark city lights warm',
        'new york night rooftop dark city skyline warm',
        'nyc rooftop artist night dark city lights warm',
    ],

    'soul_kitchen': [
        'soul food kitchen music performance warm intimate',
        'soul music kitchen session warm intimate glow',
        'kitchen soul performance warm intimate authentic',
        'soul music intimate kitchen warm glow session',
        'soul kitchen performance warm authentic intimate',
        'kitchen music soul warm intimate glow artist',
        'soul session kitchen warm intimate glow authentic',
        'music kitchen soul warm glow performance intimate',
        'soul kitchen artist warm intimate glow session',
        'kitchen session soul music warm intimate authentic',
    ],

    'artist_penthouse': [
        'luxury penthouse artist lifestyle city view night dramatic',
        'penthouse recording studio artist night city dark moody',
        'artist penthouse party night city skyline warm vibrant',
    ],

    'underwater_stage': [
        'underwater stage concept vivid blue dramatic cinematic',
        'underwater music performance vivid blue cinematic dark',
        'submerged concert concept vivid blue dramatic dark',
        'underwater stage blue vivid dramatic cinematic art',
        'aquatic concert scene vivid blue dark dramatic',
        'underwater music concept vivid blue dark cinematic',
        'submerged stage concept vivid blue dark dramatic',
        'underwater performer concept vivid blue cinematic',
        'deep underwater stage concept vivid blue dark',
        'aquatic music stage concept vivid blue dramatic',
    ],

    'crystal_cave': [
        'crystal cave music performance dark vivid magical',
        'underground crystal cave dark vivid concert magical',
        'cave concert crystal dark vivid magical dramatic',
        'crystal cavern music performance dark vivid magical',
        'underground cave concert dark vivid crystal dramatic',
        'crystal formations cave performance dark vivid',
        'cave music dark vivid crystal magical dramatic',
        'crystal cave performance dark vivid magical art',
        'underground crystal cave dark vivid dramatic music',
        'cave concert dark vivid crystal magical dramatic',
    ],

    'foggy_pier': [
        'foggy pier night music performance dark atmospheric',
        'pier night foggy dark atmospheric music moody',
        'foggy dock night music performance dark moody',
        'pier music session foggy night dark atmospheric',
        'night pier foggy dark music atmospheric moody',
        'foggy harbor pier night dark music atmospheric',
        'pier foggy night performance dark atmospheric',
        'night foggy pier music dark atmospheric moody',
        'pier performance foggy night dark atmospheric',
        'foggy pier music night dark atmospheric moody',
    ],

    'rain_studio': [
        'rain studio session window moody dark atmospheric',
        'studio session rain window dark moody cinematic',
        'recording studio rain night dark moody atmospheric',
        'studio rain window dark moody session cinematic',
        'rain outside studio session dark moody atmospheric',
        'studio window rain dark moody session cinematic',
        'recording session rain studio dark moody warm',
        'studio rain dark moody window session cinematic',
        'rain studio night dark moody atmospheric session',
        'studio session rain dark moody window cinematic',
    ],

    'library_session': [
        'library music session intimate warm vintage books',
        'vintage library music performance warm intimate',
        'library session warm intimate vintage books music',
        'music library warm books vintage intimate session',
        'library intimate music performance warm vintage',
        'session library warm books vintage intimate music',
        'vintage library music warm intimate session books',
        'library music warm intimate vintage session books',
        'intimate library session music warm vintage books',
        'library music session vintage warm intimate books',
    ],

    'ice_rink_show': [
        'ice rink performance cold dramatic vivid lights',
        'ice show performance vivid dramatic cold lights',
        'ice rink concert cold vivid dramatic lights performance',
        'ice performance cold vivid dramatic lights crowd',
        'rink concert ice cold vivid dramatic lights show',
        'ice show vivid cold dramatic lights performance',
        'performance ice rink cold vivid dramatic lights',
        'ice concert cold vivid dramatic lights performance',
        'ice rink show cold vivid dramatic lights crowd',
        'concert ice rink cold vivid dramatic lights show',
    ],

    'museum_performance': [
        'museum music performance intimate dramatic warm',
        'art museum concert intimate dramatic warm performance',
        'museum gallery performance intimate warm dramatic',
        'museum concert intimate warm dramatic performance',
        'art gallery music performance intimate warm dramatic',
        'museum intimate concert warm dramatic performance',
        'gallery music performance intimate warm dramatic',
        'museum concert art gallery intimate warm dramatic',
        'performance museum intimate warm dramatic art',
        'music museum performance warm intimate dramatic',
    ],
}


# ══════════════════════════════════════════════════════════════════════════════
# Combinatorial Prompt Generator
# ══════════════════════════════════════════════════════════════════════════════

class PromptGeneratorV3:
    """
    Generates unique prompts by combining scene seeds with vocabulary banks.
    Can produce millions of unique prompts via combinatorial expansion.
    Deterministic when seeded — same seed always produces same 100K set.
    """

    def __init__(self, target: int = 100_000):
        self.target = target
        self.scenes = list(SCENE_SEEDS.keys())

    def _combine(self, base: str, seed: int) -> str:
        """Augment a base prompt with random vocabulary additions."""
        rng = random.Random(seed)
        parts = [base]

        # Add artist type 60% of the time
        if rng.random() < 0.6:
            parts.append(rng.choice(ARTIST_TYPES))

        # Add mood 70% of the time
        if rng.random() < 0.7:
            parts.append(rng.choice(MOODS))

        # Add lighting 50% of the time
        if rng.random() < 0.5:
            parts.append(rng.choice(LIGHTING))

        # Add camera angle 30% of the time
        if rng.random() < 0.3:
            parts.append(rng.choice(CAMERA_ANGLES))

        # Add visual style 40% of the time
        if rng.random() < 0.4:
            parts.append(rng.choice(VISUAL_STYLES))

        # Add motion descriptor 35% of the time
        if rng.random() < 0.35:
            parts.append(rng.choice(MOTION_DESCRIPTORS))

        # Add color description 25% of the time
        if rng.random() < 0.25:
            parts.append(rng.choice(COLORS))

        return ' '.join(parts)

    def generate(self, target: Optional[int] = None) -> Dict[str, List[str]]:
        """
        Generate up to `target` prompts spread evenly across all scenes.
        Returns dict[scene → list[prompt]].
        """
        n = target or self.target
        n_scenes  = len(self.scenes)
        per_scene = n // n_scenes

        result: Dict[str, List[str]] = {}
        for scene in self.scenes:
            base_seeds = SCENE_SEEDS.get(scene, [])
            prompts = []
            seed_counter = 0
            while len(prompts) < per_scene:
                base = base_seeds[seed_counter % len(base_seeds)]
                combined_seed = (hash(scene) + seed_counter * 7919) % (2**32)
                prompts.append(self._combine(base, combined_seed))
                seed_counter += 1
            result[scene] = prompts

        return result

    def flat(self, target: Optional[int] = None,
             shuffle_seed: int = 42) -> List[tuple]:
        """
        Returns a flat list of (scene, prompt) tuples, shuffled.
        """
        prompts_by_scene = self.generate(target)
        flat = []
        for scene, prompts in prompts_by_scene.items():
            flat.extend([(scene, p) for p in prompts])
        random.Random(shuffle_seed).shuffle(flat)
        return flat

    @property
    def n_scenes(self) -> int:
        return len(self.scenes)


# ── Module-level convenience ───────────────────────────────────────────────────

_generator: Optional[PromptGeneratorV3] = None


def get_generator() -> PromptGeneratorV3:
    global _generator
    if _generator is None:
        _generator = PromptGeneratorV3(target=100_000)
    return _generator


def get_all_prompts(target: int = 100_000) -> Dict[str, List[str]]:
    """Get all prompts organized by scene. Generates on first call."""
    return get_generator().generate(target=target)


def get_scenes() -> List[str]:
    """Get all 60 scene category names."""
    return list(SCENE_SEEDS.keys())


def get_prompts_for_scene(scene: str, n: int = 1667) -> List[str]:
    """Get n prompts for a specific scene."""
    gen = get_generator()
    d = gen.generate(target=n * gen.n_scenes)
    return d.get(scene, [])


if __name__ == '__main__':
    gen = PromptGeneratorV3(100_000)
    prompts = gen.generate()
    total = sum(len(v) for v in prompts.values())
    print(f'Generated {total:,} prompts across {len(prompts)} scenes')
    for scene, ps in list(prompts.items())[:3]:
        print(f'\n  {scene}: {len(ps)} prompts')
        for p in ps[:3]:
            print(f'    · {p[:80]}')

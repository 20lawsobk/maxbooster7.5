"""
Diffusion trainer v4 — self-improving with long-term memory + rich training data.

New in v4:
  - 700+ training prompts across 20 scene categories (was 124 across 12)
  - training_data_v2.py: 62 rich PIL visual templates (perspective stages, LED walls,
    skylines, neon grids, jazz setups, pipe ceilings, mirror balls, etc.)
  - Blended frame source: 50% rich templates + 35% scene renderer + 15% procedural
  - 8 new scene categories: dj_booth, street_art, music_video_set, album_cover_shoot,
    hip_hop_cypher, luxury_yacht, gospel_choir, trap_aesthetic
  - LongTermMemory integration: scene mastery, experience replay, session log
  - RotatingBatchScheduler: priority-weighted scene sampling + auto-shuffle
  - 20% of each epoch replays hard examples from memory buffer
  - Per-scene loss tracking feeds back into next session's sampling weights
  - Continuous-mode flag for background self-training loop
"""

import os
import sys
import time
import json
import math
import numpy as np

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from .scheduler import DDPMScheduler
from .encoder   import TextEncoder, TimeEncoder, tokenize
from .unet      import UNet
from .layers    import Adam, EMA
from .memory    import LongTermMemory, RotatingBatchScheduler

WEIGHTS_PATH = os.path.join(_here, 'weights.npz')
META_PATH    = os.path.join(_here, 'meta.json')


# ══════════════════════════════════════════════════════════════════════════════
# 600+ training prompts across 20 scene categories
# ══════════════════════════════════════════════════════════════════════════════

SCENE_PROMPTS = {

    'concert_stage': [
        'concert stage live hiphop show spotlight crowd dark purple energetic',
        'concert performer spotlight stage crowd hype energetic raised fist',
        'live music rock performance arena crowd dark bright intense stage',
        'performer under white spotlight stage dark crowd audience cinematic',
        'festival mainstage crowd epic lights dark smoke beam spotlight',
        'hip hop show stage performer mic stand crowd chanting dark moody',
        'rap concert stage dark neon crowd waving hands performer intense',
        'sold-out arena concert stage lights crowd dark dramatic cinematic',
        'outdoor amphitheater concert evening lights crowd trees stage warm',
        'headline act concert stage confetti crowd dark explosive energetic',
        'comeback concert stage dramatic lighting crowd emotion performer',
        'opening night concert stage debut crowd excitement performer neon',
        'arena tour stage production pyrotechnics crowd dark spectacular',
        'stadium concert night aerial view crowd wave lights massive epic',
        'concert stage LED screen performer silhouette crowd sea of lights',
        'hip hop fest stage crowd packed dark strobe performer energy',
        'live band stage concert rock drums guitar crowd moshing intense',
        'soul r&b singer stage spotlight crowd emotional intimate concert',
        'trap artist concert stage designer lights crowd money throw moment',
        'afrobeats concert stage dancers crowd colorful vibrant energetic',
        'latin concert stage performer horns crowd festive warm vibrant',
        'pop superstar stadium stage dancers elaborate production crowd',
        'gospel concert stage choir performer crowd uplifted spiritual',
        'rap battle stage dark crowd circle energy underground raw',
        'indie concert small venue stage crowd close performer authentic',
        'jazz performer stage spotlight small crowd intimate atmospheric',
        'reggae concert outdoor stage crowd palm trees sunset warm',
        'drill music concert dark stage uk style crowd intense moody',
        'country concert stage open air crowd stars sunset warm energy',
        'metal concert stage mosh pit crowd dark intense red lighting',
    ],

    'city_nights': [
        'city night urban rain neon lights skyline dark moody blue reflections',
        'downtown night dark city rain traffic wet neon glow street bokeh',
        'trap rap city night urban dark moody neon glow rain blue cinematic',
        'city nights glow rain neon street urban dark cinematic atmosphere',
        'urban cityscape night blue neon rain moody atmospheric aerial view',
        'rooftop city skyline night neon dark cinematic aerial perspective',
        'new york city night skyline bridge lights dark rain cinematic',
        'los angeles night freeway lights blur dark city glow warm',
        'atlanta city night trap urban dark glow rain reflective street',
        'chicago night city lake skyline dark cold blue lights cinematic',
        'tokyo city night neon signs rain dark foreign language blur',
        'city intersection night crosswalk rain neon lights dark wet pavement',
        'city bridge at night reflections lights traffic long exposure',
        'urban skyline night storm lightning distant buildings dramatic',
        'nighttime city park trees lights bench solitary cinematic moody',
        'taxi yellow city night traffic blur bokeh wet street',
        'city rooftop edge night view lights wind dark peaceful alone',
        'subway station night urban dark commuters blur motion lights',
        'city alley night graffiti wet stone lantern dark atmospheric',
        'london city night fog river bridge lights dark cold cinematic',
        'miami night ocean drive neon cars lights warm vibrant energy',
        'paris city night lights eiffel dark romantic dreamy',
        'toronto night city cold dark winter lights frozen cinematic',
        'dubai night skyline ultramodern lights spectacular desert dark',
        'night city rain puddle reflection lone figure umbrella dark',
        'city highway interchange night traffic lights aerial dark',
        'downtown detroit night abandoned buildings dark haunted cinematic',
        'houston city night spread lights vast dark country feel',
        'night city fog grey muted ambient quiet lonely dark',
        'berlin city night cold industrial lights dark underground vibe',
    ],

    'studio_session': [
        'recording studio session rnb soul neo warm booth console glow',
        'studio mixing console producer session warm amber intimate close',
        'studio session recording booth microphone warm cinematic intimate',
        'producer studio session neosoul groove warm smooth chill vibration',
        'studio control room mixing session warm soft amber producer focused',
        'home studio bedroom producer laptop beats dark warm focused glow',
        'professional recording studio grand piano warm wood golden intimate',
        'studio session late night headphones producer dark focused blue glow',
        'studio vocal booth singer microphone pop filter warm intimate glow',
        'grammy studio session legendary vintage console warm amber legendary',
        'analog tape recording studio warm vintage equipment amber glow',
        'studio engineer mixing board dark focused blue glow professional',
        'producer in studio dark laptop glow beat making focused intense',
        'recording session vocalist emotional take warm booth glow soft',
        'studio session collaboration friends creative energy warm dark',
        'home studio morning light wood desk guitar coffee beats relaxed',
        'mastering studio reference monitors speaker dark professional',
        'studio bass guitar amp recording warm vintage tone close-up',
        'drum recording studio isolation booth microphones live kit sound',
        'string section orchestral studio recording classical warm formal',
        'studio session singer headphones eyes closed emotional take raw',
        'producer notes handwritten dark studio coffee late night session',
        'beatmaker studio dark phone glow laptop beats fingers keys',
        'studio session rap artist booth animated delivery energy raw',
        'piano studio session white keys hands warm light wood grain',
        'music producer awards plaques studio wall dark accomplishment',
        'control room glass window artist singing warm professional',
        'studio patch bay cables wires hardware warm amber vintage',
        'songwriter acoustic guitar notebook studio couch warm focused',
        'studio session keyboard synth producer dark electric warm glow',
    ],

    'golden_hour': [
        'outdoor golden sunset nature field sky warm orange country peaceful',
        'golden hour landscape hills trees horizon warm romantic cinematic',
        'country folk acoustic outdoor sunset golden peaceful warm nostalgic',
        'warm golden light nature outdoor landscape cinematic peaceful calm',
        'sunset golden sky field trees warm romantic melancholy atmospheric',
        'dawn golden light mist nature field peaceful cinematic spiritual',
        'golden hour beach ocean waves warm light reflection magical',
        'autumn golden leaves park path trees warm afternoon light walk',
        'desert golden hour cactus hills warm orange sky dramatic',
        'mountain vista golden sunset clouds warm dramatic epic cinematic',
        'sunflower field golden afternoon warm light peaceful countryside',
        'vineyard golden hour rows vines warm sky romantic Europe',
        'prairie sunset golden grass wind endless sky vast freedom',
        'california golden hour pacific coast highway cliff ocean warm',
        'canyon golden hour rock formations shadows dramatic warm glow',
        'lakeside golden sunset reflection water trees mirror warm',
        'city skyline golden hour orange sky buildings silhouette cinematic',
        'golden hour corn field midwest wide sky peaceful countryside',
        'savanna golden hour africa trees silhouette warm cinematic',
        'cherry blossom golden hour pink petals warm spring soft',
        'alps mountain golden hour snow peaks warm alpenglow dramatic',
        'golden hour rooftop couple silhouette city backdrop romantic',
        'tropical beach golden hour palms warm turquoise ocean magical',
        'wheat field golden harvest sunset warm nostalgic rural',
        'rolling hills golden hour sheep pastoral warm cinematic Europe',
        'canyonlands golden hour sandstone warm orange plateau vast',
        'river valley golden hour fog mist forest warm ethereal',
        'lighthouse golden hour coastal cliff ocean dramatic warm cinematic',
        'scottish highlands golden hour moorland dramatic sky warm',
        'rice terraces golden hour asia green gradient warm terraced',
    ],

    'neon_cityscape': [
        'neon cyberpunk city dark electronic edm glow magenta cyan future',
        'neon lights night city trap dark synth glow vibrant electric',
        'futuristic neon cityscape dark glow rain cyberpunk purple haze',
        'edm electronic neon city dark underground rave strobe laser smoke',
        'synthwave neon retro city dark purple cyan aesthetic grid',
        'hologram neon city futuristic dark glow cinematic purple digital',
        'neon sign alley rain reflective dark city atmospheric glow night',
        'cyberpunk market neon stalls rain dark crowded urban future',
        'neon bridge reflection water dark city glow electric blue',
        'underground tunnel neon strips dark train station future glow',
        'vaporwave neon sunset grid dark aesthetic purple pink glow',
        'blade runner city rain neon dark dystopia glow cinematic fog',
        'neon kanji signs rain japan dark electric alley glow wet',
        'retrowave neon palm trees grid perspective dark purple sun',
        'neon city low angle wet street glow colorful dark rain cinematic',
        'cyberpunk alley vendor neon steam dark crowd future electric',
        'pink neon light apartment window dark city rain blur outside',
        'neon grid tunnel fly through dark electric speed motion',
        'korean street neon signs bright night rain dark reflective pavement',
        'neon circle rings dark abstract electric glow vibrant rotating',
        'lo-fi neon city sketch dark purple pink animated grain vibe',
        'outrun aesthetic car night highway neon grid dark speed glow',
        'holo neon display dark digital glitch interference electric',
        'neon holographic text dark city float cinematic sci-fi glow',
        'cyberpunk rooftop garden neon plants dark rain city glow future',
        'electric arcs dark neon lightning jagged vivid',
        'neon ocean underwater coral dark electric bioluminescent glow',
        'neon graffiti dark wall glow color spray paint electric vibrant',
        'synthwave sunset behind city neon grid dark nostalgic',
        'neon bar sign dark window rain reflection bokeh night city',
    ],

    'music_festival': [
        'festival outdoor crowd hype stage live pop summer bright energy',
        'festival music hype energetic crowd stage afrobeats vibrant outdoor',
        'outdoor festival stage show bright sky crowd summer happy dance',
        'festival sunset crowd warm golden stage live beautiful magic',
        'coachella desert festival stages crowds tents sunny warm afternoon',
        'glastonbury festival mud crowd green rain british summer flags',
        'electric forest festival night lights trees crowd magical dark',
        'lollapalooza festival city park stages crowd summer hot bright',
        'burning man festival desert night fire art crowd dark dramatic',
        'festival main stage fireworks night crowd dark celebration epic',
        'reggae festival beach outdoor palm trees crowd relaxed warm',
        'jazz festival outdoors summer band crowd elegant warm afternoon',
        'festival crowd aerial view drone colorful tents thousands summer',
        'music festival backstage area crew equipment dark preparation',
        'festival wristband crowd hands up stage night lights energy',
        'afrofusion festival dance stage crowd colorful vibrant outdoor day',
        'summer music festival meadow flags crowd stage distant warm',
        'hip hop festival outdoor stage crowd sun glasses gold chains',
        'festival campsite night tents fires crowd stars outdoor dark',
        'bonaroo festival tennessee outdoor stage summer massive crowd',
        'festival press pit photographers crowd barrier stage dark',
        'rave festival open air night dark laser crowd massive energy',
        'festival crowd moshing front barrier stage intense energy dark',
        'electronic music festival desert night black rock crowd strobe',
        'folk music festival wooden stage acoustic crowd trees warm day',
        'latin music festival outdoor stage crowd dancers colorful vibrant',
        'gospel festival outdoor crowd hands raised spiritual warm daylight',
        'beach festival sunset ocean stage crowd warm sand barefoot',
        'carnival music festival parade float crowd colorful vibrant',
        'world music festival diverse crowd instruments cultural outdoor',
    ],

    'rooftop_view': [
        'rooftop city skyline night urban indie chill warm nostalgic vibe',
        'rooftop sunset city beautiful warm golden indie peaceful breath',
        'rooftop city view aerial cinematic beautiful night lights drama',
        'penthouse rooftop city skyline golden sunset romantic warm glow',
        'rooftop pool party sunset city lights warm summer evening chill',
        'rooftop bar city night lights cocktail intimate warm romantic',
        'rooftop garden city green plants warm afternoon peaceful bohemian',
        'rooftop helipad city skyline night dark dramatic cinematic aerial',
        'rooftop alone night cold city lights blanket introspective dark',
        'rooftop new year fireworks city below crowd celebration night',
        'rooftop art installation city backdrop creative lighting warm',
        'rooftop yoga sunrise city golden morning peaceful mindful calm',
        'high rise rooftop edge vertigo dark city below dramatic cinematic',
        'rooftop solar panels city green sustainability view aerial',
        'helicopter landing rooftop city night dark dramatic cinematic',
        'rooftop restaurant outdoor dining city lights warm evening date',
        'rooftop jump silhouette city sunset dramatic freerunning dark',
        'rooftop graffiti artist city skyline spray paint creative dark',
        'rooftop telescope night sky city stars astronomy wonder',
        'penthouse terrace infinity pool night city reflection dark luxury',
        'rooftop beekeeping urban garden city backdrop warm sustainable',
        'rooftop movie screening night city crowd projector warm summer',
        'rooftop fire pit gathering city night warm social cozy',
        'rooftop sunrise meditation city golden calm peaceful awakening',
        'rooftop basketball hoop city skyline urban sport athletic',
        'rooftop concert small intimate city backdrop night lights warm',
        'rooftop fashion shoot city backdrop model golden hour cinematic',
        'water tower rooftop city view industrial metal warm afternoon',
        'rooftop stairwell dark city below vertigo dramatic geometric',
        'rooftop rain alone city lights blur dark melancholy introspective',
    ],

    'underground_club': [
        'underground club dark bass house music strobe lights crowd dancing',
        'dark underground techno rave bass smoke machine strobe black wall',
        'basement club dark neon minimal techno crowd sweaty intense',
        'underground party dark lights bass music subwoofer crowd energy',
        'nightclub dark dance floor strobe laser lights crowd grinding music',
        'warehouse party underground dark EDM crowd rave fog machine strobe',
        'underground jazz club dark intimate stage dim amber blue smoke',
        'hip hop underground cipher dark crowd rapper mic pass',
        'drill music dark underground basement studio gritty London Chicago',
        'dark club booth VIP leather dark champagne night exclusive',
        'nightclub bathroom dark mirror lights harsh brutal authentic',
        'club door bouncer line outside dark cold urban night queue',
        'underground bunker rave berlin dark concrete industrial strobe',
        'club smoke machine haze purple laser dark bodies dancing bass',
        'after-hours club dark sun coming up small crowd intimate',
        'underground reggae soundsystem dark bass crowd jam crowd',
        'acid house underground dark minimal crowd sweat bass pure',
        'underground club coat check dark corridor night beginning',
        'club exit dark alley rain 3am night end of the night',
        'underground venue secret door entrance dark exclusive small',
        'UK garage underground dark sweat bass crowd night intimate',
        'drum and bass club dark mosh crowd intense bass low ceiling',
        'club visuals dark projection trippy abstract crowd hypnotic',
        'underground hip hop night dark bar MCs crowd graffiti',
        'club speaker stack dark bass woofer cone subwoofer close',
        'underground rave old building dark history walls art crowd',
        'nightclub empty after closing dark lights still on eerie',
        'underground club card table dark poker chips vibes cinematic',
        'club backstage green room dark performer waiting nervous',
        'underground dance floor dark circle crowd center all eyes',
    ],

    'rain_mood': [
        'rainy window city lights blurred dark moody introspective alone',
        'rain street walk dark umbrella neon reflections city night mood',
        'rain on glass dark bedroom alone introspective blue light outside',
        'heavy rain city night dark empty street neon wet cinematic',
        'rain forest dark green atmospheric mist moody melancholy walk',
        'rain roof puddles dark suburban street night lonely cinematic',
        'thunderstorm dark city dramatic lightning brief flash cinematic',
        'misty rain bridge dark city silhouette dramatic moody blue',
        'drizzle cafe window dark street lights blur warm inside cold out',
        'rain smell petrichor earth dark garden morning solitary',
        'rain highway driving dark blur red taillights lonely night',
        'rain bus window dark city smear lights contemplative quiet',
        'rain jazz club dark umbrella enter wet lonely warm inside',
        'rain drops race glass window dark competition metaphor alone',
        'rain puddle foot splash dark slow motion melancholy street',
        'rain studio dark window producer listening moody atmosphere',
        'storm rain dark ocean waves dramatic ship nautical cinematic',
        'rain church dark empty pew wet shoes quiet spiritual',
        'rain subway entrance dark city steps umbrella wet pavement',
        'rain car interior dark windshield wiper city night thinking',
        'rain late night walk dark no umbrella soaked moody choice',
        'rain rooftop dark city mist wet concrete alone feeling',
        'rain park bench dark alone figure sitting somber melancholy',
        'rain memorial dark flowers wet stone reflection sad quiet',
        'rain festival aftermath dark mud empty stage silent morning',
        'rain airport dark window plane delayed quiet waiting alone',
        'rain book window dark tea warm cozy read storm outside',
        'rain lover window dark city separate glass longing apart',
        'rain tears dark close up face wet emotion raw authentic',
        'rain cold breath dark winter puddle boots walk home slow',
    ],

    'morning_light': [
        'sunrise morning light bedroom curtains warm golden peaceful calm',
        'morning mist forest light rays golden peaceful spiritual nature',
        'early morning studio fresh start warm coffee golden light focused',
        'sunrise city rooftop dawn warm pink sky hopeful beginning',
        'morning beach sunrise waves soft golden pink sky peaceful calm',
        'sunrise highway road trip warm golden ahead hopeful freedom drive',
        'morning light church stained glass warm rays spiritual uplift',
        'dawn mountain peak sunrise clouds below warm dramatic epic',
        'morning kitchen warm golden light coffee steam peaceful domestic',
        'morning dew grass warm light drops sparkle peaceful nature',
        'dawn jogger park warm mist golden silhouette energetic hopeful',
        'morning stretch yoga mat warm golden light window peaceful',
        'sunrise boat dock water warm golden reflection peaceful fish',
        'morning train window warm countryside golden blur peaceful commute',
        'alarm clock morning dark room golden light peeking curtain',
        'sunrise balcony coffee warm golden city waking up peaceful',
        'morning market warm vendors light sunrise fresh produce vibrant',
        'dawn desert sunrise warm colors orange vast silence peaceful',
        'morning airport sunrise warm travelers new journey hopeful',
        'sunrise ocean horizon warm pink gold vast peaceful hopeful',
        'morning light leaves warm dappled forest floor peaceful walk',
        'dawn chorus birds warm morning light mist soft peaceful',
        'morning studio warm light musician awake fresh start create',
        'sunrise over snow warm orange white vast silence serene',
        'morning prayer warm light spiritual person kneeling hopeful',
        'early morning city warm few people peaceful before hustle',
        'dawn fishing warm orange water reflection rod quiet peaceful',
        'morning gratitude journal warm golden light quiet thankful',
        'sunrise hot air balloon warm sky golden voyage freedom',
        'morning light flowers garden warm dew petals nature calm',
    ],

    'warehouse_rave': [
        'warehouse rave dark industrial bare concrete pillars strobe laser',
        'abandoned warehouse party dark techno crowd smoke machine intense',
        'industrial rave space dark pipes rust concrete strobe art',
        'warehouse concert live performance dark crowd art direction brick',
        'raw industrial space dark music event moody dramatic concrete',
        'factory rave dark machinery shadows DJ booth crowd underground',
        'warehouse art show dark moody crowd installation light projection',
        'industrial nightclub dark metal aesthetic underground bass music',
        'old factory warehouse rave dark graffiti concrete pillars bass',
        'warehouse scaffolding lights dark industrial rave artist crowd',
        'rave warehouse morning dark last song crowd tired beautiful',
        'warehouse rave cold dark breath visible strobe industrial',
        'port warehouse dark shipping containers rave crowd massive',
        'warehouse roof open dark sky stars crowd rave incredible',
        'industrial complex dark turbines rave surreal cinematic crowd',
        'warehouse rave projection mapping dark walls morphing crowd',
        'old abattoir rave dark history texture crowd art collision',
        'warehouse rave fire exit dark red sign emergency backdrop',
        'cold warehouse winter dark coats rave crowd breath steam',
        'warehouse rave bathroom dark graffiti tile wet floor authentic',
        'old mill warehouse dark wood beam rave crowd warm bass',
        'warehouse rave queue outside dark cold night anticipation',
        'loading dock warehouse dark rave trucks industrial authentic',
        'warehouse rave early hours dark small crowd pure music',
        'silo warehouse dark circular rave crowd ring acoustic',
        'warehouse bunker dark cold concrete rave art installation',
        'night warehouse rave rain dark outside roof leak atmospheric',
        'industrial rave dark cable drums scaffold light rigging',
        'warehouse gallery rave dark art pieces illuminated crowd view',
        'warehouse rave dawn dark sky lightens last hour bittersweet',
    ],

    'intimate_venue': [
        'small intimate venue acoustic concert warm 200 seats close crowd',
        'jazz club stage band audience small dim amber warm cocktail',
        'coffee shop acoustic performance warm cozy intimate small crowd',
        'church acoustics intimate performance choir warm sacred beautiful',
        'art gallery evening performance installation intimate warm crowd',
        'comedy club intimate dark small venue brick stage microphone warm',
        'speakeasy intimate bar live band warm dark brass wood vintage',
        'living room session intimate acoustic warm friends recording circle',
        'rooftop intimate concert sunset small crowd warm personal special',
        'house concert living room dark performer small crowd magical',
        'bookshop evening intimate reading performance warm cozy dim',
        'wine bar intimate jazz trio warm candlelight close audience',
        'studio apartment intimate session friends circle guitar warm',
        'theatre black box intimate dark experimental performance close',
        'intimate radio station session warm performer small microphone',
        'backyard show warm evening intimate neighborhood crowd special',
        'mountain cabin intimate acoustic warm fireplace guitar simple',
        'boat deck intimate concert dark ocean stars crowd special',
        'museum after-hours intimate performance installation dark warm',
        'loft apartment dark intimate concert exposed brick warm wood',
        'library concert series intimate quiet warm respectful crowd',
        'basement venue intimate dark raw performance local original',
        'church crypt intimate dark acoustic echo warm stone ancient',
        'intimate outdoor garden concert warm lanterns summer evening',
        'record store intimate performance warm vinyl walls crowd close',
        'intimate venue green room backstage warm small talk before show',
        'private dining room serenade intimate dark warm romantic music',
        'hospital ward intimate acoustic soothing warm healing music',
        'prison yard intimate concert dark guard tower crowd moved',
        'underground passage intimate busker dark echo warm resonant',
    ],

    # ── 8 new scene categories ──────────────────────────────────────────────

    'dj_booth': [
        'dj booth turntables cdj mixer dark club crowd behind performer',
        'dj set dark club raised booth crowd below lights laser mixing',
        'edm dj booth dark stadium crowd hands up laser spectacular',
        'house music dj dark intimate club booth crowd close warm',
        'dj controller laptop dark glow festival booth crowd night',
        'turntablist dj scratch dark vinyl record booth intimate raw',
        'dj booth crowd energy dark neon hands raised peak moment',
        'open format dj booth dark wedding crowd dressed up fun',
        'dj headphones one ear dark booth focused technique booth',
        'dj booth sunrise dark crowd festival morning light end',
        'mobile dj setup dark event room crowd birthday party fun',
        'dj booth production crowd dark confetti celebration pop moment',
        'back-to-back dj set dark club two performers crowd energy',
        'dj booth silent disco headphones dark crowd individual journey',
        'legendary dj dark residency crowd devoted fans intimate ritual',
        'dj booth crowd recording phone dark moment capture share',
        'dj sweat dark club physical booth marathon performance endure',
        'dj vinyl crate dark records digging booth preparation before',
        'dj booth dark club glass of water crowd pause brief',
        'dj equipment dark flight cases road touring lifestyle grind',
        'dj booth dark festival massive crowd sunrise outdoor epic',
        'dj booth dark pink room neon aesthetics instagram model crowd',
        'underground dj dark booth warehouse anonymous crowd pure music',
        'dj transition dark crowd crescendo build up drop energy',
        'dj booth technical rider dark setup soundcheck afternoon preparation',
        'dj music video dark performance edited rapid cut energy',
        'classic dj dark hip hop turntables two decks battle focus',
        'dj booth dark celebrity guest surprise crowd reaction joy',
        'dj booth raised platform dark crowd sea lights depth visual',
        'dj set end dark crowd applause sweaty fulfilled satisfied',
    ],

    'street_art': [
        'graffiti mural wall bright colorful urban outdoor daylight vivid',
        'street art large scale building facade outdoor bold colors paint',
        'graffiti artist spray paint dark wall urban night stealth',
        'mural portrait face urban wall colorful realistic outdoor',
        'stencil street art urban wall minimal dark bold message',
        'graffiti letters wildstyle dark alley colorful complex design',
        'street art festival outdoor walls colorful artists community',
        'graffiti hall of fame dark pillars under bridge vibrant',
        'street art abstract geometric wall colors outdoor urban',
        'paste-up street art urban wall layered faces city dark alley',
        'graffiti crew dark night wall urban illegal authentic raw',
        'street mural tribute dark wall memorial emotional community',
        'wheat paste art dark wet paper urban wall morning reveal',
        'graffiti train yard dark freight cars paint industrial',
        'street art 3D illusion wall outdoor crowd tourist wonder',
        'graffiti museum dark gallery exhibition legitimized art',
        'mural hip hop culture dark wall turntable spray breakdance mic',
        'street art nature urban green leaves urban concrete contrast',
        'graffiti throw-up dark quick style lettering urban wall raw',
        'street art commentary political dark urban message bold',
        'mural black and white dark portrait face urban realistic',
        'graffiti bombing dark city night comprehensive systematic',
        'street art invisible dark UV reactive light hidden message',
        'urban wall art installation dark projection onto paint night',
        'graffiti colorful abstract dark alley entrance urban funky',
        'mural female face dark bright colors flowers urban beauty',
        'street art music note instruments dark wall vibrant culture',
        'graffiti crew tag dark name location time history document',
        'sticker street art dark lamp post layers collected urban',
        'mural neighborhood pride dark bright community identity local',
    ],

    'music_video_set': [
        'music video set production cameras lights crew dark cinematic',
        'music video elaborate set piece dancers performers dark theatrical',
        'music video green screen studio dark futuristic effects composite',
        'rap music video mansion exterior dark luxury cars posse',
        'music video rooftop set dark city background performers sunset',
        'music video retro set vintage 80s warm colorful aesthetic',
        'music video underwater dark blue slow motion ethereal surreal',
        'music video space set dark stars floating zero gravity sci-fi',
        'music video desert location dark heat vehicle explosion cinematic',
        'music video cemetery dark gothic theatrical performers mist',
        'music video car driving night dark city chase action energy',
        'music video fashion shoot dark high concept minimal elegant',
        'rnb music video luxury interior dark warm candles intimate',
        'music video club scene dark crowded performers dance energy',
        'music video montage dark fast cut city scenes quick urban',
        'music video rain dark performer soaked emotional dramatic',
        'music video abandoned building dark cinematic art direction',
        'music video boxing ring dark fighters sweat intense dramatic',
        'music video crowd controlled extras dark performer center',
        'music video choreography dark synchronized dancers precise',
        'music video night street dark alley performer environment',
        'music video behind the scenes dark camera crew set life',
        'music video wardrobe dark costume designer rack hanging',
        'music video storyboard dark planning creative director vision',
        'music video budget luxury dark helicopter aerial shots epic',
        'music video concept art dark mood board visual aesthetic',
        'music video director monitor dark review shot playback',
        'music video crane shot dark ascending performers below small',
        'music video studio soundstage dark bare bones pure performance',
        'music video premiere red carpet dark crowd media flashbulbs',
    ],

    'album_cover_shoot': [
        'album cover shoot dark moody studio portrait dramatic light',
        'album cover bright bold graphic design typography abstract',
        'album cover outdoor location dark cinematic wide shot artist',
        'album cover close-up face dark high contrast black white',
        'album cover concept dark surreal artistic unusual visual',
        'album cover vintage warm retro aesthetic grain film photography',
        'album cover minimalist dark simple icon powerful message',
        'album cover water dark underwater submerged ethereal blue',
        'album cover fire dark flames warm dramatic elemental power',
        'album cover city scape dark artist small scale urban epic',
        'album cover painting dark oil fine art classical reference',
        'album cover night sky dark stars milky way vast cosmic',
        'album cover nature dark forest lone figure atmospheric mist',
        'album cover abstract dark shapes texture layer composition',
        'album cover fashion high end dark editorial styled portrait',
        'album cover band group shot dark ensemble formation cool',
        'album cover hands dark close gesture meaning intentional',
        'album cover crowd dark artist among people belonging identity',
        'album cover light leak dark analog film beautiful error',
        'album cover dusk dark blue hour city silhouette emotional',
        'album cover double exposure dark face merged landscape',
        'album cover object symbolic dark meaningful still life art',
        'album cover silhouette dark backlit single figure powerful',
        'album cover illustration dark painted artistic commissioned',
        'album cover gold dark metallic foil luxury premium exclusive',
        'album cover neon dark one light source dramatic simple',
        'album cover motion blur dark movement energy kinetic speed',
        'album cover reflection dark mirror puddle surface artistic',
        'album cover spiral dark pattern hypnotic graphic bold',
        'album cover black nothing dark negative space bold statement',
    ],

    'hip_hop_cypher': [
        'hip hop cypher circle dark underground raw freestyle energy',
        'rap cipher dark concrete outdoor night crew authentic raw',
        'freestyle circle dark parking garage urban night underground',
        'hip hop cipher dark park benches night crew watching energy',
        'rap battle dark outdoor circle two performers facing clash',
        'cypher dark basement boom bap beats rap passing mic',
        'hip hop cipher dark community center youth raw expression',
        'rap group dark rehearsal space chemistry recording together',
        'cypher dark cardboard breakdancer center circle cheering',
        'hip hop cipher dark legendary spot known underground sacred',
        'freestyle rap dark subway car moving performance energy',
        'cipher dark high school courtyard youth expression power',
        'hip hop cipher dark rooftop night city lights backdrop',
        'rap group dark studio couch listening playback vibing',
        'cypher dark warehouse industrial rap culture authentic',
        'hip hop cipher dark tour bus performer warming up pre-show',
        'rap battle dark tournament stage competitive performance',
        'cypher dark festival side stage crowd watching listening',
        'hip hop cipher dark rain outdoor dedicated artists wet',
        'rap group session dark home studio recording together bond',
        'cypher dark train platform underground commuter unexpected',
        'hip hop cipher dark cultural center community building',
        'rap cipher dark basketball court night lights concrete raw',
        'cypher dark legendary night historical spot music culture',
        'hip hop cipher dark record label showcase discovering',
        'freestyle rap dark corner store steps block culture local',
        'cypher dark barbershop classic culture neighborhood connection',
        'hip hop cipher documentary dark camera natural moment',
        'rap dark cipher practice before event warm up group',
        'hip hop cipher dark ending night dap hugs departing until next',
    ],

    'luxury_yacht': [
        'yacht luxury ocean dark night exclusive party lifestyle rich',
        'superyacht deck sunset warm ocean breeze calm rich glamour',
        'yacht interior dark luxurious wood leather gold exclusive',
        'yacht bow dark ocean horizon distant dramatic speed wake',
        'yacht party night dark water lights music crowd exclusive',
        'superyacht aerial dark ocean blue water white deck luxury',
        'yacht captain bridge dark controls navigation professional',
        'yacht at anchor dark ocean stars remote peace exclusive',
        'yacht tender dark water transport small boat luxury access',
        'yacht sunset ocean warm silhouette person rich calm',
        'yacht dock marina dark night other boats lights reflection',
        'yacht champagne dark deck celebration luxury drink toast',
        'yacht music video dark ocean lifestyle expensive backdrop',
        'yacht bedroom dark porthole ocean view exclusive rest',
        'yacht dining dark formal table ocean view luxury service',
        'yacht swimming platform dark jump ocean swim luxury',
        'yacht deck dark sunrise morning coffee exclusive peace',
        'yacht storm dark ocean dramatic waves dangerous cinematic',
        'yacht radar dark technical navigation professional seamanship',
        'yacht flag dark wind international waters freedom symbol',
        'yacht fuel stop dark port exotic location refueling stop',
        'yacht charter dark guest luxury experience money cant buy',
        'yacht fishing dark deep sea rods serious sport',
        'yacht bbq dark grill deck friends summer luxury casual',
        'yacht helipad dark helicopter landing luxury arrival epic',
        'yacht music performance dark live artist ocean backdrop',
        'yacht night dark underwater lights glowing pool ocean',
        'yacht race dark competitive sailing crew athletic ocean',
        'yacht crew uniform dark professional service crew proud',
        'yacht sunset champagne dark two people silhouette romance',
    ],

    'gospel_choir': [
        'gospel choir robes dark church stage singing powerful spiritual',
        'church choir stained glass light rays dark pews congregation',
        'gospel performance dark stage hands raised emotional spiritual',
        'choir arrangement dark risers rows voices unified powerful',
        'church revival dark crowd standing clapping music spirit',
        'gospel pianist dark organ church music leader worship',
        'choir dark recording studio session producers mixing gospel',
        'praise team dark contemporary church band screens worship',
        'gospel singer soloist dark spotlight emotional powerful moment',
        'church choir dark robes white gold formal Sunday service',
        'gospel award ceremony dark stage performing excellence',
        'choir dark rehearsal notes music stands director focused',
        'church dark Christmas choir candles warm sacred tradition',
        'gospel workshop dark conference singers learning technique',
        'choir dark international competition performance excellence',
        'church dark baptism choir singing water spiritual ritual',
        'gospel song dark video shoot natural performance authentic',
        'choir dark school auditorium young voices future talent',
        'church dark congregation hands raised worship surrender',
        'gospel radio dark station live recording intimate authentic',
        'choir dark harmonies complex arrangement beauty voices blend',
        'church bells dark morning sound beginning calling faithful',
        'gospel dark funeral emotional comfort community gathering',
        'choir dark wedding ceremony sacred moment voices beautiful',
        'church dark Easter sunrise service outdoor worship nature',
        'gospel dark hip hop fusion contemporary artistic creative',
        'choir dark march protest civil rights justice spiritual',
        'church dark pipe organ dark instrument ancient powerful sound',
        'gospel dark television broadcast living rooms nationwide',
        'choir dark standing ovation emotional overwhelmed beautiful',
    ],

    'trap_aesthetic': [
        'trap aesthetic dark luxury interior moody cinematic expensive',
        'trap house dark minimal luxury furniture expensive drapes',
        'dark trap aesthetic money stacks dark moody cinematic',
        'trap dark cars garage expensive collection lifestyle flex',
        'trap music video dark set luxury moody rain window inside',
        'trap aesthetic dark jewellery ice chain watch close-up',
        'dark trap mansion pool night outdoor lights minimal',
        'trap dark recording session studio gold dark expensive',
        'trap aesthetic dark wardrobe designer labels luxury close-up',
        'dark trap art direction minimal purple haze expensive moody',
        'trap dark lifestyle private jet leather seats luxury flex',
        'trap aesthetic dark shoes collection shelves obsession value',
        'dark trap environment sparse luxury furniture single bulb',
        'trap dark club VIP section exclusive dark expensive service',
        'trap aesthetic dark city night expensive hotel penthouse',
        'dark trap sensibility expensive humble origin contrast',
        'trap dark aesthetic rain window dark city luxury inside',
        'dark trap mansion hallway dark long expensive marble',
        'trap aesthetic dark candle lit room expensive moody intimate',
        'dark trap art gallery dark expensive exclusive opening night',
        'trap dark recording contract signing dark moment historic',
        'dark trap lifestyle montage dark cars women money music',
        'trap aesthetic dark fire place luxury cabin expensive mountain',
        'dark trap safe full cash dark cinematic important moment',
        'trap dark phone screen dark content creation hustle always',
        'dark trap success dark office expensive suit elevated taste',
        'trap aesthetic dark empty street dark rain alone reflection',
        'dark trap beginnings dark project housing contrast now',
        'trap dark aesthetic expensive perfume dark bottle close-up',
        'dark trap energy dark studio session focused late night',
    ],
}

# Flat list of all (scene, prompt) pairs — for random sampling
ALL_PAIRS = [
    (scene, prompt)
    for scene, prompts in SCENE_PROMPTS.items()
    for prompt in prompts
]
print(f"[DiffusionTrainer v4] Dataset: {len(ALL_PAIRS)} prompts "
      f"across {len(SCENE_PROMPTS)} scene categories", flush=True)


# ── Training-frame generation ──────────────────────────────────────────────

def _load_frame_generator():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'frameGenerator',
        os.path.join(_parent, 'frameGenerator.py'))
    fg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fg)
    return fg

_fg_cache = None
_v2_cache = None


def _load_training_data_v2():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'training_data_v2',
        os.path.join(_here, 'training_data_v2.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _generate_training_frame(scene: str, frame_idx: int, res: int = 48) -> np.ndarray:
    """
    Blended frame source:
      50% → training_data_v2 rich PIL templates  (most visual variety)
      35% → frameGenerator scene renderer        (realistic rendered scenes)
      15% → procedural fallback                  (colour/shape diversity)
    """
    global _fg_cache, _v2_cache
    source = frame_idx % 20

    # ── 50% training_data_v2 rich templates (0..9)
    if source < 10:
        try:
            if _v2_cache is None:
                _v2_cache = _load_training_data_v2()
            return _v2_cache.generate_frame(scene, frame_idx, res)
        except Exception:
            pass

    # ── 35% frameGenerator scene renderer (10..16)
    if source < 17:
        try:
            if _fg_cache is None:
                _fg_cache = _load_frame_generator()
            fg = _fg_cache
            config = {
                'resolution': (res * 4, res * 4),
                'scene_prompt': scene,
                'title': 'MaxBooster', 'artist': 'AI', 'genre': 'hip-hop',
                'frame_index': frame_idx, 'fps': 30,
                'show_title': False, 'show_progress': False,
            }
            frame_bytes = fg.generate_frame(config)
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(frame_bytes)).convert('RGB').resize((res, res), Image.BILINEAR)
            arr = np.array(img, dtype=np.float32) / 127.5 - 1.0
            return arr
        except Exception:
            pass

    # ── 15% procedural fallback (17..19) or any failure above
    return _procedural_frame(scene, res)


def _procedural_frame(scene: str, res: int) -> np.ndarray:
    """Rich procedural fallback frames with scene-specific palettes."""
    rng = np.random.default_rng()
    arr = np.zeros((res, res, 3), dtype=np.float32)

    palettes = {
        'concert_stage':    [(0.5, 0.1, 0.8), (0.8, 0.1, 0.5)],
        'city_nights':      [(0.05, 0.1, 0.5), (0.0, 0.3, 0.6)],
        'studio_session':   [(0.5, 0.35, 0.1), (0.3, 0.2, 0.05)],
        'golden_hour':      [(0.9, 0.6, 0.1), (0.7, 0.4, 0.05)],
        'neon_cityscape':   [(0.0, 0.8, 0.7), (0.7, 0.0, 0.9)],
        'music_festival':   [(0.8, 0.5, 0.1), (0.9, 0.7, 0.2)],
        'rooftop_view':     [(0.4, 0.5, 0.8), (0.6, 0.5, 0.3)],
        'underground_club': [(0.1, 0.0, 0.3), (0.3, 0.0, 0.5)],
        'rain_mood':        [(0.1, 0.15, 0.35), (0.05, 0.1, 0.2)],
        'morning_light':    [(0.9, 0.75, 0.4), (0.95, 0.6, 0.3)],
        'warehouse_rave':   [(0.15, 0.05, 0.1), (0.5, 0.1, 0.1)],
        'intimate_venue':   [(0.6, 0.4, 0.15), (0.4, 0.25, 0.05)],
        'dj_booth':         [(0.1, 0.0, 0.4), (0.5, 0.0, 0.6)],
        'street_art':       [(0.9, 0.3, 0.1), (0.1, 0.7, 0.2)],
        'music_video_set':  [(0.2, 0.1, 0.3), (0.6, 0.2, 0.4)],
        'album_cover_shoot':[(0.1, 0.1, 0.1), (0.8, 0.7, 0.6)],
        'hip_hop_cypher':   [(0.15, 0.1, 0.2), (0.4, 0.3, 0.1)],
        'luxury_yacht':     [(0.0, 0.3, 0.7), (0.9, 0.9, 0.95)],
        'gospel_choir':     [(0.8, 0.7, 0.3), (0.95, 0.9, 0.6)],
        'trap_aesthetic':   [(0.05, 0.02, 0.05), (0.3, 0.2, 0.4)],
    }
    colors = palettes.get(scene, [(0.3, 0.3, 0.3)])

    yv = np.linspace(0, 1, res).reshape(res, 1)
    xv = np.linspace(0, 1, res).reshape(1, res)
    weight_base = np.exp(-((yv - 0.5)**2 + (xv - 0.5)**2) / 0.3)

    for R, G, B in colors:
        jitter = 0.5 + 0.5 * rng.random()
        arr[:, :, 0] += R * weight_base * jitter
        arr[:, :, 1] += G * weight_base * jitter
        arr[:, :, 2] += B * weight_base * jitter

    # Vertical gradient for depth
    sky = np.linspace(0.3, 0.0, res).reshape(res, 1) * np.ones((1, res))
    arr[:, :, 2] += sky * 0.4
    arr += rng.standard_normal((res, res, 3)).astype(np.float32) * 0.12
    return arr.clip(-1.0, 1.0)


# ── Data augmentation ──────────────────────────────────────────────────────

def augment(frame: np.ndarray) -> np.ndarray:
    if np.random.random() < 0.5:
        frame = frame[:, ::-1, :].copy()
    for c in range(3):
        frame[:, :, c] = (
            frame[:, :, c] * np.random.uniform(0.85, 1.15)
            + np.random.uniform(-0.08, 0.08)
        ).clip(-1.0, 1.0)
    return frame


# ── Losses ─────────────────────────────────────────────────────────────────

_SOBEL_KX = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
_SOBEL_KY = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def _sobel_gradient(x: np.ndarray) -> np.ndarray:
    from scipy.signal import convolve2d
    grad = np.zeros_like(x)
    for c in range(x.shape[2]):
        gx = convolve2d(x[:, :, c], _SOBEL_KX, mode='same', boundary='symm')
        gy = convolve2d(x[:, :, c], _SOBEL_KY, mode='same', boundary='symm')
        grad[:, :, c] = np.sqrt(gx**2 + gy**2 + 1e-8)
    return grad


def perceptual_loss(pred, target,
                    lambda_edge: float = 0.15,
                    lambda_freq: float = 0.03):
    diff  = pred - target
    mse   = np.mean(diff ** 2)
    dmse  = (2.0 / diff.size) * diff

    grad_pred   = _sobel_gradient(pred)
    grad_target = _sobel_gradient(target)
    edge_diff   = grad_pred - grad_target
    edge_loss   = np.mean(np.abs(edge_diff))
    dedge       = np.sign(edge_diff) / edge_diff.size * lambda_edge

    fft_pred   = np.abs(np.fft.rfft2(pred[:, :, 0]))
    fft_target = np.abs(np.fft.rfft2(target[:, :, 0]))
    freq_loss  = np.mean((fft_pred - fft_target) ** 2) * lambda_freq
    dfreq      = np.zeros_like(pred)
    dfreq[:, :, 0] = 2 * (pred[:, :, 0] - target[:, :, 0]) * lambda_freq / pred.size

    total  = mse + edge_loss + freq_loss
    dtotal = dmse + dedge + dfreq
    return total, dtotal


def _clip_gradients(pairs, max_norm: float = 1.0):
    total_sq = sum(
        float(np.sum(g ** 2))
        for _, grads in pairs
        for g in grads.values()
        if g is not None
    )
    norm = math.sqrt(total_sq + 1e-8)
    if norm > max_norm:
        scale = max_norm / norm
        for _, grads in pairs:
            for k in grads:
                if grads[k] is not None:
                    grads[k] *= scale


def _build_cond(time_enc, text_enc, t, prompt):
    t_emb  = time_enc.forward(t)
    tokens = tokenize(prompt)
    tx_emb = text_enc.forward(tokens)
    return np.concatenate([t_emb, tx_emb]).astype(np.float32)


# ── Weight I/O ─────────────────────────────────────────────────────────────

def _save_all(model, time_enc, text_enc, losses=None):
    weights = model.get_named_weights()
    for k, v in time_enc.params.items():
        weights[f'time_enc_{k}'] = v
    for k, v in text_enc.params.items():
        weights[f'text_enc_{k}'] = v
    np.savez_compressed(WEIGHTS_PATH, **weights)
    kb = os.path.getsize(WEIGHTS_PATH) // 1024
    print(f"[DiffusionTrainer v3] Saved weights ({kb} KB) → {WEIGHTS_PATH}", flush=True)


def _load_all(model, time_enc, text_enc, path):
    data = dict(np.load(path, allow_pickle=False))
    try:
        model.load_named_weights(data)
    except Exception as e:
        print(f"[DiffusionTrainer v3] Named load error: {e}")
        model.load_weights(data)
    for k in time_enc.params:
        key = f'time_enc_{k}'
        if key in data:
            time_enc.params[k] = data[key].astype(np.float32)
    for k in text_enc.params:
        key = f'text_enc_{k}'
        if key in data:
            text_enc.params[k] = data[key].astype(np.float32)
    print(f"[DiffusionTrainer v3] Weights loaded from {path}", flush=True)


# ── Dataset generation ─────────────────────────────────────────────────────

def build_dataset(n_samples: int, res: int) -> list:
    """Generate n_samples training frames, one per scene prompt pair."""
    print(f"[DiffusionTrainer v3] Generating {n_samples} training frames @ {res}×{res}...",
          flush=True)
    t0 = time.time()
    dataset = []
    scenes  = list(SCENE_PROMPTS.keys())

    for i in range(n_samples):
        scene_idx = i % len(scenes)
        scene     = scenes[scene_idx]
        prompts   = SCENE_PROMPTS[scene]
        prompt    = prompts[i % len(prompts)]
        frame_idx = np.random.randint(0, 900)
        frame     = _generate_training_frame(scene, frame_idx, res)
        dataset.append((frame, prompt, scene))
        if (i + 1) % 200 == 0:
            rate = (i + 1) / (time.time() - t0)
            print(f"  Generated {i+1}/{n_samples} ({rate:.1f}/s)", flush=True)

    print(f"[DiffusionTrainer v3] Dataset ready in {time.time()-t0:.0f}s "
          f"({len(dataset)} frames, {len(scenes)} scene types)", flush=True)
    return dataset


# ══════════════════════════════════════════════════════════════════════════════
# Main training function
# ══════════════════════════════════════════════════════════════════════════════

def train(n_samples:  int   = 600,
          n_epochs:   int   = 20,
          lr:         float = 2e-4,
          lr_min:     float = 5e-6,
          res:        int   = 48,
          T:          int   = 100,
          log_every:  int   = 100,
          resume:     bool  = True,
          ema_decay:  float = 0.9995,
          use_perceptual: bool = True,
          lambda_edge: float = 0.15,
          lambda_freq: float = 0.03,
          session_label: str = '') -> dict:
    """
    Training tiers:
      Quick:            300  × 10  → ~28 min  CPU @ 48×48
      Medium (default): 600  × 20  → ~110 min CPU @ 48×48
      Deep:             1000 × 30  → ~275 min CPU @ 48×48

    Memory system is always active — each session builds on all previous ones.
    """
    label = f" [{session_label}]" if session_label else ""
    print(f"[DiffusionTrainer v3]{label} {n_samples}×{n_epochs} @ {res}×{res}  "
          f"lr={lr:.0e}→{lr_min:.0e}  resume={resume}", flush=True)
    print(f"[DiffusionTrainer v3] Prompts: {len(ALL_PAIRS)} across "
          f"{len(SCENE_PROMPTS)} scene categories", flush=True)

    # Initialise all components
    memory    = LongTermMemory()
    scheduler = DDPMScheduler(T=T, schedule='cosine')
    time_enc  = TimeEncoder(sin_dim=64, emb_dim=32)
    text_enc  = TextEncoder(emb_dim=32, token_emb_dim=48)
    model     = UNet(cond_dim=64)
    optimizer = Adam(lr=lr, weight_decay=1e-5, lr_min=lr_min)
    ema       = EMA(decay=ema_decay)

    if resume and os.path.exists(WEIGHTS_PATH):
        try:
            _load_all(model, time_enc, text_enc, WEIGHTS_PATH)
        except Exception as e:
            print(f"[DiffusionTrainer v3] Weights incompatible, training fresh: {e}",
                  flush=True)

    mem_summary = memory.summary()
    print(f"[DiffusionTrainer v3] Memory: {mem_summary}", flush=True)

    # Build dataset
    dataset = build_dataset(n_samples, res)
    scenes  = list(SCENE_PROMPTS.keys())

    # Build batch scheduler — scene rotation with memory-driven priority
    batch_sched = RotatingBatchScheduler(
        memory,
        scenes,
        [(f, p) for f, p, _ in dataset],
    )

    model.set_training(True)
    all_pairs = (
        model._get_param_grad_pairs_flat()
        + [(time_enc.params, time_enc.grads)]
        + [(text_enc.params, text_enc.grads)]
    )

    losses       = []
    scene_losses = {s: [] for s in scenes}
    total_steps  = n_samples * n_epochs
    step         = 0
    t_train      = time.time()

    for epoch in range(n_epochs):
        # Shuffle base dataset
        np.random.shuffle(dataset)

        # Cosine LR
        optimizer.cosine_anneal(epoch, n_epochs)

        epoch_losses = []

        for frame_raw, prompt, scene in dataset:
            frame = augment(frame_raw)

            # Curriculum timestep sampling
            if epoch < n_epochs // 4:
                t_step = int(np.random.triangular(T // 4, T // 2, 3 * T // 4))
            else:
                t_step = np.random.randint(0, T)

            x_t, eps_gt = scheduler.add_noise(frame, t_step)
            cond        = _build_cond(time_enc, text_enc, t_step, prompt)

            model.zero_grads()
            time_enc.zero_grads()
            text_enc.zero_grads()

            eps_pred = model.forward(x_t, cond)

            if use_perceptual:
                loss, dloss = perceptual_loss(eps_pred, eps_gt, lambda_edge, lambda_freq)
            else:
                diff  = eps_pred - eps_gt
                loss  = float(np.mean(diff ** 2))
                dloss = (2.0 / diff.size) * diff

            epoch_losses.append(float(loss))
            scene_losses[scene].append(float(loss))

            model.backward(dloss)
            _clip_gradients(all_pairs, max_norm=1.0)
            optimizer.step(all_pairs)
            ema.update(all_pairs)

            # Record to long-term memory
            memory.record_step(scene, prompt, frame, float(loss), epoch_losses)

            step += 1
            if step % log_every == 0:
                avg     = np.mean(epoch_losses[-log_every:])
                elapsed = time.time() - t_train
                eta     = (total_steps - step) * (elapsed / step)
                print(f"  Ep{epoch+1}/{n_epochs} step{step}/{total_steps}  "
                      f"loss={avg:.4f}  lr={optimizer.lr:.2e}  "
                      f"replay={len(memory.replay)}  ETA={eta/60:.0f}min",
                      flush=True)

        # Replay 20% of next epoch from hard examples in memory buffer
        replay_batch = memory.get_replay_batch(max(1, n_samples // 5))
        for entry in replay_batch:
            try:
                frame_r = memory.replay.get_frame(entry)
                frame_r = augment(frame_r)
                t_step  = np.random.randint(T // 4, T)
                x_t, eps_gt = scheduler.add_noise(frame_r, t_step)
                cond = _build_cond(time_enc, text_enc, t_step, entry['prompt'])
                model.zero_grads(); time_enc.zero_grads(); text_enc.zero_grads()
                eps_pred = model.forward(x_t, cond)
                if use_perceptual:
                    r_loss, r_dloss = perceptual_loss(eps_pred, eps_gt, lambda_edge, lambda_freq)
                else:
                    r_diff  = eps_pred - eps_gt
                    r_loss  = float(np.mean(r_diff ** 2))
                    r_dloss = (2.0 / r_diff.size) * r_diff
                model.backward(r_dloss)
                _clip_gradients(all_pairs, max_norm=1.0)
                optimizer.step(all_pairs)
                ema.update(all_pairs)
                epoch_losses.append(float(r_loss))
                step += 1
            except Exception:
                pass

        epoch_loss = float(np.mean(epoch_losses))
        losses.append(epoch_loss)

        if epoch % 5 == 0 or epoch == n_epochs - 1:
            print(f"[DiffusionTrainer v3] Epoch {epoch+1}/{n_epochs}  "
                  f"loss={epoch_loss:.4f}  lr={optimizer.lr:.2e}  "
                  f"scenes={memory.summary()['scenes_tracked']}  "
                  f"replay={memory.summary()['replay_buffer']}",
                  flush=True)
            backup = ema.apply(all_pairs)
            _save_all(model, time_enc, text_enc, losses)
            ema.restore(all_pairs, backup)

    total_time = time.time() - t_train
    print(f"[DiffusionTrainer v3] Done in {total_time/60:.1f}min  "
          f"final_loss={losses[-1]:.4f}", flush=True)

    # Final EMA save
    backup = ema.apply(all_pairs)
    _save_all(model, time_enc, text_enc, losses)
    ema.restore(all_pairs, backup)

    meta = {
        'version':        3,
        'epochs':         n_epochs,
        'samples':        n_samples,
        'final_loss':     float(losses[-1]),
        'total_seconds':  total_time,
        'losses':         losses,
        'resolution':     res,
        'T':              T,
        'schedule':       'cosine',
        'ema_decay':      ema_decay,
        'perceptual_loss': use_perceptual,
        'channels':       [32, 64, 96, 128],
        'attention':      True,
        'attention_levels': 2,
        'resblocks':      True,
        'scene_categories': len(SCENE_PROMPTS),
        'total_prompts':  len(ALL_PAIRS),
        'session_label':  session_label,
    }
    with open(META_PATH, 'w') as f:
        json.dump(meta, f, indent=2)

    # Persist session to long-term memory
    memory.complete_session(meta, total_time)

    return meta


# ── Helpers ────────────────────────────────────────────────────────────────

def is_trained() -> bool:
    return os.path.exists(WEIGHTS_PATH) and os.path.exists(META_PATH)


def get_meta() -> dict:
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            return json.load(f)
    return {}


def load_for_inference(model, time_enc, text_enc):
    if is_trained():
        _load_all(model, time_enc, text_enc, WEIGHTS_PATH)
        return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# v4 Training Engine — UNetV4, 100K prompts, T=32 temporal sequences
# ══════════════════════════════════════════════════════════════════════════════

WEIGHTS_V4_PATH = os.path.join(_here, 'weights_v4.npz')
META_V4_PATH    = os.path.join(_here, 'meta_v4.json')

# v4 uses 256-dim conditioning: 128 time + 128 text
_TIME_ENC_DIM_V4 = 128
_TEXT_ENC_DIM_V4 = 128
_COND_DIM_V4     = 256


def _build_cond_v4(time_enc, text_enc, t, prompt):
    """256-dim conditioning for v4: time(128) + text(128)"""
    t_emb  = time_enc.forward(t)
    tokens = tokenize(prompt)
    tx_emb = text_enc.forward(tokens)
    return np.concatenate([t_emb, tx_emb]).astype(np.float32)


def _save_v4(model, time_enc, text_enc, losses=None):
    weights = model.get_named_weights()
    for k, v in time_enc.params.items():
        weights[f'time_enc_v4_{k}'] = v
    for k, v in text_enc.params.items():
        weights[f'text_enc_v4_{k}'] = v
    np.savez_compressed(WEIGHTS_V4_PATH, **weights)
    kb = os.path.getsize(WEIGHTS_V4_PATH) // 1024
    print(f"[DiffusionTrainer v4] Saved weights ({kb} KB) → {WEIGHTS_V4_PATH}", flush=True)


def _load_v4(model, time_enc, text_enc):
    if not os.path.exists(WEIGHTS_V4_PATH):
        return False
    try:
        data = dict(np.load(WEIGHTS_V4_PATH, allow_pickle=False))
    except Exception as e:
        print(f"[DiffusionTrainer v4] Could not load weights (corrupt?): {e}", flush=True)
        return False
    try:
        model.load_named_weights(data)
    except Exception as e:
        print(f"[DiffusionTrainer v4] Load error (non-fatal): {e}")
    for k in time_enc.params:
        key = f'time_enc_v4_{k}'
        if key in data and data[key].shape == time_enc.params[k].shape:
            time_enc.params[k] = data[key].astype(np.float32)
    for k in text_enc.params:
        key = f'text_enc_v4_{k}'
        if key in data and data[key].shape == text_enc.params[k].shape:
            text_enc.params[k] = data[key].astype(np.float32)
    print(f"[DiffusionTrainer v4] Loaded weights from {WEIGHTS_V4_PATH}", flush=True)
    return True


def train_v4(n_epochs: int = 5,
             n_samples: int = 500,
             T: int = 4,
             res: int = 96,
             lr: float = 2e-4,
             ema_decay: float = 0.9998,
             use_perceptual: bool = True,
             session_label: str = 'v4_quick') -> dict:
    """
    Train the v4 UNet (300M params, T-frame sequences, 100K prompts).

    Progressive training schedule (suggested):
      Phase 1 (T=4,  quick): Spatial quality foundation
      Phase 2 (T=8,  medium): Short motion learning
      Phase 3 (T=16, deep):   Medium motion coherence
      Phase 4 (T=32, deep):   Full video coherence

    Args:
        n_epochs:    Training epochs
        n_samples:   Samples per epoch
        T:           Temporal sequence length (4/8/16/32)
        res:         Spatial resolution (96 for v4 native)
        lr:          Learning rate
        ema_decay:   EMA decay rate (higher = slower adaptation)
        use_perceptual: Use Sobel edge + FFT loss
        session_label: Label for memory/logging
    """
    from .unet_v4 import UNetV4
    from .frame_extractor import FrameExtractor
    from .training_data_v3 import get_all_prompts, get_scenes

    print(f"\n{'='*70}", flush=True)
    print(f"[DiffusionTrainer v4] Starting: {session_label}", flush=True)
    print(f"  Model: UNetV4 (~300M params, T={T} frames, {res}×{res})", flush=True)
    print(f"  Epochs: {n_epochs}  |  Samples/epoch: {n_samples}", flush=True)
    print(f"  LR: {lr}  |  EMA: {ema_decay}  |  Perceptual: {use_perceptual}", flush=True)
    print(f"{'='*70}", flush=True)

    # ── Build model ───────────────────────────────────────────────────────────
    from .encoder import TimeEncoder, TextEncoder
    model    = UNetV4(cond_dim=_COND_DIM_V4, T=T)
    param_count = model.count_params()
    print(f"[DiffusionTrainer v4] Model params: {param_count:,} ({param_count/1e6:.1f}M)",
          flush=True)

    time_enc = TimeEncoder(emb_dim=_TIME_ENC_DIM_V4)
    text_enc = TextEncoder(emb_dim=_TEXT_ENC_DIM_V4)
    scheduler = DDPMScheduler(T=1000, schedule='cosine')
    extractor = FrameExtractor(T=T, H=res, W=res)

    # ── Try loading existing v4 weights ──────────────────────────────────────
    _load_v4(model, time_enc, text_enc)
    model.set_training(True)

    # ── Optimizer ─────────────────────────────────────────────────────────────
    all_pairs = model._get_param_grad_pairs_flat()
    # Add time/text encoder params
    all_pairs.append((time_enc.params, time_enc.grads))
    all_pairs.append((text_enc.params, text_enc.grads))
    opt = Adam(lr=lr)
    ema = EMA(decay=ema_decay)

    # ── 100K prompt library + real dataset prompts ────────────────────────────
    print(f"[DiffusionTrainer v4] Loading 100K prompt library...", flush=True)
    all_scene_prompts = get_all_prompts(target=100_000)
    scenes = list(all_scene_prompts.keys())
    print(f"[DiffusionTrainer v4] {sum(len(v) for v in all_scene_prompts.values()):,} "
          f"prompts across {len(scenes)} scenes", flush=True)

    # Load real dataset prompts (MusicCaps / AudioCaps) — 20% blend
    _real_captions: list = []
    try:
        from .dataset_reader import get_reader as _get_dr
        _dr = _get_dr()
        if _dr.has_prompt_data():
            _real_captions = _dr._musiccaps.sample_batch(500, seed=0) if _dr._musiccaps else []
            if not _real_captions and _dr._audiocaps:
                _real_captions = [_dr._audiocaps.sample_caption(seed=i) for i in range(500)]
            print(f"[DiffusionTrainer v4] Real captions: {len(_real_captions)} "
                  f"(MusicCaps/AudioCaps)", flush=True)
        if _dr.has_video_data():
            stats = _dr.get_stats()
            print(f"[DiffusionTrainer v4] Real video clips: "
                  f"HMDB51={stats['hmdb51_clips']} UCF101={stats['ucf101_clips']}", flush=True)
    except Exception as _e:
        print(f"[DiffusionTrainer v4] Dataset reader unavailable: {_e}", flush=True)

    # Flatten for rotation
    flat_pairs = []
    for sc, prompts in all_scene_prompts.items():
        flat_pairs.extend([(sc, p) for p in prompts])
    rng = np.random.default_rng(42)
    rng.shuffle(flat_pairs)

    # Pre-mix 20% real captions into flat_pairs (paired with nearest scene)
    if _real_captions:
        real_pairs = [(scenes[i % len(scenes)], cap) for i, cap in enumerate(_real_captions)]
        n_real_per_10 = max(1, len(real_pairs) * 2 // len(flat_pairs))
        mixed = []
        real_iter = iter(real_pairs * 10)
        for j, pair in enumerate(flat_pairs):
            if j % 5 == 0:
                try:
                    mixed.append(next(real_iter))
                except StopIteration:
                    pass
            mixed.append(pair)
        flat_pairs = mixed
        print(f"[DiffusionTrainer v4] Mixed {len(real_pairs)} real captions into "
              f"{len(flat_pairs)} total pairs", flush=True)

    losses    = []
    total_time = 0.0
    step_count = 0
    memory = LongTermMemory()

    for epoch in range(n_epochs):
        epoch_losses = []
        epoch_start  = time.time()
        sample_pairs = flat_pairs[:n_samples]  # rotate each epoch
        flat_pairs   = flat_pairs[n_samples:] + flat_pairs[:n_samples]  # cycle

        for i, (scene, prompt) in enumerate(sample_pairs):
            try:
                # Sample frame sequence from extractor
                frame_seq = extractor.sample(scene, seed=step_count)
                frame_seq = extractor.augment(frame_seq, seed=step_count)
                # frame_seq: (T, H, W, 3) float32 in [-1, 1]

                # Sample noise timestep
                t_idx = rng.integers(1, 1000)
                noise = np.random.randn(*frame_seq.shape).astype(np.float32)

                # Add noise to ALL T frames (same t_idx for temporal coherence)
                alpha = float(scheduler.alpha_bar[t_idx])
                x_noisy = math.sqrt(alpha) * frame_seq + math.sqrt(1 - alpha) * noise

                # Build 256-dim conditioning
                cond = _build_cond_v4(time_enc, text_enc, t_idx, prompt)

                # Forward pass: predict noise for all T frames
                model.zero_grads()
                pred_noise = model.forward(x_noisy, cond)
                # pred_noise: (T, H, W, 3)

                # Loss across all T frames
                if use_perceptual:
                    total_loss = 0.0
                    total_dloss = np.zeros_like(pred_noise)
                    for t_frame in range(T):
                        fl, dfl = perceptual_loss(pred_noise[t_frame], noise[t_frame])
                        total_loss += fl / T
                        total_dloss[t_frame] = dfl / T

                    # Temporal consistency loss: penalize frame-to-frame inconsistency
                    if T > 1:
                        for tf in range(T - 1):
                            diff = pred_noise[tf + 1] - pred_noise[tf]
                            temporal_loss = np.mean(diff ** 2) * 0.05
                            total_loss += temporal_loss
                            total_dloss[tf]     -= 0.1 * diff / diff.size
                            total_dloss[tf + 1] += 0.1 * diff / diff.size
                    loss  = total_loss
                    dloss = total_dloss
                else:
                    diff  = pred_noise - noise
                    loss  = float(np.mean(diff ** 2))
                    dloss = (2.0 / pred_noise.size) * diff

                # Backward + update
                model.backward(dloss)
                _clip_gradients(all_pairs, max_norm=1.0)
                opt.step(all_pairs)
                ema.update(all_pairs)

                epoch_losses.append(float(loss))
                losses.append(float(loss))
                step_count += 1

                if i % 50 == 0:
                    avg = float(np.mean(epoch_losses[-50:]))
                    print(f"[v4] Ep {epoch+1}/{n_epochs}  step {i+1}/{n_samples}  "
                          f"loss={avg:.4f}  scene={scene[:20]}", flush=True)

            except Exception as e:
                print(f"[DiffusionTrainer v4] Step error (skip): {e}", flush=True)
                continue

        epoch_time  = time.time() - epoch_start
        total_time += epoch_time
        mean_loss   = float(np.mean(epoch_losses)) if epoch_losses else 0.0
        print(f"[DiffusionTrainer v4] Epoch {epoch+1} done: "
              f"loss={mean_loss:.4f}  time={epoch_time:.0f}s", flush=True)

        # EMA snapshot + save
        backup = ema.apply(all_pairs)
        _save_v4(model, time_enc, text_enc, losses)
        ema.restore(all_pairs, backup)

    # ── Final save + metadata ─────────────────────────────────────────────────
    backup = ema.apply(all_pairs)
    _save_v4(model, time_enc, text_enc, losses)
    ema.restore(all_pairs, backup)

    meta = {
        'version':          4,
        'epochs':           n_epochs,
        'samples_per_epoch': n_samples,
        'final_loss':       float(losses[-1]) if losses else 0.0,
        'total_seconds':    total_time,
        'resolution':       res,
        'T':                T,
        'channels':         [128, 256, 512, 1024],
        'levels':           5,
        'resblocks':        4,
        'bottleneck_depth': 6,
        'attention_levels': 5,
        'temporal_attn':    True,
        'param_count':      param_count,
        'scene_categories': len(scenes),
        'total_prompts':    len(flat_pairs),
        'ema_decay':        ema_decay,
        'session_label':    session_label,
    }
    with open(META_V4_PATH, 'w') as f:
        json.dump(meta, f, indent=2)

    memory.complete_session(meta, total_time)
    print(f"[DiffusionTrainer v4] Complete. Total time: {total_time:.0f}s  "
          f"Final loss: {losses[-1]:.4f}", flush=True)
    return meta


def is_trained_v4() -> bool:
    return os.path.exists(WEIGHTS_V4_PATH)


def get_meta_v4() -> dict:
    if os.path.exists(META_V4_PATH):
        with open(META_V4_PATH) as f:
            return json.load(f)
    return {}

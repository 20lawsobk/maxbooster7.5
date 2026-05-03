"""
Music Industry Scenario Engine — Compounding Random Scenario Layer
==================================================================
Generates dynamically-compounding, music-industry-targeted training
scenarios for the MaxCore UNetV4 diffusion model.  Replaces generic
prompt rotation every N steps with a scenario-aware training signal
that compounds across sessions — teaching the model the full visual
language of the music business.

Architecture
────────────
  ScenarioSpec        — structured scenario object (job, stage, event, prompt)
  MusicScenarioEngine — main engine: rolls scenarios, plants seeds, persists state

Compounding Mechanism
─────────────────────
  Every fired scenario plants one or more "consequence seeds" — future event
  types that logically follow from the current scenario (e.g. a viral post
  seeds a label DM, which seeds an A&R meeting, which seeds a signing deal).

  Seeds are stored in the engine's JSON state file and are preferentially
  selected during subsequent training steps.  compound_depth tracks how
  deep in a chain the current scenario sits (0 = fresh → 2+ = veteran arc).

  Higher compound_depth → higher YE-step premium (more domain-targeted
  information per gradient update).

Eight Job Families (mapped to MaxCore model designations)
──────────────────────────────────────────────────────────
  content_creator   → 'content'     model
  social_strategist → 'social'      model
  ads_manager       → 'advertising' model
  fan_engagement    → 'engagement'  model
  visual_director   → UNetV4 (visual generation primary target)
  release_architect → cross-model  (all four + visual)
  touring_pro       → content + social
  sync_composer     → advertising + content

YE-Step Weights
───────────────
  Base scenario   (depth 0)  = 18 YE-steps  (1.5× replay weight)
  Compound D1     (depth 1)  = 24 YE-steps  (2×  replay weight)
  Compound D2+    (depth 2+) = 30 YE-steps  (2.5× replay weight)

Integration (from trainer.py train_v4)
───────────────────────────────────────
  from diffusion.music_scenario_engine import (
      get_engine as _get_scenario_engine,
      SCENARIO_INJECT_EVERY_N_STEPS as _SCENARIO_INJECT_N,
  )
  scenario_eng = _get_scenario_engine()

  # Every N steps (inside training loop, before extractor.sample):
  if scenario_eng is not None and step_count % _SCENARIO_INJECT_N == 0:
      spec = scenario_eng.roll_scenario(scene_hint=scene, gradient_health=_gh)
      if spec is not None:
          scene  = spec.scene_category
          prompt = spec.scene_prompt
          sim.add_scenario_steps(1, compound_depth=spec.compound_depth)

  # After adv_mem.record():
  scenario_eng.plant_seeds(spec, step_count)

  # End of session:
  scenario_eng.save()
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE       = os.path.dirname(os.path.abspath(__file__))
_STATE_DIR  = os.path.join(_HERE, 'music_scenario_engine')
_STATE_PATH = os.path.join(_STATE_DIR, 'scenario_state.json')

os.makedirs(_STATE_DIR, exist_ok=True)

# ── YE-Step weights (mirrored in time_simulator.py) ───────────────────────────
SCENARIO_YE_WEIGHT_BASE:       int = 18   # depth 0 (fresh scenario)   = 1.5× replay
SCENARIO_YE_WEIGHT_COMPOUND_1: int = 24   # depth 1 (first follow-up)  = 2×  replay
SCENARIO_YE_WEIGHT_COMPOUND_2: int = 30   # depth 2+ (veteran arc)     = 2.5× replay

# ── Behavioral constants ───────────────────────────────────────────────────────
SEED_TTL_SECONDS:              float = 1800.0  # seeds expire after 30 min of inactivity
MAX_ACTIVE_SEEDS:              int   = 64      # cap on concurrent active seeds
SCENARIO_INJECT_EVERY_N_STEPS: int   = 5       # inject scenario every N training steps

# ── Career stages ──────────────────────────────────────────────────────────────
CAREER_STAGES: List[str] = [
    'unsigned_indie',  # bedroom musician, no team, no budget
    'emerging',        # first real traction, small loyal audience
    'breaking',        # fast-rising, industry attention, first deals
    'established',     # proven chart/streaming success, touring income
    'mainstream',      # household name, radio, stadium tours
    'legacy',          # catalogue value, nostalgia tours, influence
]

# Sampling weights (realistic career-stage distribution in the industry)
_STAGE_WEIGHTS = [0.12, 0.25, 0.28, 0.20, 0.10, 0.05]

# ── Visual modifiers keyed to career stage ────────────────────────────────────
_STAGE_MODS: Dict[str, str] = {
    'unsigned_indie': 'underground indie raw bedroom authentic',
    'emerging':       'rising emerging authentic momentum raw',
    'breaking':       'breaking trending fast-rising spotlight energy',
    'established':    'established polished professional premium',
    'mainstream':     'mainstream iconic powerful stadium premium',
    'legacy':         'legendary iconic timeless classic historic',
}

# ── Scene category → SCENE_PROMPTS key mapping ────────────────────────────────
# All keys must be present in trainer.py SCENE_PROMPTS.
SCENE_MAP: Dict[str, List[str]] = {
    'content_creator':   ['studio_session', 'city_nights', 'rooftop_view'],
    'social_strategist': ['city_nights', 'studio_session', 'concert_stage'],
    'ads_manager':       ['city_nights', 'neon_cityscape', 'concert_stage'],
    'fan_engagement':    ['concert_stage', 'city_nights', 'intimate_venue'],
    'visual_director':   ['music_video_set', 'concert_stage', 'album_cover_shoot'],
    'release_architect': ['studio_session', 'golden_hour', 'concert_stage'],
    'touring_pro':       ['concert_stage', 'city_nights', 'music_festival'],
    'sync_composer':     ['studio_session', 'golden_hour', 'city_nights'],
}

# ── MaxCore model target per job family ───────────────────────────────────────
MODEL_TARGET: Dict[str, str] = {
    'content_creator':   'content',
    'social_strategist': 'social',
    'ads_manager':       'advertising',
    'fan_engagement':    'engagement',
    'visual_director':   'visual',
    'release_architect': 'all',
    'touring_pro':       'content',
    'sync_composer':     'advertising',
}

# ══════════════════════════════════════════════════════════════════════════════
#  MASTER SCENARIO LIBRARY
#  Structure: job_family → event_type → {seeds, intensity, platforms, visuals}
# ══════════════════════════════════════════════════════════════════════════════

SCENARIO_LIBRARY: Dict[str, Dict[str, Dict]] = {

    # ── CONTENT CREATOR ───────────────────────────────────────────────────────
    'content_creator': {
        'first_post_goes_viral': {
            'seeds':     ['label_dm_arrives', 'booking_inquiry', 'follower_explosion',
                          'brand_reach_out'],
            'intensity': (0.7, 1.0),
            'platforms': ['tiktok', 'instagram', 'youtube'],
            'visuals': [
                'bedroom creator ring light phone vertical video viral moment dark',
                'home studio ring light filming viral tiktok hook focused dark',
                'creator phone tripod bedroom ring light neon music content dark',
                'viral moment creator phone ring light home dark excited energy',
            ],
        },
        'tiktok_sound_goes_trend': {
            'seeds':     ['cover_wave_incoming', 'mainstream_discovery', 'sync_inquiry',
                          'streaming_spike'],
            'intensity': (0.5, 0.9),
            'platforms': ['tiktok'],
            'visuals': [
                'tiktok trend sound music creator phone dark ring light viral loop',
                'phone screen tiktok music trend dance creator bedroom ring light',
                'creator tiktok ring light dark energetic trending audio viral',
                'tiktok screen viral sound music creator filming bedroom glow dark',
            ],
        },
        'youtube_docuseries_launch': {
            'seeds':     ['press_feature_request', 'streaming_documentary_inquiry',
                          'fanbase_depth_surge'],
            'intensity': (0.4, 0.7),
            'platforms': ['youtube'],
            'visuals': [
                'documentary camera crew filming artist studio dark behind scenes',
                'youtube creator camera setup interview warm light behind scenes',
                'behind the scenes documentary crew artist studio warm ambient glow',
                'filmmaker crew recording artist emotional journey studio warm dark',
            ],
        },
        'collab_content_drops': {
            'seeds':     ['cross_audience_capture', 'new_genre_fan_wave',
                          'double_billing_tour'],
            'intensity': (0.3, 0.7),
            'platforms': ['tiktok', 'instagram', 'youtube'],
            'visuals': [
                'two artists collab studio session warm dark creative energy glow',
                'collab shoot two creators ring light phone filming fun energy',
                'music collab video shoot set camera two artists dark energetic',
                'studio session duo collaboration warm amber close-up creative dark',
            ],
        },
        'content_series_momentum': {
            'seeds':     ['platform_editorial_pick', 'algorithm_favorite',
                          'subscriber_surge'],
            'intensity': (0.3, 0.6),
            'platforms': ['youtube', 'instagram'],
            'visuals': [
                'youtube series filming studio warm editorial cinematic consistent',
                'content creator series studio consistent warm light professional',
                'video series filming setup studio warm organized focused creator',
                'creator content series dark warm studio editorial professional',
            ],
        },
        'short_form_algorithm_hit': {
            'seeds':     ['momentum_window', 'rapid_posting_advantage', 'label_discovery'],
            'intensity': (0.6, 0.9),
            'platforms': ['tiktok', 'instagram'],
            'visuals': [
                'short form viral video creator phone ring light dark flash moment',
                'reel creator filming dark studio ring light quick hook energy',
                'short clip music creator phone dark ring light energetic intense',
                'vertical video ring light dark creator music reel hook explosive',
            ],
        },
        'content_fatigue_pivot': {
            'seeds':     ['format_reinvention', 'audience_research_session',
                          'strategy_reset'],
            'intensity': (0.2, 0.5),
            'platforms': ['tiktok', 'instagram', 'youtube'],
            'visuals': [
                'creator reflection notebook strategy planning dark studio quiet',
                'creator reviewing analytics phone dark studio quiet thinking',
                'content pivot brainstorm studio dark notebook pen focused writer',
                'late night creator alone phone dark reviewing analytics quiet',
            ],
        },
    },

    # ── SOCIAL STRATEGIST ─────────────────────────────────────────────────────
    'social_strategist': {
        'campaign_goes_viral': {
            'seeds':     ['media_pickup_wave', 'speaking_inquiry', 'label_notice'],
            'intensity': (0.7, 1.0),
            'platforms': ['twitter', 'instagram'],
            'visuals': [
                'social media campaign viral trending phone dark city glow excited',
                'strategy team office screens trending dark night energetic glow',
                'viral campaign phone screen dark glow trending notification burst',
                'social strategy viral moment phone dark night city glow eruption',
            ],
        },
        'community_challenge_wave': {
            'seeds':     ['ugc_explosion', 'trending_hashtag',
                          'cross_platform_momentum'],
            'intensity': (0.5, 0.9),
            'platforms': ['tiktok', 'instagram', 'twitter'],
            'visuals': [
                'fan challenge video montage creative dark energetic phone glow',
                'community challenge trend wave phones screens dark social energy',
                'ugc fan content challenge montage dark vibrant creative explosion',
                'challenge wave phones dark screen glow trending viral community',
            ],
        },
        'live_stream_milestone': {
            'seeds':     ['superfan_identified', 'merchandise_demand', 'community_data'],
            'intensity': (0.4, 0.7),
            'platforms': ['twitch', 'instagram', 'youtube'],
            'visuals': [
                'live stream setup ring light camera dark glow focused chat active',
                'live stream music performance phone camera dark glow chat active',
                'streaming setup studio ring light chat dark energetic artist live',
                'creator live stream milestone dark ring light chat celebration',
            ],
        },
        'twitter_space_explosion': {
            'seeds':     ['podcast_invitation', 'industry_ear_perked',
                          'speaker_circuit'],
            'intensity': (0.4, 0.7),
            'platforms': ['twitter'],
            'visuals': [
                'phone twitter space microphone dark glow intimate night city',
                'audio conversation space phone dark focused night quiet intimate',
                'twitter space icon phone dark night ambient soft glow city',
                'voice chat phone dark glow intimate industry conversation night',
            ],
        },
        'controversy_handled': {
            'seeds':     ['crisis_pr_campaign', 'narrative_control', 'trust_rebuild'],
            'intensity': (0.5, 0.8),
            'platforms': ['twitter', 'instagram'],
            'visuals': [
                'crisis management phone dark night serious focused professional',
                'statement post phone screen dark serious controlled calm night',
                'damage control late night phone dark screen serious focused',
                'public statement phone dark screen night serious composed calm',
            ],
        },
        'fan_appreciation_moment': {
            'seeds':     ['loyalty_surge', 'organic_word_of_mouth',
                          'community_deepening'],
            'intensity': (0.2, 0.5),
            'platforms': ['instagram', 'tiktok', 'twitter'],
            'visuals': [
                'artist fan appreciation post warm light genuine smile candid',
                'heartfelt fan moment backstage warm soft light authentic real',
                'artist genuine fan interaction warm close candid organic moment',
                'artist love fans post warm candid genuine authentic real moment',
            ],
        },
    },

    # ── ADS MANAGER ───────────────────────────────────────────────────────────
    'ads_manager': {
        'campaign_launch': {
            'seeds':     ['ctr_optimization', 'audience_refinement', 'scale_decision'],
            'intensity': (0.4, 0.8),
            'platforms': ['instagram', 'youtube', 'tiktok'],
            'visuals': [
                'advertising agency dark office screens campaign launch night glow',
                'marketing dashboard screens dark night professional focus glow',
                'ad campaign control room screens data dark professional intense',
                'launch day campaign office screens dark night professional glow',
            ],
        },
        'retargeting_wins': {
            'seeds':     ['conversion_spike', 'lookalike_expansion',
                          'budget_scale_up'],
            'intensity': (0.3, 0.6),
            'platforms': ['instagram', 'youtube'],
            'visuals': [
                'retargeting analytics dashboard dark screen data glow night',
                'conversion graph rising screen dark office night professional',
                'ad performance data screen dark glow analyst focused night',
                'retargeting win screen graph rising dark office professional',
            ],
        },
        'influencer_campaign': {
            'seeds':     ['authentic_endorsement_wave', 'niche_audience_capture',
                          'brand_loyalty'],
            'intensity': (0.5, 0.8),
            'platforms': ['tiktok', 'instagram', 'youtube'],
            'visuals': [
                'influencer campaign shoot product dark ring light creative',
                'influencer filming collab music dark ring light authentic warm',
                'creator brand deal shoot dark ring light music artist natural',
                'influencer brand partnership dark ring light authentic warm shoot',
            ],
        },
        'playlist_ad_campaign': {
            'seeds':     ['editorial_pitch_follow_up', 'dsp_algorithm_boost',
                          'streaming_milestone'],
            'intensity': (0.4, 0.7),
            'platforms': ['spotify', 'apple_music', 'youtube'],
            'visuals': [
                'spotify campaign promotion dark screen playlist editorial glow',
                'streaming platform campaign analytics dark screen professional',
                'playlist ad campaign data screen dark glow music streaming night',
                'dsp campaign streaming dark screen professional editorial glow',
            ],
        },
        'festival_ad_takeover': {
            'seeds':     ['ticket_surge', 'social_proof_moment',
                          'brand_partnership_offer'],
            'intensity': (0.6, 0.9),
            'platforms': ['instagram', 'tiktok', 'youtube'],
            'visuals': [
                'festival advertising billboard night neon crowd dark energetic',
                'festival ad campaign outdoor crowd night large screen dark vibrant',
                'outdoor festival ad dark night stage crowd energetic display',
                'festival ad takeover screens night dark crowd energetic vibrant',
            ],
        },
        'ad_creative_refresh': {
            'seeds':     ['ctr_recovery', 'audience_re_engagement',
                          'creative_breakthrough'],
            'intensity': (0.3, 0.5),
            'platforms': ['instagram', 'tiktok'],
            'visuals': [
                'creative team brainstorm dark office screens night professional',
                'ad creative refresh session dark office focused night screens',
                'marketing creative review dark screens professional night team',
                'creative session studio dark brainstorm screens night team focus',
            ],
        },
    },

    # ── FAN ENGAGEMENT ────────────────────────────────────────────────────────
    'fan_engagement': {
        'superfan_identified': {
            'seeds':     ['vip_program_launch', 'early_access_offer',
                          'word_of_mouth_army'],
            'intensity': (0.5, 0.8),
            'platforms': ['instagram', 'twitter', 'tiktok'],
            'visuals': [
                'artist fan meet moment backstage warm close candid authentic real',
                'superfan artist interaction backstage warm light emotional real',
                'fan meeting artist backstage authentic warm emotional cinematic',
                'artist superfan moment real warm backstage close authentic',
            ],
        },
        'meet_greet_goes_viral': {
            'seeds':     ['fan_story_spreads', 'loyalty_deepening', 'merch_surge'],
            'intensity': (0.4, 0.7),
            'platforms': ['instagram', 'tiktok', 'twitter'],
            'visuals': [
                'meet greet photo fan artist warm close smile authentic venue',
                'backstage meet greet crowd fan warm light artist candid real',
                'fan meet artist backstage warm smile candid emotional lighting',
                'meet and greet backstage warm close fan artist smile authentic',
            ],
        },
        'exclusive_merch_drop': {
            'seeds':     ['scarcity_fomo_wave', 'secondary_market_premium',
                          'brand_prestige'],
            'intensity': (0.5, 0.8),
            'platforms': ['instagram', 'tiktok'],
            'visuals': [
                'limited edition merch drop product dark studio minimal premium',
                'exclusive clothing drop dark product shot premium editorial',
                'limited merch release dark background clean product premium shot',
                'merch drop product dark studio premium minimal clean editorial',
            ],
        },
        'fan_art_goes_mainstream': {
            'seeds':     ['community_showcase', 'organic_marketing_wave',
                          'authenticity_signal'],
            'intensity': (0.3, 0.6),
            'platforms': ['twitter', 'instagram', 'tiktok'],
            'visuals': [
                'fan art wall gallery dark vibrant colorful tribute artist prints',
                'fan artwork display gallery warm dark colorful authentic tribute',
                'community fan art exhibition warm gallery dark vibrant prints',
                'fan art showcase gallery dark warm colorful authentic tribute',
            ],
        },
        'discord_milestone': {
            'seeds':     ['active_community_asset', 'product_test_group',
                          'organic_feedback_loop'],
            'intensity': (0.3, 0.5),
            'platforms': ['twitch', 'instagram', 'twitter'],
            'visuals': [
                'discord community dark phone screen chat active night milestone',
                'online community chat dark screen glow fan engagement night',
                'digital fan community screen dark glow active chat night phone',
                'community milestone dark phone glow screen active fans night',
            ],
        },
        'charity_moment': {
            'seeds':     ['goodwill_premium', 'press_feature_request',
                          'fan_pride_boost'],
            'intensity': (0.3, 0.6),
            'platforms': ['instagram', 'twitter', 'youtube'],
            'visuals': [
                'charity event artist warm community giving light authentic real',
                'artist charity moment warm light genuine community engagement',
                'giving back community event artist warm candid authentic real',
                'artist community charity warm giving authentic light real',
            ],
        },
    },

    # ── VISUAL DIRECTOR ───────────────────────────────────────────────────────
    'visual_director': {
        'music_video_production': {
            'seeds':     ['viral_visual_moment', 'award_nomination',
                          'streaming_visual_boost'],
            'intensity': (0.6, 1.0),
            'platforms': ['youtube', 'instagram', 'tiktok'],
            'visuals': [
                'music video production set camera crane operator crew dark cinematic',
                'mv set production studio lights camera director dark professional',
                'music video shoot cinematic camera rig crew dark professional set',
                'artist music video set production lights dark director cinematic',
                'music video night shoot location crew lights dark dramatic',
            ],
        },
        'album_cover_shoot': {
            'seeds':     ['artwork_press_cycle', 'social_reveal_campaign',
                          'visual_identity_refresh'],
            'intensity': (0.4, 0.8),
            'platforms': ['instagram', 'youtube'],
            'visuals': [
                'album cover photo shoot studio dark dramatic portrait cinematic',
                'artist portrait shoot dramatic dark studio professional editorial',
                'album artwork shoot dramatic dark lighting portrait cinematic',
                'solo artist portrait shoot dark dramatic moody cinematic close',
            ],
        },
        'live_visualizer_release': {
            'seeds':     ['streaming_view_surge', 'live_show_enhancement',
                          'brand_identity_lock'],
            'intensity': (0.3, 0.6),
            'platforms': ['youtube', 'spotify'],
            'visuals': [
                'visualizer abstract music art dark neon animation flowing cinematic',
                'lyric video animated dark neon glow abstract artistic music',
                'audio visualizer neon abstract dark flow music animated cinematic',
                'music visualizer dark neon abstract flowing animated cinematic',
            ],
        },
        'short_film_collab': {
            'seeds':     ['film_critical_praise', 'sync_licensing_inquiry',
                          'artistic_credibility'],
            'intensity': (0.5, 0.8),
            'platforms': ['youtube', 'film'],
            'visuals': [
                'short film production set dark cinematic crew lights dramatic',
                'artistic short film crew dark cinematic dramatic lighting set',
                'indie short film production dark dramatic lighting crew cinematic',
                'short film shoot dark cinematic crew artistic dramatic moody',
            ],
        },
        'bts_documentary_series': {
            'seeds':     ['content_series_extension', 'audience_bonding',
                          'authenticity_premium'],
            'intensity': (0.3, 0.6),
            'platforms': ['youtube', 'instagram'],
            'visuals': [
                'behind scenes documentary crew filmmaker dark handheld intimate',
                'bts film crew handheld dark backstage intimate documentary',
                'behind scenes artist documentary dark handheld camera crew raw',
                'documentary crew handheld dark backstage intimate authentic raw',
            ],
        },
        'vr_ar_experience': {
            'seeds':     ['tech_press_coverage', 'innovation_award_consideration',
                          'forward_brand'],
            'intensity': (0.4, 0.7),
            'platforms': ['youtube', 'tiktok'],
            'visuals': [
                'vr virtual reality headset concert dark neon futuristic immersive',
                'ar augmented reality concert overlay dark neon digital futuristic',
                'immersive vr music experience dark neon glow futuristic concert',
                'virtual reality music headset dark neon futuristic concert glow',
            ],
        },
    },

    # ── RELEASE ARCHITECT ─────────────────────────────────────────────────────
    'release_architect': {
        'single_rollout_campaign': {
            'seeds':     ['playlist_pitch_window', 'streaming_push_moment',
                          'press_rollout'],
            'intensity': (0.5, 0.8),
            'platforms': ['spotify', 'apple_music', 'instagram', 'youtube'],
            'visuals': [
                'single release artwork reveal dark premium editorial cinematic',
                'new single promotional artwork dark premium studio clean',
                'music release campaign artwork dark premium studio professional',
                'single drop reveal dark premium editorial clean studio cinematic',
            ],
        },
        'album_campaign_build': {
            'seeds':     ['press_cycle_launch', 'radio_promo_push',
                          'tour_announcement'],
            'intensity': (0.7, 1.0),
            'platforms': ['spotify', 'apple_music', 'youtube', 'radio'],
            'visuals': [
                'album release campaign studio dark premium artwork reveal cinematic',
                'album rollout campaign dark studio professional editorial reveal',
                'new album announcement dark dramatic premium artwork reveal studio',
                'album campaign reveal dark studio dramatic premium cinematic glow',
            ],
        },
        'surprise_drop': {
            'seeds':     ['viral_moment_ignition', 'fan_frenzy_activity',
                          'media_scramble'],
            'intensity': (0.6, 1.0),
            'platforms': ['spotify', 'apple_music', 'tiktok', 'instagram'],
            'visuals': [
                'surprise release announcement phone screen dark night excited',
                'midnight surprise drop phone dark screen music release explosive',
                'surprise album drop announcement dark explosive cinematic reveal',
                'midnight drop phone screen dark night surprise music explosive',
            ],
        },
        'playlist_placement_win': {
            'seeds':     ['streaming_momentum_surge', 'algorithm_favor_period',
                          'label_attention'],
            'intensity': (0.4, 0.7),
            'platforms': ['spotify', 'apple_music'],
            'visuals': [
                'spotify playlist editorial add dark green phone screen success',
                'playlist placement win phone screen dark streaming success glow',
                'editorial playlist add screen dark green streaming notification',
                'playlist add notification phone dark screen success streaming',
            ],
        },
        'chart_debut_moment': {
            'seeds':     ['press_coverage_wave', 'booking_surge',
                          'anticipation_next_project'],
            'intensity': (0.8, 1.0),
            'platforms': ['spotify', 'apple_music', 'radio'],
            'visuals': [
                'chart position achievement screen dark phone excited milestone',
                'chart entry number phone screen dark success milestone excited',
                'billboard chart debut screen dark phone major milestone energy',
                'chart debut achievement phone screen dark milestone success glow',
            ],
        },
        'streaming_milestone': {
            'seeds':     ['leverage_label_deal', 'brand_deal_window',
                          'fan_celebration_moment'],
            'intensity': (0.5, 0.8),
            'platforms': ['spotify', 'apple_music', 'youtube'],
            'visuals': [
                'streaming milestone certificate plaque dark studio wall success',
                'million streams milestone plaque dark studio professional proud',
                'streaming achievement award dark studio wall milestone proud',
                'streams milestone plaque dark studio wall professional proud',
            ],
        },
        'label_signing_day': {
            'seeds':     ['advance_investment', 'professional_team_assembly',
                          'major_press_push'],
            'intensity': (0.9, 1.0),
            'platforms': ['instagram', 'twitter', 'youtube'],
            'visuals': [
                'record label signing ceremony dark office suit professional milestone',
                'label deal signing pen paper dark office professional milestone',
                'record deal signing dark boardroom professional dramatic milestone',
                'label signing boardroom dark suit pen paper professional milestone',
            ],
        },
    },

    # ── TOURING PRO ───────────────────────────────────────────────────────────
    'touring_pro': {
        'headline_show_debut': {
            'seeds':     ['ticket_sell_out', 'press_coverage_wave', 'merch_surge'],
            'intensity': (0.7, 1.0),
            'platforms': ['instagram', 'tiktok', 'live_venue'],
            'visuals': [
                'headline concert debut sold-out crowd dark spotlight stage energy',
                'first headline show stage crowd dark energetic triumphant spotlight',
                'debut headline act concert stage dark crowd energy milestone',
                'headline debut stage sold-out crowd dark dramatic triumphant',
            ],
        },
        'festival_slot_win': {
            'seeds':     ['new_audience_discovery', 'industry_networking_moment',
                          'industry_credibility'],
            'intensity': (0.6, 0.9),
            'platforms': ['instagram', 'live_venue'],
            'visuals': [
                'festival stage slot crowd outdoor energetic performer vibrant day',
                'festival crowd stage performer daytime outdoor energetic vibrant',
                'music festival stage artist crowd outdoor vibrant energetic warm',
                'festival slot stage outdoor crowd day energetic performer vibrant',
            ],
        },
        'arena_tour_announcement': {
            'seeds':     ['pre_sale_excitement', 'sponsorship_interest',
                          'tour_merch_design'],
            'intensity': (0.8, 1.0),
            'platforms': ['instagram', 'twitter', 'youtube'],
            'visuals': [
                'arena tour announcement dark stage empty potential massive dramatic',
                'arena venue empty pre-show dark dramatic massive stage potential',
                'tour announcement poster dark dramatic stage cinematic massive',
                'arena empty dark pre-show massive stage tour announcement dramatic',
            ],
        },
        'support_slot_opportunity': {
            'seeds':     ['fanbase_expansion', 'industry_introduction',
                          'touring_skill_growth'],
            'intensity': (0.3, 0.6),
            'platforms': ['live_venue', 'instagram'],
            'visuals': [
                'support act opening stage small crowd dark energy emerging warm',
                'opening act stage crowd warm dark emerging performer humble',
                'support slot stage dark crowd warm small beginning emerging',
                'opening set stage crowd dark warm beginning emerging humble',
            ],
        },
        'international_tour': {
            'seeds':     ['global_fanbase_growth', 'cultural_exchange_moment',
                          'international_press'],
            'intensity': (0.6, 0.9),
            'platforms': ['instagram', 'youtube', 'live_venue'],
            'visuals': [
                'international tour stage foreign city dark crowd energetic global',
                'overseas concert stage crowd dark performer international energy',
                'world tour stage foreign city crowd dark energetic international',
                'global tour stage dark foreign city crowd energetic international',
            ],
        },
        'residency_run': {
            'seeds':     ['deep_fan_engagement', 'creative_experimentation',
                          'local_cultural_impact'],
            'intensity': (0.4, 0.7),
            'platforms': ['live_venue', 'instagram'],
            'visuals': [
                'residency venue intimate stage crowd dark warm repeat performer',
                'intimate residency show stage small crowd dark warm close',
                'venue residency stage dark warm close crowd intimate energy',
                'residency show intimate stage dark warm crowd close repeat',
            ],
        },
    },

    # ── SYNC COMPOSER ─────────────────────────────────────────────────────────
    'sync_composer': {
        'tv_show_placement': {
            'seeds':     ['royalty_check_arrival', 'new_audience_discovery',
                          'licensing_agency_interest'],
            'intensity': (0.5, 0.8),
            'platforms': ['tv', 'streaming_platform'],
            'visuals': [
                'television sync music placement studio dark screen professional',
                'tv show soundtrack placement studio dark professional warm',
                'sync licensing success tv screen dark studio professional warm',
                'tv placement studio dark screen professional warm sync success',
            ],
        },
        'film_trailer_feature': {
            'seeds':     ['mainstream_discovery_wave', 'critical_association',
                          'streaming_boost'],
            'intensity': (0.7, 1.0),
            'platforms': ['film', 'youtube'],
            'visuals': [
                'film trailer sync music cinematic dark dramatic studio professional',
                'movie trailer music sync dark dramatic professional cinematic',
                'cinema trailer sync placement dark dramatic studio professional',
                'film trailer sync dark dramatic studio cinematic professional',
            ],
        },
        'ad_campaign_scoring': {
            'seeds':     ['brand_partnership_offer', 'recurring_royalty',
                          'mainstream_exposure'],
            'intensity': (0.5, 0.8),
            'platforms': ['tv', 'youtube', 'instagram'],
            'visuals': [
                'advertising score session studio dark professional warm cinematic',
                'brand music score studio dark warm professional sync recording',
                'ad campaign score recording studio dark warm professional sync',
                'brand score session studio dark warm professional cinematic sync',
            ],
        },
        'video_game_feature': {
            'seeds':     ['gaming_audience_discovery', 'tech_press_coverage',
                          'licensing_portfolio_growth'],
            'intensity': (0.4, 0.7),
            'platforms': ['gaming'],
            'visuals': [
                'video game soundtrack recording studio dark screen glow tech',
                'game music score session studio dark screen glow professional',
                'gaming sync recording dark studio screen glow tech professional',
                'game score session studio dark screen glow tech professional sync',
            ],
        },
        'documentary_score': {
            'seeds':     ['critical_praise_wave', 'historical_preservation',
                          'artistic_depth_signal'],
            'intensity': (0.4, 0.7),
            'platforms': ['film', 'streaming_platform'],
            'visuals': [
                'documentary score recording studio dark orchestral warm dramatic',
                'film score session studio dark orchestral warm cinematic dramatic',
                'documentary music recording studio warm dark cinematic professional',
                'score session studio dark warm orchestral cinematic documentary',
            ],
        },
        'streaming_show_theme': {
            'seeds':     ['weekly_discovery_loop', 'fanbase_growth_passive',
                          'licensing_income_stream'],
            'intensity': (0.5, 0.8),
            'platforms': ['streaming_platform'],
            'visuals': [
                'streaming show theme music recording studio dark warm professional',
                'series theme score studio warm dark professional cinematic',
                'show title sequence music studio dark warm professional record',
                'streaming theme session studio dark warm professional cinematic',
            ],
        },
    },
}


# ══════════════════════════════════════════════════════════════════════════════
#  CONSEQUENCE SEED RESOLUTION TABLE
#  Maps a seed name → (job_family, event_type) that fires next in the chain.
# ══════════════════════════════════════════════════════════════════════════════

SEED_RESOLUTION: Dict[str, Tuple[str, str]] = {
    # ── content_creator seeds ─────────────────────────────────────────────────
    'label_dm_arrives':              ('release_architect',   'label_signing_day'),
    'booking_inquiry':               ('touring_pro',         'support_slot_opportunity'),
    'follower_explosion':            ('social_strategist',   'campaign_goes_viral'),
    'brand_reach_out':               ('ads_manager',         'influencer_campaign'),
    'cover_wave_incoming':           ('content_creator',     'collab_content_drops'),
    'mainstream_discovery':          ('release_architect',   'playlist_placement_win'),
    'sync_inquiry':                  ('sync_composer',       'tv_show_placement'),
    'streaming_spike':               ('release_architect',   'streaming_milestone'),
    'press_feature_request':         ('social_strategist',   'campaign_goes_viral'),
    'streaming_documentary_inquiry': ('visual_director',     'bts_documentary_series'),
    'fanbase_depth_surge':           ('fan_engagement',      'superfan_identified'),
    'cross_audience_capture':        ('fan_engagement',      'community_challenge_wave'),
    'new_genre_fan_wave':            ('social_strategist',   'community_challenge_wave'),
    'double_billing_tour':           ('touring_pro',         'headline_show_debut'),
    'platform_editorial_pick':       ('release_architect',   'playlist_placement_win'),
    'algorithm_favorite':            ('release_architect',   'streaming_milestone'),
    'subscriber_surge':              ('fan_engagement',      'discord_milestone'),
    'momentum_window':               ('content_creator',     'short_form_algorithm_hit'),
    'rapid_posting_advantage':       ('content_creator',     'content_series_momentum'),
    'label_discovery':               ('release_architect',   'label_signing_day'),
    'format_reinvention':            ('visual_director',     'bts_documentary_series'),
    'audience_research_session':     ('ads_manager',         'campaign_launch'),
    'strategy_reset':                ('social_strategist',   'fan_appreciation_moment'),
    # ── social_strategist seeds ───────────────────────────────────────────────
    'media_pickup_wave':             ('release_architect',   'single_rollout_campaign'),
    'speaking_inquiry':              ('social_strategist',   'twitter_space_explosion'),
    'label_notice':                  ('release_architect',   'label_signing_day'),
    'ugc_explosion':                 ('content_creator',     'tiktok_sound_goes_trend'),
    'trending_hashtag':              ('social_strategist',   'campaign_goes_viral'),
    'cross_platform_momentum':       ('content_creator',     'short_form_algorithm_hit'),
    'superfan_identified':           ('fan_engagement',      'superfan_identified'),
    'merchandise_demand':            ('fan_engagement',      'exclusive_merch_drop'),
    'community_data':                ('ads_manager',         'campaign_launch'),
    'podcast_invitation':            ('social_strategist',   'twitter_space_explosion'),
    'industry_ear_perked':           ('release_architect',   'label_signing_day'),
    'speaker_circuit':               ('social_strategist',   'campaign_goes_viral'),
    'crisis_pr_campaign':            ('social_strategist',   'controversy_handled'),
    'narrative_control':             ('social_strategist',   'fan_appreciation_moment'),
    'trust_rebuild':                 ('fan_engagement',      'charity_moment'),
    'loyalty_surge':                 ('fan_engagement',      'superfan_identified'),
    'organic_word_of_mouth':         ('social_strategist',   'community_challenge_wave'),
    'community_deepening':           ('fan_engagement',      'discord_milestone'),
    # ── ads_manager seeds ─────────────────────────────────────────────────────
    'ctr_optimization':              ('ads_manager',         'ad_creative_refresh'),
    'audience_refinement':           ('ads_manager',         'retargeting_wins'),
    'scale_decision':                ('ads_manager',         'festival_ad_takeover'),
    'conversion_spike':              ('ads_manager',         'campaign_launch'),
    'lookalike_expansion':           ('ads_manager',         'influencer_campaign'),
    'budget_scale_up':               ('ads_manager',         'festival_ad_takeover'),
    'authentic_endorsement_wave':    ('content_creator',     'collab_content_drops'),
    'niche_audience_capture':        ('fan_engagement',      'superfan_identified'),
    'brand_loyalty':                 ('fan_engagement',      'fan_art_goes_mainstream'),
    'editorial_pitch_follow_up':     ('release_architect',   'playlist_placement_win'),
    'dsp_algorithm_boost':           ('release_architect',   'streaming_milestone'),
    'ticket_surge':                  ('touring_pro',         'arena_tour_announcement'),
    'social_proof_moment':           ('social_strategist',   'campaign_goes_viral'),
    'brand_partnership_offer':       ('sync_composer',       'ad_campaign_scoring'),
    'ctr_recovery':                  ('ads_manager',         'campaign_launch'),
    'audience_re_engagement':        ('social_strategist',   'fan_appreciation_moment'),
    'creative_breakthrough':         ('visual_director',     'music_video_production'),
    # ── fan_engagement seeds ──────────────────────────────────────────────────
    'vip_program_launch':            ('fan_engagement',      'meet_greet_goes_viral'),
    'early_access_offer':            ('release_architect',   'surprise_drop'),
    'word_of_mouth_army':            ('social_strategist',   'campaign_goes_viral'),
    'fan_story_spreads':             ('social_strategist',   'campaign_goes_viral'),
    'loyalty_deepening':             ('fan_engagement',      'discord_milestone'),
    'merch_surge':                   ('fan_engagement',      'exclusive_merch_drop'),
    'scarcity_fomo_wave':            ('fan_engagement',      'exclusive_merch_drop'),
    'secondary_market_premium':      ('release_architect',   'chart_debut_moment'),
    'brand_prestige':                ('ads_manager',         'influencer_campaign'),
    'community_showcase':            ('content_creator',     'youtube_docuseries_launch'),
    'organic_marketing_wave':        ('social_strategist',   'community_challenge_wave'),
    'authenticity_signal':           ('fan_engagement',      'charity_moment'),
    'active_community_asset':        ('social_strategist',   'community_challenge_wave'),
    'product_test_group':            ('ads_manager',         'ad_creative_refresh'),
    'organic_feedback_loop':         ('content_creator',     'content_series_momentum'),
    'goodwill_premium':              ('release_architect',   'single_rollout_campaign'),
    'fan_pride_boost':               ('fan_engagement',      'fan_art_goes_mainstream'),
    # ── visual_director seeds ─────────────────────────────────────────────────
    'viral_visual_moment':           ('social_strategist',   'campaign_goes_viral'),
    'award_nomination':              ('release_architect',   'chart_debut_moment'),
    'streaming_visual_boost':        ('release_architect',   'streaming_milestone'),
    'artwork_press_cycle':           ('release_architect',   'single_rollout_campaign'),
    'social_reveal_campaign':        ('social_strategist',   'campaign_goes_viral'),
    'visual_identity_refresh':       ('visual_director',     'album_cover_shoot'),
    'streaming_view_surge':          ('release_architect',   'streaming_milestone'),
    'live_show_enhancement':         ('touring_pro',         'headline_show_debut'),
    'brand_identity_lock':           ('ads_manager',         'influencer_campaign'),
    'film_critical_praise':          ('sync_composer',       'documentary_score'),
    'sync_licensing_inquiry':        ('sync_composer',       'tv_show_placement'),
    'artistic_credibility':          ('release_architect',   'album_campaign_build'),
    'content_series_extension':      ('content_creator',     'content_series_momentum'),
    'audience_bonding':              ('fan_engagement',      'superfan_identified'),
    'authenticity_premium':          ('fan_engagement',      'charity_moment'),
    'tech_press_coverage':           ('social_strategist',   'campaign_goes_viral'),
    'innovation_award_consideration':('release_architect',   'chart_debut_moment'),
    'forward_brand':                 ('ads_manager',         'influencer_campaign'),
    # ── release_architect seeds ───────────────────────────────────────────────
    'playlist_pitch_window':         ('release_architect',   'playlist_placement_win'),
    'streaming_push_moment':         ('release_architect',   'streaming_milestone'),
    'press_rollout':                 ('social_strategist',   'campaign_goes_viral'),
    'press_cycle_launch':            ('social_strategist',   'campaign_goes_viral'),
    'radio_promo_push':              ('release_architect',   'chart_debut_moment'),
    'tour_announcement':             ('touring_pro',         'arena_tour_announcement'),
    'viral_moment_ignition':         ('social_strategist',   'campaign_goes_viral'),
    'fan_frenzy_activity':           ('fan_engagement',      'meet_greet_goes_viral'),
    'media_scramble':                ('social_strategist',   'campaign_goes_viral'),
    'streaming_momentum_surge':      ('release_architect',   'streaming_milestone'),
    'algorithm_favor_period':        ('release_architect',   'playlist_placement_win'),
    'label_attention':               ('release_architect',   'label_signing_day'),
    'press_coverage_wave':           ('social_strategist',   'campaign_goes_viral'),
    'booking_surge':                 ('touring_pro',         'headline_show_debut'),
    'anticipation_next_project':     ('release_architect',   'album_campaign_build'),
    'leverage_label_deal':           ('release_architect',   'label_signing_day'),
    'brand_deal_window':             ('ads_manager',         'influencer_campaign'),
    'fan_celebration_moment':        ('fan_engagement',      'meet_greet_goes_viral'),
    'advance_investment':            ('release_architect',   'album_campaign_build'),
    'professional_team_assembly':    ('ads_manager',         'campaign_launch'),
    'major_press_push':              ('social_strategist',   'campaign_goes_viral'),
    # ── touring_pro seeds ─────────────────────────────────────────────────────
    'ticket_sell_out':               ('fan_engagement',      'meet_greet_goes_viral'),
    'new_audience_discovery':        ('fan_engagement',      'superfan_identified'),
    'industry_networking_moment':    ('release_architect',   'label_signing_day'),
    'industry_credibility':          ('release_architect',   'album_campaign_build'),
    'pre_sale_excitement':           ('social_strategist',   'campaign_goes_viral'),
    'sponsorship_interest':          ('ads_manager',         'influencer_campaign'),
    'tour_merch_design':             ('fan_engagement',      'exclusive_merch_drop'),
    'fanbase_expansion':             ('fan_engagement',      'superfan_identified'),
    'industry_introduction':         ('release_architect',   'label_signing_day'),
    'touring_skill_growth':          ('touring_pro',         'festival_slot_win'),
    'global_fanbase_growth':         ('fan_engagement',      'discord_milestone'),
    'cultural_exchange_moment':      ('content_creator',     'youtube_docuseries_launch'),
    'international_press':           ('social_strategist',   'campaign_goes_viral'),
    'deep_fan_engagement':           ('fan_engagement',      'meet_greet_goes_viral'),
    'creative_experimentation':      ('visual_director',     'music_video_production'),
    'local_cultural_impact':         ('social_strategist',   'fan_appreciation_moment'),
    # ── sync_composer seeds ───────────────────────────────────────────────────
    'royalty_check_arrival':         ('release_architect',   'streaming_milestone'),
    'licensing_agency_interest':     ('sync_composer',       'film_trailer_feature'),
    'mainstream_discovery_wave':     ('release_architect',   'chart_debut_moment'),
    'critical_association':          ('release_architect',   'album_campaign_build'),
    'recurring_royalty':             ('sync_composer',       'ad_campaign_scoring'),
    'mainstream_exposure':           ('release_architect',   'single_rollout_campaign'),
    'gaming_audience_discovery':     ('fan_engagement',      'discord_milestone'),
    'licensing_portfolio_growth':    ('sync_composer',       'documentary_score'),
    'historical_preservation':       ('release_architect',   'album_campaign_build'),
    'artistic_depth_signal':         ('visual_director',     'short_film_collab'),
    'weekly_discovery_loop':         ('release_architect',   'streaming_milestone'),
    'fanbase_growth_passive':        ('fan_engagement',      'superfan_identified'),
    'licensing_income_stream':       ('sync_composer',       'video_game_feature'),
    'streaming_boost':               ('release_architect',   'streaming_milestone'),
    'streaming_milestone':           ('release_architect',   'streaming_milestone'),
}


# ══════════════════════════════════════════════════════════════════════════════
#  SCENARIO SPEC DATACLASS
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class ScenarioSpec:
    """
    A single fired scenario with all context needed by the training loop.

    scene_category  — maps to a valid SCENE_PROMPTS key in trainer.py
    scene_prompt    — ready-to-use visual conditioning text for the UNetV4
    ye_weight       — year-equivalent step credit for time_simulator
    """
    scenario_id:          str
    chain_id:             str
    job_family:           str
    model_target:         str         # 'content' | 'social' | 'advertising' | 'engagement' | 'visual' | 'all'
    career_stage:         str
    platform:             str
    event_type:           str
    intensity:            float       # 0.0 (low stakes) → 1.0 (career-defining)
    compound_depth:       int         # 0 = fresh chain, 1+ = follow-up
    consequence_seeds:    List[str]   # events this scenario seeds for future rolls
    scene_category:       str         # SCENE_PROMPTS key
    scene_prompt:         str         # diffusion model conditioning text
    ye_weight:            int         # YE-step credit
    context_description:  str         # human-readable summary


# ══════════════════════════════════════════════════════════════════════════════
#  MUSIC SCENARIO ENGINE
# ══════════════════════════════════════════════════════════════════════════════

class MusicScenarioEngine:
    """
    Compounding music industry scenario engine.

    Call roll_scenario() every N training steps to get a fresh ScenarioSpec.
    Call plant_seeds() after a successful step to register consequence seeds.
    Call save() at session end to persist state across restarts.
    """

    def __init__(self, state_path: str = _STATE_PATH) -> None:
        self._state_path     = state_path
        self._rng            = np.random.default_rng()
        self._active_seeds:   List[dict]      = []
        self._job_exposure:   Dict[str, int]  = {j: 0 for j in SCENARIO_LIBRARY}
        self._scene_exposure: Dict[str, int]  = {}
        self._total_fired:    int             = 0
        self._chain_counter:  int             = 0
        self._last_spec:      Optional[ScenarioSpec] = None
        self.load()

    # ── Public API ─────────────────────────────────────────────────────────────

    def roll_scenario(
        self,
        scene_hint:       Optional[str]        = None,
        gradient_health:  Optional[Dict]        = None,
    ) -> Optional[ScenarioSpec]:
        """
        Generate one training scenario.

        Args:
            scene_hint:      Current scene being trained — engine may use this
                             to pick a thematically adjacent scenario.
            gradient_health: Dict of {scene_name: health_score (0–1)} from
                             adv_mem.gradients.scene_grad_health().  Low health
                             → engine targets related scenes more aggressively.

        Returns:
            ScenarioSpec ready for injection into the training loop, or None
            if the engine encounters an unrecoverable state error.
        """
        try:
            return self._roll(scene_hint, gradient_health)
        except Exception as e:
            print(f"[ScenarioEngine] roll_scenario error (skip): {e}")
            return None

    def plant_seeds(self, spec: ScenarioSpec, step_count: int) -> None:
        """Register consequence seeds from a fired scenario for future rolls."""
        try:
            self._plant(spec, step_count)
        except Exception:
            pass

    def active_seed_count(self) -> int:
        """Number of non-expired active seeds."""
        self._cleanup_seeds()
        return len(self._active_seeds)

    def save(self) -> None:
        """Persist engine state to JSON (call at session end)."""
        state = {
            'active_seeds':   self._active_seeds,
            'job_exposure':   self._job_exposure,
            'scene_exposure': self._scene_exposure,
            'total_fired':    self._total_fired,
            'chain_counter':  self._chain_counter,
        }
        tmp = self._state_path + '.tmp'
        try:
            with open(tmp, 'w') as f:
                json.dump(state, f, indent=2)
            os.replace(tmp, self._state_path)
        except Exception as e:
            print(f"[ScenarioEngine] Save error: {e}")

    def load(self) -> None:
        """Restore engine state from JSON if available."""
        if not os.path.exists(self._state_path):
            return
        try:
            with open(self._state_path) as f:
                state = json.load(f)
            self._active_seeds   = state.get('active_seeds',   [])
            self._job_exposure   = state.get('job_exposure',   {j: 0 for j in SCENARIO_LIBRARY})
            self._scene_exposure = state.get('scene_exposure', {})
            self._total_fired    = state.get('total_fired',    0)
            self._chain_counter  = state.get('chain_counter',  0)
            self._cleanup_seeds()
            print(
                f"[ScenarioEngine] State restored — "
                f"seeds={len(self._active_seeds)} active  "
                f"total_fired={self._total_fired}  "
                f"chains_carried={len({s['chain_id'] for s in self._active_seeds})}",
                flush=True,
            )
        except Exception as e:
            print(f"[ScenarioEngine] Load error ({e}) — starting fresh", flush=True)

    def status(self) -> dict:
        """FastAPI-compatible status dict."""
        self._cleanup_seeds()
        top_jobs   = sorted(self._job_exposure.items(),   key=lambda x: -x[1])[:5]
        top_scenes = sorted(self._scene_exposure.items(), key=lambda x: -x[1])[:5]
        depths     = [s.get('compound_depth', 0) for s in self._active_seeds]
        avg_depth  = float(np.mean(depths)) if depths else 0.0
        last_info  = None
        if self._last_spec is not None:
            last_info = {
                'job_family':    self._last_spec.job_family,
                'event_type':    self._last_spec.event_type,
                'career_stage':  self._last_spec.career_stage,
                'compound_depth': self._last_spec.compound_depth,
                'ye_weight':     self._last_spec.ye_weight,
            }
        return {
            'total_scenarios_fired':  self._total_fired,
            'active_seeds':           len(self._active_seeds),
            'active_chains':          len({s['chain_id'] for s in self._active_seeds}),
            'avg_compound_depth':     round(avg_depth, 2),
            'top_job_families':       dict(top_jobs),
            'top_scene_categories':   dict(top_scenes),
            'job_families_available': list(SCENARIO_LIBRARY.keys()),
            'total_events':           sum(len(v) for v in SCENARIO_LIBRARY.values()),
            'total_seed_types':       len(SEED_RESOLUTION),
            'last_scenario':          last_info,
            'ye_weights': {
                'base':        SCENARIO_YE_WEIGHT_BASE,
                'compound_d1': SCENARIO_YE_WEIGHT_COMPOUND_1,
                'compound_d2': SCENARIO_YE_WEIGHT_COMPOUND_2,
            },
            'inject_every_n_steps': SCENARIO_INJECT_EVERY_N_STEPS,
        }

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _roll(
        self,
        scene_hint:      Optional[str],
        gradient_health: Optional[Dict],
    ) -> ScenarioSpec:
        self._cleanup_seeds()

        # ── Step 1: Decide seeded vs fresh ────────────────────────────────────
        seed_entry     = None
        job_family     = None
        event_type     = None
        chain_id       = None
        compound_depth = 0

        # 40 % chance to honour a seed if any are queued
        if self._active_seeds and self._rng.random() < 0.40:
            seed_entry = self._claim_seed()
            if seed_entry is not None:
                seed_type  = seed_entry['seed_type']
                chain_id   = seed_entry['chain_id']
                compound_depth = seed_entry['compound_depth']
                if seed_type in SEED_RESOLUTION:
                    job_family, event_type = SEED_RESOLUTION[seed_type]
                # Validate the resolved (job, event) exists in the library
                if (job_family not in SCENARIO_LIBRARY or
                        event_type not in SCENARIO_LIBRARY.get(job_family, {})):
                    job_family, event_type, chain_id, compound_depth = None, None, None, 0

        # Fresh pick if no valid seed resolved
        if job_family is None:
            job_family     = self._pick_job_family(gradient_health)
            event_type     = self._pick_event(job_family)
            chain_id       = self._new_chain_id()
            compound_depth = 0

        event_data = SCENARIO_LIBRARY[job_family][event_type]

        # ── Step 2: Contextual attributes ─────────────────────────────────────
        career_stage   = self._pick_career_stage()
        platform       = str(self._rng.choice(event_data['platforms']))
        lo, hi         = event_data['intensity']
        intensity      = float(self._rng.uniform(lo, hi))
        scene_category = self._pick_scene_category(job_family, scene_hint)

        # ── Step 3: Build visual conditioning prompt ───────────────────────────
        scene_prompt = self._build_prompt(
            event_data, career_stage, intensity, compound_depth)

        # ── Step 4: YE-step weight ─────────────────────────────────────────────
        if compound_depth >= 2:
            ye_weight = SCENARIO_YE_WEIGHT_COMPOUND_2
        elif compound_depth == 1:
            ye_weight = SCENARIO_YE_WEIGHT_COMPOUND_1
        else:
            ye_weight = SCENARIO_YE_WEIGHT_BASE

        # ── Step 5: Human-readable context ───────────────────────────────────
        context = (
            f"{career_stage.replace('_', ' ')} | "
            f"{job_family.replace('_', ' ')} | "
            f"{event_type.replace('_', ' ')} | "
            f"{platform} | "
            f"intensity={intensity:.2f} | depth={compound_depth}"
        )

        spec = ScenarioSpec(
            scenario_id         = f"sc_{int(time.time())}_{self._total_fired}",
            chain_id            = chain_id,
            job_family          = job_family,
            model_target        = MODEL_TARGET[job_family],
            career_stage        = career_stage,
            platform            = platform,
            event_type          = event_type,
            intensity           = intensity,
            compound_depth      = compound_depth,
            consequence_seeds   = list(event_data['seeds']),
            scene_category      = scene_category,
            scene_prompt        = scene_prompt,
            ye_weight           = ye_weight,
            context_description = context,
        )

        # ── Step 6: Track exposure ────────────────────────────────────────────
        self._job_exposure[job_family]       = self._job_exposure.get(job_family, 0) + 1
        self._scene_exposure[scene_category] = self._scene_exposure.get(scene_category, 0) + 1
        self._total_fired  += 1
        self._last_spec     = spec

        return spec

    def _plant(self, spec: ScenarioSpec, step_count: int) -> None:
        next_depth   = spec.compound_depth + 1
        # Weight increases with depth so compounding chains are prioritised
        seed_weight  = 1.0 + 0.5 * spec.compound_depth
        now          = time.time()

        for seed_type in spec.consequence_seeds:
            if seed_type not in SEED_RESOLUTION:
                continue
            # Avoid duplicate seeds for the same chain
            already = any(
                s['seed_type'] == seed_type and s['chain_id'] == spec.chain_id
                for s in self._active_seeds
            )
            if already:
                continue
            # Evict oldest seed if at capacity
            if len(self._active_seeds) >= MAX_ACTIVE_SEEDS:
                self._active_seeds.sort(key=lambda s: s['planted_at'])
                self._active_seeds.pop(0)
            self._active_seeds.append({
                'seed_type':      seed_type,
                'chain_id':       spec.chain_id,
                'compound_depth': next_depth,
                'weight':         seed_weight,
                'planted_at':     now,
                'planted_step':   step_count,
            })

    def _claim_seed(self) -> Optional[dict]:
        """Pop one seed weighted by its weight field."""
        if not self._active_seeds:
            return None
        weights = np.array(
            [s.get('weight', 1.0) for s in self._active_seeds], dtype=np.float64)
        weights = weights / weights.sum()
        idx     = int(self._rng.choice(len(self._active_seeds), p=weights))
        return self._active_seeds.pop(idx)

    def _cleanup_seeds(self) -> None:
        now = time.time()
        self._active_seeds = [
            s for s in self._active_seeds
            if (now - s['planted_at']) < SEED_TTL_SECONDS
        ]

    def _pick_job_family(self, gradient_health: Optional[Dict]) -> str:
        families = list(SCENARIO_LIBRARY.keys())
        # Inverse-exposure base weights (under-trained families get more attention)
        exposure = np.array(
            [self._job_exposure.get(f, 0) + 1 for f in families], dtype=np.float64)
        weights  = 1.0 / exposure

        # Gradient health bonus: if a scene is weak, boost related families
        if gradient_health:
            for i, fam in enumerate(families):
                related = SCENE_MAP.get(fam, [])
                for sc in related:
                    health = float(gradient_health.get(sc, 1.0))
                    weights[i] *= max(0.2, 2.0 - health)

        weights /= weights.sum()
        return str(families[int(self._rng.choice(len(families), p=weights))])

    def _pick_event(self, job_family: str) -> str:
        events = list(SCENARIO_LIBRARY[job_family].keys())
        return str(events[int(self._rng.integers(0, len(events)))])

    def _pick_career_stage(self) -> str:
        idx = int(self._rng.choice(len(CAREER_STAGES),
                                   p=np.array(_STAGE_WEIGHTS, dtype=np.float64)))
        return CAREER_STAGES[idx]

    def _pick_scene_category(
        self, job_family: str, scene_hint: Optional[str]
    ) -> str:
        candidates = SCENE_MAP.get(
            job_family, ['studio_session', 'concert_stage', 'city_nights'])
        # 35 % chance to stay in the current scene if it matches the job family
        if scene_hint and scene_hint in candidates and self._rng.random() < 0.35:
            return scene_hint
        return str(candidates[int(self._rng.integers(0, len(candidates)))])

    def _build_prompt(
        self,
        event_data:    dict,
        career_stage:  str,
        intensity:     float,
        compound_depth: int,
    ) -> str:
        """Compose a diffusion model conditioning string for this scenario."""
        base = str(self._rng.choice(event_data['visuals']))

        stage_mod = _STAGE_MODS.get(career_stage, '')

        if intensity >= 0.80:
            int_mod = 'dramatic intense climactic cinematic'
        elif intensity >= 0.60:
            int_mod = 'energetic dynamic cinematic'
        elif intensity <= 0.30:
            int_mod = 'subtle intimate close warm'
        else:
            int_mod = ''

        if compound_depth >= 2:
            depth_mod = 'layered compound evolving rich'
        elif compound_depth == 1:
            depth_mod = 'developing evolving follow-up'
        else:
            depth_mod = ''

        parts = [p for p in [base, stage_mod, int_mod, depth_mod] if p]
        return ' '.join(parts).strip()

    def _new_chain_id(self) -> str:
        self._chain_counter += 1
        digest = hashlib.md5(
            f"{time.time()}:{self._chain_counter}".encode()
        ).hexdigest()[:8]
        return f"chain_{digest}"


# ══════════════════════════════════════════════════════════════════════════════
#  MODULE-LEVEL SINGLETON
# ══════════════════════════════════════════════════════════════════════════════

_engine: Optional[MusicScenarioEngine] = None


def get_engine() -> MusicScenarioEngine:
    """Return (or create) the process-wide scenario engine singleton."""
    global _engine
    if _engine is None:
        _engine = MusicScenarioEngine()
    return _engine

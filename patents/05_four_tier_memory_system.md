UNITED STATES PATENT APPLICATION

TITLE OF INVENTION

FOUR-TIER HIERARCHICAL MEMORY REPLAY SYSTEM WITH MULTI-FACTOR PRIORITY SCORING FOR DIFFUSION MODEL TRAINING ACCELERATION

TECHNICAL FIELD

The present invention relates to experience replay memory systems for machine learning model training, and more particularly to a four-tier hierarchical memory architecture combining an in-RAM ring buffer, a disk-backed scene-sharded compressed frame store with multi-factor priority scoring, a TF-IDF semantic prompt index for nearest-neighbor retrieval, and a gradient tracking memory, all coordinated to accelerate diffusion model training through intelligent high-priority sample replay.

BACKGROUND OF THE INVENTION

Experience replay — reusing past training examples to reinforce learning — is well established in reinforcement learning. Its application to supervised diffusion model training is less explored. A naive replay buffer stores all past training frames and samples them uniformly at random. This approach treats all past frames as equally valuable for future learning, which is suboptimal: frames on which the model recently had high loss are more informative than frames the model has already mastered.

Priority replay buffers (Prioritized Experience Replay, Schaul et al., 2015) address this by sampling proportionally to loss magnitude. However, this approach does not account for: (1) novelty — frames that are visually distinct from the current scene mean provide more diverse gradient directions; (2) recency decay — very old frames may represent a part of the model's earlier training distribution that is no longer relevant; (3) scene-level weighting — some scene categories have been harder for the model to learn than others, and frames from harder scenes deserve a higher replay premium; (4) prompt semantic similarity — finding stored frames whose prompts are most similar to the current prompt enables targeted interpolation and prompt-aware replay.

There exists a need for a replay memory system that simultaneously accounts for all four of these factors in a single unified priority score, organized in a hierarchical architecture that provides zero-latency access to the most recent frames while maintaining a large compressed archive of high-priority historical frames.

SUMMARY OF THE INVENTION

The present invention provides a four-tier hierarchical memory replay system comprising: Tier 1, an in-RAM ring buffer for zero-latency access to recent frames; Tier 2, a disk-backed scene-sharded NPZ archive with multi-factor priority scoring; Tier 3, a TF-IDF semantic prompt index for nearest-neighbor prompt retrieval; and Tier 4, a gradient tracking memory that monitors per-scene gradient health and feeds scene difficulty signals back to the priority scorer and scenario engine.

In a first aspect, the invention provides a multi-factor priority score computed as:

  priority = loss_norm × (0.5 + 0.5 × novelty) × recency_decay × scene_weight

where loss_norm is the frame's loss relative to the scene average, novelty is one minus the cosine similarity between the frame's visual mean and the running scene mean, recency_decay is an exponential decay in time since storage, and scene_weight is a function of the gap between the scene's average loss and its best-ever loss.

In a second aspect, the invention provides a scene-sharded storage architecture that stores all frames from a given scene in a single compressed NPZ file, enabling O(1) shard lookup and efficient scene-level eviction when a shard reaches capacity.

In a third aspect, the invention provides a semantic prompt index using TF-IDF vectorization and cosine similarity that enables nearest-neighbor retrieval of stored frames by prompt semantic similarity, enabling prompt-aware replay and cross-scene interpolation partner selection.

DETAILED DESCRIPTION OF PREFERRED EMBODIMENTS

I. System Architecture

The four-tier memory system (hereinafter "the Memory") is organized as follows:

  Tier 1 — HotCache:      in-RAM ring buffer, maxlen = 1000 entries, zero disk I/O
  Tier 2 — EpisodicStore: disk-backed scene-sharded NPZ archive, priority-scored
  Tier 3 — PromptIndex:   TF-IDF semantic nearest-neighbor index, disk-persisted
  Tier 4 — GradientMemory: per-scene gradient norm tracker, disk-persisted as JSON

All four tiers are initialized at process start and updated in concert during the training loop.

II. Tier 1 — HotCache

The HotCache is an in-process deque with a fixed maximum length (default 1000). Every training frame that is processed is pushed into the HotCache immediately after the gradient update. The HotCache provides three sampling strategies:

  priority: softmax-weighted sampling over loss values (higher-loss frames sampled more)
  recent:   LIFO sampling of the last n entries
  uniform:  uniform random sampling without replacement

The HotCache requires no disk I/O and has zero network overhead. It provides the training loop with instant access to the most recent training frames for immediate replay within the same epoch.

III. Tier 2 — EpisodicStore

The EpisodicStore is a disk-backed archive organized as one NPZ shard file per scene category. Each shard stores frame sequences as float16 arrays (halving storage versus float32) keyed by entry ID. A separate frame_index.json file stores the metadata for all entries across all shards.

A. Entry Structure

Each entry in the EpisodicStore index contains:
  id:        SHA1-derived 16-character hex identifier
  scene:     scene category string
  prompt:    truncated conditioning prompt (max 120 chars)
  loss:      per-frame reconstruction loss at time of storage
  grad_norm: gradient norm at time of storage
  priority:  multi-factor priority score (see Section III.B)
  epoch:     training epoch when stored
  step:      training step when stored
  ts:        Unix timestamp when stored

B. Multi-Factor Priority Score

The priority of a stored frame is computed as:

  priority = loss_norm × (0.5 + 0.5 × novelty) × recency_decay × scene_weight

where:

  loss_norm    = loss / (scene_avg_loss + ε)
    A value > 1 means this frame is harder than average for this scene.

  novelty      = 1 − max(0, cosine_sim(frame_mean, scene_running_mean))
    frame_mean is the spatial mean color of the frame sequence.
    scene_running_mean is an exponential moving average of all stored frame means for the scene.
    novelty = 1 means the frame is visually unlike anything previously stored.

  recency_decay = exp(−λ × age_days)    where λ = RECENCY_LAMBDA (default 0.1)
    A frame stored today has decay = 1.0; one stored 7 days ago has decay ≈ 0.50.

  scene_weight  = 1.0 + log1p(max(0, scene_avg_loss − scene_best_loss × 0.8))
    Scenes with a large gap between average and best-ever loss earn higher weight.
    A scene where the model has never improved its best has scene_weight = 1.0.
    A scene where average loss is 50% above best has scene_weight ≈ 1.41.

The priority is bounded to [0, 10] for readability.

C. Shard Management and Eviction

When a shard reaches its maximum entry count (MAX_SHARD_FRAMES), the entry with the lowest priority score is evicted to make room for the new entry. This ensures that each scene's shard always contains its highest-priority frames and that low-priority old frames do not crowd out new high-loss or high-novelty frames.

Shards are written atomically using a write-to-temp-then-rename pattern to prevent corruption under process interruption. The metadata index is persisted every 100 new entries.

D. Sampling Strategies

The EpisodicStore exposes three sampling strategies:

  sample_priority(n, scene=None):
    Sample n entries weighted by priority score.
    If scene is specified, sample only from that scene's entries.
    Enables targeted replay of the hardest frames from the current training scene.

  sample_hardest(n, scene=None):
    Return the n entries with the highest loss values (deterministic).
    Used for targeted loss-focused replay.

  sample_newest(n):
    Return the n most recently added entries (deterministic).
    Used for recency-focused replay after a significant distribution shift.

IV. Tier 3 — PromptIndex

The PromptIndex is a TF-IDF nearest-neighbor index over all stored conditioning prompts. It enables semantic retrieval: given the current training step's conditioning prompt, find the stored frames whose prompts are most semantically similar, without requiring embedding model inference or vector database infrastructure.

A. Vocabulary and TF-IDF Matrix

The vocabulary is built incrementally as prompts are indexed, bounded by a maximum vocabulary size (MAX_PROMPT_VOCAB = 2000 tokens). For each indexed prompt, a TF (term frequency) vector is computed by normalizing word counts over the vocabulary. The IDF (inverse document frequency) vector is rebuilt every 500 new documents: IDF = log(n_docs / (1 + df)) where df is the number of documents containing each term.

The TF-IDF matrix stores the product of TF vectors and the IDF vector for all indexed documents, enabling cosine similarity retrieval in a single matrix-vector multiplication.

B. Nearest-Neighbor Retrieval

Given a query prompt, the PromptIndex tokenizes it, computes its TF-IDF vector, and returns the top-k stored entries with the highest cosine similarity to the query. An optional exclude_scene parameter forces cross-scene retrieval, ensuring that the returned neighbors come from a different visual domain than the current training scene — useful for finding interpolation partners that maximize visual diversity.

C. Persistence

The vocabulary, document IDs, scene assignments, and TF-IDF matrix are serialized to JSON and NPZ files respectively. The index is loaded at initialization and saved every 500 new documents.

V. Tier 4 — GradientMemory

The GradientMemory tracks per-step gradient norms, loss values, and loss deltas, organized by scene category. It exposes:

  record(scene, grad_norm, loss, loss_delta, epoch, step)
    Appends a record to the in-memory deque and the per-scene gradient norm list.

  avg_grad_norm(last_n=50)
    Returns the average gradient norm over the last n steps across all scenes.

  scene_grad_health() → Dict[scene: "healthy" | "vanishing" | "exploding"]
    Classifies each scene as healthy (avg gradient norm 0.01–5.0),
    vanishing (< 0.01), or exploding (> 5.0).
    This output is consumed by the scenario engine's job family selector to
    boost training attention toward scenes with unhealthy gradients.

  stats() → dict
    Returns per-scene gradient statistics for monitoring and debugging.

The GradientMemory persists its data to gradient_memory.json atomically, storing at most the last 200 records and last 50 gradient norms per scene.

VI. Unified Replay Controller

A replay controller coordinates all four tiers during training:

  1. Each training step pushes the processed frame to HotCache (Tier 1)
  2. High-loss frames (loss > scene_average × threshold) are stored in EpisodicStore (Tier 2) and indexed in PromptIndex (Tier 3)
  3. Each step records gradient metrics in GradientMemory (Tier 4)
  4. After each epoch, the replay controller queries the Year-Equivalent deficit from the time simulator and runs recommended_replay_cycles passes from EpisodicStore using sample_priority()
  5. The PromptIndex is queried before each interpolation step to identify cross-scene interpolation partners

VII. Integration with Other Systems

The GradientMemory's scene_grad_health() output feeds into:
  - The MusicScenarioEngine's _pick_job_family() (biases toward scenes with poor gradient health)
  - The ABTestScenarioLayer's _ucb1_select_family() (gradient health tiebreaker)
  - The ABTestScenarioLayer's _rotate_job_family() (sorts rotation by ascending scene health)

The EpisodicStore's sample_priority() is called by the training loop for post-epoch experience replay, consuming YE credits at _REPLAY_YEAR_WEIGHT = 12 per frame.

CLAIMS

1. A computer-implemented hierarchical memory replay system for training a generative machine learning model, the system comprising:
   a first tier comprising an in-process ring buffer storing recent training frames for zero-latency access;
   a second tier comprising a disk-backed compressed archive organized by scene category, each entry scored by a multi-factor priority value;
   a third tier comprising a semantic prompt index enabling nearest-neighbor retrieval of stored entries by prompt similarity; and
   a fourth tier comprising a gradient tracking memory recording per-scene gradient norms and loss deltas across training steps.

2. The system of claim 1, wherein the multi-factor priority value is computed as the product of a loss normalization factor, a novelty factor, a recency decay factor, and a scene weight factor.

3. The system of claim 2, wherein the loss normalization factor is the ratio of the entry's individual loss to the running average loss for its scene category, such that entries with above-average loss for their scene receive a priority greater than one and entries with below-average loss receive a priority less than one.

4. The system of claim 2, wherein the novelty factor is computed as one minus the cosine similarity between the spatial mean color of the stored frame sequence and an exponential moving average of spatial means of all previously stored frames from the same scene.

5. The system of claim 2, wherein the recency decay factor is an exponential function of the age of the stored entry in days, with a decay constant that causes the priority contribution of a frame to halve within a configurable number of days.

6. The system of claim 2, wherein the scene weight factor is a function of the gap between the running average loss and the best-ever loss for the scene, such that scenes where the model has struggled to improve receive higher priority weight than scenes the model has converged on.

7. The system of claim 1, wherein the disk-backed compressed archive stores frame sequences as half-precision floating-point arrays in compressed archive files, one file per scene category, and stores entry metadata separately in a single index file shared across all scenes.

8. The system of claim 7, wherein when a scene-specific archive file reaches a configurable maximum entry count, the entry with the lowest priority score is evicted before storing a new entry, ensuring that each scene's archive always contains its highest-priority frames.

9. The system of claim 1, wherein the semantic prompt index is implemented using term frequency-inverse document frequency vectorization and cosine similarity, enabling nearest-neighbor retrieval without embedding model inference or external vector database infrastructure.

10. The system of claim 9, wherein the semantic prompt index supports a cross-scene retrieval mode that excludes entries from a specified scene category, enabling the retrieval of semantically similar prompts from visually distinct scene categories for use as interpolation partners.

11. The system of claim 1, wherein the gradient tracking memory classifies each scene category as healthy, vanishing, or exploding based on the average gradient norm of recent training steps in that scene, and exposes the classification to a training scenario selection system that uses it to increase training attention toward scenes with unhealthy gradients.

12. The system of claim 1, wherein the first tier provides three sampling strategies comprising priority-weighted sampling using softmax over loss values, recency-based last-N sampling, and uniform random sampling without replacement.

13. The system of claim 1, further comprising a replay controller that queries a year-equivalent step deficit from a training time simulator and runs a computed number of post-epoch replay passes from the second tier's priority-sampled entries to close the informational density gap.

14. A method of prioritized experience replay for training a diffusion model, the method comprising:
   storing training frames in a disk-backed archive organized by scene category, each frame indexed by a priority score computed from a product of a loss normalization factor, a novelty factor, a recency decay factor, and a scene weight factor;
   sampling frames for replay proportionally to their priority scores;
   updating the priority score of each stored frame as new frames are added to the same scene, causing the effective priority of older, lower-loss, or less-novel frames to decay over time; and
   evicting the lowest-priority frame from a scene when the scene's archive reaches capacity.

15. The method of claim 14, further comprising recording per-scene gradient norm histories and computing scene health classifications that inform the downstream selection of training scenarios to prioritize scenes with degraded gradient flow.

16. The method of claim 14, further comprising indexing the conditioning prompt of each stored frame in a TF-IDF index and querying the index to find semantically similar prompts from other scene categories for use as interpolation partners in synthetic training frame generation.

17. The method of claim 14, wherein storing training frames includes converting frame data from 32-bit floating point to 16-bit floating point before writing to disk, reducing storage requirements by a factor of two without significant degradation of replay frame quality.

18. A non-transitory computer-readable medium storing instructions that, when executed by a processor, implement:
   a ring buffer configured to store a fixed maximum number of recent training frames in process memory and support priority-weighted, recency-based, and uniform sampling strategies;
   a scene-sharded archive configured to store compressed frame sequences on disk organized by scene category, compute multi-factor priority scores for each entry, and evict the lowest-priority entry when a scene reaches its maximum capacity;
   a TF-IDF prompt index configured to vectorize conditioning prompts, maintain an inverse document frequency vector, and return nearest-neighbor entries by cosine similarity for a query prompt; and
   a gradient memory configured to record per-step gradient norms organized by scene category and classify each scene as healthy, vanishing, or exploding based on the running average of recent gradient norms.

19. The computer-readable medium of claim 18, wherein the scene-sharded archive writes new and updated archive files using an atomic write-to-temporary-file-then-rename pattern to prevent data corruption under process interruption.

20. The computer-readable medium of claim 18, wherein the multi-factor priority score is bounded to a configurable maximum value to prevent numerical instability when individual factor values are simultaneously near their respective maximum values.

ABSTRACT

A four-tier hierarchical memory replay system for diffusion model training comprises: a Tier 1 in-RAM ring buffer providing zero-latency access to the most recent training frames with priority, recency, and uniform sampling strategies; a Tier 2 disk-backed scene-sharded NPZ archive where each frame is scored by a multi-factor priority formula equal to loss normalization times novelty times exponential recency decay times scene weight, stored as float16 to halve disk cost, organized in one file per scene for O(1) shard lookup, with lowest-priority eviction when shards reach capacity; a Tier 3 TF-IDF semantic prompt index enabling cosine-similarity nearest-neighbor retrieval of stored frames by conditioning prompt without embedding model inference; and a Tier 4 gradient tracking memory that records per-scene gradient norms and classifies scenes as healthy, vanishing, or exploding, feeding health signals back to training scenario selection. A unified replay controller uses year-equivalent step deficits from the training time simulator to schedule post-epoch priority replay passes, earning 12 year-equivalent credits per replay frame.

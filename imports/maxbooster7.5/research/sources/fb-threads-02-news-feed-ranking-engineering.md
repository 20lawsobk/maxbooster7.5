Source: https://engineering.fb.com/2021/01/26/core-infra/news-feed-ranking
Title: News Feed ranking, powered by machine learning - Engineering at Meta
Fetched: 2026-09-11T11:54:08.945Z

[Skip to content](https://engineering.fb.com/2021/01/26/core-infra/news-feed-ranking/#content)

![How machine learning powers Facebook’s News Feed ranking algorithm](https://engineering.fb.com/wp-content/uploads/2021/01/Under-the-Hood_Hero_1920x1080_Final.jpg)

By [Akos Lada](https://engineering.fb.com/author/akos-lada/ "Posts by Akos Lada"), [Meihong Wang](https://engineering.fb.com/author/meihong-wang/ "Posts by Meihong Wang"), [Tak Yan](https://engineering.fb.com/author/tak-yan/ "Posts by Tak Yan")

Designing a personalized ranking system for more than 2 billion people (all with different interests) and a plethora of content to select from presents significant, complex challenges. This is something we tackle every day with News Feed ranking. Without machine learning (ML), people’s News Feeds could be flooded with content they don’t find as relevant or interesting, including overly promotional content or content from acquaintances who post frequently, which can bury the content from the people they’re closest to. Ranking exists to help solve these problems, but how can you build a system that presents so many different types of content in a way that’s personally relevant to billions of people around the world? We use ML to predict which content will matter most to each person to support a more engaging and positive experience. Models for [meaningful interactions](https://about.fb.com/news/2018/01/news-feed-fyi-bringing-people-closer-together/) and [quality content](https://about.fb.com/news/2019/04/people-publishers-the-community/) are powered by state-of-the-art ML, such as multitask learning on neural networks, embeddings, and [offline learning systems](https://ai.facebook.com/blog/online-and-offline-tests-to-improve-news-feed-ranking/). We are sharing new details of how we designed an ML-powered News Feed ranking system.

![How News Feed ranking system works](https://engineering.fb.com/wp-content/uploads/2021/01/RankingFlow.jpg)

## Building a ranking algorithm

To understand how this works, let’s start with a hypothetical person logging in to Facebook: We’ll call him Juan. Since Juan’s login yesterday, his good friend Wei posted a photo of his cocker spaniel. Another friend, Saanvi, posted a video from her morning run. And his favorite Page published an interesting article about the best way to view the Milky Way at night, while his favorite cooking Group posted four new sourdough recipes.

Because Juan is connected to or has chosen to follow the producers of this content, it’s all likely to be relevant or interesting to him. To rank some of these things higher than others in Juan’s News Feed, we need to learn what matters most to Juan and which content carries the highest value for him. In mathematical terms, we need to define an objective function for Juan and perform a single-objective optimization.

Take Saanvi’s running video, for example. On Facebook, one concrete observable signal that an item has value for someone is if they click the like button _._ Given various attributes we know about a post (who is tagged in a photo, when it was posted, etc.) _,_ we can use the characteristics of the post _Xit_ toward viewer _j_ at time _t_,and predict _Y_ _ijt_ (whether Juan might like the post) _._ Mathematically, for each post _i_, we estimate _Y_ _ijt_ _= f(x_ _ijt1;_ x _ijt2;_ … x _ijtC_), where c represents a characteristic _c_(1.. _C_) such as the type of post or the relationship between the viewer and the author of the post (e.g., whether they marked each other as family members) and the function _f(.)_ combines the attributes into a single value.

For example, if Juan tends to interact with Saanvi a lot or share the content Saanvi posts, and the running video is very recent (e.g., from this morning), we might see a high probability that Juan likes content like this. On the other hand, perhaps Juan has previously engaged more with video content than photos, so the like prediction for Wei’s cocker spaniel photo might be lower. In this case, our ranking algorithm would rank Saanvi’s running video higher than Wei’s cocker spaniel photo because it predicts a higher probability that Juan will like that piece of content.

But is liking the only way Juan expresses his preferences? Surely not. He might share articles he finds interesting, watch videos from his favorite game streamers, or leave thoughtful comments on posts from friends. Things get more mathematically complicated when we need to optimize for multiple objectives that all contribute to our overarching objective (creating the most long-term value for people). You can have multiple values ( _Yijtk_), e.g., likes, comments, and shares, each for a different value of _k_, that all need to somehow aggregate up to a single _V_ _ijt_ value. To complicate things further, for each person on Facebook there are thousands of signals we need to evaluate to determine what that person might find most relevant, so the algorithm gets very complex in practice.

How do you pick the overarching value for an ecosystem the size of Facebook? We want to provide the people using our services with long-term value. How much does seeing this friend’s running video or reading an interesting article create value for Juan? We think the best way to assess whether something is creating long-term value for someone is to pick metrics that are aligned with what people say is important to them. So we [survey people](https://about.fb.com/news/2019/05/more-personalized-experiences/) about how meaningful they found an interaction with their friends or whether a post is worth their time to make sure our values ( _Y_ _ijtk_)reflect [what people say they find meaningful](https://about.fb.com/news/2018/07/how-users-help-shape-facebook/).

Multiple prediction models provide us with multiple predictions for Juan: a probability he’d engage with (e.g., like or leave a comment on) Wei’s cocker spaniel picture, Saanvi’s running video, the article shared on the Page, and the cooking Group posts. Each of these models will try to rank each of these pieces of content for Juan. Sometimes the models disagree (e.g., Juan might like Saanvi’s running video with a higher probability than the Page article, but he might be more likely to share the article than Saanvi’s video), and the way we take each prediction into account for Juan is based on the actions that people tell us ( [via surveys](https://about.fb.com/news/2019/05/more-personalized-experiences/)) are more meaningful and worth their time.

Facebook

![](https://scontent-lax3-2.xx.fbcdn.net/v/t15.5256-10/137424777_264353128370970_8240314507974857877_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=3a9e82&_nc_ohc=DkG-JICqjSkQ7kNvwFg165O&_nc_oc=AdqtxOIige4dEPfoaiNlmQwM6WsdfYaAW0N7RxvjLMJxu_W5j4ZTnL0GVU-SZaSU4pE&_nc_zt=23&_nc_ht=scontent-lax3-2.xx&edm=ACRN2rcEAAAA&_nc_gid=aijgYizs3zvoZZXBDCrdqA&oh=00_AQKz4RswRwnJR8hLmpBKE6CcKu3-VfCYKAAzCBBWnHNMyA&oe=6AA9CE13)

It looks like you may be having problems playing this video. If so, please try restarting your browser.

Close

Play

0:00

Unmute

Enter Fullscreen [Click to watch on Facebook](https://www.facebook.com/Engineering/videos/264352435037706/?t=0)

[![](https://scontent-lax3-2.xx.fbcdn.net/v/t39.30808-1/400448329_720499333445884_2451750890176167596_n.jpg?stp=cp0_dst-jpg_s40x40_tt6&_nc_cat=107&ccb=1-7&_nc_sid=f907e8&_nc_ohc=H5R2KV-RVEUQ7kNvwEqnTeD&_nc_oc=AdqA2GRFLRLCVCxbOZkc3N4Q0BdrEHKrcCLFD7KfCKwBqqX0pQy1NRjE4Lfe9bPqMGo&_nc_zt=24&_nc_ht=scontent-lax3-2.xx&edm=ACRN2rcEAAAA&_nc_gid=aijgYizs3zvoZZXBDCrdqA&oh=00_AQJW-vf6ir0eb3VcFC6hP_qOZ2E5YPse260Ix874_GxjtQ&oe=6AA9C547)](https://www.facebook.com/watch/Engineering/?ref=embed_video)

[Facebook's News Feed: Personalized ranking with machine learning](https://www.facebook.com/watch/?ref=embed_video&v=264352435037706)

[Engineering at Meta](https://www.facebook.com/watch/Engineering/?ref=embed_video "Engineering at Meta")

<iframe src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2FEngineering%2Fvideos%2F264352435037706%2F&show\_text=0&width=560" width="560" height="315" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen="true"></iframe>

Copy

Copy

Learn more about embedding Facebook videos on our [developer site.](https://developers.facebook.com/docs/plugins/embedded-video-player/)

Embed Code

Back

Share

Share

Video unavailable

Sorry, this video could not be played.

[Learn more](https://www.facebook.com/help/396404120401278/list?ref=embed_video)

## Approximating the ideal ranking function in a scalable ranking system

Now that we know the theory behind ranking (as exemplified through Juan’s News Feed), we need to determine how to build a system for this optimization. We need to score all the posts available for more than 2 billion people (more than 1,000 posts per user, per day, on average), which is challenging. And we need to do this in real time — so we need to know if an article has received a lot of likes, even if it was just posted minutes ago. We also need to know if Juan liked a lot of other content a minute ago, so we can use this information optimally in ranking.

Our system architecture uses a Web/PHP layer, which queries the feed aggregator. The role of the feed aggregator is to collect all relevant information about a post and analyze all the features (e.g., how many people have liked this post before) in order to predict the post’s value _Y_ _ijt_ to the user, as well as the final ranking score _V_ _ijt_ by aggregating all the predictions.

![When someone opens up Facebook, regardless of the front-end interface (e.g., iPhone, Android phone, web browser), the interface will send a request to a Web/PHP (front-end) layer, which then queries the feed aggregator (back-end layer). After accepting a request from the front end, the feed aggregator fetches actions and objects, along with an object summary, from the feed leaf databases so that it can process, aggregate, rank, and return the resulting list of ranked FeedStories to the front end for rendering.](https://engineering.fb.com/wp-content/uploads/2021/01/Under-the-Hood_Stills_1920x1080_Final.jpg)When someone opens up Facebook, regardless of the front-end interface (e.g., iPhone, Android phone, web browser), the interface will send a request to a Web/PHP (front-end) layer, which then queries the feed aggregator (back-end layer). After accepting a request from the front end, the feed aggregator fetches actions and objects, along with an object summary, from the feed leaf databases so that it can process, aggregate, rank, and return the resulting list of ranked FeedStories to the front end for rendering.

Now let’s review how the aggregator works:

1. **Query inventory.** We first need to collect all the candidate posts we can possibly rank for Juan (the cocker spaniel picture, the running video, etc.). The first part is fairly straightforward: The eligible inventory includes any non-deleted post shared with Juan by a friend, Group, or Page that he is connected to that was made since his last login. But what about posts created before Juan’s last login that he hasn’t seen yet? Maybe these were higher quality or more relevant than the newer posts, but he simply didn’t have time to look at them. To make sure unseen posts are also reconsidered, we have an unread bumping logic: Fresh posts that Juan has not yet seen but that were ranked for him in his previous sessions are eligible again for him to see. We also have an action-bumping logic: If any posts Juan has already seen have triggered an interesting conversation among his friends, Juan may be eligible to see this post again as a comment-bumped post.
2. **Score** **_Xit_** **for Juan for each prediction (** **_Y_** **_ijt_** **).** Now that we have Juan’s inventory, we score each post using multitask neural nets. There are many, many features ( _x_ _ijtc_) we can use to predict _Y_ _ijt_, including the type of post, embeddings (i.e., feature representations generated by deep learning models), and what the viewer tends to interact with. To calculate this for more than 1,000 posts, for each of billions of users — all in real time — we run these models for all candidate stories in parallel on multiple machines, called predictors.
3. **Calculate a single score out of many predictions:** **_V_** **_ijt_** **.** Now that we have all the predictions, we can combine them into a single score. To do this, multiple passes are needed to save computational power and to apply rules, such as content type diversity (i.e., content type should be varied so that viewers don’t see redundant content types, such as multiple videos, one after another), that depend on an initial ranking score. First, certain integrity processes are applied to every post. These are designed to determine which integrity detection measures, if any, need to be applied to the stories selected for ranking. Then, in pass 0, a lightweight model is run to select approximately 500 of the most relevant posts for Juan that are eligible for ranking. This helps us rank fewer stories with high recall in later passes so that we can use more powerful neural network models. Pass 1 is the main scoring pass, where each story is scored independently and then all ~500 eligible posts are ordered by score. Finally, we have pass 2, which is the contextual pass. Here, contextual features, such as content-type diversity rules, are added to help diversify Juan’s News Feed.

- **A deeper look at pass 1:** Most of the personalization happens in pass 1. We want to optimize how we combine _Y_ _ijtk_ into _V_ _ijt_. For some, the score may be higher for likes than for commenting, as some people like to express themselves more through liking than commenting. For simplicity and tractability, we score our predictions together in a linear way, so that _Vijt = wijt1Yijt1 \+ wijt2Yijt2 \+ … \+ wijtkYijtk_. Note that this linear formulation has an advantage: Any action a person rarely engages in (for instance, a like prediction that’s very close to 0) automatically gets a minimal role in ranking, as _Yijtk_ for that event is very low. To personalize beyond this dimension, we continue [researching personalization based on observational data](https://dl.acm.org/doi/10.1145/3328526.3329558). People with higher correlation gain more value from that specific event, as long as we make this method incremental and control for potential confounding variables.

Once we’ve completed these ranking steps, we have a scored News Feed for Juan (and all the people using Facebook) in real time, ready for him to consume and enjoy.

Now that you understand the science, ranking architecture, and engineering behind News Feed more, you can see how our ranking algorithm helps create a valuable experience for people at previously unimaginable scale and speed. Juan benefits by seeing more personally meaningful and interesting content when he comes to Facebook, and so do billions of other people. We are constantly improving our ranking system by iterating on our prediction models, enhancing personalization, and more to help people find the content that creates value and helps them stay connected to friends and family.

### Share this:

- [Share on Facebook (Opens in new window)Facebook](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=facebook&nb=1)
- [Share on Threads (Opens in new window)Threads](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=threads&nb=1)
- [Share on WhatsApp (Opens in new window)WhatsApp](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=jetpack-whatsapp&nb=1)
- [Share on LinkedIn (Opens in new window)LinkedIn](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=linkedin&nb=1)
- [Share on Reddit (Opens in new window)Reddit](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=reddit&nb=1)
- [Share on X (Opens in new window)X](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=x&nb=1)
- [Share on Bluesky (Opens in new window)Bluesky](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=bluesky&nb=1)
- [Share on Mastodon (Opens in new window)Mastodon](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=mastodon&nb=1)
- [Share on Hacker News (Opens in new window)Hacker News](https://engineering.fb.com/2021/01/26/ml-applications/news-feed-ranking/?share=custom-1699562127&nb=1)
- [Email a link to a friend (Opens in new window)Email](mailto:?subject=%5BShared%20Post%5D%20How%20machine%20learning%20powers%20Facebook%E2%80%99s%20News%20Feed%20ranking%20algorithm&body=https%3A%2F%2Fengineering.fb.com%2F2021%2F01%2F26%2Fml-applications%2Fnews-feed-ranking%2F&share=email&nb=1)

Facebook

[![2020 year in review: Connectivity innovations, faster apps, and progress toward net zero](https://engineering.fb.com/wp-content/uploads/2020/12/CD20_796_ENGBlog_YearInReview_hero_FINAL.jpg?w=580&h=326&crop=1)\\
\\
Prev\\
\\
2020 year in review: Connectivity innovations, faster apps, and progress toward net zero](https://engineering.fb.com/2020/12/30/connectivity/2020-year-in-review/) [![Open-sourcing Thrift for Haskell](https://engineering.fb.com/wp-content/uploads/2020/10/OSiB_RichTeal.jpg?w=580&h=326&crop=1)\\
\\
Next\\
\\
Open-sourcing Thrift for Haskell](https://engineering.fb.com/2021/02/05/open-source/hsthrift/)

### Read More in ML Applications

[View All](https://engineering.fb.com/category/ml-applications/)

![](https://engineering.fb.com/wp-content/uploads/2026/08/Domain-Expert-AI-Hero-1.png?w=580&h=326&crop=1)

![](https://engineering.fb.com/wp-content/uploads/2026/05/Meta-Mult-stage-Ads-Ranking.png?w=580&h=326&crop=1)

![](https://engineering.fb.com/wp-content/uploads/2026/07/Training-GEM-at-LLM-Scale-Hero.png?w=580&h=326&crop=1)

![](https://engineering.fb.com/wp-content/uploads/2026/07/image3.jpg?w=580&h=326&crop=1)

![](https://engineering.fb.com/wp-content/uploads/2026/06/10-Years-Meta-Python-HERO-large.png?w=580&h=326&crop=1)

![](https://engineering.fb.com/wp-content/uploads/2026/06/Privacy-Aware-Infrastructure-in-the-AI-Native-Era-HERO.png?w=580&h=326&crop=1)

### Available Positions

* * *

- [Machine Learning Engineer\\
\\
\\
TEL AVIV, IL](https://www.metacareers.com/jobs/2316600655751692/)
- [Software Engineer (Leadership) - Product\\
\\
\\
LONDON, GB](https://www.metacareers.com/jobs/2887906508264541/)
- [Software Engineer, Machine Learning RecSys\\
\\
\\
SUNNYVALE, US](https://www.metacareers.com/jobs/1645503493182815/)
- [Software Engineer, Machine Learning RecSys\\
\\
\\
BELLEVUE, US](https://www.metacareers.com/jobs/1645503493182815/)
- [Software Engineer, Machine Learning RecSys\\
\\
\\
MENLO PARK, US](https://www.metacareers.com/jobs/1645503493182815/)

[See All Jobs](https://www.metacareers.com/)

### Technology at Meta

- ![footer-fb-engineering](https://engineering.fb.com/wp-content/themes/code-fb-com/img/meta_logo.png)



Engineering at Meta - X



Follow


- ![footer-AI](https://engineering.fb.com/wp-content/themes/code-fb-com/img/meta_logo.png)



AI at Meta


[Read](https://ai.meta.com/blog/)

- ![footer-developers](https://engineering.fb.com/wp-content/themes/code-fb-com/img/meta_logo.png)



Meta Quest Blog


[Read](https://www.meta.com/blog/quest/)

- ![footer-developers](https://engineering.fb.com/wp-content/themes/code-fb-com/img/meta_logo.png)



Meta for Developers


[Read](https://developers.facebook.com/)

- ![footer-bug-bounty](https://engineering.fb.com/wp-content/themes/code-fb-com/img/meta_logo.png)



Meta Bug Bounty


[Learn more](https://bugbounty.meta.com/)

- ![footer-rss](https://engineering.fb.com/wp-content/themes/code-fb-com/img/rss.png)



RSS


[Subscribe](https://code.facebook.com/posts/rss/)


### Open Source

Meta believes in building community through open source technology. Explore our latest projects in Artificial Intelligence, Data Infrastructure, Development Tools, Front End, Languages, Platforms, Security, Virtual Reality, and more.

- ![android](https://engineering.fb.com/wp-content/themes/code-fb-com/img/android.png)

ANDROID


- ![ios](https://engineering.fb.com/wp-content/themes/code-fb-com/img/ios.png)

iOS


- ![web](https://engineering.fb.com/wp-content/themes/code-fb-com/img/web.png)

WEB


- ![backend](https://engineering.fb.com/wp-content/themes/code-fb-com/img/backend.png)

BACKEND


- ![hardware](https://engineering.fb.com/wp-content/themes/code-fb-com/img/hardware.png)

HARDWARE



Learn More

To help personalize content, tailor and measure ads and provide a safer experience, we use cookies. By clicking or navigating the site, you agree to allow our collection of information on and off Facebook through cookies. Learn more, including about available controls: [Cookie Policy](https://engineering.fb.com/privacy)

Accept
import{r as n,j as t,aY as v,d3 as M,b4 as z,cs as C,ac as T,aO as D,bg as B,aR as R,b7 as E,d2 as P}from"./vendor-react-DENVYnO-.js";import{j as r,C as O,d as U,f as Y,B as H,h as G,S as L,b as d,I as W}from"./studio-BGqulhNu.js";import{a as V}from"./index-D2koPttb.js";import"./vendor-ui-CJhzx3WK.js";import"./vendor-state-6zxPkItA.js";import"./vendor-utils-Dt-bGSkp.js";import"./vendor-animation-DdnyTFBd.js";const F=[{icon:D,text:"How do I use the DAW?",color:"text-purple-400"},{icon:B,text:"How does distribution work?",color:"text-blue-400"},{icon:R,text:"Tell me about AI features",color:"text-amber-400"},{icon:E,text:"How to monetize my music?",color:"text-green-400"}],a={default:"I'm here to help you get the most out of Max Booster! I can answer questions about the Studio, distribution, social media autopilot, advertising campaigns, marketplace features, and more. What would you like to know?",daw:`The Max Booster Studio is a full-featured DAW (Digital Audio Workstation) inspired by Studio One. You can:

• Create and manage unlimited projects
• Record audio and MIDI tracks
• Use AI mixing and mastering
• Apply professional effects and plugins
• Export in multiple formats

To get started, click 'Studio' in the sidebar and create a new project!`,distribution:`Max Booster offers unlimited music distribution to 150+ platforms including Spotify, Apple Music, Amazon Music, and more. You keep 100% of your royalties!

To distribute:
1. Go to Distribution in the sidebar
2. Upload your finished track
3. Add metadata (title, artist, cover art)
4. Select platforms
5. Submit for review

Your music will go live within 2-3 business days!`,ai:`Max Booster includes powerful AI features:

• **AI Mix**: Automatic EQ, compression, and spatial positioning
• **AI Master**: Professional loudness optimization and finishing
• **AI Generator**: Create beats and melodies from text descriptions
• **Social Media Autopilot**: 24/7 automated content posting
• **Ad Campaign Autopilot**: Organic growth optimization

All AI is 100% custom-built in-house - no external APIs!`,monetize:`Here's how to monetize your music on Max Booster:

• **Distribution**: Earn streaming royalties (100% yours!)
• **Beat Marketplace**: Sell beats and samples to other artists
• **Licensing**: Offer exclusive and non-exclusive licenses
• **Analytics**: Track revenue and optimize your strategy

The platform handles all payments via Stripe and provides detailed financial reports!`,social:`The Social Media Autopilot runs 24/7 and:

• Automatically posts to Instagram, Twitter, Facebook, YouTube
• Creates engaging content from your music
• Uses AI to optimize posting times
• Analyzes performance metrics
• Grows your audience organically

Just connect your accounts in Settings → Social Media!`,advertising:`The Advertising Autopilot is zero-cost organic growth:

• Creates viral-optimized content
• Posts across all platforms
• A/B tests different strategies
• Learns from your best-performing content
• No ad spend required!

It's like having a marketing team working 24/7 for free!`,marketplace:`The P2P Marketplace lets you:

• Sell beats, samples, and loops
• Offer exclusive and non-exclusive licenses
• Set your own prices
• Get paid via Stripe Connect
• Build a customer base

To start selling, go to Marketplace → List Item and upload your products!`,desktop:`Your desktop apps are ready to download!

As a subscriber, you have access to:
• Windows desktop app
• macOS desktop app
• Linux desktop app

Visit Desktop App in the sidebar to download for your platform. All the same features you love, in a native desktop application!`,analytics:`The Analytics dashboard shows:

• **Streaming Stats**: Real-time plays, listeners, revenue
• **Social Media Performance**: Engagement, growth, best posts
• **Ad Campaign Results**: Reach, conversions, ROI
• **Marketplace Sales**: Revenue, best-sellers, customer insights
• **AI Predictions**: Future trends and recommendations

All your data in one place, updated in real-time!`,settings:`You can customize Max Booster in Settings:

• **Profile**: Update your artist info and branding
• **Social Accounts**: Connect Instagram, Twitter, Facebook, YouTube
• **Distribution**: Manage your label and artist profiles
• **Billing**: View subscription and payment methods
• **Notifications**: Control email and push notifications

Click the gear icon in the sidebar to access Settings!`};function $(){const{user:i}=V(),[u,x]=n.useState(!1),[o,j]=n.useState(!1),[l,m]=n.useState([]),[p,f]=n.useState(""),[b,y]=n.useState(!1),c=n.useRef(null);n.useEffect(()=>{c.current&&(c.current.scrollTop=c.current.scrollHeight)},[l]),n.useEffect(()=>{if(u&&l.length===0){const e={id:"1",role:"assistant",content:`Hey ${i.username||i.firstName||"there"}! 👋 I'm Max, your personal AI assistant. I'm here to help you navigate Max Booster and grow your music career. What can I help you with today?`,timestamp:new Date};m([e])}},[u,i]);const N=s=>{const e=s.toLowerCase();return e.includes("daw")||e.includes("studio")||e.includes("record")||e.includes("mix")?a.daw:e.includes("distribution")||e.includes("distribute")||e.includes("spotify")||e.includes("apple music")?a.distribution:e.includes("ai")||e.includes("artificial intelligence")?a.ai:e.includes("monetize")||e.includes("money")||e.includes("earn")||e.includes("revenue")?a.monetize:e.includes("social")||e.includes("instagram")||e.includes("twitter")||e.includes("facebook")?a.social:e.includes("advertising")||e.includes("ad")||e.includes("marketing")||e.includes("growth")?a.advertising:e.includes("marketplace")||e.includes("sell")||e.includes("beats")?a.marketplace:e.includes("desktop")||e.includes("download")||e.includes("app")?a.desktop:e.includes("analytics")||e.includes("stats")||e.includes("data")||e.includes("metrics")?a.analytics:e.includes("settings")||e.includes("account")||e.includes("profile")||e.includes("preferences")?a.settings:a.default},h=s=>{const e=s||p.trim();if(!e)return;const S={id:Date.now().toString(),role:"user",content:e,timestamp:new Date};m(g=>[...g,S]),f(""),y(!0),setTimeout(()=>{const g={id:(Date.now()+1).toString(),role:"assistant",content:N(e),timestamp:new Date};m(I=>[...I,g]),y(!1)},800)},A=s=>{h(s.text)},k=i?.username||i?.firstName||"User",w=i?.subscriptionTier||"free";return u?t.jsx("div",{className:d("fixed bottom-20 lg:bottom-6 right-2 sm:right-6 z-[45] transition-all duration-200",o?"w-[calc(100vw-1rem)] sm:w-80":"w-[calc(100vw-1rem)] sm:w-96"),children:t.jsxs(O,{className:"shadow-2xl border-2 border-cyan-500/20 bg-[#1a1a1a]",children:[t.jsx(U,{className:"bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-cyan-500/20 p-4",children:t.jsxs("div",{className:"flex items-center justify-between",children:[t.jsxs(Y,{className:"flex items-center gap-2 text-white",children:[t.jsx("div",{className:"h-8 w-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center",children:t.jsx(v,{className:"h-4 w-4 text-white"})}),t.jsxs("div",{className:"flex-1",children:[t.jsx("div",{className:"text-sm font-semibold",children:"Max"}),t.jsxs("div",{className:"text-xs text-gray-400 font-normal flex items-center gap-1",children:[t.jsx(M,{className:"h-3 w-3"}),k,w!=="free"&&t.jsx(H,{variant:"outline",className:"ml-1 text-[10px] px-1 py-0 h-4 border-cyan-500/30 text-cyan-400",children:w})]})]})]}),t.jsxs("div",{className:"flex items-center gap-1",children:[t.jsx(r,{variant:"ghost",size:"sm",className:"h-8 w-8 p-0 text-gray-400 hover:text-white",onClick:()=>j(!o),children:o?t.jsx(z,{className:"h-4 w-4"}):t.jsx(C,{className:"h-4 w-4"})}),t.jsx(r,{variant:"ghost",size:"sm",className:"h-8 w-8 p-0 text-gray-400 hover:text-white",onClick:()=>x(!1),children:t.jsx(T,{className:"h-4 w-4"})})]})]})}),!o&&t.jsxs(G,{className:"p-0",children:[t.jsx(L,{ref:c,className:"h-96 p-4",children:t.jsxs("div",{className:"space-y-4",children:[l.map(s=>t.jsx("div",{className:d("flex",s.role==="user"?"justify-end":"justify-start"),children:t.jsx("div",{className:d("max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap",s.role==="user"?"bg-gradient-to-r from-cyan-500 to-blue-500 text-white":"bg-[#252525] text-gray-100 border border-gray-700"),children:s.content})},s.id)),b&&t.jsx("div",{className:"flex justify-start",children:t.jsx("div",{className:"bg-[#252525] text-gray-100 border border-gray-700 rounded-lg px-4 py-2",children:t.jsxs("div",{className:"flex space-x-2",children:[t.jsx("div",{className:"w-2 h-2 bg-cyan-400 rounded-full animate-bounce",style:{animationDelay:"0ms"}}),t.jsx("div",{className:"w-2 h-2 bg-cyan-400 rounded-full animate-bounce",style:{animationDelay:"150ms"}}),t.jsx("div",{className:"w-2 h-2 bg-cyan-400 rounded-full animate-bounce",style:{animationDelay:"300ms"}})]})})}),l.length===1&&!b&&t.jsx("div",{className:"grid grid-cols-1 gap-2 mt-4",children:F.map((s,e)=>t.jsxs(r,{variant:"outline",size:"sm",className:"justify-start text-left h-auto py-2 px-3 border-gray-700 hover:border-cyan-500/50 hover:bg-cyan-500/10",onClick:()=>A(s),children:[t.jsx(s.icon,{className:d("h-4 w-4 mr-2 flex-shrink-0",s.color)}),t.jsx("span",{className:"text-xs text-gray-300",children:s.text})]},e))})]})}),t.jsxs("div",{className:"border-t border-gray-700 p-4",children:[t.jsxs("div",{className:"flex items-center gap-2",children:[t.jsx(W,{value:p,onChange:s=>f(s.target.value),onKeyPress:s=>s.key==="Enter"&&h(),placeholder:"Ask me anything...",className:"flex-1 bg-[#252525] border-gray-700 text-white placeholder:text-gray-500"}),t.jsx(r,{onClick:()=>h(),disabled:!p.trim(),size:"sm",className:"bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600",children:t.jsx(P,{className:"h-4 w-4"})})]}),t.jsx("div",{className:"mt-2 text-xs text-gray-500 text-center",children:"Personalized AI help • Available 24/7"})]})]})]})}):t.jsxs("div",{className:"fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-[45]",children:[t.jsx(r,{onClick:()=>x(!0),size:"lg",className:"h-14 w-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 group","data-testid":"ai-assistant-bubble-personalized",children:t.jsx(v,{className:"h-6 w-6 text-white group-hover:scale-110 transition-transform"})}),t.jsx("div",{className:"absolute -top-2 -right-2 h-4 w-4 bg-green-500 rounded-full border-2 border-white animate-pulse"})]})}export{$ as AIAssistantPersonalized};

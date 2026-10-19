import {PrismaPg} from "@prisma/adapter-pg";
import {
  GameMode,
  MilestoneNameEnum,
  PostKindEnum,
  PostTypeEnum,
  PrismaClient,
  Prisma,
  RewardReasonEnum,
  RewardTypeEnum,
  UserTypeEnum,
} from "@prisma/client";
import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

const seedDatabaseUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const seedSchema = seedDatabaseUrl ? new URL(seedDatabaseUrl).searchParams.get("schema") || "public" : "public";
const prisma = new PrismaClient({adapter: new PrismaPg({connectionString: seedDatabaseUrl, max: 10, connectionTimeoutMillis: 5000}, {schema: seedSchema})});

export function generateUniqueRef(size: number = 16): string {
  const uuid = uuidv4().replace(/-/g, ""); // Remove dashes
  const numericValue = BigInt(`0x${uuid}`).toString(); // Convert to a large number
  return numericValue.slice(0, size); // Take the first 15 digits
}

// sell   @ 0.014 - 0.0125 USD per coin
// Buy back  @ 0.08 - 0.010 USD per coin depending on coin amount
// >= 10_000 coins exchanges at 0.010 USD per coin if pro or 0.009
// <= 10_000 coins exchanges at 0.009 USD per coin if pro or 0.008
// 1 USD = 1650 NGN
// Bonus is sold at the price range of ((0.014 to 0.0125)/1.5) USD per coin
// > 205_000 sells at $0.0125 per coin or 18.30

const dummyPosts = [
  "Tech evolves fast! Keep exploring new tools and platforms daily — the only way to stay ahead is to keep learning and adapting.",
  "Fitness isn't about the scale — it's about feeling strong, energized, and ready to take on the world. Every small step counts.",
  "AI isn't just for big companies. Even small businesses can leverage automation and insights to save time and boost growth.",
  "Traveling opens your mind like nothing else. Embrace the unfamiliar, taste the local cuisine, and let every city tell its story.",
  "Motivation comes from action. Don't wait for inspiration — start moving, and inspiration will follow.",
  "Healthy eating doesn't have to be boring. Mix colorful fruits, lean proteins, and whole grains to make every meal a delight.",
  "Finance tip: Track your expenses monthly and identify patterns. Awareness is the first step toward smarter money decisions.",
  "The best tech innovations are the ones that make life simpler, not more complicated. Look for solutions, not gadgets.",
  "Meditation isn't just a trend — it's a way to reset your mind and gain clarity in a chaotic world. Even 5 minutes helps.",
  "Reading travel blogs is great, but nothing beats experiencing the sights, smells, and sounds firsthand.",
  "AI art is changing creativity. Machines can inspire ideas, but your human touch gives it meaning and emotion.",
  "Running isn't about speed; it's about consistency. Even a short daily run builds resilience over time.",
  "A good financial plan is like a roadmap — without it, even small detours can become costly mistakes.",
  "Life is full of micro-adventures: try a new café, take a different route home, or strike up a conversation with a stranger.",
  "Tech burnout is real. Remember to unplug, breathe, and enjoy a world beyond screens.",
  "Yoga teaches flexibility not just in the body, but in the mind. Try it to balance stress and energy.",
  "AI in healthcare is saving lives. From diagnostics to personalized treatment, innovation can truly make a difference.",
  "Travel responsibly — respect local cultures, support local businesses, and leave a positive impact on the places you visit.",
  "Motivation is fleeting, but discipline is powerful. Build habits that last, and results will follow.",
  "Your diet fuels your life. Eating nutrient-dense foods is investing in energy, focus, and long-term health.",
  "Fintech apps make budgeting easier than ever. Automate your savings and watch small deposits grow.",
  "Tech conferences aren't just networking events — they're treasure troves of new ideas and perspectives.",
  "A short walk in nature can reset your mind and spark creativity. Don't underestimate the power of fresh air.",
  "AI assistants can save hours daily, but don't forget to add your personal touch — humans still lead with empathy.",
  "Motivation often hides in curiosity. Explore a new topic today, and you might unlock your next big goal.",
  "Cooking at home can be both fun and healthy. Experiment with herbs and spices for exciting flavors.",
  "Investing isn't only for the wealthy. Start small, stay consistent, and learn as you go.",
  "Tech security tip: use strong passwords and 2FA — a small step that protects a world of data.",
  "Traveling solo is empowering. You learn independence, patience, and the joy of discovering yourself.",
  "Fitness challenges are more than physical—they test your mental stamina and resilience.",
  "AI in education can personalize learning, but curiosity and discipline still drive mastery.",
  "Motivational quote of the day: “Progress, not perfection.” Every small improvement counts.",
  "Food tip: balance indulgence with nutrition. Life's too short to skip the chocolate, but moderation is key.",
  "Saving money isn't painful — it's a mindset shift. Prioritize needs, delay wants, and celebrate small wins.",
  "Tech podcasts are a goldmine of insights. Listen during commutes and fuel your mind constantly.",
  "Mindful breathing can reduce stress instantly. Take a deep breath, hold, exhale — and feel the tension leave.",
  "Travel photography captures memories, but sometimes just being present is better than snapping a picture.",
  "AI is powerful, but ethical use is key. Technology without responsibility can harm more than help.",
  "Fitness gear isn't essential; commitment is. Your body adapts to effort, not fancy equipment.",
  "Motivation grows when you celebrate tiny wins. Don't wait for big achievements to feel proud.",
  "Plant-based meals aren't just trendy — they can improve health and reduce environmental impact.",
  "Finance tip: Diversify your investments. Don't put all your eggs in one basket.",
  "Tech innovation thrives on curiosity. Ask questions, experiment, and don't fear failure.",
  "Traveling with friends strengthens bonds. Shared memories often last longer than souvenirs.",
  "AI in daily apps is already shaping our lives. Learn it, adapt it, and leverage it for growth.",
  "Morning routines set the tone for your day. Even a 10-minute ritual can boost productivity.",
  "Motivation is often action disguised as effort. Start small — the rest will follow.",
  "Cooking hacks save time: prep ingredients in batches, freeze leftovers, and use kitchen gadgets wisely.",
  "Financial health is mental health too. Stress less by planning budgets and setting realistic goals.",
  "Tech isn't just about gadgets — it's about creating solutions that simplify human lives.",
  "Innovation comes from curiosity. Ask questions, experiment, and never fear failure — the next big idea could be yours.",
  "Start your day with intention. Even small morning rituals like journaling or stretching set a positive tone.",
  "Healthy habits compound. Drink water, get enough sleep, and move your body daily — your future self will thank you.",
  "Tech trends are exciting, but focus on solving real problems, not just following the latest hype.",
  "Travel isn’t about checking places off a list — it’s about experiencing culture, people, and new perspectives.",
  "Motivation fades, but habits stick. Build routines that align with your goals for long-term success.",
  "AI can help automate tasks, but creativity and empathy are still human superpowers.",
  "Nutrition isn’t just calories — it’s about giving your body fuel for energy, focus, and longevity.",
  "Financial literacy is freedom. Understanding money management opens doors to opportunities you never imagined.",
  "Embrace failures as lessons. Every mistake is a step closer to mastery and growth.",
  "Tech skills are valuable, but soft skills like communication and teamwork are what make you indispensable.",
  "A mindful walk in nature can spark creativity and reduce stress simultaneously.",
  "Investing in experiences often yields greater happiness than buying material things.",
  "AI in daily life can simplify complex tasks — embrace it as a tool, not a replacement.",
  "Fitness is a journey, not a destination. Celebrate progress, not perfection.",
  "Traveling teaches adaptability. Unexpected challenges often lead to the most memorable experiences.",
  "Healthy snacks like nuts, fruits, or yogurt keep energy high without sabotaging goals.",
  "Money management isn’t complicated — track, save, invest, and repeat consistently.",
  "Tech communities are goldmines of knowledge. Engage, learn, and contribute whenever you can.",
  "Meditation improves focus, reduces anxiety, and enhances clarity. Start with just five minutes a day.",
  "AI-powered apps can boost productivity, but set boundaries to prevent digital burnout.",
  "Small fitness goals compound into big results. Focus on consistency over intensity.",
  "Travel opens your mind and heart. Meeting new people broadens perspectives beyond imagination.",
  "Learning is lifelong. Stay curious, read, explore, and never stop growing.",
  "Planting trees and supporting green initiatives benefits both your community and the planet.",
  "Motivation often comes from seeing progress. Track achievements to stay inspired.",
  "Tech innovations are exciting, but security and privacy must always remain a priority.",
  "Investing early, even small amounts, harnesses the power of compound interest over time.",
  "Mindfulness isn’t just meditation — it’s being present in every interaction and action.",
  "AI in healthcare is revolutionizing early detection and personalized treatments for patients.",
  "Fitness routines work best when enjoyable. Find activities you love and stick to them.",
  "Travel responsibly: respect cultures, reduce waste, and support local economies.",
  "Eating colorful fruits and vegetables ensures a variety of nutrients for optimal health.",
  "Financial planning gives peace of mind. Set budgets, track expenses, and plan for the future.",
  "Tech innovations often fail — embrace experimentation and learn from mistakes.",
  "Short daily reading sessions improve knowledge, focus, and imagination over time.",
  "AI can enhance creativity, but original ideas still require human intuition and emotion.",
  "Consistency in learning new skills builds expertise over time. Small daily efforts matter.",
  "Mindful breathing can help manage stress during challenging or chaotic moments.",
  "Traveling with intention deepens experiences. Explore, connect, and reflect wherever you go.",
  "Fitness is mental as much as physical. Strengthen both for lasting results.",
  "AI is shaping the future, but ethical use ensures technology benefits society.",
  "Cooking meals at home can be fun, creative, and healthier than eating out constantly.",
  "Investing isn’t gambling — research, diversify, and plan for the long term.",
  "Tech is best when it solves real problems, not just dazzles with complexity.",
  "Small acts of kindness, every day, ripple into larger positive impacts in your community.",
  "Journaling helps organize thoughts, set intentions, and track personal growth.",
  "Motivation sparks action, but discipline sustains it. Build systems to keep momentum going.",
  "Travel memories last longer than souvenirs — focus on experiences, not possessions.",
  "Healthy routines are the foundation of productivity and well-being — prioritize self-care daily.",
  "Tech is evolving faster than ever. Stay curious, experiment, and embrace continuous learning.",
  "Daily movement matters more than occasional intense workouts. Keep it consistent for long-term health.",
  "AI can help with repetitive tasks, but your creativity and judgment remain irreplaceable.",
  "Traveling exposes you to new cultures, ideas, and perspectives — embrace every experience.",
  "Motivation gets you started, but habits keep you going. Build routines that support your goals.",
  "Eating nutrient-dense foods fuels your mind and body for optimal performance every day.",
  "Financial freedom starts with tracking your expenses and setting achievable saving goals.",
  "Innovation often comes from solving simple problems in smarter ways. Observe and create.",
  "A mindful walk in nature can reduce stress, spark ideas, and boost your mood instantly.",
  "Invest in experiences, not just material things — memories last longer than possessions.",
  "AI-powered tools can increase efficiency, but your strategic thinking drives meaningful results.",
  "Fitness is about progress, not perfection. Celebrate every milestone along the journey.",
  "Travel challenges teach adaptability, patience, and resilience — the lessons stay forever.",
  "Healthy snacks keep energy levels high and improve focus throughout your day.",
  "Start small with investing — even minor contributions grow significantly over time.",
  "Tech communities are rich sources of knowledge. Engage, learn, and contribute regularly.",
  "Meditation improves focus, reduces anxiety, and enhances emotional resilience — start today.",
  "AI can enhance productivity, but set boundaries to avoid burnout from constant notifications.",
  "Short, consistent workouts build long-term strength and stamina better than sporadic sessions.",
  "Travel opens your heart and mind. Interact with locals to gain authentic experiences.",
  "Lifelong learning is key to personal and professional growth. Stay curious and explore.",
  "Supporting environmental initiatives benefits both your community and the planet.",
  "Track your achievements to maintain motivation and measure progress over time.",
  "Data privacy and cybersecurity are essential in the era of rapid tech adoption.",
  "Start investing early, even with small amounts, to harness the power of compound interest.",
  "Mindfulness is about being present in every action and interaction, not just meditation.",
  "AI in healthcare improves early detection and delivers personalized treatments for patients.",
  "Choose fitness activities you enjoy — sustainability matters more than intensity alone.",
  "Travel responsibly: respect cultures, reduce waste, and support local businesses.",
  "Eating a variety of colorful fruits and vegetables ensures essential nutrients daily.",
  "Financial planning reduces stress. Budget, track expenses, and prepare for the future.",
  "Embrace failure as a learning opportunity. Experiment, adjust, and grow stronger.",
  "Reading daily improves knowledge, focus, and imagination — even 15 minutes counts.",
  "AI can inspire creativity, but original ideas still require human intuition and emotion.",
  "Consistency in skill-building leads to expertise. Small daily efforts accumulate over time.",
  "Mindful breathing helps manage stress and brings clarity in hectic moments.",
  "Travel with purpose. Explore, connect, and reflect for deeper experiences.",
  "Mental fitness is as important as physical. Strengthen both for balanced well-being.",
  "Ethical use of AI ensures technology benefits society rather than causing harm.",
  "Cooking at home promotes creativity, health, and mindful eating habits.",
  "Investing requires research, diversification, and long-term planning — not luck.",
  "Tech works best when it simplifies problems rather than complicating them unnecessarily.",
  "Small acts of kindness ripple into larger positive changes in your community.",
  "Journaling organizes thoughts, sets intentions, and tracks personal growth over time.",
  "Motivation sparks action, but discipline sustains it — build systems for lasting momentum.",
  "Focus on travel experiences rather than souvenirs — memories hold more value.",
  "Healthy routines form the foundation for productivity, energy, and mental clarity.",
  "Curiosity drives innovation. Question assumptions, explore solutions, and stay flexible.",
  "Daily gratitude improves mental well-being and strengthens relationships with others.",
  "Tech literacy empowers you to adapt to new tools, platforms, and digital challenges.",
  "Even small financial steps, like saving spare change, accumulate into meaningful wealth.",
  "Innovation thrives when you challenge the status quo. Experiment boldly and learn from failures.",
  "Consistency beats intensity. Small daily actions compound into big results over time.",
  "AI can automate repetitive tasks, but human creativity remains unmatched in problem-solving.",
  "Travel opens your mind — every city, culture, and person teaches a new perspective.",
  "Motivation gets you started, but discipline keeps you moving when inspiration fades.",
  "Eating whole, unprocessed foods fuels your energy and supports long-term health.",
  "Financial planning empowers you to make choices freely — track, save, and invest wisely.",
  "Simple solutions often create the biggest impact. Observe problems closely and act smartly.",
  "Spending time in nature can reduce stress, boost creativity, and enhance overall well-being.",
  "Investing in experiences creates lasting memories that material possessions can’t replace.",
  "AI can enhance productivity, but strategic thinking and creativity remain human strengths.",
  "Fitness is about growth, not perfection. Celebrate progress, however small it may seem.",
  "Travel challenges teach adaptability and patience — embrace the unexpected with curiosity.",
  "Healthy snacks like nuts, fruits, and yogurt keep energy levels steady throughout the day.",
  "Start investing early, even small amounts. Compound interest turns tiny steps into large gains.",
  "Engaging with tech communities can accelerate learning and open new opportunities.",
  "Meditation helps calm the mind, reduce anxiety, and improve emotional clarity.",
  "AI tools can boost efficiency, but set boundaries to prevent over-reliance and burnout.",
  "Short, consistent workouts are more effective than occasional intense sessions for long-term fitness.",
  "Traveling with locals in mind creates authentic experiences and deeper cultural understanding.",
  "Curiosity drives lifelong learning. Explore, ask questions, and never stop growing.",
  "Supporting environmental initiatives benefits the community and contributes to global sustainability.",
  "Tracking achievements motivates continued progress and helps celebrate small wins.",
  "Data security and privacy are essential in our increasingly digital world.",
  "Investing consistently over time, even in small amounts, leads to financial growth.",
  "Mindfulness isn’t just meditation — it’s a habit of staying present in daily life.",
  "AI in healthcare is transforming diagnostics and treatment, improving patient outcomes.",
  "Choose enjoyable fitness activities to ensure long-term adherence and sustainability.",
  "Travel responsibly by respecting cultures, minimizing waste, and supporting local businesses.",
  "Eating a variety of colorful fruits and vegetables ensures you get essential nutrients daily.",
  "Financial planning reduces stress and builds confidence. Budget, track, and plan ahead.",
  "Failures are opportunities to learn. Adjust, adapt, and grow stronger from each experience.",
  "Reading daily improves focus, knowledge, and imagination, even in small increments.",
  "AI can inspire creativity, but human intuition and emotion give ideas meaning and depth.",
  "Daily consistency in skill-building leads to mastery over time — small efforts accumulate.",
  "Mindful breathing reduces stress, improves focus, and brings clarity in hectic moments.",
  "Travel with intention. Explore, reflect, and connect to make experiences meaningful.",
  "Mental fitness is as important as physical health — cultivate both for balance.",
  "Ethical AI ensures technology benefits humanity rather than causing unintended harm.",
  "Cooking at home fosters creativity, healthier eating habits, and mindful consumption.",
  "Investing wisely requires research, diversification, and a long-term perspective.",
  "Technology should simplify life, not complicate it — focus on solutions, not features.",
  "Small acts of kindness ripple into larger impacts within your community.",
  "Journaling helps organize thoughts, set goals, and track personal growth effectively.",
  "Motivation sparks action, but disciplined systems sustain long-term progress.",
  "Prioritize experiences over material goods — memories have more lasting value.",
  "Healthy routines create a foundation for productivity, energy, and mental clarity.",
  "Curiosity drives innovation — question, explore, and remain flexible in your approach.",
  "Daily gratitude improves mental well-being and strengthens personal relationships.",
  "Tech literacy enables you to adapt quickly to new tools, platforms, and challenges.",
  "Even small financial steps, like saving spare change, can grow into significant wealth over time.",
  "Innovation starts with curiosity. Question assumptions, explore possibilities, and experiment fearlessly.",
  "Small daily actions build big results over time. Consistency beats occasional intensity every time.",
  "AI can handle repetitive work, but human creativity and judgment remain irreplaceable.",
  "Travel expands your perspective. Embrace new cultures, people, and experiences with an open mind.",
  "Motivation is fleeting; habits last. Build routines that align with your goals for lasting success.",
  "Eating whole, nutrient-rich foods fuels your body and brain for optimal performance.",
  "Financial literacy empowers decision-making. Track spending, save wisely, and invest intelligently.",
  "Simplicity in solutions often drives the most impact. Observe carefully and act smartly.",
  "Time in nature reduces stress, enhances creativity, and improves overall well-being.",
  "Invest in experiences over material goods — memories outlast possessions.",
  "AI can boost productivity, but strategic thinking and creativity remain human strengths.",
  "Fitness is a journey, not a destination. Celebrate progress, no matter how small.",
  "Travel challenges teach resilience and adaptability — embrace the unexpected.",
  "Healthy snacks like fruits, nuts, and yogurt maintain energy and focus throughout the day.",
  "Start investing early, even with modest amounts. Compound interest grows wealth over time.",
  "Engaging in tech communities accelerates learning and opens new opportunities.",
  "Meditation calms the mind, reduces anxiety, and enhances emotional clarity.",
  "AI tools increase efficiency, but set boundaries to prevent burnout and over-reliance.",
  "Short, consistent workouts outperform sporadic intense sessions in building fitness.",
  "Interacting with locals while traveling creates authentic and meaningful experiences.",
  "Curiosity drives lifelong learning. Keep exploring, questioning, and growing.",
  "Supporting environmental causes benefits your community and the planet.",
  "Tracking achievements motivates progress and celebrates small wins.",
  "Data security and privacy are critical in today’s digital world.",
  "Consistent investing, even in small amounts, yields long-term financial growth.",
  "Mindfulness is about staying present in every moment, not just meditation.",
  "AI in healthcare revolutionizes diagnostics and personalized treatment, improving outcomes.",
  "Enjoyable fitness activities ensure adherence and long-term results.",
  "Travel responsibly: respect cultures, minimize waste, and support local businesses.",
  "Eating colorful fruits and vegetables ensures essential nutrients for health.",
  "Financial planning reduces stress — budget, track, and prepare for the future.",
  "Failure is a learning opportunity. Adjust, adapt, and grow stronger.",
  "Reading daily improves focus, knowledge, and imagination — even small amounts help.",
  "AI can inspire creativity, but human intuition gives ideas depth and meaning.",
  "Consistent skill-building over time leads to mastery. Small efforts accumulate.",
  "Mindful breathing reduces stress, improves focus, and provides clarity.",
  "Travel with intention. Explore, reflect, and connect for meaningful experiences.",
  "Mental fitness is as important as physical health — nurture both.",
  "Ethical AI ensures technology benefits society rather than causing harm.",
  "Cooking at home fosters creativity, healthier eating, and mindful habits.",
  "Investing wisely requires research, diversification, and a long-term perspective.",
  "Technology should simplify life, not complicate it — prioritize solutions.",
  "Small acts of kindness ripple into larger impacts in your community.",
  "Journaling organizes thoughts, sets goals, and tracks personal growth.",
  "Motivation sparks action, but discipline sustains long-term progress.",
  "Prioritize experiences over material goods — memories last longer.",
  "Healthy routines build a foundation for energy, productivity, and clarity.",
  "Curiosity drives innovation — question, explore, and remain flexible.",
  "Daily gratitude improves mental well-being and strengthens relationships.",
  "Tech literacy helps you adapt to new tools, platforms, and challenges.",
  "Small financial steps, like saving spare change, grow into significant wealth over time.",
  "Innovation comes from questioning norms. Experiment, iterate, and embrace failures as lessons.",
  "Small, consistent actions create big long-term results. Focus on progress, not perfection.",
  "AI handles repetitive tasks efficiently, but human judgment and creativity remain crucial.",
  "Travel broadens your mind — every new culture and perspective teaches something valuable.",
  "Motivation gets you started; habits keep you moving. Build systems that last.",
  "Eating whole foods fuels energy, focus, and long-term health.",
  "Financial literacy empowers freedom. Track, save, and invest smartly.",
  "Simplicity often leads to the most impactful solutions. Observe carefully and act wisely.",
  "Spending time in nature reduces stress and sparks creativity.",
  "Invest in experiences — memories last longer than material possessions.",
  "AI boosts productivity, but human insight drives meaningful outcomes.",
  "Fitness is about consistent growth. Celebrate small victories along the way.",
  "Travel challenges teach resilience and adaptability. Embrace the unknown.",
  "Healthy snacks like fruits, nuts, and seeds maintain energy throughout the day.",
  "Start investing early, even small amounts, to leverage compound growth.",
  "Tech communities are rich learning resources. Engage, share, and grow.",
  "Meditation calms the mind, improves focus, and enhances emotional clarity.",
  "AI tools improve efficiency, but set boundaries to prevent over-reliance.",
  "Short, consistent workouts outperform sporadic intense sessions over time.",
  "Interacting with locals while traveling creates authentic and enriching experiences.",
  "Curiosity fuels lifelong learning. Stay inquisitive and explore new ideas.",
  "Supporting environmental initiatives benefits your community and the planet.",
  "Tracking achievements keeps motivation high and progress measurable.",
  "Cybersecurity and data privacy are essential in a connected digital world.",
  "Consistent investing, even in small amounts, leads to long-term growth.",
  "Mindfulness is about being present, aware, and intentional in daily life.",
  "AI in healthcare improves early detection, diagnosis, and personalized treatment.",
  "Fitness is more sustainable when it’s enjoyable. Choose activities you love.",
  "Travel responsibly: respect cultures, minimize waste, and support local economies.",
  "Eating colorful fruits and vegetables provides essential vitamins and minerals.",
  "Financial planning reduces stress — set budgets, track spending, and plan ahead.",
  "Failures are opportunities to learn, adapt, and grow stronger.",
  "Reading daily enhances knowledge, focus, and creativity — even 10 minutes counts.",
  "AI can inspire creativity, but human intuition gives depth and meaning to ideas.",
  "Skill-building is cumulative. Small daily efforts lead to mastery over time.",
  "Mindful breathing reduces stress and increases mental clarity.",
  "Travel intentionally. Explore, connect, and reflect to make meaningful memories.",
  "Mental fitness is as important as physical health — nurture both.",
  "Ethical AI ensures technology benefits society without causing harm.",
  "Cooking at home promotes creativity, healthy eating, and mindfulness.",
  "Investing wisely requires research, diversification, and long-term perspective.",
  "Technology should simplify life, not complicate it — focus on practical solutions.",
  "Small acts of kindness ripple into larger positive impacts in your community.",
  "Journaling organizes thoughts, sets intentions, and tracks personal growth.",
  "Motivation sparks action, but discipline sustains long-term success.",
  "Prioritize experiences over material possessions — memories last longer.",
  "Healthy routines form the foundation for energy, productivity, and mental clarity.",
  "Curiosity drives innovation — question, explore, and remain open-minded.",
  "Daily gratitude improves mental well-being and strengthens personal connections.",
  "Tech literacy enables adaptation to new tools, platforms, and digital challenges.",
  "Small financial habits, like saving regularly, accumulate into significant wealth over time.",
  "Innovation often comes from unexpected ideas. Stay curious and experiment fearlessly.",
  "Daily small actions lead to big long-term results. Consistency is more important than intensity.",
  "AI can streamline repetitive tasks, but human creativity and insight remain irreplaceable.",
  "Travel broadens your perspective. Each new culture and encounter teaches valuable lessons.",
  "Motivation starts the journey; habits keep you moving. Build systems that last.",
  "Eating whole, nutrient-rich foods supports energy, focus, and long-term health.",
  "Financial literacy empowers freedom. Track expenses, save wisely, and invest intelligently.",
  "Simple solutions often have the greatest impact. Observe, analyze, and act thoughtfully.",
  "Time spent in nature reduces stress, boosts creativity, and improves well-being.",
  "Invest in experiences, not just things. Memories last longer than material possessions.",
  "AI can improve efficiency, but human judgment ensures meaningful results.",
  "Fitness is about growth, not perfection. Celebrate small milestones along the way.",
  "Travel challenges teach adaptability, resilience, and patience — embrace the unknown.",
  "Healthy snacks, like fruits and nuts, maintain energy and mental clarity throughout the day.",
  "Invest early, even in small amounts, to harness the power of compound interest.",
  "Tech communities are excellent learning resources. Engage, share, and grow your skills.",
  "Meditation improves focus, reduces stress, and enhances emotional clarity.",
  "AI tools boost productivity, but set boundaries to prevent over-dependence.",
  "Short, consistent workouts are more effective for long-term fitness than occasional intense sessions.",
  "Engaging with locals during travel creates authentic and enriching experiences.",
  "Curiosity fuels lifelong learning. Stay inquisitive and explore new ideas daily.",
  "Supporting environmental causes benefits both your community and the planet.",
  "Tracking achievements keeps motivation high and progress measurable.",
  "Cybersecurity and data privacy are critical in today’s connected digital world.",
  "Consistent investing, even small amounts, leads to long-term financial growth.",
  "Mindfulness is being present, aware, and intentional in your daily actions.",
  "AI in healthcare enhances early detection, diagnosis, and personalized treatment.",
  "Fitness is sustainable when enjoyable. Choose activities you love to maintain consistency.",
  "Travel responsibly — respect cultures, reduce waste, and support local businesses.",
  "Eating colorful fruits and vegetables ensures essential nutrients for optimal health.",
  "Financial planning reduces stress — set budgets, track spending, and prepare for the future.",
  "Failures are opportunities to learn, adapt, and become stronger.",
  "Reading daily improves focus, knowledge, and imagination, even in small increments.",
  "AI can inspire creativity, but human intuition gives depth and meaning to ideas.",
  "Consistent skill-building leads to mastery over time — small efforts accumulate.",
  "Mindful breathing reduces stress and improves mental clarity.",
  "Travel intentionally. Explore, connect, and reflect to make experiences meaningful.",
  "Mental fitness is as important as physical health — nurture both for balance.",
  "Ethical AI ensures technology benefits society without causing unintended harm.",
  "Cooking at home fosters creativity, healthier eating habits, and mindfulness.",
  "Investing wisely requires research, diversification, and a long-term perspective.",
  "Technology should simplify life, not complicate it — prioritize practical solutions.",
  "Small acts of kindness ripple into larger positive impacts within your community.",
  "Journaling organizes thoughts, sets intentions, and tracks personal growth effectively.",
  "Motivation sparks action, but discipline sustains long-term success.",
  "Prioritize experiences over material goods — memories are more valuable.",
  "Healthy routines create a foundation for energy, productivity, and mental clarity.",
  "Curiosity drives innovation — question, explore, and remain open-minded.",
  "Daily gratitude improves mental well-being and strengthens relationships.",
  "Tech literacy helps you adapt to new tools, platforms, and digital challenges.",
  "Small financial habits, like saving consistently, accumulate into significant wealth over time.",
  "Just listened to Eminem's new verse on that track – still the GOAT! 🔥 Davido and Nicki Minaj need to hop on the remix ASAP. #Eminem #Davido #NickiMinaj",

  "Davido just dropped another banger! If Nicki Minaj and Eminem jumped on this beat, it would be unstoppable. Who's with me? 🇳🇬🎤 #Davido #NickiMinaj #Eminem",

  "Nicki Minaj's flow is untouchable right now. Imagine her trading bars with Eminem over a Davido Afrobeat instrumental… the world isn't ready! 👑 #NickiMinaj #Eminem #Davido",

  "Eminem's lyricism + Davido's melody + Nicki Minaj's attitude = the ultimate collab we all need in 2025. Make it happen! 🙏 #Eminem #Davido #NickiMinaj",

  "Davido living his best life in the new Rolls-Royce while Nicki Minaj owns the charts and Eminem drops bars out of nowhere. Legends only in 2025! 💎 #Davido #NickiMinaj #Eminem",

  "Nicki Minaj at the Met Gala looking like royalty, Eminem winning awards, Davido selling out shows – hip-hop and Afrobeats are eating good this year! 👸🎤 #NickiMinaj #Eminem #Davido",

  "Can't stop playing Davido's new album. A Nicki Minaj feature would be fire, but an Eminem verse? Straight chaos (the good kind)! 😈 #Davido #NickiMinaj #Eminem",

  "Eminem and Nicki Minaj have that unmatched energy. Add Davido's vibe and you get a global anthem. Someone in the studio needs to hear this! 🌍 #Eminem #NickiMinaj #Davido",

  "Davido shutting down O2 Arena, Nicki Minaj breaking records, Eminem still spitting like it's 2002 – music is in great hands. Respect to the kings & queen! 👑 #Davido #NickiMinaj #Eminem",

  "Dream feature: Davido chorus, Nicki Minaj hook, Eminem closing verse. That song would live rent-free in my head forever. Who's producing it? 🐐 #Davido #NickiMinaj #Eminem",
  "Just heard Nicki Minaj's new track and it's fire! Eminem and Davido should collab soon. #NickiMinaj #Eminem #Davido",
  "Nicki Minaj's lyrics + Eminem's vibe + Davido's flow = perfection. #NickiMinaj #Eminem #Davido",
  "Dream team: Nicki Minaj, Davido, and Eminem on one song. The world wouldn't survive! 🔥 #NickiMinaj #Davido #Eminem",
  "Can't stop playing Nicki Minaj. Imagine a remix with Davido and Eminem! #NickiMinaj #Davido #Eminem",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "Fan edit needed: Nicki Minaj verse over Davido beat with Eminem ad-libs. #NickiMinaj #Davido #Eminem",
  "Eminem's lyrics + Nicki Minaj's vibe + Davido's flow = perfection. #Eminem #NickiMinaj #Davido",
  "Davido's lyrics + Nicki Minaj's vibe + Eminem's flow = perfection. #Davido #NickiMinaj #Eminem",
  "Eminem's lyrics + Nicki Minaj's vibe + Davido's flow = perfection. #Eminem #NickiMinaj #Davido",
  "2025 belongs to Davido, Eminem, and Nicki Minaj. Legends dominating! #Davido #Eminem #NickiMinaj",
  "If Davido and Eminem made a song with Nicki Minaj's energy, it would break records. #Davido #Eminem #NickiMinaj",
  "If Davido and Eminem made a song with Nicki Minaj's energy, it would break records. #Davido #Eminem #NickiMinaj",
  "Fan edit needed: Nicki Minaj verse over Eminem beat with Davido ad-libs. #NickiMinaj #Eminem #Davido",
  "Who wins in a feature: Nicki Minaj on a Eminem beat or Davido spitting bars? #NickiMinaj #Eminem #Davido",
  "Nicki Minaj's lyrics + Davido's vibe + Eminem's flow = perfection. #NickiMinaj #Davido #Eminem",
  "If Davido and Nicki Minaj made a song with Eminem's energy, it would break records. #Davido #NickiMinaj #Eminem",
  "Can't stop playing Nicki Minaj. Imagine a remix with Davido and Eminem! #NickiMinaj #Davido #Eminem",
  "Nicki Minaj concert was insane! Wish Eminem and Davido were guests. #NickiMinaj #Eminem #Davido",
  "Can't stop playing Eminem. Imagine a remix with Nicki Minaj and Davido! #Eminem #NickiMinaj #Davido",
  "Davido concert was insane! Wish Nicki Minaj and Eminem were guests. #Davido #NickiMinaj #Eminem",
  "2025 belongs to Eminem, Davido, and Nicki Minaj. Legends dominating! #Eminem #Davido #NickiMinaj",
  "Fan edit needed: Davido verse over Eminem beat with Nicki Minaj ad-libs. #Davido #Eminem #NickiMinaj",
  "Just heard Eminem's new track and it's fire! Nicki Minaj and Davido should collab soon. #Eminem #NickiMinaj #Davido",
  "If Nicki Minaj and Davido made a song with Eminem's energy, it would break records. #NickiMinaj #Davido #Eminem",
  "Eminem concert was insane! Wish Davido and Nicki Minaj were guests. #Eminem #Davido #NickiMinaj",
  "Dream team: Eminem, Davido, and Nicki Minaj on one song. The world wouldn't survive! 🔥 #Eminem #Davido #NickiMinaj",
  "Who wins in a feature: Eminem on a Davido beat or Nicki Minaj spitting bars? #Eminem #Davido #NickiMinaj",
  "Fan edit needed: Davido verse over Eminem beat with Nicki Minaj ad-libs. #Davido #Eminem #NickiMinaj",
  "Nicki Minaj is killing it this year. Davido and Eminem are close behind though. #NickiMinaj #Davido #Eminem",
  "Just heard Nicki Minaj's new track and it's fire! Eminem and Davido should collab soon. #NickiMinaj #Eminem #Davido",
  "2025 belongs to Davido, Eminem, and Nicki Minaj. Legends dominating! #Davido #Eminem #NickiMinaj",
  "If Nicki Minaj and Eminem made a song with Davido's energy, it would break records. #NickiMinaj #Eminem #Davido",
  "If Davido and Nicki Minaj made a song with Eminem's energy, it would break records. #Davido #NickiMinaj #Eminem",
  "Eminem concert was insane! Wish Davido and Nicki Minaj were guests. #Eminem #Davido #NickiMinaj",
  "Dream team: Eminem, Davido, and Nicki Minaj on one song. The world wouldn't survive! 🔥 #Eminem #Davido #NickiMinaj",
  "Just heard Eminem's new track and it's fire! Davido and Nicki Minaj should collab soon. #Eminem #Davido #NickiMinaj",
  "2025 belongs to Davido, Eminem, and Nicki Minaj. Legends dominating! #Davido #Eminem #NickiMinaj",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "Can't stop playing Eminem. Imagine a remix with Nicki Minaj and Davido! #Eminem #NickiMinaj #Davido",
  "Nicki Minaj is killing it this year. Davido and Eminem are close behind though. #NickiMinaj #Davido #Eminem",
  "Nicki Minaj concert was insane! Wish Davido and Eminem were guests. #NickiMinaj #Davido #Eminem",
  "Davido's lyrics + Eminem's vibe + Nicki Minaj's flow = perfection. #Davido #Eminem #NickiMinaj",
  "If Nicki Minaj and Davido made a song with Eminem's energy, it would break records. #NickiMinaj #Davido #Eminem",
  "2025 belongs to Nicki Minaj, Eminem, and Davido. Legends dominating! #NickiMinaj #Eminem #Davido",
  "Davido concert was insane! Wish Nicki Minaj and Eminem were guests. #Davido #NickiMinaj #Eminem",
  "If Eminem and Nicki Minaj made a song with Davido's energy, it would break records. #Eminem #NickiMinaj #Davido",
  "Can't stop playing Davido. Imagine a remix with Nicki Minaj and Eminem! #Davido #NickiMinaj #Eminem",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "Just heard Eminem's new track and it's fire! Davido and Nicki Minaj should collab soon. #Eminem #Davido #NickiMinaj",
  "Eminem concert was insane! Wish Nicki Minaj and Davido were guests. #Eminem #NickiMinaj #Davido",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "Just heard Davido's new track and it's fire! Eminem and Nicki Minaj should collab soon. #Davido #Eminem #NickiMinaj",
  "If Eminem and Nicki Minaj made a song with Davido's energy, it would break records. #Eminem #NickiMinaj #Davido",
  "Can't stop playing Davido. Imagine a remix with Eminem and Nicki Minaj! #Davido #Eminem #NickiMinaj",
  "Who wins in a feature: Nicki Minaj on a Davido beat or Eminem spitting bars? #NickiMinaj #Davido #Eminem",
  "Just heard Nicki Minaj's new track and it's fire! Davido and Eminem should collab soon. #NickiMinaj #Davido #Eminem",
  "Just heard Eminem's new track and it's fire! Nicki Minaj and Davido should collab soon. #Eminem #NickiMinaj #Davido",
  "Fan edit needed: Eminem verse over Davido beat with Nicki Minaj ad-libs. #Eminem #Davido #NickiMinaj",
  "If Nicki Minaj and Davido made a song with Eminem's energy, it would break records. #NickiMinaj #Davido #Eminem",
  "Dream team: Eminem, Nicki Minaj, and Davido on one song. The world wouldn't survive! 🔥 #Eminem #NickiMinaj #Davido",
  "Davido concert was insane! Wish Nicki Minaj and Eminem were guests. #Davido #NickiMinaj #Eminem",
  "Fan edit needed: Nicki Minaj verse over Davido beat with Eminem ad-libs. #NickiMinaj #Davido #Eminem",
  "Nicki Minaj is killing it this year. Davido and Eminem are close behind though. #NickiMinaj #Davido #Eminem",
  "Just heard Nicki Minaj's new track and it's fire! Eminem and Davido should collab soon. #NickiMinaj #Eminem #Davido",
  "Dream team: Nicki Minaj, Eminem, and Davido on one song. The world wouldn't survive! 🔥 #NickiMinaj #Eminem #Davido",
  "Nicki Minaj's lyrics + Eminem's vibe + Davido's flow = perfection. #NickiMinaj #Eminem #Davido",
  "If Nicki Minaj and Davido made a song with Eminem's energy, it would break records. #NickiMinaj #Davido #Eminem",
  "Fan edit needed: Davido verse over Nicki Minaj beat with Eminem ad-libs. #Davido #NickiMinaj #Eminem",
  "Who wins in a feature: Eminem on a Davido beat or Nicki Minaj spitting bars? #Eminem #Davido #NickiMinaj",
  "Just heard Eminem's new track and it's fire! Davido and Nicki Minaj should collab soon. #Eminem #Davido #NickiMinaj",
  "2025 belongs to Nicki Minaj, Davido, and Eminem. Legends dominating! #NickiMinaj #Davido #Eminem",
  "Can't stop playing Eminem. Imagine a remix with Nicki Minaj and Davido! #Eminem #NickiMinaj #Davido",
  "Fan edit needed: Davido verse over Eminem beat with Nicki Minaj ad-libs. #Davido #Eminem #NickiMinaj",
  "2025 belongs to Nicki Minaj, Davido, and Eminem. Legends dominating! #NickiMinaj #Davido #Eminem",
  "If Eminem and Davido made a song with Nicki Minaj's energy, it would break records. #Eminem #Davido #NickiMinaj",
  "Eminem's lyrics + Nicki Minaj's vibe + Davido's flow = perfection. #Eminem #NickiMinaj #Davido",
  "Who wins in a feature: Nicki Minaj on a Davido beat or Eminem spitting bars? #NickiMinaj #Davido #Eminem",
  "Davido is killing it this year. Nicki Minaj and Eminem are close behind though. #Davido #NickiMinaj #Eminem",
  "Davido is killing it this year. Eminem and Nicki Minaj are close behind though. #Davido #Eminem #NickiMinaj",
  "Who wins in a feature: Nicki Minaj on a Eminem beat or Davido spitting bars? #NickiMinaj #Eminem #Davido",
  "Nicki Minaj concert was insane! Wish Davido and Eminem were guests. #NickiMinaj #Davido #Eminem",
  "Who wins in a feature: Davido on a Eminem beat or Nicki Minaj spitting bars? #Davido #Eminem #NickiMinaj",
  "Can't stop playing Davido. Imagine a remix with Nicki Minaj and Eminem! #Davido #NickiMinaj #Eminem",
  "Davido's lyrics + Nicki Minaj's vibe + Eminem's flow = perfection. #Davido #NickiMinaj #Eminem",
  "Dream team: Nicki Minaj, Eminem, and Davido on one song. The world wouldn't survive! 🔥 #NickiMinaj #Eminem #Davido",
  "Fan edit needed: Davido verse over Eminem beat with Nicki Minaj ad-libs. #Davido #Eminem #NickiMinaj",
  "Eminem is killing it this year. Davido and Nicki Minaj are close behind though. #Eminem #Davido #NickiMinaj",
  "2025 belongs to Davido, Nicki Minaj, and Eminem. Legends dominating! #Davido #NickiMinaj #Eminem",
  "Fan edit needed: Eminem verse over Davido beat with Nicki Minaj ad-libs. #Eminem #Davido #NickiMinaj",
  "2025 belongs to Davido, Eminem, and Nicki Minaj. Legends dominating! #Davido #Eminem #NickiMinaj",
  "Dream team: Davido, Eminem, and Nicki Minaj on one song. The world wouldn't survive! 🔥 #Davido #Eminem #NickiMinaj",
  "Fan edit needed: Nicki Minaj verse over Davido beat with Eminem ad-libs. #NickiMinaj #Davido #Eminem",
  "If Eminem and Nicki Minaj made a song with Davido's energy, it would break records. #Eminem #NickiMinaj #Davido",
  "2025 belongs to Nicki Minaj, Eminem, and Davido. Legends dominating! #NickiMinaj #Eminem #Davido",
  "Fan edit needed: Nicki Minaj verse over Eminem beat with Davido ad-libs. #NickiMinaj #Eminem #Davido",
  "2025 belongs to Nicki Minaj, Davido, and Eminem. Legends dominating! #NickiMinaj #Davido #Eminem",
  "Who wins in a feature: Nicki Minaj on a Davido beat or Eminem spitting bars? #NickiMinaj #Davido #Eminem",
  "Davido concert was insane! Wish Nicki Minaj and Eminem were guests. #Davido #NickiMinaj #Eminem",
  "If Davido and Nicki Minaj made a song with Eminem's energy, it would break records. #Davido #NickiMinaj #Eminem",
];




const coinPackages = [
  {
    name: "Starter Pack",
    amount: 30,
    price: 0.42,
    bonus: 10,
    ngnBonus: 10,
    ngnPrice: 560,
  },
  {
    name: "Bronze Pack",
    amount: 85,
    price: 1.18,
    bonus: 20,
    ngnBonus: 20,
    ngnPrice: 1_590,
  },

  {
    name: "Silver Pack",
    amount: 100,
    price: 1.37,
    bonus: 30,
    ngnBonus: 30,
    ngnPrice: 1_950,
  },
  {
    name: "Gold Pack",
    amount: 277,
    price: 3.75,
    bonus: 40,
    ngnBonus: 40,
    ngnPrice: 5_515,
  },
  {
    name: "Elite Pack",
    amount: 320,
    price: 4.32,
    bonus: 50,
    ngnBonus: 50,
    ngnPrice: 6_315,
  },
  {
    name: "Pro Pack",
    amount: 635,
    price: 8.57,
    bonus: 60,
    ngnBonus: 60,
    ngnPrice: 12_640,
  },
  {
    name: "Mega Pack",
    amount: 1280,
    price: 17.15,
    bonus: 70,
    ngnBonus: 70,
    ngnPrice: 25_550,
  },
  {
    name: "Ultra Pack",
    amount: 5305,
    price: 70.5,
    bonus: 80,
    ngnBonus: 80,
    ngnPrice: 103_325,
  },
  {
    name: "Master Pack",
    amount: 10505,
    price: 138.6,
    bonus: 90,
    ngnBonus: 90,
    ngnPrice: 200_690,
  },
  {
    name: "Legend Pack",
    amount: 25500,
    price: 336.6,
    bonus: 100,
    ngnBonus: 100,
    ngnPrice: 475_390,
  },
  {
    name: "Titan Pack",
    amount: 70000,
    price: 915,
    bonus: 110,
    ngnBonus: 110,
    ngnPrice: 1_308_000,
  },
  {
    name: "Giant Pack",
    amount: 100_000,
    price: 1300,
    bonus: 120,
    ngnBonus: 120,
    ngnPrice: 1_860_000,
  },
  {
    name: "Colossal Pack",
    amount: 145_000,
    price: 1870.5,
    bonus: 130,
    ngnBonus: 130,
    ngnPrice: 2_690_250,
  },
  {
    name: "Zenith Pack",
    amount: 187_000,
    price: 2393.6,
    bonus: 140,
    ngnBonus: 140,
    ngnPrice: 3_450_440,
  },
  {
    name: "Infinity Pack",
    amount: 205_000,
    price: 2605.3,
    bonus: 150,
    ngnBonus: 150,
    ngnPrice: 3_780_000,
  },
];

// const coinPackages = [
//   { name: "Starter Pack", amount: 110, price: 50, bonus: 0 },
//   { name: "Basic Pack", amount: 230, price: 100, bonus: 0 },
//   { name: "Bronze Pack", amount: 350, price: 170, bonus: 0 },
//   { name: "Silver Pack", amount: 460, price: 200, bonus: 0 },
//   { name: "Gold Pack", amount: 570, price: 260, bonus: 50 },
//   { name: "Elite Pack", amount: 1_100, price: 500, bonus: 105 },
//   { name: "Pro Pack", amount: 2_000, price: 1005, bonus: 410 },
//   { name: "Mega Pack", amount: 5_000, price: 2200, bonus: 500 },
//   { name: "Ultra Pack", amount: 10_100, price: 5100, bonus: 1200 },
//   { name: "Master Pack", amount: 20_300, price: 10_000, bonus: 3300 },
//   { name: "Legend Pack", amount: 41_000, price: 22_000, bonus: 7100 },
//   { name: "Titan Pack", amount: 88_500, price: 45_000, bonus: 15_000 },
//   { name: "Giant Pack", amount: 180_000, price: 80_000, bonus: 25_000 },
//   { name: "Colossal Pack", amount: 300_500, price: 140_000, bonus: 70_000 },
//   { name: "Zenith Pack", amount: 500_000, price: 220_000, bonus: 100_000 }, // NEW
//   { name: "Infinity Pack", amount: 700_500, price: 300_000, bonus: 150_000 },
// ];

// Stable randomized prices: small gifts, celebrations, luxury gifts and premium landmarks.
export const tipPackages = [
  {
    "id": "party-prism",
    "name": "Party Prism",
    "price": 150,
    "thumbnail": "/static/tips/party-prism.webp"
  },
  {
    "id": "golden-fizz",
    "name": "Golden Fizz",
    "price": 300,
    "thumbnail": "/static/tips/golden-fizz.webp"
  },
  {
    "id": "petal-elixir",
    "name": "Petal Elixir",
    "price": 475,
    "thumbnail": "/static/tips/petal-elixir.webp"
  },
  {
    "id": "coral-smooch",
    "name": "Coral Smooch",
    "price": 10,
    "thumbnail": "/static/tips/coral-smooch.webp"
  },
  {
    "id": "cupid-comet",
    "name": "Cupid Comet",
    "price": 525,
    "thumbnail": "/static/tips/cupid-comet.webp"
  },
  {
    "id": "secret-ember",
    "name": "Secret Ember",
    "price": 200,
    "thumbnail": "/static/tips/secret-ember.webp"
  },
  {
    "id": "heart-snapshot",
    "name": "Heart Snapshot",
    "price": 475,
    "thumbnail": "/static/tips/heart-snapshot.webp"
  },
  {
    "id": "moonpetal-pearls",
    "name": "Moonpetal Pearls",
    "price": 3350,
    "thumbnail": "/static/tips/moonpetal-pearls.webp"
  },
  {
    "id": "blush-cruiser",
    "name": "Blush Cruiser",
    "price": 3400,
    "thumbnail": "/static/tips/blush-cruiser.webp"
  },
  {
    "id": "solar-parade",
    "name": "Solar Parade",
    "price": 12000,
    "thumbnail": "/static/tips/solar-parade.webp"
  },
  {
    "id": "reef-reverie",
    "name": "Reef Reverie",
    "price": 625,
    "thumbnail": "/static/tips/reef-reverie.webp"
  },
  {
    "id": "peel-pop",
    "name": "Peel Pop",
    "price": 35,
    "thumbnail": "/static/tips/peel-pop.webp"
  },
  {
    "id": "bloom-breeze",
    "name": "Bloom Breeze",
    "price": 125,
    "thumbnail": "/static/tips/bloom-breeze.webp"
  },
  {
    "id": "velvet-bloom",
    "name": "Velvet Bloom",
    "price": 35,
    "thumbnail": "/static/tips/velvet-bloom.webp"
  },
  {
    "id": "starlace",
    "name": "Starlace",
    "price": 1950,
    "thumbnail": "/static/tips/starlace.webp"
  },
  {
    "id": "indigo-devotion",
    "name": "Indigo Devotion",
    "price": 2600,
    "thumbnail": "/static/tips/indigo-devotion.webp"
  },
  {
    "id": "spark-fiesta",
    "name": "Spark Fiesta",
    "price": 325,
    "thumbnail": "/static/tips/spark-fiesta.webp"
  },
  {
    "id": "cuddle-duo",
    "name": "Cuddle Duo",
    "price": 25,
    "thumbnail": "/static/tips/cuddle-duo.webp"
  },
  {
    "id": "amber-citadel",
    "name": "Amber Citadel",
    "price": 11750,
    "thumbnail": "/static/tips/amber-citadel.webp"
  },
  {
    "id": "sky-bonbon",
    "name": "Sky Bonbon",
    "price": 600,
    "thumbnail": "/static/tips/sky-bonbon.webp"
  },
  {
    "id": "violet-keep",
    "name": "Violet Keep",
    "price": 11250,
    "thumbnail": "/static/tips/violet-keep.webp"
  },
  {
    "id": "kindred-light",
    "name": "Kindred Light",
    "price": 175,
    "thumbnail": "/static/tips/kindred-light.webp"
  },
  {
    "id": "cloud-pavilion",
    "name": "Cloud Pavilion",
    "price": 11750,
    "thumbnail": "/static/tips/cloud-pavilion.webp"
  },
  {
    "id": "halo-heart",
    "name": "Halo Heart",
    "price": 550,
    "thumbnail": "/static/tips/halo-heart.webp"
  },
  {
    "id": "crimson-wishes",
    "name": "Crimson Wishes",
    "price": 200,
    "thumbnail": "/static/tips/crimson-wishes.webp"
  },
  {
    "id": "confetti-curl",
    "name": "Confetti Curl",
    "price": 10,
    "thumbnail": "/static/tips/confetti-curl.webp"
  },
  {
    "id": "cocoa-charm",
    "name": "Cocoa Charm",
    "price": 50,
    "thumbnail": "/static/tips/cocoa-charm.webp"
  },
  {
    "id": "boba-bliss",
    "name": "Boba Bliss",
    "price": 10,
    "thumbnail": "/static/tips/boba-bliss.webp"
  },
  {
    "id": "ruby-harvest",
    "name": "Ruby Harvest",
    "price": 35,
    "thumbnail": "/static/tips/ruby-harvest.webp"
  },
  {
    "id": "morning-muse",
    "name": "Morning Muse",
    "price": 40,
    "thumbnail": "/static/tips/morning-muse.webp"
  },
  {
    "id": "cloudstep",
    "name": "Cloudstep",
    "price": 5,
    "thumbnail": "/static/tips/cloudstep.webp"
  },
  {
    "id": "sunset-stroll",
    "name": "Sunset Stroll",
    "price": 55,
    "thumbnail": "/static/tips/sunset-stroll.webp"
  },
  {
    "id": "gilded-orbit",
    "name": "Gilded Orbit",
    "price": 2700,
    "thumbnail": "/static/tips/gilded-orbit.webp"
  },
  {
    "id": "aurora-crest",
    "name": "Aurora Crest",
    "price": 2700,
    "thumbnail": "/static/tips/aurora-crest.webp"
  },
  {
    "id": "forever-fountain",
    "name": "Forever Fountain",
    "price": 6250,
    "thumbnail": "/static/tips/forever-fountain.webp"
  },
  {
    "id": "aqua-ace",
    "name": "Aqua Ace",
    "price": 700,
    "thumbnail": "/static/tips/aqua-ace.webp"
  },
  {
    "id": "prism-pony",
    "name": "Prism Pony",
    "price": 1400,
    "thumbnail": "/static/tips/prism-pony.webp"
  },
  {
    "id": "twirl-fair",
    "name": "Twirl Fair",
    "price": 1500,
    "thumbnail": "/static/tips/twirl-fair.webp"
  },
  {
    "id": "silk-sonata",
    "name": "Silk Sonata",
    "price": 1350,
    "thumbnail": "/static/tips/silk-sonata.webp"
  },
  {
    "id": "rosette-promise",
    "name": "Rosette Promise",
    "price": 2200,
    "thumbnail": "/static/tips/rosette-promise.webp"
  },
  {
    "id": "swirl-joy",
    "name": "Swirl Joy",
    "price": 20,
    "thumbnail": "/static/tips/swirl-joy.webp"
  },
  {
    "id": "fin-affection",
    "name": "Fin Affection",
    "price": 200,
    "thumbnail": "/static/tips/fin-affection.webp"
  },
  {
    "id": "wonder-vault",
    "name": "Wonder Vault",
    "price": 650,
    "thumbnail": "/static/tips/wonder-vault.webp"
  },
  {
    "id": "net-glory",
    "name": "Net Glory",
    "price": 700,
    "thumbnail": "/static/tips/net-glory.webp"
  },
  {
    "id": "frothy-cheer",
    "name": "Frothy Cheer",
    "price": 700,
    "thumbnail": "/static/tips/frothy-cheer.webp"
  },
  {
    "id": "victory-muse",
    "name": "Victory Muse",
    "price": 175,
    "thumbnail": "/static/tips/victory-muse.webp"
  },
  {
    "id": "champion-haven",
    "name": "Champion Haven",
    "price": 10750,
    "thumbnail": "/static/tips/champion-haven.webp"
  },
  {
    "id": "heart-overflow",
    "name": "Heart Overflow",
    "price": 600,
    "thumbnail": "/static/tips/heart-overflow.webp"
  },
  {
    "id": "love-aloft",
    "name": "Love Aloft",
    "price": 575,
    "thumbnail": "/static/tips/love-aloft.webp"
  },
  {
    "id": "ever-after-arch",
    "name": "Ever After Arch",
    "price": 5250,
    "thumbnail": "/static/tips/ever-after-arch.webp"
  }
];


const gameMilestones = [
  // room winning streak
  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIVE_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 20,
    milestone: 5,
    thumbnail: "/static/badges/silver-4.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TEN_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 30,
    milestone: 10,
    thumbnail: "/static/badges/silver-3.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TWENTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 55,
    milestone: 20,
    thumbnail: "/static/badges/silver-2.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIFTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 75,
    milestone: 50,
    thumbnail: "/static/badges/silver-1.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.HUNDRED_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 100,
    milestone: 100,
    thumbnail: "/static/badges/gold-1.jpeg",
  },

  // week
  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.TOP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 100,
    milestone: 1,
    thumbnail: "/static/badges/gold-1.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 85,
    milestone: 2,
    thumbnail: "/static/badges/gold-2.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 70,
    milestone: 3,
    thumbnail: "/static/badges/gold-3.jpeg",
  },

  // Month
  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.TOP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 300,
    milestone: 1,
    thumbnail: "/static/badges/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 200,
    milestone: 2,
    thumbnail: "/static/badges/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 100,
    milestone: 3,
    thumbnail: "/static/badges/gold-6.jpeg",
  },

  // Year
  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.TOP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 500,
    milestone: 1,
    thumbnail: "/static/badges/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 350,
    milestone: 2,
    thumbnail: "/static/badges/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 200,
    milestone: 3,
    thumbnail: "/static/badges/gold-6.jpeg",
  },
  //   champ
  {
    name: MilestoneNameEnum.CHAMP,
    reason: RewardReasonEnum.CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 600,
    milestone: 1,
    thumbnail: "/static/badges/diamond-1.jpeg",
  },

  {
    name: MilestoneNameEnum.GRAND_CHAMP,
    reason: RewardReasonEnum.GRAND_CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 700,
    milestone: 1,
    thumbnail: "/static/badges/diamond-2.jpeg",
  },
];

type Game = {
  name: string;
  description: string;
  categories: {
    name: string;
    description: string;
    topics: string[];
    rooms: {
      name: string;
      description: string;
    }[];
  }[];
};

/** Room labels identify spaces to play; they never narrow the category content. */
export function genericGameRooms(categoryName: string, count: number, activity = false) {
  return Array.from({length: count}, (_, index) => ({
    name: `Room ${index + 1}`,
    description: activity
      ? `Play in this room. All rooms use the same category content and rules.`
      : `Play in this room using the full ${categoryName} question pool. All rooms cover the same category topics.`,
  }));
}

const games: Game[] = [
  {
    name: "Trivia & Quiz",
    description:
      "Fast-paced games requiring quick thinking, precise timing, and swift reactions",
    categories: [
      {
        name: "Themed Quest",
        description: "Embark on a journey through themed challenges",
        topics: [
          "Olympic Games",
          "Famous Athletes",
          "Football & Basketball",
          "Esports & Gaming",
          "Unusual Sports",
          "Board Games Trivia",
          "Cricket & Baseball",
          "Extreme Sports",
        ],
        rooms: genericGameRooms("Themed Quest", 30, false),
      },
      {
        name: "Science & Technology",
        description:
          "Dive into the wonders of science and technological advancements.",
        topics: [
          "Space Exploration",
          "Scientific Discoveries",
          "Animal Kingdom",
          "The Solar System",
          "Human Anatomy",
          "Physics in Action",
          "Chemistry Around Us",
          "Breakthrough Experiments",
          "Famous Scientists",
          "Physics in Everyday Life",
          "Human Evolution",
        ],
        rooms: genericGameRooms("Science & Technology", 30, false),
      },
      {
        name: "History & Geography",
        description: "Learn about historical events and geographic wonders.",
        topics: [
          "Ancient Civilizations",
          "World Wars",
          "Historic Inventions",
          "Geographic Wonders",
          "Capitals & Countries",
          "Historic Leaders",
          "Revolutions in History",
          "Famous Explorers",
        ],
        rooms: genericGameRooms("History & Geography", 30, false),
      },
      {
        name: "Pop Culture",
        description:
          "Test your knowledge of movies, TV, music, and celebrities.",
        topics: [
          "Movies & TV",
          "Famous Books",
          "Music Through the Decades",
          "Superheroes & Comics",
          "Internet Culture",
          "Celebrity Gossip",
          "Animation & Cartoons",
          "Streaming Platforms",
        ],
        rooms: genericGameRooms("Pop Culture", 48, false),
      },
      {
        name: "Culture & Lifestyle",
        description:
          "Discover cultural traditions and lifestyle trends around the world.",
        topics: [
          "Famous Foods & Drinks",
          "World Festivals",
          "Fashion Through History",
          "Art Movements",
          "Myths & Legends",
          "Indigenous Tribes",
          "Traditional Dances",
        ],
        rooms: genericGameRooms("Culture & Lifestyle", 30, false),
      },
      {
        name: "Literature & Language",
        description: "Celebrate the beauty of words, literature, and language.",
        topics: [
          "Famous Quotes",
          "Word Origins",
          "Global Languages",
          "Classic Novels",
          "Literary Genres",
          "Poetry Across Cultures",
          "Famous Authors",
          "Word Play and Riddles",
        ],
        rooms: genericGameRooms("Literature & Language", 30, false),
      },
      {
        name: "Entertainment & Media",
        description:
          "From Hollywood to the internet, dive into entertainment trivia.",
        topics: [
          "Hollywood Trivia",
          "Iconic TV Shows",
          "Award Ceremonies",
          "Famous Directors",
          "Internet Trends",
          "Viral Videos",
          "Movie Quotes",
          "Video Games Evolution",
        ],
        rooms: genericGameRooms("Entertainment & Media", 30, false),
      },
      {
        name: "Nature & Environment",
        description: "Explore the beauty and challenges of the natural world.",
        topics: [
          "Endangered Species",
          "National Parks",
          "Natural Disasters",
          "Environmental Activism",
          "Plants & Trees",
          "Ocean Mysteries",
          "Global Wildlife",
          "Conservation Heroes",
        ],
        rooms: genericGameRooms("Nature & Environment", 30, false),
      },
      {
        name: "Technology Trends",
        description:
          "Keep up with the latest trends in technology and innovation.",
        topics: [
          "Innovations of the 21st Century",
          "Famous Tech Companies",
          "History of Computers",
          "Smartphones & Gadgets",
          "Artificial Intelligence",
          "Renewable Energy",
          "Virtual Reality",
          "Robotics",
        ],
        rooms: genericGameRooms("Technology Trends", 30, false),
      },
      {
        name: "World Cultures",
        description: "Learn about global cultures, religions, and traditions.",
        topics: [
          "Global Religions",
          "Exotic Customs",
          "Unique Festivals",
          "Cultural Etiquettes",
          "Iconic Artifacts",
          "World Cuisines",
          "Legendary Kings and Queens",
          "Languages of the World",
        ],
        rooms: genericGameRooms("World Cultures", 30, false),
      },
      {
        name: "Fun & Riddles",
        description: "Enjoy brain-teasing puzzles and entertaining trivia.",
        topics: [
          "Brain Teasers",
          "Logical Puzzles",
          "Tongue Twisters",
          "Word Scrambles",
          "General Fun Facts",
        ],
        rooms: genericGameRooms("Fun & Riddles", 30, false),
      },
      {
        name: "Travel & Destinations",
        description: "Discover iconic landmarks and hidden travel gems.",
        topics: [
          "Famous Landmarks",
          "Exotic Beaches",
          "Hidden Travel Gems",
          "Travel Tips & Hacks",
          "UNESCO Heritage Sites",
          "World's Largest Cities",
          "Adventure Destinations",
          "Iconic Mountains",
        ],
        rooms: genericGameRooms("Travel & Destinations", 30, false),
      },
      {
        name: "Myths & Legends",
        description:
          "Uncover myths, legends, and folklore from around the world.",
        topics: [
          "Greek Mythology",
          "Folklore Tales",
          "Urban Legends",
          "Legendary Heroes",
          "Mythical Creatures",
          "Norse Mythology",
          "Asian Legends",
          "Ancient Deities",
        ],
        rooms: genericGameRooms("Myths & Legends", 30, false),
      },
      {
        name: "Health & Wellness",
        description:
          "Trivia about health, wellness, and medical breakthroughs.",
        topics: [
          "Famous Medical Discoveries",
          "Fitness Trends",
          "Nutrition & Diet",
          "Alternative Medicine",
          "Mental Health Awareness",
          "Herbal Remedies",
          "Famous Doctors",
          "History of Medicine",
        ],
        rooms: genericGameRooms("Health & Wellness", 30, false),
      },
      {
        name: "Fashion & Trends",
        description: "Explore the world of fashion, designers, and trends.",
        topics: [
          "Runway Hits",
          "Famous Designers",
          "Decades of Style",
          "Accessory Trends",
          "Sustainable Fashion",
          "Street Style",
          "Haute Couture",
          "Iconic Fashion Moments",
        ],
        rooms: genericGameRooms("Fashion & Trends", 30, false),
      },
      {
        name: "Technology Innovations",
        description: "Discover how technology shapes our world.",
        topics: [
          "Space Technologies",
          "Breakthrough Gadgets",
          "The Internet Evolution",
          "Blockchain and Cryptocurrencies",
          "Future of Technology",
          "Autonomous Vehicles",
          "Smart Cities",
          "AI and Ethics",
        ],
        rooms: genericGameRooms("Technology Innovations", 30, false),
      },
      {
        name: "Business & Economy",
        description:
          "Test your knowledge of global business and economic facts.",
        topics: [
          "Stock Market Facts",
          "Global Trade",
          "Famous Entrepreneurs",
          "History of Money",
          "Billion-Dollar Companies",
          "Startup Culture",
          "Economic Theories",
          "Business Scandals",
        ],
        rooms: genericGameRooms("Business & Economy", 30, false),
      },
      {
        name: "Music & Arts",
        description: "Trivia about music, arts, and cultural expression.",
        topics: [
          "Famous Composers",
          "Afrobeat",
          "Hip Hop",
          "Rnb",
          "Country Music",
          "Pop Music",
          "Iconic Paintings",
          "Instruments Across Cultures",
          "Street Art & Graffiti",
          "Music Awards",
          "Album Cover Trivia",
          "The History of Opera",
          "Evolution of Dance",
        ],
        rooms: genericGameRooms("Music & Arts", 30, false),
      },
      {
        name: "Geography Facts",
        description: "Expand your knowledge about Earth's geography.",
        topics: [
          "Mountains & Peaks",
          "Deserts of the World",
          "Rivers & Oceans",
          "Unique Countries",
          "Climate Zones",
          "Geopolitical Trivia",
          "Island Nations",
          "Famous World Borders",
        ],
        rooms: genericGameRooms("Geography Facts", 30, false),
      },
      {
        name: "Space Mysteries",
        description: "Explore the mysteries of outer space.",
        topics: [
          "Black Holes",
          "The Milky Way",
          "Mars Exploration",
          "Exoplanets",
          "Space Missions",
          "Astronomical Events",
          "Theories of the Universe",
          "Space-Time Concepts",
        ],
        rooms: genericGameRooms("Space Mysteries", 30, false),
      },
      {
        name: "Historical Eras",
        description:
          "Learn about key historical periods and their significance.",
        topics: [
          "The Renaissance",
          "The Industrial Revolution",
          "The Medieval Period",
          "The Enlightenment",
          "The Cold War",
          "Ancient Empires",
          "Colonial Histories",
          "The Age of Exploration",
        ],
        rooms: genericGameRooms("Historical Eras", 30, false),
      },
      {
        name: "Food & Drinks",
        description: "Discover trivia about culinary delights and beverages.",
        topics: [
          "Culinary Styles",
          "Famous Cocktails",
          "Street Foods",
          "Iconic Dishes",
          "Global Ingredients",
          "Food History",
          "Dessert Specialties",
          "Drinks Around the World",
        ],
        rooms: genericGameRooms("Food & Drinks", 30, false),
      },
      {
        name: "Famous People",
        description: "Trivia about influential figures throughout history.",
        topics: [
          "World Leaders",
          "Influential Women",
          "Inventors & Thinkers",
          "Revolutionaries",
          "Explorers & Adventurers",
          "Celebrities Who Changed the World",
          "Scientists and Mathematicians",
          "Philosophers and Theologians",
        ],
        rooms: genericGameRooms("Famous People", 30, false),
      },
      {
        name: "Festivals & Celebrations",
        description: "Trivia about global festivals and iconic celebrations.",
        topics: [
          "Carnival Traditions",
          "Winter Festivals",
          "Harvest Celebrations",
          "Religious Holidays",
          "Music Festivals",
          "National Holidays",
          "Iconic Global Events",
          "Local Parades",
        ],
        rooms: genericGameRooms("Festivals & Celebrations", 30, false),
      },
      {
        name: "Quirky & Bizarre",
        description: "Weird and quirky trivia to surprise and amaze.",
        topics: [
          "Odd Jobs",
          "Strange Laws",
          "Unusual Inventions",
          "Rare Animal Species",
          "Weird World Records",
          "Bizarre Foods",
          "Crazy Rituals",
          "Outlandish Events",
        ],
        rooms: genericGameRooms("Quirky & Bizarre", 30, false),
      },
      {
        name: "Urban Life",
        description: "Trivia about cities, urban development, and cultures.",
        topics: [
          "City Skylines",
          "Megacities",
          "Famous Streets",
          "Urban Development",
          "Transportation Systems",
          "The Rise of Suburbs",
          "Urban Legends",
          "Historical Cities",
        ],
        rooms: genericGameRooms("Urban Life", 30, false),
      },
      {
        name: "Internet & Technology",
        description: "Trivia about the internet and digital culture.",
        topics: [
          "Evolution of Social Media",
          "Online Security Tips",
          "The Rise of E-commerce",
          "Internet Memes",
          "Famous Websites",
          "Gaming Communities",
          "Online Trends",
          "Digital Influencers",
        ],
        rooms: genericGameRooms("Internet & Technology", 30, false),
      },
      {
        name: "Time & Space",
        description: "Learn about the mysteries of time and space.",
        topics: [
          "Ancient Calendars",
          "Timekeeping Devices",
          "Measuring Distance",
          "Theories of Relativity",
          "Space-Time Paradoxes",
          "Evolution of Clocks",
          "Time Travel in Fiction",
          "Cosmic Timelines",
        ],
        rooms: genericGameRooms("Time & Space", 30, false),
      },
      {
        name: "War & Conflict",
        description: "Trivia about wars, battles, and historical conflicts.",
        topics: [
          "Revolutionary Wars",
          "Military Tactics",
          "Cold War Espionage",
          "Naval Battles",
          "Famous Generals",
          "Civil Wars",
          "Modern Conflicts",
          "Peace Treaties",
        ],
        rooms: genericGameRooms("War & Conflict", 30, false),
      },
      {
        name: "Psychology & Philosophy",
        description:
          "Explore the depths of the mind and profound philosophical ideas.",
        topics: [
          "Famous Philosophers",
          "Cognitive Biases",
          "Psychology Theories",
          "Human Emotions",
          "Thought Experiments",
          "Existential Questions",
          "Behavioral Science",
          "Personality Types",
        ],
        rooms: genericGameRooms("Psychology & Philosophy", 30, false),
      },
      {
        name: "Mythology Around the World",
        description:
          "Delve into myths, legends, and deities from different cultures worldwide.",
        topics: [
          "Celtic Myths",
          "African Folklore",
          "Indian Epics",
          "Japanese Kami Legends",
          "Native American Myths",
          "Mesopotamian Gods",
          "Australian Dreamtime",
          "Slavic Folklore",
        ],
        rooms: genericGameRooms("Mythology Around the World", 30, false),
      },
      {
        name: "Inventions & Discoveries",
        description:
          "Trivia about human ingenuity and scientific breakthroughs.",
        topics: [
          "Famous Inventors",
          "Groundbreaking Patents",
          "Space Innovations",
          "Medical Milestones",
          "Transportation Revolutions",
          "The Age of Electricity",
          "Everyday Inventions",
          "Technological Marvels",
        ],
        rooms: genericGameRooms("Inventions & Discoveries", 30, false),
      },
    ],
  },
  {
    name: "Acronym Arcade",
    description:
      "Test your wit and speed in this fun-filled game of guessing acronyms — perfect for quick thinkers!",
    categories: [
      {
        name: "Pop Culture & Slang",
        description:
          "Acronyms derived from movies, TV shows, music, internet trends, and common texting slang.",
        topics: [
          "Movies",
          "TV Shows",
          "Music Genres",
          "Internet Memes",
          "Texting Slang",
        ],
        rooms: genericGameRooms("Pop Culture & Slang", 30, false),
      },
      {
        name: "Business & Corporate",
        description:
          "Acronyms used in industries, corporate communication, and professional terminology.",
        topics: [
          "Corporate Titles",
          "Startup Terms",
          "Marketing Jargon",
          "Finance Terms",
          "Project Management",
        ],
        rooms: genericGameRooms("Business & Corporate", 30, false),
      },

      {
        name: "Science & Technology",
        description:
          "Acronyms related to scientific discoveries, innovations, and technological concepts.",
        topics: [
          "Physics",
          "Biology",
          "Computer Science",
          "Space Exploration",
          "Artificial Intelligence",
        ],
        rooms: genericGameRooms("Science & Technology", 30, false),
      },

      {
        name: "Government, Politics & Law",
        description:
          "Acronyms tied to government agencies, political terms, and legal systems.",
        topics: [
          "Government Agencies",
          "Political Parties",
          "Constitutional Terms",
          "Military Organizations",
          "Legal Terms",
        ],
        rooms: genericGameRooms("Government, Politics & Law", 30, false),
      },

      {
        name: "Sports & Gaming",
        description:
          "Acronyms from sports leagues, teams, gaming culture, and esports.",
        topics: [
          "Football Leagues",
          "Video Games",
          "Board Games",
          "Sports Teams",
          "Gaming Strategies",
        ],
        rooms: genericGameRooms("Sports & Gaming", 30, false),
      },
      {
        name: "Health & Wellness",
        description:
          "Acronyms related to fitness, nutrition, medical terms, and wellness practices.",
        topics: [
          "Fitness Techniques",
          "Nutrition Plans",
          "Medical Terms",
          "Mental Health",
          "Healthcare Professions",
        ],
        rooms: genericGameRooms("Health & Wellness", 30, false),
      },

      {
        name: "Education & Academics",
        description:
          "Acronyms from schools, universities, and academic research.",
        topics: [
          "Educational Degrees",
          "School Subjects",
          "Research Fields",
          "Academic Institutions",
          "Standardized Tests",
        ],
        rooms: genericGameRooms("Education & Academics", 0, false),
      },
      {
        name: "Travel & Geography",
        description:
          "Acronyms associated with travel, locations, and geographical landmarks.",
        topics: [
          "Airports",
          "Country Codes",
          "Geographical Landmarks",
          "Travel Agencies",
          "Transportation Modes",
        ],
        rooms: genericGameRooms("Travel & Geography", 30, false),
      },
      {
        name: "Historical & Cultural",
        description:
          "Acronyms tied to historical events, cultural movements, and traditions.",
        topics: [
          "Historical Events",
          "Cultural Organizations",
          "Festivals",
          "Historical Figures",
          "Cultural Movements",
        ],
        rooms: genericGameRooms("Historical & Cultural", 30, false),
      },
      {
        name: "Entertainment & Media",
        description:
          "Acronyms from the entertainment industry, including awards and productions.",
        topics: [
          "Award Shows",
          "Streaming Platforms",
          "Media Companies",
          "Movie Franchises",
          "TV Networks",
        ],
        rooms: genericGameRooms("Entertainment & Media", 30, false),
      },

      {
        name: "Finance & Economics",
        description:
          "Acronyms used in banking, investments, and economic discussions.",
        topics: [
          "Banking Terms",
          "Stock Market",
          "Cryptocurrencies",
          "Economic Theories",
          "Investment Strategies",
        ],
        rooms: genericGameRooms("Finance & Economics", 30, false),
      },

      {
        name: "Environment & Conservation",
        description:
          "Acronyms about sustainability, environmental organizations, and conservation efforts.",
        topics: [
          "Climate Change",
          "Sustainability Programs",
          "Conservation Organizations",
          "Recycling Initiatives",
          "Environmental Laws",
        ],
        rooms: genericGameRooms("Environment & Conservation", 30, false),
      },
      {
        name: "Fashion & Lifestyle",
        description:
          "Acronyms from fashion trends, lifestyle habits, and popular brands.",
        topics: [
          "Fashion Trends",
          "Beauty Brands",
          "Lifestyle Choices",
          "Fitness Trends",
          "Clothing Lines",
        ],
        rooms: genericGameRooms("Fashion & Lifestyle", 30, false),
      },
      {
        name: "Military & Defense",
        description:
          "Acronyms related to military operations, strategies, and equipment.",
        topics: [
          "Military Ranks",
          "Defense Strategies",
          "Weapon Systems",
          "Peacekeeping Missions",
          "Military Bases",
        ],
        rooms: genericGameRooms("Military & Defense", 30, false),
      },
      {
        name: "Daily Life & General Knowledge",
        description:
          "Acronyms encountered in everyday life and general trivia.",
        topics: [
          "Household Items",
          "Common Phrases",
          "Everyday Services",
          "Public Transportation",
          "Popular Apps",
        ],
        rooms: genericGameRooms("Daily Life & General Knowledge", 30, false),
      },
    ],
  },
  {
    name: "Academia Adventure",
    description:
      "Test your knowledge on everything from math to history and prove you're the ultimate academic adventurer",
    categories: [
      {
        name: "Mathematics",
        description:
          "Test your skills in various branches of mathematics, from algebra to calculus.",
        topics: [
          "Algebra",
          "Geometry",
          "Calculus",
          "Trigonometry",
          "Statistics",
          "Probability",
        ],
        rooms: genericGameRooms("Mathematics", 30, false),
      },

      {
        name: "Science",
        description:
          "Dive into the world of science and explore topics from biology to physics.",
        topics: [
          "Physics",
          "Chemistry",
          "Biology",
          "Earth Science",
          "Astronomy",
          "Genetics",
        ],
        rooms: genericGameRooms("Science", 30, false),
      },

      {
        name: "History",
        description:
          "Explore the past, from ancient civilizations to modern history.",
        topics: [
          "Ancient Civilizations",
          "World History",
          "U.S. History",
          "Historical Events",
          "Wars and Conflicts",
          "Famous Leaders",
        ],
        rooms: genericGameRooms("History", 30, false),
      },
      {
        name: "Literature",
        description:
          "Test your knowledge of literature, from famous authors to literary terms.",
        topics: [
          "Famous Authors",
          "Poetry",
          "Novels",
          "Literary Terms",
          "Genres",
          "Book Summaries",
        ],
        rooms: genericGameRooms("Literature", 30, false),
      },
      {
        name: "Geography",
        description:
          "Learn about the world's countries, capitals, and geography.",
        topics: [
          "Countries",
          "Capitals",
          "Landforms",
          "Climate Zones",
          "Continents",
          "Natural Wonders",
        ],
        rooms: genericGameRooms("Geography", 30, false),
      },
      {
        name: "Language Arts",
        description:
          "Master the art of grammar, writing, and reading comprehension.",
        topics: [
          "Grammar",
          "Vocabulary",
          "Reading Comprehension",
          "Writing Skills",
          "Punctuation",
          "Spelling",
        ],
        rooms: genericGameRooms("Language Arts", 30, false),
      },

      {
        name: "Art & Music",
        description:
          "Explore the worlds of art and music, from history to theory.",
        topics: [
          "Famous Artists",
          "Art History",
          "Music Theory",
          "Instruments",
          "Famous Composers",
          "Art Movements",
        ],
        rooms: genericGameRooms("Art & Music", 30, false),
      },
      {
        name: "Physical Education",
        description:
          "Learn about fitness, sports rules, and the importance of teamwork.",
        topics: [
          "Sports Rules",
          "Fitness",
          "Nutrition",
          "Teamwork",
          "Strength Training",
          "Cardio",
        ],
        rooms: genericGameRooms("Physical Education", 30, false),
      },
      {
        name: "Social Studies",
        description: "Explore society, culture, government, and economics.",
        topics: [
          "Government",
          "Economics",
          "Sociology",
          "Cultural Studies",
          "Political Systems",
          "Law",
        ],
        rooms: genericGameRooms("Social Studies", 30, false),
      },
      {
        name: "Technology",
        description:
          "Test your knowledge of technology, from programming to innovations.",
        topics: [
          "Computers",
          "Programming",
          "Innovations",
          "Digital Literacy",
          "Cybersecurity",
          "Artificial Intelligence",
        ],
        rooms: genericGameRooms("Technology", 30, false),
      },
      {
        name: "Foreign Languages",
        description: "Learn and test your skills in various foreign languages.",
        topics: ["Spanish", "French", "German", "Latin", "Mandarin", "Italian"],
        rooms: genericGameRooms("Foreign Languages", 30, false),
      },
      {
        name: "Philosophy & Logic",
        description:
          "Engage with thought-provoking topics in philosophy and logic.",
        topics: [
          "Famous Philosophers",
          "Logical Reasoning",
          "Ethics",
          "Thought Experiments",
          "Philosophical Theories",
          "Metaphysics",
        ],
        rooms: genericGameRooms("Philosophy & Logic", 30, false),
      },
      {
        name: "Environmental Studies",
        description:
          "Explore the wonders of nature and how we can protect our planet.",
        topics: [
          "Conservation",
          "Ecology",
          "Climate Change",
          "Renewable Energy",
          "Pollution",
          "Biodiversity",
        ],
        rooms: genericGameRooms("Environmental Studies", 30, false),
      },
      {
        name: "Health Education",
        description:
          "Jump into the world of health and wellness with fun and easy learning!",
        topics: [
          "Anatomy",
          "Nutrition",
          "Mental Health",
          "Personal Safety",
          "First Aid",
          "Public Health",
        ],
        rooms: genericGameRooms("Health Education", 30, false),
      },
      {
        name: "Current Events",
        description:
          "Keep up with the buzz and test your knowledge on what's happening around the globe!",
        topics: [
          "News",
          "Politics",
          "World Affairs",
          "Global Issues",
          "Environmental Policies",
          "Human Rights",
        ],
        rooms: genericGameRooms("Current Events", 30, false),
      },
    ],
  },
  {
    name: "Sports & Games",
    description:
      "Explore the world of sports, athletes, and games from popular global sports like football, soccer, basketball in a diverse array of questions and challenge participants",
    categories: [
      {
        name: "Football",
        description:
          "Kick off your knowledge and score big in the exciting world of football!",
        topics: [
          "FIFA World Cup",
          "Club Football",
          "National Teams",
          "Football Tactics",
          "Football History",
          "Football Positions",
          "Famous Football Players",
          "Football Leagues",
          "Referee Rules",
          "Football Equipment",
          "Olympic Games",
          "Famous Athletes",
          "Football & Basketball",
          "Esports & Gaming",
          "Unusual Sports",
          "Board Games Trivia",
          "Cricket & Baseball",
          "Extreme Sports",
        ],
        rooms: genericGameRooms("Football", 30, false),
      },
      {
        name: "TeamSports",
        description:
          "Get in the game and test your knowledge of all things team sports!",
        topics: [
          "Basketball",
          "Baseball",
          "Rugby",
          "Hockey (Field and Ice)",
          "Volleyball",
          "Lacrosse",
          "Water Polo",
          "Handball",
        ],
        rooms: genericGameRooms("TeamSports", 30, false),
      },
      {
        name: "Racquets",
        description:
          "Swing into action and test your knowledge of all things racquet sports!",
        topics: ["Tennis", "Badminton", "Table Tennis", "Squash", "Pickleball"],
        rooms: genericGameRooms("Racquets", 31, false),
      },
      {
        name: "Combat",
        description:
          "Step into the ring and test your skills in the world of fighting sports!",
        topics: ["Boxing", "MMA", "Wrestling", "Fencing"],
        rooms: genericGameRooms("Combat", 30, false),
      },
      {
        name: "Water",
        description:
          "Dive into the splashy world of water sports and make a big splash with your knowledge!",
        topics: [
          "Swimming",
          "Surfing",
          "Canoeing",
          "Sailing",
          "Rowing",
          "Water Polo",
        ],
        rooms: genericGameRooms("Water", 30, false),
      },
      {
        name: "Winter",
        description:
          "Chill out and have fun with cool trivia about sports on snow and ice!",
        topics: ["Skiing", "Snowboarding", "Ice Skating", "Speed Skating"],
        rooms: genericGameRooms("Winter", 30, false),
      },
      {
        name: "Adventure",
        description: "Get ready for thrilling challenges and wild outdoor fun!",
        topics: [
          "Rock Climbing",
          "Parkour",
          "Hiking",
          "Cycling",
          "Mountain Biking",
        ],
        rooms: genericGameRooms("Adventure", 30, false),
      },
      {
        name: "Motorsports",
        description:
          "Feel the rush of speed and roar of engines in thrilling races!",
        topics: ["Formula 1", "MotoGP", "Rally Racing", "NASCAR", "Go-Karting"],
        rooms: genericGameRooms("Motorsports", 30, false),
      },
      {
        name: "Strength",
        description:
          "Flex your muscles and test your knowledge of power-packed sports!",
        topics: [
          "Weightlifting",
          "Powerlifting",
          "CrossFit",
          "Strongman Competitions",
        ],
        rooms: genericGameRooms("Strength", 31, false),
      },
      {
        name: "Individual",
        description:
          "Show off your solo skills and master the game one play at a time!",
        topics: [
          "Golf",
          "Tennis",
          "Bowling",
          "Archery",
          "Snooker",
          "Billiards",
          "Darts",
        ],
        rooms: genericGameRooms("Individual", 30, false),
      },
      {
        name: "Equestrian",
        description:
          "Gallop into the exciting world of horse sports and riding skills!",
        topics: ["Horse Racing", "Polo", "Equestrian Jumping", "Dressage"],
        rooms: genericGameRooms("Equestrian", 30, false),
      },
      {
        name: "Extreme",
        description:
          "Get ready for thrills, spills, and adrenaline-pumping action!",
        topics: [
          "Skateboarding",
          "BMX",
          "Snowboarding",
          "Surfing",
          "Freestyle Motocross",
        ],
        rooms: genericGameRooms("Extreme", 30, false),
      },
      {
        name: "Ballgames",
        description:
          "Get ready to bounce, throw, and score in all kinds of ball sports!",
        topics: [
          "Golf",
          "Tennis",
          "Baseball",
          "Basketball",
          "Cricket",
          "Rugby",
          "Football",
        ],
        rooms: genericGameRooms("Ballgames", 30, false),
      },
      {
        name: "Track",
        description:
          "Dash, jump, and race your way through thrilling track events!",
        topics: ["Cycling", "Sprinting", "Hurdles", "Relay"],
        rooms: genericGameRooms("Track", 30, false),
      },
      {
        name: "Fitness",
        description:
          "Get moving and have fun with all things fitness and exercise!",
        topics: ["Gymnastics", "Pilates", "Yoga", "Martial Arts", "Zumba"],
        rooms: genericGameRooms("Fitness", 30, false),
      },
      {
        name: "Boards",
        description:
          "Ride the waves, slopes, and streets with board sports fun and excitement!",
        topics: ["Skateboarding", "Snowboarding", "Surfing", "Windsurfing"],
        rooms: genericGameRooms("Boards", 30, false),
      },
      {
        name: "WaterRacing",
        description:
          "Race across waves and waterways with speed and skill in water-based racing!",
        topics: ["Jet Skiing", "Canoeing", "Kayaking", "Sailing", "Rowing"],
        rooms: genericGameRooms("WaterRacing", 30, false),
      },
      {
        name: "Recreation",
        description:
          "Enjoy casual games and fun sports perfect for friends, family, and good times!",
        topics: [
          "Ultimate Frisbee",
          "Dodgeball",
          "Kickball",
          "Bocce Ball",
          "Horseshoes",
        ],
        rooms: genericGameRooms("Recreation", 30, false),
      },
      {
        name: "Social Sports",
        description:
          "Casual sports that bring friends together for fun and friendly competition.",
        topics: [
          "Softball",
          "Cricket",
          "Bowling",
          "Ping Pong",
          "Pool",
          "Darts",
        ],
        rooms: genericGameRooms("Social Sports", 30, false),
      },
      {
        name: "Esports",
        description:
          "Jump into the fast-paced world of competitive gaming and epic battles!",
        topics: [
          "League of Legends",
          "Fortnite",
          "Counter-Strike",
          "Call of Duty",
          "Dota 2",
        ],
        rooms: genericGameRooms("Esports", 30, false),
      },
    ],
  },
  {
    name: "MindMash",
    description:
      "Brain games that challenge your thinking and reflexes, featuring word puzzles, typing races, and problem-solving challenges.",
    categories: [
      {
        name: "TypeMania",
        description:
          "Race your fingers and show off your typing speed and accuracy!",
        topics: [],
        rooms: genericGameRooms("TypeMania", 30, true),
      },
      {
        name: "Hangman",
        description:
          "Guess letters to reveal the hidden word before the hangman is complete!",
        topics: [],
        rooms: genericGameRooms("Hangman", 30, true),
      },
      {
        name: "Anagram",
        description:
          "Rearrange the letters to create new words and solve the puzzle!",
        topics: [],
        rooms: genericGameRooms("Anagram", 30, true),
      },
      {
        name: "Unscramble",
        description:
          "A fun and engaging game where players unscramble jumbled letters to discover the correct word or phrase.",
        topics: [],
        rooms: genericGameRooms("Unscramble", 30, true),
      },

      {
        name: "WordMaker",
        description:
          "Given a base word, form as many smaller words as possible using its letters. A fun and challenging game to test your vocabulary skills!",
        topics: [],
        rooms: genericGameRooms("WordMaker", 30, true),
      },
      {
        name: "LuckyFlip",
        description:
          "This game combines excitement with unpredictability, making it perfect for casual gamers and risk-takers alike.",
        topics: [],
        rooms: genericGameRooms("LuckyFlip", 30, true),
      },

      {
        name: "LuckyWhiz",
        description:
          "A game of luck and logic, where you make quick decisions to win. Guess correctly and rise to the top!",
        topics: [],
        rooms: genericGameRooms("LuckyWhiz", 30, true),
      },
      {
        name: "LuckySpin",
        description:
          "Spin the wheel of fortune and guess the word or number! The more you play, the luckier you get!",
        topics: [],
        rooms: genericGameRooms("LuckySpin", 30, true),
      },
    ],
  },
  {
    name: "Country Mania",
    description:
      "Test your geographical skills by answering questions about flags, capitals, landmarks in a fun and interactive way!",
    categories: [
      {
        name: "Afghanistan",
        description:
          "A landlocked country located in South Asia and Central Asia.",
        topics: [],
        rooms: [
          { name: "Kabul", description: "Dive into the heart of the nation." },
          { name: "Herat", description: "Explore the gateway to the west." },
          {
            name: "Kandahar",
            description: "Challenge your skills in the south.",
          },
          { name: "Balkh", description: "Discover northern adventures." },
          {
            name: "Nangarhar",
            description: "Test your knowledge in the east.",
          },
          {
            name: "Badakhshan",
            description: "Reach for the mountainous heights.",
          },
          { name: "Faryab", description: "Spin through the colorful culture." },
          {
            name: "Helmand",
            description: "Engage in exciting southern challenges.",
          },
          { name: "Ghazni", description: "Uncover history and fun." },
          { name: "Baghlan", description: "Push your limits in the north." },
          {
            name: "Takhar",
            description: "Navigate through the northern plains.",
          },
          { name: "Kunar", description: "Challenge your mind by the rivers." },
          { name: "Laghman", description: "Jump into the eastern excitement." },
          {
            name: "Paktia",
            description: "Power through fun in the southeast.",
          },
          { name: "Paktika", description: "Sharpen your skills here." },
          {
            name: "Nuristan",
            description: "Venture into the forested regions.",
          },
          { name: "Wardak", description: "Test your wit near the capital." },
          { name: "Khost", description: "Experience the spirited east." },
          { name: "Zabul", description: "Rise up with southern challenges." },
          { name: "Parwan", description: "Explore the northern gateway." },
          { name: "Samangan", description: "Delve into historic puzzles." },
          { name: "Jawzjan", description: "Spin your way through the north." },
          { name: "Badghis", description: "Engage with western thrills." },
          { name: "Farah", description: "Fun awaits in the west." },
          {
            name: "Daykundi",
            description: "Challenge yourself in the highlands.",
          },
          { name: "Bamyan", description: "Discover ancient wonders." },
          { name: "Logar", description: "Sharpen your mind south of Kabul." },
          { name: "Kapisa", description: "Jump into the northern fun." },
          { name: "Ghor", description: "Navigate the mountainous terrains." },
          {
            name: "Samangan",
            description: "Solve puzzles in the northern region.",
          },
        ],
      },
      {
        name: "Albania",
        description:
          "A country in Southeastern Europe, known for its beaches and rugged landscapes.",
        topics: [],
        rooms: [
          {
            name: "Berat",
            description: "Discover the city of a thousand windows.",
          },
          {
            name: "Durrës",
            description: "Feel the coastal vibes and lively spirit.",
          },
          { name: "Elbasan", description: "Explore the heart of Albania." },
          {
            name: "Fier",
            description: "Challenge yourself in this fertile land.",
          },
          {
            name: "Gjirokastër",
            description: "Unveil historic charm and stunning views.",
          },
          {
            name: "Korçë",
            description: "Test your knowledge in the cultural hub.",
          },
          { name: "Kukës", description: "Adventure awaits in the north-east." },
          {
            name: "Lezhë",
            description: "Dive into coastal beauty and history.",
          },
          {
            name: "Shkodër",
            description: "Engage with northern traditions and landscapes.",
          },
          {
            name: "Tirana",
            description: "Jump into the vibrant capital's buzz.",
          },
          {
            name: "Vlorë",
            description: "Feel the energy of the southern coast.",
          },
          {
            name: "Dibër",
            description: "Explore the mountainous eastern region.",
          },
          {
            name: "Librazhd",
            description: "Challenge yourself with central puzzles.",
          },
          {
            name: "Përmet",
            description: "Uncover the beauty of southern valleys.",
          },
          {
            name: "Sarandë",
            description: "Discover the stunning Ionian coast.",
          },
          {
            name: "Kavajë",
            description: "Test your skills near the Adriatic.",
          },
          { name: "Patos", description: "Dive into the oil-rich plains." },
          {
            name: "Ballsh",
            description: "Explore the historic southern towns.",
          },
          {
            name: "Rrogozhinë",
            description: "Spin your way through central Albania.",
          },
          {
            name: "Pogradec",
            description: "Challenge yourself by Lake Ohrid.",
          },
          {
            name: "Krujë",
            description: "Discover the fortress city's secrets.",
          },
          { name: "Levan", description: "Enjoy southern Albanian vibes." },
          { name: "Cërrik", description: "Engage with the plains and hills." },
          {
            name: "Fushë-Krujë",
            description: "Test your wits near the capital.",
          },
          {
            name: "Kuçovë",
            description: "Experience the oil city challenges.",
          },
          { name: "Burrel", description: "Explore northern highlands." },
          {
            name: "Mamurras",
            description: "Discover coastal life near the north.",
          },
          {
            name: "Ballsh",
            description: "Dive into southern culture and fun.",
          },
          {
            name: "Libohovë",
            description: "Unveil historic southern mysteries.",
          },
          {
            name: "Tropojë",
            description: "Adventure through northern mountain trails.",
          },
        ],
      },
      {
        name: "Algeria",
        description: "The largest country in Africa, located in North Africa.",
        topics: [],
        rooms: [
          { name: "Adrar", description: "Explore the vast desert landscapes." },
          { name: "Chlef", description: "Discover the rich coastal culture." },
          {
            name: "Laghouat",
            description: "Dive into the oasis and steppe adventures.",
          },
          {
            name: "Oum El Bouaghi",
            description: "Experience the historic heartland.",
          },
          {
            name: "Batna",
            description: "Unveil the Roman ruins and mountain views.",
          },
          {
            name: "Béjaïa",
            description: "Feel the Mediterranean breeze and vibrant city life.",
          },
          {
            name: "Biskra",
            description: "Discover the gateway to the Sahara.",
          },
          {
            name: "Béchar",
            description: "Explore the oasis city and desert tales.",
          },
          { name: "Blida", description: "Enjoy the gardens and mountain air." },
          {
            name: "Bouira",
            description: "Challenge yourself in the Kabylie region.",
          },
          {
            name: "Tamanrasset",
            description: "Embark on a deep desert adventure.",
          },
          {
            name: "Tébessa",
            description: "Step back in time with ancient ruins.",
          },
          {
            name: "Tlemcen",
            description: "Discover Andalusian charm and history.",
          },
          {
            name: "Tiaret",
            description: "Explore plains and cultural heritage.",
          },
          {
            name: "Tizi Ouzou",
            description: "Experience the heart of Kabylie culture.",
          },
          {
            name: "Algiers",
            description: "Jump into the vibrant capital city.",
          },
          {
            name: "Djelfa",
            description: "Test your knowledge in the high plateaus.",
          },
          {
            name: "Jijel",
            description: "Feel the coastal mountains and beaches.",
          },
          {
            name: "Sétif",
            description: "Discover the crossroads of history and culture.",
          },
          {
            name: "Saïda",
            description: "Explore the hills and historical sites.",
          },
          {
            name: "Skikda",
            description: "Dive into the Mediterranean port life.",
          },
          {
            name: "Sidi Bel Abbès",
            description: "Engage with plains and vineyards.",
          },
          {
            name: "Annaba",
            description: "Experience the coastal city's energy.",
          },
          {
            name: "Guelma",
            description: "Discover thermal springs and ruins.",
          },
          {
            name: "Constantine",
            description: "Explore the city of bridges and history.",
          },
          {
            name: "Médéa",
            description: "Test yourself in the mountainous region.",
          },
          {
            name: "Mostaganem",
            description: "Enjoy the seaside and rich culture.",
          },
          {
            name: "Msila",
            description: "Uncover the agricultural heart of Algeria.",
          },
          {
            name: "Ouargla",
            description: "Challenge yourself in the desert oasis.",
          },
          {
            name: "Oran",
            description: "Feel the lively vibes of the western port.",
          },
        ],
      },
      {
        name: "Andorra",
        description:
          "A tiny country in the Pyrenees mountains between France and Spain.",
        topics: [],
        rooms: [
          {
            name: "Canillo",
            description: "Explore snowy peaks and alpine adventures.",
          },
          {
            name: "Encamp",
            description: "Discover charming villages and mountain trails.",
          },
          {
            name: "Ordino",
            description: "Enjoy peaceful valleys and nature walks.",
          },
          {
            name: "La Massana",
            description: "Dive into skiing and outdoor fun.",
          },
          {
            name: "Andorra la Vella",
            description: "Experience the bustling capital's energy.",
          },
          {
            name: "Sant Julià de Lòria",
            description: "Uncover cultural gems and scenic views.",
          },
          {
            name: "Escaldes-Engordany",
            description: "Relax in hot springs and vibrant markets.",
          },
        ],
      },
      {
        name: "Angola",
        description:
          "A country in Southern Africa, known for its oil reserves and natural beauty.",
        topics: [],
        rooms: [
          { name: "Bengo", description: "Coastal vibes and rich history." },
          { name: "Benguela", description: "Beaches, culture, and city life." },
          { name: "Bié", description: "Highlands with lush landscapes." },
          { name: "Cabinda", description: "An enclave with tropical forests." },
          {
            name: "Cuando Cubango",
            description: "Wildlife and vast wilderness.",
          },
          { name: "Cuanza Norte", description: "Rivers and rolling hills." },
          {
            name: "Cuanza Sul",
            description: "Agriculture and coastal plains.",
          },
          { name: "Cunene", description: "Desert lands and unique cultures." },
          { name: "Huambo", description: "Fertile lands and vibrant markets." },
          { name: "Huila", description: "Mountains and rich traditions." },
          {
            name: "Luanda",
            description: "The bustling capital and port city.",
          },
          {
            name: "Lunda Norte",
            description: "Diamond mines and dense forests.",
          },
          { name: "Lunda Sul", description: "Mining and natural reserves." },
          { name: "Malanje", description: "Waterfalls and historical sites." },
          { name: "Moxico", description: "Savannahs and diverse wildlife." },
          { name: "Namibe", description: "Coastal deserts and marine life." },
          { name: "Uíge", description: "Coffee plantations and hills." },
          { name: "Zaire", description: "Rivers, culture, and borderlands." },
        ],
      },
      {
        name: "Antigua and Barbuda",
        description:
          "A small Caribbean nation known for its pristine beaches and colonial architecture.",
        topics: [],
        rooms: [
          {
            name: "Antigua",
            description:
              "The heart island with stunning beaches and vibrant culture.",
          },
          {
            name: "Barbuda",
            description:
              "A peaceful island known for its pink sand beaches and wildlife.",
          },
          {
            name: "Saint John's",
            description:
              "The lively capital city with colorful markets and history.",
          },
          {
            name: "English Harbour",
            description: "Historic naval port with beautiful marinas.",
          },
          {
            name: "Falmouth Harbour",
            description: "Popular for sailing and waterfront dining.",
          },
          {
            name: "Codrington",
            description: "The main town of Barbuda, known for friendly locals.",
          },
          {
            name: "Deep Bay",
            description: "Scenic bay area with great fishing spots.",
          },
          {
            name: "Dickenson Bay",
            description: "Famous beach with resorts and water sports.",
          },
          {
            name: "Nelson's Dockyard",
            description: "A restored 18th-century naval dockyard and museum.",
          },
          {
            name: "Willikies",
            description: "Small community with beautiful nature trails.",
          },
          {
            name: "Potters Village",
            description: "A bustling town with local shops and eateries.",
          },
          {
            name: "Green Bay",
            description: "A tranquil beach perfect for relaxation.",
          },
          {
            name: "Bethesda",
            description: "Quaint village with cultural charm.",
          },
          {
            name: "Five Islands",
            description: "Known for rocky coastlines and panoramic views.",
          },
          {
            name: "Jolly Harbour",
            description: "A marina town with great boating activities.",
          },
          { name: "Seaview", description: "Scenic coastal area with resorts." },
          {
            name: "Freetown",
            description: "A historic town with rich traditions.",
          },
          { name: "Sea Grapes", description: "Quiet beachside community." },
          {
            name: "Fort James",
            description: "Historic fort with panoramic ocean views.",
          },
          {
            name: "Liberta",
            description: "Known for its warm community and local festivals.",
          },
          {
            name: "Old Road",
            description: "A charming town with colonial architecture.",
          },
          {
            name: "Potworks Dam",
            description: "A popular spot for birdwatching and nature walks.",
          },
          {
            name: "Clare Hall",
            description: "A growing town with local shops.",
          },
          {
            name: "Guiana Island",
            description: "A protected natural reserve with rare wildlife.",
          },
          {
            name: "Runaway Bay",
            description: "Secluded beaches and nature trails.",
          },
          {
            name: "Nonsuch Bay",
            description: "A quiet bay area ideal for snorkeling.",
          },
          {
            name: "Darkwood Beach",
            description: "A hidden gem for beach lovers.",
          },
          {
            name: "Long Island",
            description: "A small island known for its beauty and serenity.",
          },
          {
            name: "Yorks Village",
            description: "A friendly community with scenic surroundings.",
          },
          {
            name: "Christian Valley",
            description: "Lush valley with agricultural heritage.",
          },
        ],
      },
      {
        name: "Argentina",
        description:
          "A country in South America, famous for its football and the Pampas grasslands.",
        topics: [],
        rooms: [
          {
            name: "Buenos Aires",
            description:
              "The vibrant capital city known for tango and culture.",
          },
          {
            name: "Córdoba",
            description:
              "Known for its colonial architecture and lively student population.",
          },
          {
            name: "Santa Fe",
            description:
              "A province with rich agricultural land and historic sites.",
          },
          {
            name: "Mendoza",
            description:
              "Famous for its wine regions and Andes mountain views.",
          },
          {
            name: "Tucumán",
            description:
              "Known as the garden of the Republic, with lush landscapes.",
          },
          {
            name: "Salta",
            description:
              "Famous for its colonial buildings and Andean heritage.",
          },
          {
            name: "Misiones",
            description: "Home to the spectacular Iguazu Falls.",
          },
          {
            name: "Neuquén",
            description: "Known for its lakes and Patagonian landscapes.",
          },
          {
            name: "Chubut",
            description: "Famous for wildlife and the Valdés Peninsula.",
          },
          {
            name: "Río Negro",
            description: "A gateway to Patagonia with diverse landscapes.",
          },
          {
            name: "San Juan",
            description: "Wine country with stunning desert scenery.",
          },
          {
            name: "Entre Ríos",
            description: "Known for its rivers and hot springs.",
          },
          {
            name: "La Rioja",
            description: "Desert landscapes mixed with vineyards.",
          },
          {
            name: "Formosa",
            description: "A province rich in wetlands and wildlife.",
          },
          {
            name: "Chaco",
            description: "Known for its tropical forests and culture.",
          },
          {
            name: "Corrientes",
            description: "Famous for its wetlands and music traditions.",
          },
          {
            name: "San Luis",
            description: "Known for mountains and outdoor activities.",
          },
          {
            name: "Santa Cruz",
            description: "Patagonian province with glaciers and wildlife.",
          },
          {
            name: "La Pampa",
            description: "Flat grasslands and cattle ranching.",
          },
          {
            name: "Jujuy",
            description: "Known for colorful mountains and indigenous culture.",
          },
          {
            name: "Santiago del Estero",
            description: "Historic province with rich folklore.",
          },
          {
            name: "Catamarca",
            description: "Mountains, deserts, and ancient ruins.",
          },
          {
            name: "Tierra del Fuego",
            description: "The southernmost tip with rugged beauty.",
          },
          {
            name: "Ciudad Autónoma de Buenos Aires",
            description: "The autonomous city, vibrant and cosmopolitan.",
          },
          {
            name: "La Plata",
            description: "Known for its planned city design and museums.",
          },
          {
            name: "Villa Carlos Paz",
            description: "Popular mountain resort town.",
          },
          {
            name: "Bariloche",
            description:
              "Famous for lakes, skiing, and Swiss-style architecture.",
          },
          {
            name: "Mar del Plata",
            description: "A bustling beach city on the Atlantic coast.",
          },
          {
            name: "Rosario",
            description: "Known for its riverfront and cultural life.",
          },
          {
            name: "San Rafael",
            description: "Wine-producing area with beautiful canyons.",
          },
        ],
      },
      {
        name: "Armenia",
        description:
          "A landlocked country in the Caucasus region, known for its ancient churches and rich culture.",
        topics: [],
        rooms: [
          {
            name: "Aragatsotn",
            description: "Home to Mount Aragats and ancient monasteries.",
          },
          {
            name: "Ararat",
            description:
              "Known for its fertile plains and proximity to Mount Ararat.",
          },
          {
            name: "Armavir",
            description:
              "Rich in historical sites and archaeological treasures.",
          },
          {
            name: "Gegharkunik",
            description:
              "Famous for Lake Sevan, a high-altitude freshwater lake.",
          },
          {
            name: "Kotayk",
            description: "Known for its natural beauty and the Garni Temple.",
          },
          {
            name: "Lori",
            description:
              "A mountainous province with lush forests and monasteries.",
          },
          {
            name: "Shirak",
            description: "Known for the city of Gyumri and cold winters.",
          },
          {
            name: "Syunik",
            description: "Home to Tatev Monastery and stunning canyons.",
          },
          {
            name: "Tavush",
            description:
              "Forested region with rich biodiversity and historic fortresses.",
          },
          {
            name: "Vayots Dzor",
            description: "Wine region with scenic gorges and caves.",
          },
          {
            name: "Yerevan",
            description: "The vibrant capital city, cultural and economic hub.",
          },
          {
            name: "Sevan",
            description: "Famous for its beautiful lake and resort areas.",
          },
          {
            name: "Gyumri",
            description:
              "Armenia's second-largest city, rich in history and art.",
          },
          {
            name: "Stepanavan",
            description: "Known for its botanical garden and parks.",
          },
          {
            name: "Jermuk",
            description:
              "A spa town famous for its mineral waters and waterfalls.",
          },
          {
            name: "Dilijan",
            description:
              "Often called the 'Switzerland of Armenia' for its forests.",
          },
          {
            name: "Goris",
            description:
              "A town with ancient cave dwellings and rugged terrain.",
          },
          {
            name: "Kapan",
            description: "Industrial city surrounded by mountains.",
          },
          {
            name: "Martuni",
            description: "Located near Lake Sevan with rich cultural heritage.",
          },
          {
            name: "Vardenis",
            description: "A town near Lake Sevan known for its natural beauty.",
          },
          {
            name: "Noyemberyan",
            description: "Located in the northeast, known for its forests.",
          },
          {
            name: "Tashir",
            description: "City in Lori region, known for historic sites.",
          },
          {
            name: "Alaverdi",
            description: "Known for its copper mine and historic churches.",
          },
          {
            name: "Vanadzor",
            description: "Third-largest city, surrounded by mountains.",
          },
          {
            name: "Artashat",
            description: "An ancient city with archaeological significance.",
          },
          {
            name: "Ashtarak",
            description: "A charming town near Yerevan with old churches.",
          },
          {
            name: "Hrazdan",
            description: "Known for its hydroelectric power plant.",
          },
          {
            name: "Abovyan",
            description: "City close to Yerevan, known for parks and history.",
          },
          {
            name: "Masis",
            description: "City in Ararat region, near Mount Ararat.",
          },
          {
            name: "Sevakar",
            description: "A small village known for its traditional lifestyle.",
          },
        ],
      },
      {
        name: "Australia",
        description:
          "An island continent famous for its unique wildlife, beaches, and the Great Barrier Reef.",
        topics: [],
        rooms: [
          {
            name: "Sydney",
            description:
              "Explore the bustling city with iconic landmarks like the Opera House.",
          },
          {
            name: "Melbourne",
            description:
              "Dive into the cultural capital filled with art and coffee.",
          },
          {
            name: "Brisbane",
            description: "A sunny city known for its river and lively vibe.",
          },
          {
            name: "Perth",
            description:
              "Western Australia's gem, famous for beaches and sunsets.",
          },
          {
            name: "Adelaide",
            description: "City of festivals, food, and nearby wine regions.",
          },
          {
            name: "Canberra",
            description:
              "Australia's capital with museums and politics galore.",
          },
          {
            name: "Hobart",
            description: "Tasmania's charming harbor city with historic charm.",
          },
          {
            name: "Darwin",
            description:
              "Tropical gateway with wildlife and outdoor adventures.",
          },
          {
            name: "Queensland",
            description: "Sunshine state with rainforests and reef magic.",
          },
          {
            name: "New South Wales",
            description: "State with stunning coasts and vibrant cities.",
          },
          {
            name: "Victoria",
            description: "Known for arts, coffee, and scenic Great Ocean Road.",
          },
          {
            name: "Western Australia",
            description: "Home to vast outback and pristine beaches.",
          },
          {
            name: "South Australia",
            description: "Famous for wine, festivals, and desert landscapes.",
          },
          {
            name: "Tasmania",
            description: "Island wilderness full of nature and history.",
          },
          {
            name: "Northern Territory",
            description: "Red desert landscapes and Indigenous culture.",
          },
          {
            name: "Uluru",
            description: "The iconic red rock and spiritual heart of the land.",
          },
          {
            name: "Great Barrier Reef",
            description: "Explore the world's largest coral reef system.",
          },
          {
            name: "Blue Mountains",
            description: "Majestic cliffs and eucalyptus forests to discover.",
          },
          {
            name: "Gold Coast",
            description: "Famous for beaches, surf, and nightlife.",
          },
          {
            name: "Byron Bay",
            description: "A laid-back town known for beaches and vibes.",
          },
          {
            name: "Cairns",
            description: "Tropical city gateway to reefs and rainforests.",
          },
          {
            name: "Alice Springs",
            description: "Heart of the Outback with desert adventures.",
          },
          {
            name: "Fraser Island",
            description: "World's largest sand island with unique nature.",
          },
          {
            name: "Kangaroo Island",
            description: "Wildlife haven with stunning coastal views.",
          },
          {
            name: "Bondi",
            description: "Famous beach and vibrant local culture.",
          },
          {
            name: "Daintree",
            description: "Ancient rainforest with exotic wildlife.",
          },
          {
            name: "Barossa",
            description: "Renowned wine region with great flavors.",
          },
          {
            name: "Snowy Mountains",
            description: "Australia's alpine playground with snow and hikes.",
          },
          {
            name: "Phillip Island",
            description: "Known for penguins and coastal wildlife.",
          },
          {
            name: "Tasman Peninsula",
            description: "Dramatic cliffs and convict history to explore.",
          },
        ],
      },
      {
        name: "Austria",
        description:
          "A landlocked country in Central Europe, known for its classical music and Alpine landscapes.",
        topics: [],
        rooms: [
          {
            name: "Vienna",
            description:
              "The capital city, famous for music, art, and coffee culture.",
          },
          {
            name: "Salzburg",
            description:
              "Birthplace of Mozart with stunning baroque architecture.",
          },
          {
            name: "Innsbruck",
            description: "A winter sports paradise nestled in the Alps.",
          },
          {
            name: "Graz",
            description: "A vibrant university city with a rich history.",
          },
          {
            name: "Linz",
            description:
              "A city blending technology and culture on the Danube.",
          },
          {
            name: "Klagenfurt",
            description: "Gateway to alpine lakes and scenic landscapes.",
          },
          {
            name: "Bregenz",
            description: "Known for its lakeside festivals and mountain views.",
          },
          {
            name: "Styria",
            description:
              "The green heart of Austria with vineyards and forests.",
          },
          {
            name: "Tyrol",
            description: "Alpine region famous for skiing and hiking.",
          },
          {
            name: "Carinthia",
            description: "Home to crystal-clear lakes and warm summers.",
          },
          {
            name: "Lower Austria",
            description: "Vineyards, castles, and the Danube valley.",
          },
          {
            name: "Upper Austria",
            description: "Industrial hub with beautiful natural parks.",
          },
          {
            name: "Vorarlberg",
            description: "Westernmost region with unique cultural charm.",
          },
          {
            name: "Wachau",
            description: "A picturesque valley known for wine and ruins.",
          },
          {
            name: "Neusiedler",
            description: "Famous for its lake and birdlife.",
          },
          {
            name: "Grossglockner",
            description: "Austria's highest mountain, perfect for adventure.",
          },
          {
            name: "Salzkammergut",
            description: "A stunning lake district and alpine retreat.",
          },
          {
            name: "Zell",
            description:
              "Charming lakeside town with great outdoor activities.",
          },
          {
            name: "Kitzbühel",
            description: "World-renowned ski resort with alpine flair.",
          },
          {
            name: "Wienerwald",
            description:
              "Forest region just outside Vienna, full of hiking trails.",
          },
          {
            name: "Eisenstadt",
            description: "Capital of Burgenland with baroque elegance.",
          },
          {
            name: "Burgenland",
            description: "Known for its wine, lakes, and flat landscapes.",
          },
          {
            name: "Semmering",
            description: "Historic mountain pass with winter sports.",
          },
          {
            name: "Mariazell",
            description: "Famous pilgrimage town with stunning basilica.",
          },
          {
            name: "Kahlenberg",
            description: "A popular Vienna viewpoint with panoramic sights.",
          },
          {
            name: "Danube",
            description:
              "Europe's second-longest river flowing through Austria.",
          },
          {
            name: "Hochkönig",
            description: "A majestic mountain peak for hiking and skiing.",
          },
          {
            name: "Lainzer",
            description: "A natural park with wildlife near Vienna.",
          },
          {
            name: "Hallstatt",
            description:
              "Fairy-tale village famous for its lakes and salt mines.",
          },
          {
            name: "Murtal",
            description: "A valley with charming towns and scenic beauty.",
          },
        ],
      },
      {
        name: "Azerbaijan",
        description:
          "A country in the Caucasus region, rich in oil resources and diverse cultures.",
        topics: [],
        rooms: [
          {
            name: "Baku",
            description: "Explore the vibrant capital full of flame and flair.",
          },
          {
            name: "Ganja",
            description: "A historic city with youthful energy and charm.",
          },
          {
            name: "Sumqayit",
            description: "A coastal gem buzzing with city life.",
          },
          {
            name: "Shaki",
            description: "Home to palaces, crafts, and mountain views.",
          },
          {
            name: "Lankaran",
            description: "Where tea plantations meet the Caspian breeze.",
          },
          {
            name: "Quba",
            description: "Orchards, mountains, and a sweet escape.",
          },
          {
            name: "Gabala",
            description: "Adventure meets serenity in this scenic getaway.",
          },
          {
            name: "Naftalan",
            description: "The land of healing oil and unique spas.",
          },
          {
            name: "Nakhchivan",
            description: "An exclave with ancient stories and silence.",
          },
          {
            name: "Shamakhi",
            description: "Astronomy and poetry in the hills.",
          },
          {
            name: "Zaqatala",
            description: "A colorful mix of nature and cultures.",
          },
          {
            name: "Mingachevir",
            description: "A city by the river with electric vibes.",
          },
          {
            name: "Khachmaz",
            description: "Fruitful fields and festive feels.",
          },
          {
            name: "Tovuz",
            description: "A town of traditions and timeless tastes.",
          },
          {
            name: "Ismayilli",
            description: "Forests, lakes, and fresh air in every breath.",
          },
          {
            name: "Masalli",
            description: "Soothing springs and sweet surroundings.",
          },
          {
            name: "Shirvan",
            description: "A modern touch in a classic setting.",
          },
          {
            name: "Yevlakh",
            description: "A cozy crossroad of travel and trade.",
          },
          {
            name: "Agdam",
            description: "Echoes of history with eyes on the future.",
          },
          {
            name: "Fizuli",
            description: "Resilience and revival in the south.",
          },
          { name: "Qabala", description: "Old capital, new adventures." },
          { name: "Astara", description: "A green gateway to the south." },
          {
            name: "Balakan",
            description: "Forests, rivers, and border charm.",
          },
          {
            name: "Dashkasan",
            description: "Mountains, mines, and cool retreats.",
          },
          {
            name: "Goychay",
            description: "Pomegranate paradise with a festive spirit.",
          },
          { name: "Shusha", description: "Cultural crown in the highlands." },
          {
            name: "Zardab",
            description: "Peaceful fields and poetic rhythms.",
          },
          { name: "Qusar", description: "Snowy peaks and cozy streets." },
          { name: "Salyan", description: "Flatlands full of flavor." },
          {
            name: "Bilasuvar",
            description: "Borders, markets, and mellow life.",
          },
        ],
      },
      {
        name: "Bahamas",
        description:
          "An island nation in the Caribbean, known for its white sandy beaches and clear blue waters.",
        topics: [],
        rooms: [
          {
            name: "Nassau",
            description: "The capital buzzes with culture, colors, and charm.",
          },
          {
            name: "Freeport",
            description: "A city of sunshine, shopping, and sea breeze.",
          },
          {
            name: "Eleuthera",
            description: "Narrow, scenic, and full of pink sand wonders.",
          },
          {
            name: "Harbour Island",
            description: "Chill vibes and candy-colored cottages await.",
          },
          {
            name: "Abaco",
            description: "Boats, beaches, and boundless beauty.",
          },
          {
            name: "Exuma",
            description: "Home to swimming pigs and sapphire waters.",
          },
          {
            name: "Andros",
            description: "Lush forests and blue holes to explore.",
          },
          {
            name: "Bimini",
            description: "Close to Florida, packed with fishing fun.",
          },
          {
            name: "Cat Island",
            description: "Quiet, quaint, and full of local flavor.",
          },
          {
            name: "Long Island",
            description: "A land of cliffs, caves, and contrasts.",
          },
          {
            name: "San Salvador",
            description: "Where Columbus made his famous landfall.",
          },
          {
            name: "Inagua",
            description: "Flamingos, salt lakes, and peace galore.",
          },
          {
            name: "Crooked Island",
            description: "Hidden away with stories to tell.",
          },
          { name: "Acklins", description: "Remote, raw, and reef-rich." },
          {
            name: "Mayaguana",
            description: "A tranquil haven for nature lovers.",
          },
          { name: "Berry Islands", description: "Tiny islands, big charm." },
          {
            name: "Ragged Island",
            description: "A rugged retreat off the beaten path.",
          },
          {
            name: "Great Exuma",
            description: "Larger-than-life island adventures.",
          },
          {
            name: "Little Exuma",
            description: "Small island, big personality.",
          },
          {
            name: "Great Abaco",
            description: "Sailing central with island spirit.",
          },
          {
            name: "Little Abaco",
            description: "A smaller slice of tropical paradise.",
          },
          {
            name: "New Providence",
            description: "The bustling heart of the Bahamas.",
          },
          {
            name: "Paradise Island",
            description: "Resorts, waterslides, and relaxing waves.",
          },
          {
            name: "Blue Lagoon",
            description: "A dreamy day trip full of dolphins and fun.",
          },
          {
            name: "Great Inagua",
            description: "Flamingos and flaming sunsets.",
          },
          { name: "Little Inagua", description: "Untouched and wild beauty." },
          {
            name: "Grand Bahama",
            description: "Big island, bigger adventures.",
          },
          { name: "Cave Cay", description: "Explore caves and calm waters." },
          {
            name: "Rum Cay",
            description: "History, diving, and mellow moods.",
          },
          {
            name: "Staniel Cay",
            description: "Home of the famous Thunderball Grotto.",
          },
        ],
      },

      {
        name: "Bahrain",
        description:
          "A small island country in the Persian Gulf, known for its oil wealth and historical significance.",
        topics: [],
        rooms: [
          {
            name: "Manama",
            description: "The vibrant capital full of life and lights.",
          },
          {
            name: "Muharraq",
            description: "A blend of history, heritage, and modernity.",
          },
          { name: "Riffa", description: "Palaces, parks, and peaceful vibes." },
          {
            name: "Isa Town",
            description: "Charming neighborhoods and cozy corners.",
          },
          {
            name: "Sitra",
            description: "Island meets industry with a coastal touch.",
          },
          {
            name: "Budaiya",
            description: "Palm-lined streets and peaceful mornings.",
          },
          {
            name: "Juffair",
            description: "Trendy, lively, and full of energy.",
          },
          {
            name: "Adliya",
            description: "The artsy heart of cafes and culture.",
          },
          {
            name: "Amwaj Islands",
            description: "Luxury, leisure, and ocean views.",
          },
          {
            name: "Zallaq",
            description: "Beaches and resorts in every direction.",
          },
          { name: "Diraz", description: "Rich traditions and quiet streets." },
          {
            name: "Barbar",
            description: "Home to ancient temples and village charm.",
          },
          {
            name: "A'ali",
            description: "Famous for its ancient burial mounds.",
          },
          {
            name: "Hamad Town",
            description: "A planned town full of neighborhoods and parks.",
          },
          { name: "Seef", description: "Skyscrapers, malls, and sea views." },
          { name: "Tubli", description: "A calm place with coastal flair." },
          {
            name: "Jid Ali",
            description: "Local markets and community spirit.",
          },
          {
            name: "Saar",
            description: "Suburban comfort with green surroundings.",
          },
          {
            name: "Bilad Al Qadeem",
            description: "Old city feel with modern rhythm.",
          },
          { name: "Al Jasra", description: "Crafts, culture, and cozy vibes." },
          {
            name: "Busaiteen",
            description: "A scenic blend of tradition and progress.",
          },
          {
            name: "Malkiya",
            description: "A fishing village with laid-back charm.",
          },
          { name: "Karzakan", description: "Shady groves and quiet roads." },
          {
            name: "Al Hidd",
            description: "Industrial strength meets coastal views.",
          },
          { name: "Galali", description: "A hidden gem by the sea." },
          { name: "Duraz", description: "Old tales and friendly faces." },
          {
            name: "Jannusan",
            description: "A peaceful village with leafy lanes.",
          },
          { name: "Sanabis", description: "Marketplace buzz with city soul." },
          { name: "Ma'ameer", description: "Urban life meets history." },
          { name: "Awali", description: "The heart of Bahrain's oil story." },
        ],
      },
      {
        name: "Bangladesh",
        description:
          "A densely populated country in South Asia, known for its vibrant culture and river delta.",
        topics: [],
        rooms: [
          {
            name: "Dhaka",
            description: "Buzzing capital with energy and endless action.",
          },
          {
            name: "Chittagong",
            description: "A coastal port city full of spice and trade.",
          },
          {
            name: "Khulna",
            description: "Gateway to the Sundarbans and southern adventures.",
          },
          {
            name: "Rajshahi",
            description: "Famous for mangoes and academic vibes.",
          },
          {
            name: "Sylhet",
            description: "Tea gardens and scenic hill tracks await.",
          },
          {
            name: "Barisal",
            description: "Canals and rivers create a floating charm.",
          },
          {
            name: "Rangpur",
            description: "Lush fields and rural calm define it.",
          },
          {
            name: "Mymensingh",
            description: "Historic culture and gentle greenery.",
          },
          {
            name: "Comilla",
            description: "Tradition, temples, and tasty treats.",
          },
          {
            name: "Narayanganj",
            description: "The textile hub with river views.",
          },
          {
            name: "Gazipur",
            description: "Industries and greenery side by side.",
          },
          {
            name: "Jessore",
            description: "Pioneers of agriculture and quiet charm.",
          },
          { name: "Bogura", description: "Ancient ruins and modern roads." },
          {
            name: "Pabna",
            description: "Fields, factories, and folklore galore.",
          },
          {
            name: "Tangail",
            description: "Handloom heritage and sweet delights.",
          },
          {
            name: "Kushtia",
            description: "Baul music echoes from the riverside.",
          },
          {
            name: "Satkhira",
            description: "Nature meets mangroves and mystery.",
          },
          {
            name: "Faridpur",
            description: "Quiet roads and riverside stories.",
          },
          { name: "Noakhali", description: "Coastal beauty with bold spirit." },
          {
            name: "Dinajpur",
            description: "Famous for rice, relics, and warmth.",
          },
          {
            name: "Cox's Bazar",
            description: "Home to the world's longest sea beach!",
          },
          {
            name: "Bandarban",
            description: "Hill adventures and tribal tales.",
          },
          {
            name: "Rangamati",
            description: "Lakes and landscapes you'll love.",
          },
          { name: "Feni", description: "A blend of trade and tranquility." },
          {
            name: "Brahmanbaria",
            description: "Music and history in perfect rhythm.",
          },
          {
            name: "Gopalganj",
            description: "The heartland of heritage and peace.",
          },
          {
            name: "Sirajganj",
            description: "Where rivers and looms weave magic.",
          },
          {
            name: "Naogaon",
            description: "Rice bowls and archaeological gems.",
          },
          {
            name: "Meherpur",
            description: "Where independence history lives.",
          },
          {
            name: "Lalmonirhat",
            description: "Fields, borders, and open skies.",
          },
        ],
      },

      {
        name: "Barbados",
        description:
          "An island nation in the Caribbean, famous for its beaches and rum.",
        topics: [],
        rooms: [
          {
            name: "Bridgetown",
            description: "Bustling capital with history and harbor views.",
          },
          {
            name: "Oistins",
            description: "Where fish fries and fun meet every weekend.",
          },
          {
            name: "Holetown",
            description: "Chic vibes with shopping and sea breezes.",
          },
          {
            name: "Speightstown",
            description: "Historic charm meets the ocean breeze.",
          },
          {
            name: "Bathsheba",
            description: "A surfer's paradise with rugged beauty.",
          },
          {
            name: "St. Lawrence Gap",
            description: "The nightlife hotspot that never sleeps.",
          },
          {
            name: "Silver Sands",
            description: "Wind, waves, and water sports everywhere.",
          },
          {
            name: "Crane Beach",
            description: "One of the world's prettiest pink beaches.",
          },
          {
            name: "Harrison's Cave",
            description: "Go underground in a sparkling wonderland.",
          },
          {
            name: "Animal Flower Cave",
            description: "Explore sea caves with natural beauty.",
          },
          {
            name: "Cherry Tree Hill",
            description: "A scenic spot with sweeping island views.",
          },
          {
            name: "St. Michael",
            description: "Home to Bridgetown and historic gems.",
          },
          {
            name: "St. James",
            description: "Luxury resorts and calm, clear waters.",
          },
          {
            name: "St. Peter",
            description: "Coastal towns and relaxed island life.",
          },
          {
            name: "St. Joseph",
            description: "Wild beauty and hilly inland hikes.",
          },
          {
            name: "St. Andrew",
            description: "Remote, peaceful, and full of charm.",
          },
          {
            name: "St. Thomas",
            description: "Caves and central island quietude.",
          },
          {
            name: "St. Lucy",
            description: "Northernmost tip with rugged coasts.",
          },
          { name: "St. John", description: "Old churches and ocean outlooks." },
          {
            name: "St. George",
            description: "Lush greenery and quiet countryside.",
          },
          {
            name: "Christ Church",
            description: "Beaches, nightlife, and island fun.",
          },
          { name: "Wildey", description: "Suburban buzz meets local charm." },
          {
            name: "Bath",
            description: "Hidden beach escape on the east coast.",
          },
          {
            name: "Belleplaine",
            description: "East coast calm with village charm.",
          },
          {
            name: "Four Roads",
            description: "Crossroads of friendly island life.",
          },
          { name: "Green Hill", description: "Lush views and relaxing vibes." },
          {
            name: "Welches",
            description: "Small town with a big beach heart.",
          },
          {
            name: "Atlantic Shores",
            description: "Where waves meet breezy shores.",
          },
          { name: "Maxwell", description: "Laid-back fun with coastal flair." },
          {
            name: "Black Rock",
            description: "Urban rhythm near the crashing waves.",
          },
        ],
      },

      {
        name: "Belarus",
        description:
          "A country in Eastern Europe, known for its forests and Soviet-era monuments.",
        topics: [],
        rooms: [
          {
            name: "Minsk",
            description: "The capital city where history meets hustle.",
          },
          {
            name: "Gomel",
            description: "A southern gem with riverside views.",
          },
          {
            name: "Mogilev",
            description: "Historic charm on the Dnieper River.",
          },
          {
            name: "Vitebsk",
            description: "The art capital known for creativity.",
          },
          {
            name: "Grodno",
            description: "A city full of culture and castles.",
          },
          { name: "Brest", description: "Border city with a heroic fortress." },
          {
            name: "Baranovichi",
            description: "A rail hub with a peaceful vibe.",
          },
          {
            name: "Bobruisk",
            description: "Industrial spirit meets local flavor.",
          },
          { name: "Pinsk", description: "A riverside town with calm energy." },
          {
            name: "Orsha",
            description: "History and trains roll through here.",
          },
          {
            name: "Zhlobin",
            description: "Steel city with a strong heartbeat.",
          },
          {
            name: "Novopolotsk",
            description: "Modern industry with northern chill.",
          },
          { name: "Polotsk", description: "The oldest city with deep roots." },
          {
            name: "Lida",
            description: "A medieval castle and lively culture.",
          },
          { name: "Mazyr", description: "A scenic spot nestled by rivers." },
          {
            name: "Svetlogorsk",
            description: "A cozy town with creative sparks.",
          },
          {
            name: "Slutsk",
            description: "Traditional flair meets town pride.",
          },
          { name: "Rechytsa", description: "A town full of river charm." },
          {
            name: "Borisov",
            description: "Football fans and rich history unite.",
          },
          {
            name: "Maladzyechna",
            description: "Concerts and calm in equal measure.",
          },
          { name: "Kobryn", description: "Where waterways guide the way." },
          {
            name: "Soligorsk",
            description: "Salt of the earth and proud of it.",
          },
          {
            name: "Dzerzhinsk",
            description: "Small but mighty, full of character.",
          },
          { name: "Nesvizh", description: "A castle town with royal vibes." },
          { name: "Mir", description: "Step into a fairytale fortress." },
          {
            name: "Smorgon",
            description: "Northwestern charm and traditions.",
          },
          { name: "Krichev", description: "A riverside town full of stories." },
          { name: "Slonim", description: "Theatrical roots and quiet grace." },
          {
            name: "Zaslavl",
            description: "Ancient spirit with a modern beat.",
          },
          {
            name: "Shklov",
            description: "Markets, rivers, and friendly smiles.",
          },
        ],
      },

      {
        name: "Belgium",
        description:
          "A country in Western Europe, famous for its medieval towns, beer, and chocolates.",
        topics: [],
        rooms: [
          {
            name: "Brussels",
            description: "The buzzing capital full of waffles and wonders.",
          },
          {
            name: "Antwerp",
            description: "Diamonds and design in a stylish city.",
          },
          { name: "Ghent", description: "A medieval city with modern charm." },
          {
            name: "Bruges",
            description: "A fairytale town with canals and cobbles.",
          },
          {
            name: "Leuven",
            description: "Where beer meets brains in a student hub.",
          },
          {
            name: "Liège",
            description: "An energetic city with fiery spirit.",
          },
          {
            name: "Namur",
            description: "Fortresses and rivers define this gem.",
          },
          {
            name: "Charleroi",
            description: "A city rising with art and grit.",
          },
          { name: "Mons", description: "Cultural vibes and historic pride." },
          {
            name: "Mechelen",
            description: "Bells, beauty, and Belgian flair.",
          },
          {
            name: "Hasselt",
            description: "Sweet jenever and street style blend here.",
          },
          {
            name: "Tournai",
            description: "One of Belgium's oldest cities with rich history.",
          },
          {
            name: "Kortrijk",
            description: "Textiles and tech meet medieval streets.",
          },
          {
            name: "Ostend",
            description: "Seaside fun with a splash of history.",
          },
          {
            name: "Sint-Niklaas",
            description: "The big square says it all — festive fun!",
          },
          {
            name: "Genk",
            description: "Diverse, dynamic, and driven by innovation.",
          },
          {
            name: "Aalst",
            description: "Carnivals, comedy, and charm combined.",
          },
          {
            name: "Louvain-la-Neuve",
            description: "A young town buzzing with student life.",
          },
          {
            name: "Arlon",
            description: "Quiet, quaint, and close to Luxembourg.",
          },
          {
            name: "Diepenbeek",
            description: "Small but scholarly in the heart of Limburg.",
          },
          {
            name: "Roeselare",
            description: "Sporty, stylish, and full of surprises.",
          },
          {
            name: "Dendermonde",
            description: "Myths, music, and medieval magic.",
          },
          {
            name: "Turnhout",
            description: "Card games and castles rule here.",
          },
          {
            name: "Heist-op-den-Berg",
            description: "Hilltop views and happy vibes.",
          },
          {
            name: "Binche",
            description: "Carnival central with colorful traditions.",
          },
          { name: "Ypres", description: "History lives on in every brick." },
          {
            name: "Geraardsbergen",
            description: "Steep climbs and sweet pies await.",
          },
          {
            name: "Wavre",
            description: "Family fun and fantasy-filled parks.",
          },
          {
            name: "La Louvière",
            description: "Industry, art, and innovation collide.",
          },
          {
            name: "Nivelles",
            description: "A peaceful town with Romanesque roots.",
          },
        ],
      },

      {
        name: "Belize",
        description:
          "A small Central American country known for its Caribbean coastline and Mayan ruins.",
        topics: [],
        rooms: [
          {
            name: "Belize City",
            description: "Bustling streets and Caribbean breezes.",
          },
          { name: "San Pedro", description: "Island vibes and beachside fun." },
          { name: "Caye Caulker", description: "Relax, unwind, and go slow!" },
          {
            name: "Orange Walk",
            description: "Sugar town with sweet surprises.",
          },
          {
            name: "Dangriga",
            description: "Culture, drums, and coastal charm.",
          },
          {
            name: "Punta Gorda",
            description: "Jungle meets sea in this southern gem.",
          },
          {
            name: "Belmopan",
            description: "The quiet capital with a green heart.",
          },
          { name: "Corozal", description: "Northern breeze and border charm." },
          { name: "Placencia", description: "Sandy shores and sunny smiles." },
          {
            name: "Hopkins",
            description: "Garifuna rhythms and coastal peace.",
          },
          {
            name: "Sarteneja",
            description: "Fishing village with fearless spirit.",
          },
          {
            name: "Benque Viejo",
            description: "Border town with deep heritage.",
          },
          {
            name: "Spanish Lookout",
            description: "Modern farms and Mennonite flair.",
          },
          {
            name: "Maya Centre",
            description: "A gateway to nature and tradition.",
          },
          {
            name: "Ladyville",
            description: "Airport town with island access.",
          },
          {
            name: "Hattieville",
            description: "Built from strength after the storm.",
          },
          {
            name: "Valley of Peace",
            description: "Tranquil living and true community.",
          },
          {
            name: "Crooked Tree",
            description: "Birds, lagoons, and laid-back life.",
          },
          {
            name: "San Ignacio",
            description: "Adventure starts in this lively town.",
          },
          {
            name: "Bullet Tree Falls",
            description: "Riverside fun and rustic vibes.",
          },
          {
            name: "Santa Elena",
            description: "Twin to San Ignacio, twice the charm.",
          },
          {
            name: "Dangriga Town",
            description: "Colorful culture on every corner.",
          },
          {
            name: "Monkey River",
            description: "Wildlife and whispers in the mangroves.",
          },
          {
            name: "Big Falls",
            description: "A peaceful village in lush lands.",
          },
          { name: "Blue Creek", description: "Rolling hills and cool waters." },
          {
            name: "Red Bank",
            description: "Hidden gem known for scarlet macaws.",
          },
          {
            name: "Independence",
            description: "Gateway to banana farms and boats.",
          },
          {
            name: "Teakettle",
            description: "Tiny village with a quirky name.",
          },
          {
            name: "Double Head Cabbage",
            description: "A fun name and farming pride.",
          },
          {
            name: "Gales Point",
            description: "A quiet peninsula with a unique beat.",
          },
        ],
      },

      {
        name: "Benin",
        description:
          "A West African country known for its historical significance in the Kingdom of Dahomey.",
        topics: [],
        rooms: [
          {
            name: "Cotonou",
            description: "Bustling streets and beachside vibes.",
          },
          {
            name: "Porto-Novo",
            description: "The capital with colonial charm.",
          },
          { name: "Abomey", description: "Home of kings and rich history." },
          {
            name: "Ouidah",
            description: "Spiritual paths and slave route echoes.",
          },
          {
            name: "Parakou",
            description: "Northern trade and cultural heart.",
          },
          {
            name: "Bohicon",
            description: "Busy crossroads and market scenes.",
          },
          {
            name: "Natitingou",
            description: "Tata castles and mountain breeze.",
          },
          { name: "Djougou", description: "Friendly faces in a lively town." },
          {
            name: "Kandi",
            description: "Sun-drenched fields and rural pride.",
          },
          { name: "Malanville", description: "Border buzz and river life." },
          { name: "Lokossa", description: "Quiet town with a gentle rhythm." },
          { name: "Savalou", description: "Yam festival and highland calm." },
          { name: "Allada", description: "Once a kingdom, always regal." },
          { name: "Kétou", description: "A cradle of Yoruba heritage." },
          {
            name: "Dassa-Zoumé",
            description: "Hilltops, shrines, and serenity.",
          },
          { name: "Tchaourou", description: "Rest stop with rustic charm." },
          {
            name: "Banikoara",
            description: "Agriculture and quiet determination.",
          },
          { name: "Nikki", description: "Horses, heritage, and celebration." },
          { name: "Pobè", description: "Green lands and border trade." },
          { name: "Comé", description: "Lakeside beauty and weekend joy." },
          { name: "Bembèrèkè", description: "Hidden charm up north." },
          { name: "Covè", description: "A cozy stop in the Zou." },
          {
            name: "Zogbodomey",
            description: "Community spirit and local pride.",
          },
          {
            name: "Aplahoué",
            description: "Fields, food, and friendly faces.",
          },
          {
            name: "Djakotomey",
            description: "Village vibes and traditional flair.",
          },
          { name: "Dogbo", description: "Lively markets and laid-back pace." },
          { name: "Grand-Popo", description: "Where the ocean meets culture." },
          { name: "Sakété", description: "A town of roots and rhythm." },
          { name: "Toviklin", description: "Small town, big heart." },
          { name: "Ouaké", description: "Hills, harmony, and hospitality." },
        ],
      },

      {
        name: "Bhutan",
        description:
          "A landlocked country in the Himalayas, known for its focus on happiness and sustainability.",
        topics: [],
        rooms: [
          {
            name: "Thimphu",
            description: "The peaceful capital with rich culture.",
          },
          {
            name: "Paro",
            description: "Home to the iconic Tiger's Nest Monastery.",
          },
          {
            name: "Punakha",
            description: "Famous for its stunning dzong and valleys.",
          },
          {
            name: "Trongsa",
            description: "Heart of Bhutan with historical significance.",
          },
          {
            name: "Bumthang",
            description: "Spiritual and cultural heartland.",
          },
          {
            name: "Wangdue Phodrang",
            description: "Lush landscapes and ancient dzongs.",
          },
          {
            name: "Samdrup Jongkhar",
            description: "Gateway to India with vibrant markets.",
          },
          {
            name: "Samtse",
            description: "Tropical lowlands with diverse culture.",
          },
          {
            name: "Trashigang",
            description: "Eastern beauty with mountain views.",
          },
          {
            name: "Dagana",
            description: "Forests and traditional lifestyles.",
          },
          {
            name: "Gasa",
            description: "Remote and pristine Himalayan wilderness.",
          },
          { name: "Haa", description: "Secluded valley with rich traditions." },
          { name: "Lhuntse", description: "Known for its handwoven textiles." },
          { name: "Mongar", description: "Bustling town with natural beauty." },
          {
            name: "Pemagatshel",
            description: "Cultural hub with scenic views.",
          },
          {
            name: "Trashiyangtse",
            description: "Artisan crafts and mountain scenery.",
          },
        ],
      },

      {
        name: "Bolivia",
        description:
          "A landlocked country in South America, known for its Andes Mountains and salt flats.",
        topics: [],
        rooms: [
          {
            name: "La Paz",
            description:
              "The high-altitude seat of government with vibrant markets.",
          },
          {
            name: "Santa Cruz",
            description: "A tropical and economic hub full of life.",
          },
          {
            name: "Cochabamba",
            description:
              "Known as the 'City of Eternal Spring' for its pleasant climate.",
          },
          {
            name: "Oruro",
            description: "Famous for its lively carnival and mining history.",
          },
          {
            name: "Potosí",
            description: "Historic mining city near the vast salt flats.",
          },
          {
            name: "Tarija",
            description: "Renowned for its vineyards and warm weather.",
          },
          {
            name: "Beni",
            description: "Lowland region rich in wildlife and rivers.",
          },
          {
            name: "Pando",
            description: "Remote Amazonian jungle with diverse nature.",
          },
          {
            name: "Chuquisaca",
            description:
              "Home to Sucre, Bolivia's constitutional capital with colonial charm.",
          },
        ],
      },

      {
        name: "Bosnia and Herzegovina",
        description:
          "A country in Southeastern Europe, known for its cultural diversity and Ottoman influence.",
        topics: [],
        rooms: [
          {
            name: "Sarajevo",
            description:
              "The vibrant capital city with rich history and culture.",
          },
          {
            name: "Banja Luka",
            description: "A lively city known for its rivers and green spaces.",
          },
          {
            name: "Mostar",
            description: "Famous for its iconic bridge and beautiful old town.",
          },
          {
            name: "Tuzla",
            description: "Known for its salt lakes and warm hospitality.",
          },
          {
            name: "Zenica",
            description: "An industrial city surrounded by natural beauty.",
          },
          {
            name: "Doboj",
            description:
              "A strategic town with a mix of history and modern life.",
          },
          {
            name: "Bihać",
            description: "Gateway to stunning national parks and rivers.",
          },
          {
            name: "Goražde",
            description: "A peaceful city along the Drina river.",
          },
          {
            name: "Trebinje",
            description: "Southern town known for Mediterranean charm.",
          },
          {
            name: "Foča",
            description: "Mountainous area with amazing outdoor adventures.",
          },
        ],
      },

      {
        name: "Botswana",
        description:
          "A landlocked country in Southern Africa, famous for its wildlife and the Okavango Delta.",
        topics: [],
        rooms: [
          {
            name: "Gaborone",
            description: "The bustling capital city and administrative center.",
          },
          {
            name: "Francistown",
            description: "A historic mining town with lively markets.",
          },
          {
            name: "Maun",
            description: "The gateway to the Okavango Delta adventures.",
          },
          {
            name: "Kasane",
            description:
              "Close to Chobe National Park, perfect for wildlife lovers.",
          },
          {
            name: "Selibe Phikwe",
            description: "A mining town with friendly local culture.",
          },
          {
            name: "Lobatse",
            description:
              "Known for its meat industry and traditional heritage.",
          },
          {
            name: "Serowe",
            description:
              "A large village with rich history and cultural significance.",
          },
          {
            name: "Molepolole",
            description: "One of the largest traditional villages in Botswana.",
          },
          {
            name: "Sowa",
            description: "Home to the unique Sua Pan salt flats.",
          },
          {
            name: "Jwaneng",
            description:
              "Famous for its diamond mines and modern infrastructure.",
          },
        ],
      },

      {
        name: "Brazil",
        description:
          "The largest country in South America, known for its Amazon rainforest and football culture.",
        topics: [],
        rooms: [
          {
            name: "Acre",
            description:
              "Explore the lush Amazon rainforest and its mysteries.",
          },
          {
            name: "Alagoas",
            description:
              "Relax on beautiful beaches and vibrant coastal towns.",
          },
          {
            name: "Amapá",
            description:
              "Discover the wild northern forests and the Amazon River delta.",
          },
          {
            name: "Amazonas",
            description: "Dive deep into the heart of the Amazon rainforest.",
          },
          {
            name: "Bahia",
            description:
              "Experience lively culture, music, and beautiful beaches.",
          },
          {
            name: "Ceará",
            description: "Enjoy stunning beaches and energetic city life.",
          },
          {
            name: "Distrito Federal",
            description:
              "Visit the capital, Brasília, with its modern architecture.",
          },
          {
            name: "Espírito Santo",
            description: "Known for its beaches and rich culinary traditions.",
          },
          {
            name: "Goiás",
            description:
              "Explore waterfalls and the vibrant Cerrado landscape.",
          },
          {
            name: "Maranhão",
            description: "Discover the unique Lençóis Maranhenses sand dunes.",
          },
          {
            name: "Mato Grosso",
            description:
              "Visit the Pantanal, the world's largest tropical wetland.",
          },
          {
            name: "Mato Grosso do Sul",
            description: "Known for wetlands, wildlife, and nature parks.",
          },
          {
            name: "Minas Gerais",
            description: "Famous for historic towns and delicious cuisine.",
          },
          {
            name: "Pará",
            description:
              "Home to the Amazon River and diverse indigenous cultures.",
          },
          {
            name: "Paraíba",
            description: "Experience warm beaches and rich folklore.",
          },
          {
            name: "Paraná",
            description:
              "Known for its forests, waterfalls, and vibrant cities.",
          },
          {
            name: "Pernambuco",
            description: "Famous for carnival, music, and historic sites.",
          },
          {
            name: "Piauí",
            description: "Explore beautiful beaches and prehistoric rock art.",
          },
          {
            name: "Rio de Janeiro",
            description: "Home to iconic beaches, samba, and carnival spirit.",
          },
          {
            name: "Rio Grande do Norte",
            description: "Known for dunes, beaches, and seafood.",
          },
          {
            name: "Rio Grande do Sul",
            description: "Famous for gaucho culture and beautiful landscapes.",
          },
          {
            name: "Rondônia",
            description: "Discover Amazon forest and riverside communities.",
          },
          {
            name: "Roraima",
            description: "Visit tabletop mountains and pristine nature.",
          },
          {
            name: "Santa Catarina",
            description: "Enjoy coastal towns and German-influenced culture.",
          },
          {
            name: "São Paulo",
            description:
              "Brazil's economic powerhouse with rich cultural diversity.",
          },
          {
            name: "Sergipe",
            description: "Known for beautiful beaches and friendly towns.",
          },
          {
            name: "Tocantins",
            description:
              "Explore savannas, waterfalls, and the Araguaia River.",
          },
        ],
      },

      {
        name: "Brunei",
        description:
          "A small, wealthy country on the island of Borneo, known for its oil resources and Islamic culture.",
        topics: [],
        rooms: [
          {
            name: "Brunei-Muara",
            description:
              "The most populous district, home to the capital Bandar Seri Begawan.",
          },
          {
            name: "Belait",
            description:
              "Known for oil and gas industries and beautiful coastline.",
          },
          {
            name: "Tutong",
            description:
              "A peaceful district with rich cultural heritage and nature spots.",
          },
          {
            name: "Temburong",
            description:
              "A remote district famous for its pristine rainforest and biodiversity.",
          },
        ],
      },

      {
        name: "Bulgaria",
        description:
          "A country in Southeast Europe, known for its historical sites and diverse landscapes.",
        topics: [],
        rooms: [
          {
            name: "Blagoevgrad",
            description:
              "Explore the mountainous beauty and lively university town vibes.",
          },
          {
            name: "Burgas",
            description:
              "Coastal city fun with beaches and festivals to enjoy.",
          },
          {
            name: "Varna",
            description:
              "Dive into the sunny shores and bustling seaside energy.",
          },
          {
            name: "Veliko Tarnovo",
            description: "Discover the medieval charm and hilltop views.",
          },
          {
            name: "Vidin",
            description:
              "A riverside city with ancient fortresses and quiet streets.",
          },
          {
            name: "Vratsa",
            description: "Gateway to stunning cliffs and natural wonders.",
          },
          {
            name: "Gabrovo",
            description:
              "Home of humor and craftsmanship, with a quirky spirit.",
          },
          {
            name: "Dobrich",
            description:
              "Experience the fertile plains and cultural traditions.",
          },
          {
            name: "Kardzhali",
            description: "Hidden gems of nature and multicultural heritage.",
          },
          {
            name: "Kyustendil",
            description: "Famous for mineral springs and vibrant gardens.",
          },
          {
            name: "Lovech",
            description: "Medieval bridges and historical streets await.",
          },
          {
            name: "Montana",
            description: "Peaceful landscapes and ancient Roman history.",
          },
          {
            name: "Pazardzhik",
            description: "A blend of tradition and growing urban life.",
          },
          {
            name: "Pernik",
            description: "Known for festivals and industrial history.",
          },
          {
            name: "Pleven",
            description: "Rich in history and beautiful parks to explore.",
          },
          {
            name: "Plovdiv",
            description: "Art, history, and lively streets full of energy.",
          },
          {
            name: "Razgrad",
            description: "A mix of cultures and historic ruins.",
          },
          {
            name: "Ruse",
            description: "The Danube's gateway with grand architecture.",
          },
          {
            name: "Silistra",
            description: "A riverside city with ancient roots and warm vibes.",
          },
          {
            name: "Sliven",
            description: "City of the blue stones and natural beauty.",
          },
          {
            name: "Smolyan",
            description: "Mountain adventures and traditional crafts.",
          },
          {
            name: "Sofia",
            description:
              "The buzzing capital with rich history and modern life.",
          },
          {
            name: "Stara Zagora",
            description: "A city where ancient ruins meet green parks.",
          },
          {
            name: "Targovishte",
            description: "Known for markets and rich cultural heritage.",
          },
          {
            name: "Haskovo",
            description: "Sun-soaked hills and vibrant traditions.",
          },
          {
            name: "Shumen",
            description: "Historic monuments and folklore spirit.",
          },
          {
            name: "Yambol",
            description: "Fields, vineyards, and a laid-back lifestyle.",
          },
        ],
      },

      {
        name: "Burkina Faso",
        description:
          "A landlocked country in West Africa, known for its cultural diversity and natural resources.",
        topics: [],
        rooms: [
          {
            name: "Boucle du Mouhoun",
            description: "Land of rivers and rich farmlands.",
          },
          {
            name: "Cascades",
            description: "Home to beautiful waterfalls and lush landscapes.",
          },
          { name: "Centre", description: "The bustling heart of the nation." },
          {
            name: "Centre-Est",
            description: "A region of growing towns and vibrant culture.",
          },
          {
            name: "Centre-Nord",
            description: "Savanna lands with traditional lifestyles.",
          },
          {
            name: "Centre-Ouest",
            description: "Where nature meets rural charm.",
          },
          {
            name: "Centre-Sud",
            description: "Warm lands known for friendly communities.",
          },
          { name: "Est", description: "Eastern plains with rich wildlife." },
          {
            name: "Hauts-Bassins",
            description: "Western highlands with scenic beauty.",
          },
          {
            name: "Nord",
            description: "Northern region with vast open spaces.",
          },
          {
            name: "Plateau-Central",
            description: "Central plateau with cultural heritage.",
          },
          {
            name: "Sahel",
            description: "The semi-arid belt with resilient communities.",
          },
          {
            name: "Sud-Ouest",
            description: "Southwest lands with unique traditions.",
          },
        ],
      },
      {
        name: "Burundi",
        description:
          "A small, landlocked country in East Africa, facing challenges related to poverty and conflict.",
        topics: [],
        rooms: [
          {
            name: "Bubanza",
            description:
              "A province with rich agricultural lands and vibrant communities.",
          },
          {
            name: "Bujumbura Mairie",
            description: "The bustling city center and economic hub.",
          },
          {
            name: "Bujumbura Rural",
            description: "Scenic rural lands surrounding the main city.",
          },
          {
            name: "Bururi",
            description:
              "Known for its beautiful hills and coffee plantations.",
          },
          {
            name: "Cankuzo",
            description:
              "Eastern province with diverse cultures and landscapes.",
          },
          {
            name: "Cibitoke",
            description: "A province rich in natural resources and forests.",
          },
          {
            name: "Gitega",
            description: "The heartland with a strong historical heritage.",
          },
          {
            name: "Karuzi",
            description: "Fertile lands known for farming and tradition.",
          },
          {
            name: "Kayanza",
            description: "Northern highlands famous for tea and coffee.",
          },
          { name: "Kirundo", description: "Land of lakes and lush greenery." },
          {
            name: "Makamba",
            description: "Southern province with warm climate and culture.",
          },
          {
            name: "Muramvya",
            description: "Hilly region with rich history and agriculture.",
          },
          {
            name: "Muyinga",
            description: "A province of rolling hills and vibrant communities.",
          },
          {
            name: "Mwaro",
            description: "Known for peaceful landscapes and farming.",
          },
          {
            name: "Ngozi",
            description: "Lively northern province with strong cultural roots.",
          },
          {
            name: "Rutana",
            description: "Eastern lands with scenic views and agriculture.",
          },
          {
            name: "Ruyigi",
            description: "Home to diverse traditions and fertile soils.",
          },
        ],
      },
      {
        name: "Cabo Verde",
        description:
          "An island nation off the coast of West Africa, known for its Creole culture and music.",
        topics: [],
        rooms: [
          {
            name: "Santiago",
            description:
              "The largest island, home to the capital Praia and rich cultural heritage.",
          },
          {
            name: "São Vicente",
            description:
              "Known for its vibrant music scene and port city Mindelo.",
          },
          {
            name: "Sal",
            description: "Famous for its beautiful beaches and tourism.",
          },
          {
            name: "Boa Vista",
            description:
              "Island with stunning dunes and a growing tourist destination.",
          },
          {
            name: "Fogo",
            description:
              "Volcanic island known for its active volcano and coffee plantations.",
          },
          {
            name: "Maio",
            description:
              "Quiet island with beautiful beaches and traditional fishing villages.",
          },
          {
            name: "Santo Antão",
            description:
              "Mountainous island popular for hiking and nature lovers.",
          },
          {
            name: "Brava",
            description:
              "Small island known for its flowers and peaceful atmosphere.",
          },
          {
            name: "São Nicolau",
            description: "Island with rugged landscapes and rich folklore.",
          },
        ],
      },
      {
        name: "Cambodia",
        description:
          "A Southeast Asian country, famous for the Angkor Wat temples and Khmer culture.",
        topics: [],
        rooms: [
          {
            name: "Phnom Penh",
            description:
              "The vibrant capital city and economic hub of Cambodia.",
          },
          {
            name: "Banteay Meanchey",
            description:
              "Known for its temples and border trade with Thailand.",
          },
          {
            name: "Battambang",
            description:
              "Famous for its colonial architecture and rice production.",
          },
          {
            name: "Kampong Cham",
            description:
              "An important agricultural province along the Mekong River.",
          },
          {
            name: "Kampong Chhnang",
            description: "Known for pottery and traditional Khmer crafts.",
          },
          {
            name: "Kampong Speu",
            description: "Renowned for sugar palm and rural landscapes.",
          },
          {
            name: "Kampong Thom",
            description: "Home to ancient temples and wildlife reserves.",
          },
          {
            name: "Kampot",
            description: "Famous for pepper plantations and coastal beauty.",
          },
          {
            name: "Kandal",
            description: "Surrounds Phnom Penh and is rich in agriculture.",
          },
          {
            name: "Kep",
            description:
              "A small coastal province known for its seafood and beaches.",
          },
          {
            name: "Kratié",
            description:
              "Known for the rare Irrawaddy dolphins in the Mekong River.",
          },
          {
            name: "Mondulkiri",
            description:
              "Mountainous region known for waterfalls and indigenous cultures.",
          },
          {
            name: "Oddar Meanchey",
            description:
              "A province with rich forest resources and historical sites.",
          },
          {
            name: "Pailin",
            description: "Famous for gem mining and former conflict zones.",
          },
          {
            name: "Preah Vihear",
            description:
              "Home to the famous Preah Vihear Temple on the border with Thailand.",
          },
          {
            name: "Prey Veng",
            description: "An agricultural province known for rice farming.",
          },
          {
            name: "Pursat",
            description: "Known for its palm sugar and Tonle Sap wetlands.",
          },
          {
            name: "Ratanakiri",
            description:
              "A remote province with dense forests and ethnic minorities.",
          },
          {
            name: "Siem Reap",
            description:
              "Gateway to the Angkor Wat temple complex and major tourist destination.",
          },
          {
            name: "Preah Sihanouk",
            description: "Coastal province famous for beaches and islands.",
          },
          {
            name: "Stung Treng",
            description: "Known for its river ecosystems and natural beauty.",
          },
          {
            name: "Svay Rieng",
            description: "A border province with rice farming and small towns.",
          },
          {
            name: "Takeo",
            description:
              "One of Cambodia's oldest provinces with ancient ruins.",
          },
          {
            name: "Tboung Khmum",
            description:
              "Known for agriculture and proximity to the Mekong River.",
          },
        ],
      },
      {
        name: "Cameroon",
        description:
          "A country in Central Africa, known for its cultural diversity and natural resources.",
        topics: [],
        rooms: [
          {
            name: "Adamawa",
            description: "Known for its plateaus and cattle farming.",
          },
          {
            name: "Centre",
            description:
              "Contains the capital city Yaoundé and central administrative hubs.",
          },
          {
            name: "East",
            description:
              "Rich in forests and biodiversity, with vast natural resources.",
          },
          {
            name: "Far North",
            description:
              "A semi-arid region known for its Sahelian climate and diverse ethnic groups.",
          },
          {
            name: "Littoral",
            description:
              "Home to Douala, the largest city and economic capital, along the coast.",
          },
          {
            name: "North",
            description: "Known for its savannahs and traditional kingdoms.",
          },
          {
            name: "Northwest",
            description:
              "A mountainous region with English-speaking communities.",
          },
          {
            name: "West",
            description:
              "Known for its highlands, cultural heritage, and agriculture.",
          },
          {
            name: "South",
            description: "A rainforest-rich region with coastal access.",
          },
          {
            name: "Southwest",
            description:
              "Known for its beaches, forests, and English-speaking population.",
          },
        ],
      },
      {
        name: "Canada",
        description:
          "The second-largest country in the world, known for its vast landscapes and multicultural population.",
        topics: [],
        rooms: [
          {
            name: "Alberta",
            description:
              "Known for its prairies, Rocky Mountains, and oil industry.",
          },
          {
            name: "British Columbia",
            description:
              "Famous for its Pacific coastline, mountains, and forests.",
          },
          {
            name: "Manitoba",
            description: "Known for its lakes, rivers, and cultural diversity.",
          },
          {
            name: "New Brunswick",
            description:
              "A Maritime province with beautiful coastlines and forests.",
          },
          {
            name: "Newfoundland and Labrador",
            description: "Known for rugged coastline and maritime culture.",
          },
          {
            name: "Nova Scotia",
            description: "Famous for its coastal beauty and historic sites.",
          },
          {
            name: "Ontario",
            description:
              "Home to Canada's largest city Toronto and the national capital Ottawa.",
          },
          {
            name: "Prince Edward Island",
            description: "Known for its red sand beaches and agriculture.",
          },
          {
            name: "Quebec",
            description:
              "A primarily French-speaking province known for its culture and history.",
          },
          {
            name: "Saskatchewan",
            description: "Known for its vast prairies and agriculture.",
          },
          {
            name: "Northwest Territories",
            description: "Known for its wilderness and indigenous cultures.",
          },
          {
            name: "Nunavut",
            description:
              "The largest and newest territory, home to Inuit communities.",
          },
          {
            name: "Yukon",
            description:
              "Famous for its gold rush history and mountainous landscapes.",
          },
        ],
      },
      {
        name: "Central African Republic",
        description:
          "A landlocked country in Central Africa, facing political instability and poverty.",
        topics: [],
        rooms: [
          {
            name: "Bamingui-Bangoran",
            description:
              "A northern prefecture known for its savannahs and wildlife.",
          },
          {
            name: "Bangui",
            description:
              "The capital city and special commune, the political and economic center.",
          },
          {
            name: "Basse-Kotto",
            description:
              "A southeastern prefecture with dense forests and rivers.",
          },
          {
            name: "Haut-Mbomou",
            description: "A southeastern region with significant biodiversity.",
          },
          {
            name: "Haute-Kotto",
            description:
              "A large northeastern prefecture with rich mineral resources.",
          },
          {
            name: "Kémo",
            description:
              "Located centrally, known for agriculture and forest resources.",
          },
          {
            name: "Lobaye",
            description:
              "A southwestern prefecture with tropical forests and agriculture.",
          },
          {
            name: "Mambéré-Kadéï",
            description:
              "A western region rich in minerals and forest resources.",
          },
          {
            name: "Mbomou",
            description:
              "Southeastern prefecture known for its natural reserves.",
          },
          {
            name: "Nana-Grébizi",
            description: "A small prefecture in the north-central region.",
          },
          {
            name: "Nana-Mambéré",
            description: "Located in the western part, rich in forests.",
          },
          {
            name: "Ouham",
            description: "A northern prefecture with agricultural activity.",
          },
          {
            name: "Ouham-Fafa",
            description: "A newer prefecture in the northwest.",
          },
          {
            name: "Ouham-Pendé",
            description: "Northwestern prefecture bordering Cameroon.",
          },
          {
            name: "Sangha-Mbaéré",
            description: "A southwestern prefecture, known for its rainforest.",
          },
          {
            name: "Vakaga",
            description: "The northeasternmost prefecture, sparsely populated.",
          },
        ],
      },

      {
        name: "Chad",
        description:
          "A landlocked country in North-Central Africa, known for its deserts and wildlife.",
        topics: [],
        rooms: [
          {
            name: "Batha",
            description:
              "A central region with semi-arid climate and savannah.",
          },
          {
            name: "Biltine",
            description: "Located in eastern Chad, known for its dry terrain.",
          },
          {
            name: "Borkou",
            description: "A northern desert region with sparse population.",
          },
          {
            name: "Chari-Baguirmi",
            description:
              "A southwestern region near Lake Chad with fertile land.",
          },
          {
            name: "Guéra",
            description: "A central region with mountains and valleys.",
          },
          {
            name: "Hadjer-Lamis",
            description: "A western region near the capital, N'Djamena.",
          },
          {
            name: "Kanem",
            description: "Located in western Chad, known for agriculture.",
          },
          {
            name: "Lac",
            description:
              "Region surrounding Lake Chad, rich in fishery resources.",
          },
          {
            name: "Logone Occidental",
            description: "A southern region with tropical climate.",
          },
          {
            name: "Logone Oriental",
            description:
              "A southern region bordering Cameroon and Central African Republic.",
          },
          {
            name: "Mayo-Kebbi Est",
            description: "A southwestern region with forest and savannah.",
          },
          {
            name: "Mayo-Kebbi Ouest",
            description:
              "Located in the southwest with diverse flora and fauna.",
          },
          {
            name: "Moyen-Chari",
            description:
              "A southern region known for agriculture and wetlands.",
          },
          {
            name: "Ouaddaï",
            description:
              "An eastern region with historic towns and cultural heritage.",
          },
          {
            name: "Salamat",
            description:
              "A southeastern region known for Zakouma National Park.",
          },
          {
            name: "Sila",
            description: "A southeastern region with diverse ethnic groups.",
          },
          {
            name: "Tandjilé",
            description: "A southwestern agricultural region.",
          },
          {
            name: "Tibesti",
            description:
              "A mountainous northern region with the Tibesti Mountains.",
          },
          {
            name: "Wadi Fira",
            description: "An eastern region with arid climate.",
          },
        ],
      },
      {
        name: "Chile",
        description:
          "A long, narrow country in South America, famous for its wine and the Andes mountains.",
        topics: [],
        rooms: [
          {
            name: "Arica y Parinacota",
            description:
              "The northernmost region known for its desert landscapes and archaeological sites.",
          },
          {
            name: "Tarapacá",
            description: "A region famous for mining and the Atacama Desert.",
          },
          {
            name: "Antofagasta",
            description:
              "A mining and coastal region with rich mineral resources.",
          },
          {
            name: "Atacama",
            description: "Known for its deserts and salt flats.",
          },
          {
            name: "Coquimbo",
            description: "A region known for vineyards and beaches.",
          },
          {
            name: "Valparaíso",
            description: "Famous for its port city and colorful hills.",
          },
          {
            name: "Metropolitana de Santiago",
            description:
              "The capital region, home to Santiago, Chile's largest city.",
          },
          {
            name: "O'Higgins",
            description:
              "A central region known for agriculture and wine production.",
          },
          {
            name: "Maule",
            description: "A region known for vineyards and fertile valleys.",
          },
          {
            name: "Ñuble",
            description: "Known for its agriculture and national parks.",
          },
          {
            name: "Biobío",
            description:
              "An industrial and agricultural hub with a Pacific coastline.",
          },
          {
            name: "La Araucanía",
            description:
              "Famous for its indigenous Mapuche culture and forests.",
          },
          {
            name: "Los Ríos",
            description: "Known for rivers, lakes, and natural beauty.",
          },
          {
            name: "Los Lagos",
            description: "A region with lakes, volcanoes, and forests.",
          },
          {
            name: "Aysén",
            description:
              "A remote, mountainous region with fjords and glaciers.",
          },
          {
            name: "Magallanes y la Antártica Chilena",
            description:
              "The southernmost region, including Patagonia and Antarctica claims.",
          },
        ],
      },

      {
        name: "China",
        description:
          "The most populous country in the world, with a rich history and rapidly growing economy.",
        topics: [],
        rooms: [
          {
            name: "Beijing",
            description:
              "The buzzing capital where ancient history meets modern hustle.",
          },
          {
            name: "Shanghai",
            description: "Skyline dreams and vibrant city life by the river.",
          },
          {
            name: "Guangdong",
            description: "Home to tasty dim sum and lively coastal vibes.",
          },
          {
            name: "Sichuan",
            description: "Spicy food paradise and panda cuddles await!",
          },
          {
            name: "Zhejiang",
            description: "Where scenic lakes and bustling markets come alive.",
          },
          {
            name: "Jiangsu",
            description: "Historic gardens meet futuristic innovation.",
          },
          {
            name: "Shandong",
            description: "Birthplace of Confucius and seafood delights.",
          },
          {
            name: "Hunan",
            description: "Bold flavors and beautiful mountains set the scene.",
          },
          {
            name: "Hebei",
            description: "Great walls, ancient towns, and nature spots galore.",
          },
          {
            name: "Fujian",
            description: "Coastal breezes and tea plantations to explore.",
          },
          {
            name: "Yunnan",
            description: "Diverse cultures and stunning landscapes galore.",
          },
          {
            name: "Anhui",
            description:
              "Mountain trails and traditional vibes around every corner.",
          },
          {
            name: "Guizhou",
            description: "Hidden gems and colorful festivals await discovery.",
          },
          {
            name: "Jiangxi",
            description: "Rich history and lush countryside vibes.",
          },
          {
            name: "Liaoning",
            description: "Industrial heartland with a touch of coastal charm.",
          },
          {
            name: "Tianjin",
            description: "Port city with European flair and tasty street food.",
          },
          {
            name: "Xinjiang",
            description: "Vast deserts, vibrant cultures, and epic adventures.",
          },
          {
            name: "Inner Mongolia",
            description: "Endless grasslands and nomadic tales to tell.",
          },
          {
            name: "Chongqing",
            description: "Spicy hotpot city nestled among rivers and hills.",
          },
          {
            name: "Hubei",
            description: "Land of lakes and a vibrant city buzz.",
          },
          {
            name: "Gansu",
            description: "Silk Road stories and desert landscapes.",
          },
          {
            name: "Jilin",
            description: "Snowy winters and scenic mountain escapes.",
          },
          {
            name: "Guangxi",
            description: "Karst landscapes and river cruises to enjoy.",
          },
          {
            name: "Qinghai",
            description: "High-altitude lakes and Tibetan culture.",
          },
          {
            name: "Ningxia",
            description: "Desert beauty meets rich history.",
          },
          {
            name: "Hainan",
            description: "Tropical island paradise with sandy beaches.",
          },
          {
            name: "Taiwan",
            description:
              "Island vibes with bustling night markets and mountains.",
          },
          {
            name: "Macau",
            description: "Glamorous casinos and Portuguese charm collide.",
          },
          {
            name: "Hong Kong",
            description: "Sky-high views and a melting pot of cultures.",
          },
        ],
      },
      {
        name: "Colombia",
        description:
          "A country in South America known for its coffee, cultural diversity, and beautiful landscapes.",
        topics: [],
        rooms: [
          {
            name: "Antioquia",
            description:
              "A mountainous playground full of lively people and great vibes.",
          },
          {
            name: "Cundinamarca",
            description: "Where the hustle and bustle meets cool mountain air.",
          },
          {
            name: "Valle del Cauca",
            description: "The home of salsa moves and sunny smiles.",
          },
          {
            name: "Atlántico",
            description: "Beachy beats and carnival streets.",
          },
          {
            name: "Santander",
            description: "Adventure calls in the land of canyons and history.",
          },
          {
            name: "Bolívar",
            description: "Old-world charm with a splash of Caribbean fun.",
          },
          {
            name: "Boyacá",
            description: "Emerald hills and cozy colonial chills.",
          },
          {
            name: "Nariño",
            description: "Volcano views and vibrant culture collide here.",
          },
          {
            name: "Tolima",
            description: "Tunes, traditions, and tasty treats await you.",
          },
          {
            name: "Meta",
            description:
              "Wide-open plains perfect for nature lovers and dreamers.",
          },
          {
            name: "Cesar",
            description: "Where music fills the air and stories come alive.",
          },
          {
            name: "Córdoba",
            description: "Sun, culture, and coastal vibes all rolled into one.",
          },
          {
            name: "La Guajira",
            description: "Desert dunes meet indigenous magic and sea breeze.",
          },
          {
            name: "Cauca",
            description:
              "Coffee fields and colorful traditions await your visit.",
          },
          {
            name: "Risaralda",
            description:
              "Coffee, charm, and friendly faces around every corner.",
          },
          {
            name: "Quindío",
            description: "Small but mighty — nature's coffee wonderland.",
          },
          {
            name: "Norte de Santander",
            description:
              "Border tales and lively markets keep the spirit alive.",
          },
          {
            name: "Chocó",
            description: "Rainforest rhythms and lush green dreams.",
          },
          {
            name: "Huila",
            description: "Desert wonders and ancient secrets to explore.",
          },
          {
            name: "Caquetá",
            description: "Amazon adventures await in this jungle paradise.",
          },
          {
            name: "Putumayo",
            description: "Wild landscapes and warm hearts in the south.",
          },
          {
            name: "Guaviare",
            description: "Rivers, forests, and hidden treasures to discover.",
          },
          {
            name: "Vaupés",
            description: "Deep Amazon vibes and peaceful nature spots.",
          },
          {
            name: "Guainía",
            description: "Natural beauty and calm waters in every direction.",
          },
          {
            name: "Vichada",
            description: "Endless plains and big skies for dreamers.",
          },
          {
            name: "Arauca",
            description: "Oil-rich lands with friendly faces and open hearts.",
          },
        ],
      },
      {
        name: "Comoros",
        description:
          "An island nation off the coast of East Africa, known for its rich marine biodiversity.",
        topics: [],
        rooms: [
          {
            name: "Ngazidja (Grande Comore)",
            description:
              "The largest island, where volcanic peaks and tropical beaches meet.",
          },
          {
            name: "Mwali (Mohéli)",
            description:
              "A peaceful island paradise with pristine coral reefs and nature reserves.",
          },
          {
            name: "Nzwani (Anjouan)",
            description:
              "Known for its lush forests and vibrant local culture.",
          },
          {
            name: "Mayotte",
            description:
              "A beautiful island with turquoise lagoons and unique marine life.",
          },
        ],
      },
      {
        name: "Democratic Republic of the Congo",
        description:
          "A country in Central Africa, known for its vast rainforests and mineral wealth.",
        topics: [],
        rooms: [
          {
            name: "Kinshasa",
            description:
              "The bustling capital city on the Congo River, full of culture and energy.",
          },
          {
            name: "Katanga",
            description:
              "A mineral-rich region famous for its mining and beautiful landscapes.",
          },
          {
            name: "Kasai",
            description:
              "Known for its traditional crafts and rich cultural heritage.",
          },
          {
            name: "Ituri",
            description: "Home to dense rainforests and diverse wildlife.",
          },
          {
            name: "Bas-Congo",
            description:
              "A vibrant province with a mix of river life and urban buzz.",
          },
          {
            name: "Equateur",
            description:
              "Lush tropical forests and mighty rivers define this green province.",
          },
          {
            name: "Maniema",
            description: "A province full of untamed nature and rich history.",
          },
        ],
      },
      {
        name: "Costa Rica",
        description:
          "A country in Central America, known for its biodiversity and commitment to environmental conservation.",
        topics: [],
        rooms: [
          {
            name: "San José",
            description:
              "The vibrant capital province, buzzing with culture, history, and city life.",
          },
          {
            name: "Alajuela",
            description:
              "Land of lush coffee plantations and the majestic Arenal Volcano.",
          },
          {
            name: "Cartago",
            description:
              "Known for its rich colonial history and beautiful mountain landscapes.",
          },
          {
            name: "Heredia",
            description:
              "A province full of charming towns and green coffee farms.",
          },
          {
            name: "Guanacaste",
            description:
              "Famous for stunning beaches and sunny weather perfect for surfing.",
          },
          {
            name: "Puntarenas",
            description:
              "Home to coastal paradise spots and the famous Nicoya Peninsula.",
          },
          {
            name: "Limón",
            description:
              "A Caribbean-flavored province full of rainforests and vibrant culture.",
          },
        ],
      },
      {
        name: "Croatia",
        description:
          "A country in Southeastern Europe, famous for its Adriatic coastline and medieval towns.",
        topics: [],
        rooms: [
          {
            name: "Zagreb",
            description:
              "The lively capital city with a mix of history, culture, and modern vibes.",
          },
          {
            name: "Split-Dalmatia",
            description:
              "Known for beautiful beaches and the ancient Diocletian's Palace.",
          },
          {
            name: "Istria",
            description:
              "A peninsula famous for truffles, vineyards, and charming coastal towns.",
          },
          {
            name: "Dubrovnik-Neretva",
            description:
              "Home to the iconic walled city of Dubrovnik and stunning seaside views.",
          },
          {
            name: "Osijek-Baranja",
            description:
              "Famous for its rich history and lush nature reserves.",
          },
          {
            name: "Primorje-Gorski Kotar",
            description:
              "A coastal and mountainous region known for islands and outdoor adventures.",
          },
          {
            name: "Lika-Senj",
            description:
              "Known for rugged landscapes and the beautiful Plitvice Lakes National Park.",
          },
        ],
      },
      {
        name: "Cuba",
        description:
          "An island nation in the Caribbean, known for its communist regime, vibrant culture, and cigars.",
        topics: [],
        rooms: [
          {
            name: "Havana",
            description:
              "The lively capital city full of colorful streets, classic cars, and salsa beats.",
          },
          {
            name: "Santiago de Cuba",
            description:
              "A city rich in Afro-Cuban culture and history, with vibrant music scenes.",
          },
          {
            name: "Camagüey",
            description: "Famous for its winding streets and colonial charm.",
          },
          {
            name: "Holguín",
            description: "Known for beautiful beaches and lush mountains.",
          },
          {
            name: "Cienfuegos",
            description:
              "The Pearl of the South, with French-inspired architecture and seaside vibes.",
          },
          {
            name: "Matanzas",
            description:
              "A region famous for poets, waterfalls, and Afro-Cuban folklore.",
          },
          {
            name: "Villa Clara",
            description:
              "Home to Santa Clara and its rich revolutionary history.",
          },
        ],
      },
      {
        name: "Cyprus",
        description:
          "An island nation in the Eastern Mediterranean, known for its ancient history and beaches.",
        topics: [],
        rooms: [
          {
            name: "Nicosia",
            description:
              "The capital city, where history meets modern vibes and the city is split between two worlds.",
          },
          {
            name: "Limassol",
            description:
              "A bustling coastal city famous for nightlife, festivals, and beautiful beaches.",
          },
          {
            name: "Larnaca",
            description:
              "Home to palm-lined promenades, salt lakes, and a relaxed seaside atmosphere.",
          },
          {
            name: "Paphos",
            description:
              "Known for ancient ruins, myths, and stunning Mediterranean views.",
          },
          {
            name: "Famagusta",
            description:
              "A region rich in history and archaeological treasures, with a touch of mystery.",
          },
          {
            name: "Kyrenia",
            description:
              "A charming harbor town with a picturesque castle and crystal-clear waters.",
          },
        ],
      },
      {
        name: "Czech Republic",
        description:
          "A country in Central Europe, famous for its castles, beer culture, and history.",
        topics: [],
        rooms: [
          {
            name: "Prague",
            description:
              "The vibrant capital city full of stunning architecture, lively squares, and legendary beer halls.",
          },
          {
            name: "South Bohemia",
            description:
              "A picturesque region dotted with charming towns, lakes, and medieval castles.",
          },
          {
            name: "Moravia",
            description:
              "Known for its rolling vineyards, folk traditions, and warm hospitality.",
          },
          {
            name: "Bohemia",
            description:
              "A historical heartland with dense forests, mountains, and fairy-tale castles.",
          },
          {
            name: "Central Bohemia",
            description:
              "Surrounding Prague, this area blends rural charm with historic towns and scenic nature.",
          },
        ],
      },
      {
        name: "Denmark",
        description:
          "A Nordic country, known for its progressive society, design, and happy population.",
        topics: [],
        rooms: [
          {
            name: "Capital Region",
            description:
              "Home to Copenhagen, a city bursting with culture, bikes, and cozy cafés.",
          },
          {
            name: "Central Denmark",
            description:
              "A mix of vibrant cities and beautiful countryside, perfect for exploring Danish life.",
          },
          {
            name: "North Denmark",
            description:
              "Known for stunning coastlines, rolling dunes, and friendly small towns.",
          },
          {
            name: "Zealand",
            description:
              "An island full of charming towns, castles, and seaside fun.",
          },
          {
            name: "Southern Denmark",
            description:
              "Where history meets nature, with fairy-tale villages and serene landscapes.",
          },
        ],
      },
      {
        name: "Djibouti",
        description:
          "A small country in the Horn of Africa, known for its strategic location and naval ports.",
        topics: [],
        rooms: [
          {
            name: "Djibouti Region",
            description:
              "The vibrant capital area buzzing with trade, culture, and coastal charm.",
          },
          {
            name: "Ali Sabieh Region",
            description: "Land of scenic mountains and desert adventures.",
          },
          {
            name: "Dikhil Region",
            description:
              "Where nature lovers enjoy wide-open spaces and rugged landscapes.",
          },
          {
            name: "Tadjourah Region",
            description:
              "Famous for beautiful beaches and historic towns along the Gulf of Tadjourah.",
          },
          {
            name: "Obock Region",
            description:
              "A coastal gateway with rich marine life and tranquil vibes.",
          },
        ],
      },
      {
        name: "Dominica",
        description:
          "A small island nation in the Caribbean, famous for its volcanic landscapes and rainforests.",
        topics: [],
        rooms: [
          {
            name: "Saint Andrew",
            description: "Lush green hills and vibrant local culture.",
          },
          {
            name: "Saint David",
            description: "Peaceful villages surrounded by nature's beauty.",
          },
          {
            name: "Saint George",
            description: "Bustling capital area with coastal charm.",
          },
          {
            name: "Saint John",
            description: "Home to beautiful waterfalls and tropical vibes.",
          },
          {
            name: "Saint Joseph",
            description: "Scenic coastline and historic landmarks.",
          },
          {
            name: "Saint Luke",
            description: "Quiet countryside with friendly communities.",
          },
          {
            name: "Saint Mark",
            description: "Small and serene with a warm island feel.",
          },
          {
            name: "Saint Patrick",
            description: "Forests, rivers, and adventurous trails.",
          },
          {
            name: "Saint Paul",
            description: "Rich culture and breathtaking nature spots.",
          },
          {
            name: "Saint Peter",
            description: "Coastal beauty and relaxing beaches.",
          },
        ],
      },
      {
        name: "Dominican Republic",
        description:
          "An island country in the Caribbean, known for its beaches and resorts.",
        topics: [],
        rooms: [
          {
            name: "Santo Domingo",
            description:
              "The bustling capital with vibrant culture and nightlife.",
          },
          {
            name: "Santiago",
            description:
              "A lively city surrounded by mountains and coffee plantations.",
          },
          {
            name: "La Romana",
            description: "Resort town famous for beaches and golf courses.",
          },
          {
            name: "Puerto Plata",
            description:
              "Coastal paradise with stunning beaches and historic forts.",
          },
          {
            name: "Punta Cana",
            description: "A hotspot for sun, sand, and luxury resorts.",
          },
          {
            name: "San Pedro de Macorís",
            description: "Known for its baseball heritage and riverside views.",
          },
          {
            name: "La Vega",
            description: "Famous for colorful carnivals and rich traditions.",
          },
          {
            name: "Barahona",
            description: "Natural beauty with beaches and mountains.",
          },
          {
            name: "Higüey",
            description: "Religious and cultural center with warm local vibes.",
          },
          {
            name: "Samaná",
            description: "Known for whale watching and lush landscapes.",
          },
        ],
      },
      {
        name: "East Timor",
        description:
          "A small country in Southeast Asia, known for its pristine beaches and vibrant culture.",
        topics: [],
        rooms: [
          {
            name: "Dili",
            description:
              "The bustling capital city, full of energy and coastal charm.",
          },
          {
            name: "Baucau",
            description:
              "A scenic district with beautiful beaches and friendly locals.",
          },
          {
            name: "Liquiçá",
            description: "Known for its lush landscapes and cultural richness.",
          },
          {
            name: "Ainaro",
            description:
              "A mountainous region with stunning views and traditional villages.",
          },
          {
            name: "Manatuto",
            description:
              "Famous for its mix of mountains and sea, perfect for adventurers.",
          },
          {
            name: "Viqueque",
            description:
              "A district rich in history and natural beauty, with pristine coastlines.",
          },
        ],
      },
      {
        name: "Ecuador",
        description:
          "A country in South America, famous for the Galápagos Islands and the Andes mountains.",
        topics: [],
        rooms: [
          {
            name: "Pichincha",
            description:
              "Explore Quito's historic streets and volcano views that'll blow your mind!",
          },
          {
            name: "Guayas",
            description:
              "Feel the tropical energy of Guayaquil, where the coast meets vibrant city life.",
          },
          {
            name: "Azuay",
            description:
              "Discover Cuenca's colonial charm and artisan vibes in this cultural gem.",
          },
          {
            name: "Manabí",
            description:
              "Catch the waves and savor fresh seafood along Manabí's sunny coast.",
          },
          {
            name: "Loja",
            description:
              "Lose yourself in Loja's melodies and lush mountain landscapes.",
          },
          {
            name: "Galápagos",
            description:
              "Meet the coolest animals on Earth in this magical wildlife paradise.",
          },
          {
            name: "Imbabura",
            description:
              "Chill by the lakes and hike volcanoes in the heart of Ecuador's highlands.",
          },
          {
            name: "Tungurahua",
            description:
              "Adventure awaits near active volcanoes and hot springs around Baños.",
          },
          {
            name: "Cotopaxi",
            description:
              "Scale the iconic snow-capped volcano and breathe in pure mountain air.",
          },
          {
            name: "Esmeraldas",
            description:
              "Dive into Afro-Ecuadorian culture and enjoy emerald-green beaches.",
          },
          {
            name: "Chimborazo",
            description:
              "Stand near the Earth's closest point to space atop the mighty Chimborazo volcano.",
          },
          {
            name: "Santa Elena",
            description:
              "Relax on sunny beaches and explore the ancient archaeological sites.",
          },
          {
            name: "Napo",
            description:
              "Venture deep into the Amazon jungle full of exotic wildlife and vibrant tribes.",
          },
        ],
      },
      {
        name: "Egypt",
        description:
          "A country in North Africa, famous for its ancient civilization and monuments like the pyramids.",
        topics: [],
        rooms: [
          {
            name: "Cairo",
            description:
              "The vibrant heart of Egypt, where history meets modern hustle.",
          },
          {
            name: "Giza",
            description: "Land of the iconic pyramids and mysterious Sphinx.",
          },
          {
            name: "Alexandria",
            description:
              "Mediterranean charm with ancient ruins and seaside vibes.",
          },
          {
            name: "Luxor",
            description:
              "A living museum with majestic temples and royal tombs.",
          },
          {
            name: "Aswan",
            description: "Nile river magic and stunning desert scenery.",
          },
          {
            name: "Suez",
            description: "Gateway city connecting seas and continents.",
          },
          {
            name: "Port Said",
            description: "Bustling port city with a rich maritime history.",
          },
          {
            name: "Ismailia",
            description: "Known for its gardens and the Suez Canal views.",
          },
          {
            name: "Damietta",
            description: "Famous for its furniture and delicious seafood.",
          },
          {
            name: "El Mahalla El Kubra",
            description: "Industrial city with a strong textile tradition.",
          },
          {
            name: "Mansoura",
            description: "Lively city known for education and Nile charm.",
          },
          {
            name: "Tanta",
            description:
              "Famous for its cultural festivals and agricultural produce.",
          },
          {
            name: "Zagazig",
            description: "The center of the rich Nile Delta region.",
          },
          {
            name: "Minya",
            description: "Home to ancient tombs and fertile lands.",
          },
          {
            name: "Asyut",
            description: "Historic city with a mix of culture and tradition.",
          },
          {
            name: "Fayoum",
            description: "Oasis paradise with lakes and archaeological sites.",
          },
          {
            name: "Beni Suef",
            description: "Agricultural hub with ancient monuments nearby.",
          },
          {
            name: "Qena",
            description: "Gateway to the temples of Dendera and Abydos.",
          },
          {
            name: "Sohag",
            description: "A blend of ancient ruins and modern life.",
          },
          {
            name: "Red Sea",
            description: "Coastal paradise famous for diving and resorts.",
          },
          {
            name: "New Valley",
            description: "Desert expanses and hidden oases adventure.",
          },
          {
            name: "North Sinai",
            description: "Desert landscapes and strategic coastal towns.",
          },
          {
            name: "South Sinai",
            description:
              "Home to St. Catherine's Monastery and mountain adventures.",
          },
        ],
      },
      {
        name: "El Salvador",
        description:
          "A small country in Central America, known for its volcanic landscapes and coffee production.",
        topics: [],
        rooms: [
          {
            name: "Santa Ana",
            description:
              "Home to the stunning Santa Ana volcano and vibrant culture.",
          },
          {
            name: "San Salvador",
            description:
              "The bustling capital city with a mix of history and modern vibes.",
          },
          {
            name: "La Libertad",
            description:
              "Catch epic surf and chill on beautiful Pacific beaches.",
          },
          {
            name: "San Miguel",
            description:
              "A lively city famous for festivals and tasty pupusas.",
          },
          {
            name: "Chalatenango",
            description:
              "Mountain views and peaceful rural escapes await here.",
          },
          {
            name: "La Paz",
            description:
              "Coffee plantations and lush green hills paint this region.",
          },
          {
            name: "Usulután",
            description: "Discover hidden beaches and warm local hospitality.",
          },
          {
            name: "Cuscatlán",
            description:
              "Small but rich in history, right in the heart of El Salvador.",
          },
          {
            name: "Cabañas",
            description: "Experience tranquil landscapes and friendly towns.",
          },
          {
            name: "Morazán",
            description: "Explore rich history and beautiful natural parks.",
          },
          {
            name: "San Vicente",
            description:
              "Relax near volcanoes and enjoy traditional Salvadoran culture.",
          },
          {
            name: "Sonsonate",
            description:
              "A coastal department with great beaches and local flavor.",
          },
        ],
      },
      {
        name: "Equatorial Guinea",
        description:
          "A small country in Central Africa, known for its oil resources and cultural diversity.",
        topics: [],
        rooms: [
          {
            name: "Annobón",
            description:
              "A remote island paradise with unique wildlife and stunning beaches.",
          },
          {
            name: "Bioko Norte",
            description:
              "Home to the capital Malabo, with vibrant city life and lush forests.",
          },
          {
            name: "Bioko Sur",
            description:
              "Lush landscapes and coastal beauty make this province special.",
          },
          {
            name: "Centro Sur",
            description: "Known for its rich culture and natural scenery.",
          },
          {
            name: "Kié-Ntem",
            description: "Explore dense forests and traditional villages here.",
          },
          {
            name: "Litoral",
            description:
              "A coastal region famous for its fishing and seaside charm.",
          },
          {
            name: "Wele-Nzas",
            description:
              "Mountainous terrain and wildlife make it an adventurous spot.",
          },
        ],
      },
      {
        name: "Eritrea",
        description:
          "A country in the Horn of Africa, known for its Red Sea coastline and historical sites.",
        topics: [],
        rooms: [
          {
            name: "Anseba",
            description:
              "A region with rugged mountains and vibrant local culture.",
          },
          {
            name: "Debub",
            description: "Known for its fertile lands and bustling towns.",
          },
          {
            name: "Debubawi K'eyih Bahri",
            description: "Coastal beauty with amazing Red Sea views.",
          },
          {
            name: "Gash-Barka",
            description:
              "The country's breadbasket with wide plains and farms.",
          },
          {
            name: "Maekel",
            description:
              "Home to the capital Asmara with unique architecture and history.",
          },
          {
            name: "Northern Red Sea",
            description: "Famous for coral reefs and desert landscapes.",
          },
          {
            name: "Semienawi K'eyih Bahri",
            description:
              "Desert scenery meets Red Sea coast in this striking region.",
          },
        ],
      },
      {
        name: "Estonia",
        description:
          "A Baltic country in Northern Europe, known for its medieval architecture and high-tech society.",
        topics: [],
        rooms: [
          {
            name: "Harju County",
            description:
              "Home to the capital Tallinn, bustling with history and modern vibes.",
          },
          {
            name: "Tartu County",
            description:
              "Known for its university town and vibrant cultural scene.",
          },
          {
            name: "Ida-Viru County",
            description: "Industrial heartland with unique coastal landscapes.",
          },
          {
            name: "Pärnu County",
            description: "Famous for its summer beaches and spa resorts.",
          },
          {
            name: "Saare County",
            description:
              "Island life with beautiful nature and historic windmills.",
          },
          {
            name: "Lääne County",
            description: "Peaceful countryside and charming old villages.",
          },
          {
            name: "Viljandi County",
            description: "Known for folk music festivals and medieval ruins.",
          },
          {
            name: "Rapla County",
            description: "Quiet rural charm with rolling hills and forests.",
          },
          {
            name: "Jõgeva County",
            description: "Agricultural lands and serene lakes.",
          },
          {
            name: "Võru County",
            description: "Lush forests and unique Seto culture.",
          },
          {
            name: "Valga County",
            description: "Borderlands with a mix of cultures and history.",
          },
        ],
      },
      {
        name: "Eswatini",
        description:
          "A small country in Southern Africa, known for its traditional monarchy and wildlife reserves.",
        topics: [],
        rooms: [
          {
            name: "Hhohho",
            description:
              "The northern region, bustling with culture and the capital city Mbabane.",
          },
          {
            name: "Manzini",
            description:
              "The commercial heart of Eswatini, full of markets and lively streets.",
          },
          {
            name: "Shiselweni",
            description:
              "Known for its beautiful landscapes and traditional villages.",
          },
          {
            name: "Lubombo",
            description:
              "A scenic region with game reserves and rolling hills.",
          },
        ],
      },
      {
        name: "Ethiopia",
        description:
          "A country in the Horn of Africa, known for its ancient civilization and diverse cultures.",
        topics: [],
        rooms: [
          {
            name: "Addis Ababa",
            description:
              "The bustling capital city, full of history and vibrant life.",
          },
          {
            name: "Tigray",
            description: "Known for its rock-hewn churches and rich heritage.",
          },
          {
            name: "Amhara",
            description:
              "Famous for its stunning landscapes and ancient castles.",
          },
          {
            name: "Oromia",
            description:
              "The largest region, rich in culture and natural beauty.",
          },
          {
            name: "Southern Nations",
            description:
              "A diverse area known for its many ethnic groups and traditions.",
          },
          {
            name: "Afar",
            description:
              "Home to the Danakil Depression, one of the hottest places on Earth.",
          },
          {
            name: "Somali",
            description:
              "A region with a unique desert landscape and vibrant nomadic culture.",
          },
          {
            name: "Benishangul-Gumuz",
            description: "Known for its beautiful rivers and forests.",
          },
          {
            name: "Gambela",
            description: "A lush region with abundant wildlife and rivers.",
          },
          {
            name: "Harari",
            description:
              "A small, historic region known for its ancient walled city.",
          },
        ],
      },
      {
        name: "Fiji",
        description:
          "An island nation in the South Pacific, known for its coral reefs and tropical climate.",
        topics: [],
        rooms: [
          {
            name: "Central Division",
            description:
              "The heart of Fiji with the capital city Suva and vibrant markets.",
          },
          {
            name: "Western Division",
            description:
              "Famous for beautiful beaches and tourist hotspots like Nadi.",
          },
          {
            name: "Northern Division",
            description:
              "Known for lush rainforests and pristine islands like Vanua Levu.",
          },
          {
            name: "Eastern Division",
            description:
              "Home to the stunning islands of the Lau group and Kadavu.",
          },
          {
            name: "Viti Levu",
            description: "Fiji's largest island, rich with culture and nature.",
          },
          {
            name: "Vanua Levu",
            description:
              "The second largest island, perfect for adventure and exploring.",
          },
          {
            name: "Kadavu Island",
            description: "Known for spectacular diving and coral reefs.",
          },
          {
            name: "Lau Islands",
            description: "A beautiful archipelago with unique island culture.",
          },
        ],
      },
      {
        name: "Finland",
        description:
          "A Nordic country known for its stunning landscapes, saunas, and high standard of living.",
        topics: [],
        rooms: [
          {
            name: "Uusimaa",
            description:
              "Home to the capital Helsinki, vibrant culture, and beautiful seaside.",
          },
          {
            name: "Lapland",
            description:
              "Famous for the Northern Lights, reindeer, and winter adventures.",
          },
          {
            name: "Pirkanmaa",
            description: "Known for the city of Tampere and its lively events.",
          },
          {
            name: "Ostrobothnia",
            description:
              "A coastal region with unique culture and beautiful archipelagos.",
          },
          {
            name: "Satakunta",
            description:
              "Rich in history and natural beauty with coastal charm.",
          },
          {
            name: "Kymenlaakso",
            description:
              "A region of forests, rivers, and charming small towns.",
          },
          {
            name: "South Karelia",
            description:
              "Known for its lakes, forests, and border with Russia.",
          },
          {
            name: "Central Finland",
            description: "Heartland of Finland with lakes and peaceful nature.",
          },
        ],
      },
      {
        name: "France",
        description:
          "A country in Western Europe, famous for its art, cuisine, and historical landmarks.",
        topics: [],
        rooms: [
          {
            name: "Paris",
            description:
              "Bright lights, big fun! Jump into the action from the heart of France.",
          },
          {
            name: "Marseille",
            description:
              "Sun, sea, and endless games — the coast is clear for fun!",
          },
          {
            name: "Lyon",
            description:
              "A city of flavor and flair — perfect for playful minds!",
          },
          {
            name: "Toulouse",
            description:
              "Game on in the pink city — fast, fun, and full of surprises!",
          },
          {
            name: "Nice",
            description: "Chill by the coast and let the games begin!",
          },
          {
            name: "Nantes",
            description: "Creative vibes and good times — bring your A-game!",
          },
          {
            name: "Strasbourg",
            description:
              "A mix of charm and challenge — where every round feels fresh!",
          },
          {
            name: "Montpellier",
            description: "Fun, fast, and full of friendly faces!",
          },
          {
            name: "Bordeaux",
            description: "Smooth, classy, and always ready for a challenge!",
          },
          {
            name: "Lille",
            description: "Big energy from the north — game on!",
          },
          {
            name: "Rennes",
            description: "Cozy, clever, and packed with trivia energy!",
          },
          {
            name: "Reims",
            description:
              "Pop into this sparkling city room — where good vibes flow!",
          },
          {
            name: "Saint-Étienne",
            description: "Roll into a room that's built for good times!",
          },
          {
            name: "Le Havre",
            description: "Fresh air, fun games — just dock and play!",
          },
          {
            name: "Toulon",
            description: "Anchors away! Dive into the game zone.",
          },
          {
            name: "Grenoble",
            description: "Cool city, hot games — bring the heat!",
          },
          {
            name: "Dijon",
            description: "A little spice and a lot of fun!",
          },
          {
            name: "Angers",
            description: "Easygoing and entertaining — just how we like it!",
          },
          {
            name: "Clermont-Ferrand",
            description: "Up for a challenge? This room's got all the buzz!",
          },
          {
            name: "Aix-en-Provence",
            description: "Relaxed, sunny, and packed with play!",
          },
        ],
      },
      {
        name: "Gabon",
        description:
          "Lush rainforests, laid-back vibes — it's game time in the heart of Central Africa!",
        topics: [],
        rooms: [
          {
            name: "Libreville",
            description:
              "The capital of fun! Dive into coastal energy and game away!",
          },
          {
            name: "Port-Gentil",
            description: "Sandy shores and solid scores — let's play!",
          },
          {
            name: "Franceville",
            description: "A chill inland city with plenty of room to win!",
          },
          {
            name: "Oyem",
            description:
              "Tucked away but full of game spirit — Oyem always surprises!",
          },
          {
            name: "Moanda",
            description: "Mining for fun? Moanda's got game gems waiting!",
          },
          {
            name: "Lambaréné",
            description:
              "Relaxed riverside vibes — perfect for some casual play!",
          },
        ],
      },
      {
        name: "Gambia",
        description:
          "A compact West African country packed with sunshine, smiles, and a love for good vibes!",
        topics: [],
        rooms: [
          {
            name: "Banjul",
            description:
              "The cheerful capital where every game feels like a celebration!",
          },
          {
            name: "Serekunda",
            description:
              "The buzzing heart of the Gambia — vibrant, playful, and always game-ready!",
          },
          {
            name: "Brikama",
            description:
              "A cultural hotspot full of beats, creativity, and competitive fun!",
          },
          {
            name: "Bakau",
            description:
              "Beachy breezes, chilled energy, and a perfect place to unwind and play.",
          },
          {
            name: "Farafenni",
            description:
              "Crossroad of the north — a spirited town that's always down for a challenge!",
          },
          {
            name: "Lamin",
            description:
              "A laid-back gem where games meet laughter and good company.",
          },
          {
            name: "Kuntaur",
            description: "Small town, big fun — let's play!",
          },
          {
            name: "Soma",
            description: "Gateway town with loads of gaming energy.",
          },
        ],
      },
      {
        name: "Georgia",
        description:
          "A charming country where mountains, wine, and warm welcomes meet unforgettable adventures!",
        topics: [],
        rooms: [
          {
            name: "Tbilisi",
            description:
              "The lively capital where tradition and trendiness team up for unforgettable fun!",
          },
          {
            name: "Batumi",
            description:
              "A coastal playground full of games, sun, and Black Sea breeze!",
          },
          {
            name: "Kutaisi",
            description:
              "An ancient city with a young heart — always ready for a friendly challenge!",
          },
          {
            name: "Rustavi",
            description:
              "Fast-paced and full of energy, perfect for high-speed gameplay!",
          },
          {
            name: "Zugdidi",
            description:
              "A spirited western town where every round is a royal match!",
          },
          {
            name: "Telavi",
            description:
              "Nestled in wine country — come for the games, stay for the vibes!",
          },
          {
            name: "Gori",
            description:
              "Home of strong wills and bold moves — let the best player win!",
          },
          {
            name: "Poti",
            description: "A port of pure fun — all aboard the game express!",
          },
          {
            name: "Akhaltsikhe",
            description:
              "A fortress of fun where every challenge is epic and fair!",
          },
          {
            name: "Mtskheta",
            description:
              "Historic charm and peaceful plays — the calm before the competition!",
          },
        ],
      },
      {
        name: "Germany",
        description:
          "A powerhouse of precision and fun — where castles, cars, and cool competitions collide!",
        topics: [],
        rooms: [
          {
            name: "Berlin",
            description:
              "The buzzing capital where every round feels like a world tour of excitement!",
          },
          {
            name: "Munich",
            description:
              "Home of Oktoberfest and high scores — where tradition meets competition.",
          },
          {
            name: "Hamburg",
            description:
              "A port city that's always open to fun — set sail into fast-paced games!",
          },
          {
            name: "Cologne",
            description:
              "Bells, bridges, and epic battles — play your way through a cathedral of fun!",
          },
          {
            name: "Frankfurt",
            description:
              "Bank on your skills — the financial capital loves a good challenge!",
          },
          {
            name: "Stuttgart",
            description:
              "Where cars are fast and games are faster — speed through with style!",
          },
          {
            name: "Düsseldorf",
            description:
              "A stylish city that's always ready for sharp minds and bold moves.",
          },
          {
            name: "Leipzig",
            description:
              "Creative and cool — bring your best ideas to the arena!",
          },
          {
            name: "Dresden",
            description:
              "Historic streets meet modern feats — it's your time to shine!",
          },
          {
            name: "Nuremberg",
            description:
              "Cookies, castles, and clever plays — the perfect gaming combo!",
          },
          {
            name: "Hannover",
            description:
              "A central hub where fun and strategy come together flawlessly.",
          },
          {
            name: "Bremen",
            description:
              "A musical city with a playful beat — hit the right notes to win!",
          },
          {
            name: "Mainz",
            description:
              "A bookish city where your smarts turn pages into prizes!",
          },
          {
            name: "Saarbrücken",
            description:
              "Small but mighty — where every move could win the match.",
          },
          {
            name: "Erfurt",
            description: "A charming spot for big thinkers and bright ideas!",
          },
          {
            name: "Magdeburg",
            description: "A city that builds brilliance — bring your A-game!",
          },
          {
            name: "Kiel",
            description: "Sail into success from this northern coastal gem.",
          },
          {
            name: "Wiesbaden",
            description:
              "Elegant and exciting — where games feel like a luxury experience.",
          },
          {
            name: "Potsdam",
            description:
              "Just outside Berlin but full of its own flair — it's time to compete in style!",
          },
          {
            name: "Rostock",
            description:
              "From seaside vibes to gaming tides — this is your playground!",
          },
        ],
      },
      {
        name: "Ghana",
        description:
          "A West African gem full of rhythm, color, and unbeatable vibes — where every game feels like a celebration!",
        topics: [],
        rooms: [
          {
            name: "Accra",
            description:
              "The lively capital where games, music, and street food come together in perfect harmony!",
          },
          {
            name: "Kumasi",
            description:
              "The heart of Ashanti pride — full of culture, color, and competitive energy!",
          },
          {
            name: "Tamale",
            description:
              "Northern charm and spirited showdowns — the fun here is as warm as the weather!",
          },
          {
            name: "Takoradi",
            description:
              "Coastal breezes and cool vibes — where beach views meet bright ideas!",
          },
          {
            name: "Cape Coast",
            description:
              "History and hustle come alive in this seaside city full of challenges and cheer!",
          },
          {
            name: "Sunyani",
            description:
              "Peaceful but playful — Sunyani is where strategy quietly wins the day!",
          },
          {
            name: "Ho",
            description:
              "A hidden gem in the Volta Region where every game comes with a dash of surprise!",
          },
          {
            name: "Bolgatanga",
            description:
              "Up north and full of flair — bold plays and bright smiles await!",
          },
          {
            name: "Wa",
            description:
              "Small but spirited — Wa's room is where underdogs rise and surprises shine!",
          },
          {
            name: "Koforidua",
            description:
              "Home of beads and brilliance — a cool spot for smart and stylish players!",
          },
        ],
      },
      {
        name: "Greece",
        description:
          "A sunny land of myths, olives, and epic challenges — where the games are as timeless as the ruins!",
        topics: [],
        rooms: [
          {
            name: "Athens",
            description:
              "The ancient capital of champions — where strategy and speed collide!",
          },
          {
            name: "Thessaloniki",
            description:
              "Cool vibes, warm hearts — this northern hub knows how to play and party!",
          },
          {
            name: "Patras",
            description:
              "Carnivals, coastlines, and quick thinking — it's all about flair here!",
          },
          {
            name: "Heraklion",
            description:
              "Crete's capital of competition — ancient vibes, modern moves!",
          },
          {
            name: "Larissa",
            description:
              "Laid-back charm meets big-game energy — every word counts!",
          },
          {
            name: "Rhodes",
            description:
              "Island spirit and legendary fun — where every turn feels like a sunny win!",
          },
          {
            name: "Chania",
            description:
              "Scenic streets and smart plays — the heart of Cretan competition!",
          },
          {
            name: "Ioannina",
            description:
              "Lake views and lively games — strategy flows freely here!",
          },
          {
            name: "Volos",
            description:
              "Seaside flair and sharp minds — play like a hero from the Argonauts!",
          },
          {
            name: "Kavala",
            description:
              "Coastal energy, ancient echoes — a port city full of quick moves!",
          },
          {
            name: "Corfu",
            description:
              "Island grace with a playful pace — sunny games all day long!",
          },
        ],
      },
      {
        name: "Grenada",
        description:
          "A spice-scented island where sunshine, beaches, and games go hand in hand!",
        topics: [],
        rooms: [
          {
            name: "St. George's",
            description:
              "The vibrant capital — full of color, culture, and competitive spirit!",
          },
          {
            name: "Grand Anse",
            description:
              "Famous for its beach and breezy vibes — relax and play in style.",
          },
          {
            name: "Gouyave",
            description:
              "Known for its fish and friendly locals — dive into fun!",
          },
          {
            name: "Grenville",
            description:
              "The east coast charm, where laid-back meets let's-go!",
          },
          {
            name: "Sauteurs",
            description:
              "Up north with a view — historic, bold, and always game-ready.",
          },
          {
            name: "St. David",
            description:
              "The nature-lover's parish — quiet, green, and full of surprises.",
          },
          {
            name: "Victoria",
            description:
              "A small fishing town with big energy — perfect for quick matches.",
          },
          {
            name: "Carriacou",
            description:
              "Island neighbor with island flair — unique, cozy, and competitive.",
          },
          {
            name: "Petit Martinique",
            description:
              "Tiny but mighty — where even the smallest players shine!",
          },
        ],
      },
      {
        name: "Guatemala",
        description:
          "A Central American gem bursting with color, culture, and game-ready energy!",
        topics: [],
        rooms: [
          {
            name: "Guatemala City",
            description:
              "The bustling capital — where fast minds meet faster moves!",
          },
          {
            name: "Antigua",
            description:
              "A charming colonial town, perfect for strategic thinkers with flair.",
          },
          {
            name: "Quetzaltenango",
            description:
              "Also known as Xela — a cool highland hub for cool-headed gameplay.",
          },
          {
            name: "Huehuetenango",
            description:
              "Mountain views and sharp competition — play at your peak!",
          },
          {
            name: "Cobán",
            description:
              "Lush landscapes and lively games — where every round blooms.",
          },
          {
            name: "Chiquimula",
            description:
              "Sunny vibes and smart moves — a mix of heat and hustle!",
          },
          {
            name: "Escuintla",
            description:
              "Warm weather, warmer competition — bring your A-game!",
          },
          {
            name: "Puerto Barrios",
            description:
              "Coastal fun and tropical tactics await in this Caribbean port.",
          },
          {
            name: "Flores",
            description:
              "Near the great ruins of Tikal — where ancient strategy inspires modern play.",
          },
        ],
      },
      {
        name: "Guinea",
        description:
          "A vibrant West African country full of rich culture and natural treasures!",
        topics: [],
        rooms: [
          {
            name: "Conakry",
            description:
              "The buzzing capital on the Atlantic coast - always awake, always alive!",
          },
          {
            name: "Nzérékoré",
            description:
              "A forest city full of greenery, energy, and local flair.",
          },
          {
            name: "Kankan",
            description:
              "Eastern charm meets tradition - Kankan's got rhythm and history.",
          },
          {
            name: "Kindia",
            description:
              "Where the mountains meet vibrant street life. Adventure awaits!",
          },
          {
            name: "Labé",
            description:
              "High in the Fouta Djallon, this city's all about cool vibes and culture.",
          },
          {
            name: "Mamou",
            description:
              "The heart of Guinea's crossroads - always moving, always fun.",
          },
          {
            name: "Siguiri",
            description:
              "Golden land with golden sunsets - Siguiri shines bright.",
          },
          {
            name: "Gueckédou",
            description: "Border town excitement with tropical energy!",
          },
          {
            name: "Boké",
            description:
              "Coastal breeze and mining legacy - Boké is where land meets the sea.",
          },
          {
            name: "Fria",
            description:
              "Quiet yet proud - home to industry and beautiful views.",
          },
          {
            name: "Kissidougou",
            description:
              "A friendly forest-town with community spirit and natural beauty.",
          },
        ],
      },
      {
        name: "Guinea-Bissau",
        description:
          "A charming West African country famous for its beautiful beaches and rich history.",
        topics: [],
        rooms: [
          {
            name: "Bissau",
            description: "The vibrant capital city full of energy and culture.",
          },
          {
            name: "Bafatá",
            description:
              "A lively city known for its markets and warm community.",
          },
          {
            name: "Gabú",
            description: "A historical town with deep cultural roots.",
          },
          {
            name: "Bissorã",
            description: "A peaceful town surrounded by nature.",
          },
          {
            name: "Cacheu",
            description:
              "A coastal town with beautiful views and rich heritage.",
          },
        ],
      },
      {
        name: "Guyana",
        description:
          "A lush South American country full of rainforests, rivers, and friendly faces.",
        topics: [],
        rooms: [
          {
            name: "Georgetown",
            description:
              "The bustling capital with colorful markets and seaside charm.",
          },
          {
            name: "Linden",
            description:
              "A lively town known for its bauxite mining and river views.",
          },
          {
            name: "New Amsterdam",
            description:
              "A historic town with a mix of cultures and colonial vibes.",
          },
          {
            name: "Bartica",
            description:
              "Gateway to the interior, where adventure meets nature.",
          },
          {
            name: "Mahdia",
            description:
              "A mining town surrounded by the heart of the rainforest.",
          },
          {
            name: "Lethem",
            description:
              "A border town blending Guyanese and Brazilian cultures.",
          },
        ],
      },
      {
        name: "Haiti",
        description:
          "A vibrant Caribbean nation with a rich history, colorful culture, and warm-hearted people.",
        topics: [],
        rooms: [
          {
            name: "Port-au-Prince",
            description:
              "The lively capital city, full of energy, markets, and Haitian spirit.",
          },
          {
            name: "Cap-Haïtien",
            description:
              "A historic coastal city known for its colonial architecture and seaside charm.",
          },
          {
            name: "Jacmel",
            description:
              "An artsy town famous for its festivals, crafts, and beautiful beaches.",
          },
          {
            name: "Les Cayes",
            description:
              "A sunny southern city with great beaches and a relaxed vibe.",
          },
          {
            name: "Gonaïves",
            description:
              "The city of independence, rich in history and proud traditions.",
          },
          {
            name: "Saint-Marc",
            description:
              "A bustling port town known for its vibrant markets and local life.",
          },
        ],
      },
      {
        name: "Honduras",
        description:
          "A Central American country, known for its Mayan ruins and natural resources.",
        topics: [],
        rooms: [
          {
            name: "Tegucigalpa",
            description:
              "The bustling capital city full of culture and vibrant street life.",
          },
          {
            name: "San Pedro Sula",
            description:
              "A lively industrial hub with great food and nightlife.",
          },
          {
            name: "La Ceiba",
            description:
              "A tropical coastal city famous for its festivals and beaches.",
          },
          {
            name: "Choloma",
            description:
              "A growing city known for its hardworking community and industry.",
          },
          {
            name: "El Progreso",
            description: "A friendly city with a mix of urban and rural vibes.",
          },
          {
            name: "Comayagua",
            description:
              "A historic city known for its colonial architecture and churches.",
          },
          {
            name: "Puerto Cortés",
            description: "A vibrant port city bustling with maritime activity.",
          },
          {
            name: "Choluteca",
            description: "A warm city with rich traditions and lively markets.",
          },
          {
            name: "Danlí",
            description:
              "A charming city nestled in the mountains, famous for coffee.",
          },
          {
            name: "Santa Rosa de Copán",
            description:
              "A picturesque town known for its colonial beauty and cigars.",
          },
          {
            name: "Tela",
            description:
              "A laid-back beach town perfect for sun and relaxation.",
          },
          {
            name: "Siguatepeque",
            description:
              "A cool mountain town with fresh air and friendly locals.",
          },
          {
            name: "La Lima",
            description: "An industrial city with a warm tropical atmosphere.",
          },
          {
            name: "Villanueva",
            description:
              "A city with a strong community spirit and vibrant culture.",
          },
          {
            name: "Juticalpa",
            description:
              "A charming city surrounded by beautiful natural landscapes.",
          },
          {
            name: "Yoro",
            description:
              "A peaceful town known for its folklore and traditions.",
          },
          {
            name: "Gracias",
            description:
              "A historic city full of colonial charm and scenic views.",
          },
        ],
      },
      {
        name: "Hungary",
        description:
          "A landlocked country in Central Europe, known for its rich cultural heritage and thermal baths.",
        topics: [],
        rooms: [
          {
            name: "Budapest",
            description:
              "The stunning capital split by the Danube, full of history and hot springs!",
          },
          {
            name: "Debrecen",
            description:
              "A vibrant city with lively festivals and friendly vibes!",
          },
          {
            name: "Szeged",
            description:
              "Sunny and charming, known for its paprika and university buzz.",
          },
          {
            name: "Miskolc",
            description: "Gateway to nature and adventure in northern Hungary.",
          },
          {
            name: "Pécs",
            description: "Cultural hotspot with Roman ruins and artsy streets.",
          },
          {
            name: "Győr",
            description:
              "A cozy riverside city perfect for laid-back hangouts.",
          },
          {
            name: "Nyíregyháza",
            description:
              "Family-friendly and fun, with parks and zoos to explore.",
          },
        ],
      },
      {
        name: "Iceland",
        description:
          "A Nordic country known for its dramatic landscapes, volcanoes, and geothermal energy.",
        topics: [],
        rooms: [
          {
            name: "Reykjavik",
            description:
              "The vibrant capital city where modern life meets stunning nature.",
          },
          {
            name: "Akureyri",
            description:
              "The charming ‘Capital of the North’ with cozy cafés and snowy peaks.",
          },
          {
            name: "Keflavik",
            description:
              "Gateway town famous for its international airport and ocean views.",
          },
          {
            name: "Selfoss",
            description:
              "A lively town surrounded by waterfalls and lush countryside.",
          },
          {
            name: "Hafnarfjordur",
            description:
              "Known for its lava fields and a quirky, artistic vibe.",
          },
          {
            name: "Egilsstaðir",
            description:
              "A peaceful hub in East Iceland, perfect for exploring wilderness.",
          },
          {
            name: "Vestmannaeyjar",
            description:
              "A scenic island town famous for puffins and volcanic history.",
          },
        ],
      },
      {
        name: "India",
        description:
          "A vast country in South Asia, known for its rich culture, history, and diverse religions.",
        topics: [],
        rooms: [
          {
            name: "New Delhi",
            description: "Where history meets hustle in the heart of India.",
          },
          {
            name: "Mumbai",
            description:
              "The city that buzzes 24/7 with dreams and street food.",
          },
          {
            name: "Bangalore",
            description:
              "Techie paradise with gardens and endless coffee shops.",
          },
          {
            name: "Chennai",
            description: "Sunny beaches, spicy food, and classical tunes.",
          },
          {
            name: "Kolkata",
            description: "Art, old-world charm, and the aroma of fresh sweets.",
          },
          {
            name: "Hyderabad",
            description: "City of pearls, biryani, and royal tales.",
          },
          {
            name: "Jaipur",
            description:
              "Pink walls, royal forts, and a splash of color everywhere.",
          },
          {
            name: "Ahmedabad",
            description: "Where tradition dances with modern beats.",
          },
          {
            name: "Goa",
            description: "Sun, sand, and nonstop beach party vibes.",
          },
          {
            name: "Punjab",
            description:
              "Loud, proud, and full of life’s biggest celebrations.",
          },
          {
            name: "Rajasthan",
            description: "Deserts, camels, and stories from a thousand nights.",
          },
          {
            name: "Kerala",
            description: "Backwaters, coconuts, and calm, peaceful mornings.",
          },
          {
            name: "Uttar Pradesh",
            description: "Land of legends, temples, and sweet treats.",
          },
          {
            name: "Mysore",
            description: "Royalty, yoga, and a touch of old-world grace.",
          },
          {
            name: "Lucknow",
            description:
              "Poetry, kebabs, and old-school charm on every street.",
          },
          { name: "Patna", description: "Ancient roots with a modern twist." },
          {
            name: "Varanasi",
            description: "Spiritual vibes and riverside stories at dawn.",
          },
          {
            name: "Pune",
            description: "College town energy mixed with cultural spice.",
          },
          {
            name: "Nagpur",
            description: "Oranges galore and a laid-back city beat.",
          },
          {
            name: "Indore",
            description: "Street food heaven where every bite’s a party.",
          },
          {
            name: "Coimbatore",
            description: "Textile tales and scenic hill views to chill.",
          },
        ],
      },
      {
        name: "Indonesia",
        description:
          "An island nation in Southeast Asia, famous for its tropical climate and biodiversity.",
        topics: [],
        rooms: [
          {
            name: "Jakarta",
            description:
              "The bustling capital where tradition meets modern life.",
          },
          {
            name: "Bali",
            description:
              "Island paradise famous for beaches, temples, and chill vibes.",
          },
          {
            name: "Surabaya",
            description:
              "A busy port city with spicy food and vibrant streets.",
          },
          {
            name: "Bandung",
            description:
              "Cool highlands filled with creativity and coffee spots.",
          },
          {
            name: "Yogyakarta",
            description:
              "Cultural heartland with ancient temples and artsy streets.",
          },
          {
            name: "Medan",
            description:
              "Gateway to Sumatra with amazing food and diverse cultures.",
          },
          {
            name: "Semarang",
            description:
              "Historic city blending colonial charm and Javanese culture.",
          },
          {
            name: "Makassar",
            description: "Famous for seafood and warm southern hospitality.",
          },
          {
            name: "Palembang",
            description: "City of bridges and the delicious Pempek snack.",
          },
          {
            name: "Balikpapan",
            description: "Oil town with beautiful beaches and tropical nature.",
          },
          {
            name: "Denpasar",
            description: "The lively heart of Bali with markets and festivals.",
          },
          {
            name: "Pontianak",
            description:
              "City on the equator, where day meets night perfectly.",
          },
          {
            name: "Manado",
            description: "Gateway to underwater wonders and rich culture.",
          },
          {
            name: "Pekanbaru",
            description:
              "Center of Riau’s culture, nature, and vibrant markets.",
          },
          {
            name: "Kupang",
            description: "Sunny East Nusa Tenggara hub with island charm.",
          },
        ],
      },
      {
        name: "Iran",
        description:
          "A country in the Middle East, known for its ancient civilization and oil resources.",
        topics: [],
        rooms: [
          {
            name: "Tehran",
            description:
              "The bustling capital where history meets modern hustle.",
          },
          {
            name: "Isfahan",
            description:
              "City of beautiful bridges, gardens, and stunning architecture.",
          },
          {
            name: "Shiraz",
            description: "Land of poets, wine, and fragrant gardens.",
          },
          {
            name: "Mashhad",
            description: "Spiritual hub with grand shrines and lively markets.",
          },
          {
            name: "Tabriz",
            description:
              "Historic trade city with colorful bazaars and rich culture.",
          },
          {
            name: "Kerman",
            description: "Gateway to deserts and ancient Persian treasures.",
          },
          {
            name: "Qom",
            description:
              "Religious center known for its seminaries and pilgrimage sites.",
          },
          {
            name: "Ahvaz",
            description: "Oil-rich city with a lively riverfront vibe.",
          },
          {
            name: "Yazd",
            description:
              "Desert city famous for wind towers and ancient traditions.",
          },
          {
            name: "Kashan",
            description:
              "Home to beautiful traditional houses and rose gardens.",
          },
          {
            name: "Bandar Abbas",
            description:
              "Coastal port city with warm seas and tropical breeze.",
          },
        ],
      },
      {
        name: "Iraq",
        description:
          "A country in the Middle East, known for its historical significance and rich culture.",
        topics: [],
        rooms: [
          {
            name: "Baghdad",
            description:
              "The vibrant capital where ancient tales meet modern streets.",
          },
          {
            name: "Basra",
            description:
              "A lively port city with a blend of river life and culture.",
          },
          {
            name: "Mosul",
            description:
              "Historic city with stunning ruins and resilient spirit.",
          },
          {
            name: "Erbil",
            description:
              "Ancient city with a modern buzz and a famous citadel.",
          },
          {
            name: "Kirkuk",
            description:
              "Cultural melting pot with oil riches and diverse communities.",
          },
          {
            name: "Najaf",
            description:
              "A spiritual city known for its beautiful shrines and pilgrimages.",
          },
          {
            name: "Karbala",
            description:
              "A city famous for its religious importance and vibrant ceremonies.",
          },
          {
            name: "Sulaymaniyah",
            description:
              "Mountain city with lively arts, cafes, and Kurdish vibes.",
          },
          {
            name: "Fallujah",
            description:
              "A historic city known for its strong community spirit.",
          },
          {
            name: "Tikrit",
            description:
              "City with rich history and connection to famous leaders.",
          },
        ],
      },
      {
        name: "Ireland",
        description:
          "An island nation in Western Europe, famous for its green landscapes, pubs, and folklore.",
        topics: [],
        rooms: [
          {
            name: "Dublin",
            description:
              "The lively capital, buzzing with history, music, and friendly faces.",
          },
          {
            name: "Cork",
            description:
              "A charming city with delicious food and a warm local vibe.",
          },
          {
            name: "Galway",
            description:
              "A colorful town known for its festivals, street music, and coastal views.",
          },
          {
            name: "Limerick",
            description:
              "Historic city with medieval castles and a modern twist.",
          },
          {
            name: "Belfast",
            description:
              "Northern Ireland’s capital, full of stories and creative energy.",
          },
          {
            name: "Kilkenny",
            description:
              "A quaint city with cobblestone streets and a lively arts scene.",
          },
          {
            name: "Waterford",
            description:
              "Famous for crystal and rich Viking history by the sea.",
          },
          {
            name: "Sligo",
            description:
              "Land of poets and surfers, with stunning nature all around.",
          },
          {
            name: "Wexford",
            description:
              "Sunny southeast town known for beaches and festivals.",
          },
          {
            name: "Killarney",
            description:
              "Gateway to Ireland’s breathtaking national parks and lakes.",
          },
        ],
      },
      {
        name: "Israel",
        description:
          "A country in the Middle East, known for its historical and religious significance.",
        topics: [],
        rooms: [
          {
            name: "Jerusalem",
            description:
              "A city of ancient wonders, spiritual vibes, and fascinating history.",
          },
          {
            name: "Tel Aviv",
            description:
              "The vibrant beach city that never sleeps, full of nightlife and creativity.",
          },
          {
            name: "Haifa",
            description:
              "A beautiful port city with gardens and mountain views.",
          },
          {
            name: "Eilat",
            description:
              "A sunny resort town by the Red Sea, perfect for fun and diving.",
          },
          {
            name: "Beersheba",
            description:
              "The gateway to the Negev desert with a laid-back atmosphere.",
          },
          {
            name: "Nazareth",
            description:
              "A city rich in biblical history and charming old streets.",
          },
          {
            name: "Ashdod",
            description:
              "A lively port city with sandy beaches and bustling markets.",
          },
          {
            name: "Netanya",
            description:
              "Coastal city with stunning cliffs and a relaxing vibe.",
          },
          {
            name: "Tiberias",
            description:
              "A lakeside city by the Sea of Galilee, full of stories and sun.",
          },
          {
            name: "Safed",
            description:
              "A mystical town known for its artists and spiritual energy.",
          },
        ],
      },
      {
        name: "Italy",
        description:
          "A country in Southern Europe, famous for its art, architecture, and cuisine.",
        topics: [],
        rooms: [
          {
            name: "Rome",
            description:
              "The eternal city where history meets pizza and gelato adventures.",
          },
          {
            name: "Milan",
            description:
              "Fashion capital vibes and espresso-fueled creativity.",
          },
          {
            name: "Naples",
            description: "Home of the original pizza and lively street life.",
          },
          {
            name: "Turin",
            description: "Chocolate lovers and car enthusiasts unite here!",
          },
          {
            name: "Palermo",
            description:
              "Sun-kissed streets with a taste of Sicilian spice and culture.",
          },
          {
            name: "Genoa",
            description:
              "A bustling port city where the sea breeze inspires stories.",
          },
          {
            name: "Bologna",
            description:
              "The foodie paradise with endless pasta and lively piazzas.",
          },
          {
            name: "Florence",
            description:
              "Renaissance art, stunning views, and endless espresso stops.",
          },
          {
            name: "Venice",
            description: "Canals, gondolas, and romantic vibes all around.",
          },
          {
            name: "Verona",
            description: "Shakespeare’s city of love and charming old streets.",
          },
          {
            name: "Bari",
            description:
              "Coastal city with a warm heart and delicious seafood.",
          },
          {
            name: "Catania",
            description:
              "Volcano views meet lively markets and Sicilian flair.",
          },
          {
            name: "Padua",
            description:
              "Historic squares and fresh coffee breaks await you here.",
          },
          {
            name: "Trieste",
            description: "Where Austrian charm meets Italian seaside magic.",
          },
          {
            name: "Brescia",
            description:
              "A city with a perfect blend of history and modern energy.",
          },
          {
            name: "Taranto",
            description: "Ancient roots and a lively harbor life to explore.",
          },
          {
            name: "Reggio Calabria",
            description: "Sun-drenched beaches and tasty Calabrian traditions.",
          },
          {
            name: "Modena",
            description: "Home of balsamic vinegar and fast cars!",
          },
          {
            name: "Parma",
            description: "Cheese, ham, and a welcoming small-town vibe.",
          },
          {
            name: "Prato",
            description:
              "Textile heritage and delicious Tuscan flavors to discover.",
          },
          {
            name: "Livorno",
            description: "Seaside fun with seafood and colorful canals.",
          },
          {
            name: "Foggia",
            description: "Sunny plains and a warm, friendly atmosphere.",
          },
          {
            name: "Perugia",
            description: "Chocolate festivals and medieval charm galore.",
          },
          {
            name: "Salerno",
            description:
              "Coastal beauty with a laid-back Mediterranean spirit.",
          },
          {
            name: "Ravenna",
            description:
              "Mosaics, history, and artistic inspiration at every turn.",
          },
          {
            name: "Ferrara",
            description: "Renaissance streets perfect for a cycling adventure.",
          },
          {
            name: "Sassari",
            description:
              "Sardinian culture with lively festivals and beautiful landscapes.",
          },
          {
            name: "Pescara",
            description: "Beaches and buzzing nightlife by the Adriatic Sea.",
          },
          {
            name: "Lecce",
            description:
              "Baroque beauty and delicious Southern Italian hospitality.",
          },
          {
            name: "Trento",
            description: "Alpine charm with castles and mountain views.",
          },
        ],
      },
      {
        name: "Jamaica",
        description:
          "An island nation in the Caribbean, known for its music, culture, and beaches.",
        topics: [],
        rooms: [
          {
            name: "Kingston",
            description:
              "The heartbeat of reggae and city vibes—energy never sleeps here!",
          },
          {
            name: "Montego Bay",
            description:
              "Beachside fun and tropical excitement—paradise with a party twist.",
          },
          {
            name: "Ocho Rios",
            description:
              "Adventure and waterfalls—every game round is a splash of joy!",
          },
          {
            name: "Negril",
            description:
              "Sunset views and chill vibes—where gaming meets total relaxation.",
          },
          {
            name: "Port Antonio",
            description:
              "Hidden gems, lush jungles, and a vibe that sparks creativity.",
          },
          {
            name: "Spanish Town",
            description:
              "Historic and buzzing—every challenge has a twist of the past.",
          },
          {
            name: "Mandeville",
            description:
              "Cool breezes and mountain charm—perfect for calm and clever play.",
          },
          {
            name: "Savanna-la-Mar",
            description:
              "Coastal calm meets playful spirit—easygoing fun in every round.",
          },
          {
            name: "May Pen",
            description:
              "In the heart of the island, where friendly games turn into full-on battles of wits!",
          },
          {
            name: "St. Ann",
            description:
              "Lively and lovely—where every game round feels like a festival.",
          },
          {
            name: "Clarendon",
            description: "Warm, welcoming, and full of game-ready spirit!",
          },
          {
            name: "St. James",
            description:
              "Golden beaches and bright ideas—spark up your game here!",
          },
          {
            name: "St. Catherine",
            description:
              "Busy streets and big moves—every second counts in this room.",
          },
          {
            name: "Manchester",
            description: "Cool climate and sharp minds—strategy lives here.",
          },
          {
            name: "Trelawny",
            description:
              "Fast-paced and exciting—where you dash through game rounds like a sprinter!",
          },
          {
            name: "St. Elizabeth",
            description:
              "Easygoing charm and clever twists—perfect for casual champions.",
          },
          {
            name: "Westmoreland",
            description:
              "Cozy corners and fierce fun—expect surprises at every turn.",
          },
          {
            name: "St. Mary",
            description:
              "Nature, mystery, and unexpected moves—keep your game sharp!",
          },
          {
            name: "St. Thomas",
            description:
              "Wild beauty and unpredictable fun—this room keeps you guessing!",
          },
          {
            name: "Hanover",
            description: "Small but mighty—big game energy in a cozy corner.",
          },
        ],
      },
      {
        name: "Japan",
        description:
          "An island nation in East Asia, known for its technology, culture, and natural beauty.",
        topics: [],
        rooms: [
          {
            name: "Tokyo",
            description:
              "Fast-paced fun in the city that never slows down—where every round is a neon-lit rush!",
          },
          {
            name: "Kyoto",
            description:
              "Where ancient traditions meet clever strategy—play with grace and wisdom!",
          },
          {
            name: "Osaka",
            description:
              "Loud, proud, and full of flavor—game with guts and style!",
          },
          {
            name: "Sapporo",
            description:
              "Cool games from the snowy north—bundle up for brain-freezing fun!",
          },
          {
            name: "Fukuoka",
            description:
              "Chill vibes and smooth moves—this room flows like a breeze!",
          },
          {
            name: "Nagasaki",
            description:
              "A port of surprises—where every move can sail you to victory.",
          },
          {
            name: "Hiroshima",
            description:
              "Peaceful yet powerful—outsmart the competition with silent strength.",
          },
          {
            name: "Nagoya",
            description:
              "Big city, big game—flex your skills in this buzzing hub of action!",
          },
          {
            name: "Sendai",
            description:
              "The city of trees brings green energy to your gameplay!",
          },
          {
            name: "Yokohama",
            description:
              "Modern, sleek, and full of twists—play like a tech-savvy ninja!",
          },
          {
            name: "Kobe",
            description:
              "Classy and cool—where your game style shines as bright as the bay!",
          },
          {
            name: "Nara",
            description:
              "Historic charm and quiet wit—think before you leap in this timeless town.",
          },
          {
            name: "Hakodate",
            description:
              "A gateway to clever play—discover strategies as fresh as seafood!",
          },
          {
            name: "Kanazawa",
            description:
              "Where art meets intellect—beautiful moves win the game!",
          },
          {
            name: "Okayama",
            description:
              "Home of legends and smart thinking—aim for legendary wins!",
          },
          {
            name: "Kagoshima",
            description: "Fire and fun from the south—ignite your strategy!",
          },
          {
            name: "Matsuyama",
            description:
              "Soak in wisdom like a hot spring—relaxed play, sharp mind!",
          },
          {
            name: "Toyama",
            description:
              "Quiet but deep—perfect for thinkers and tricksters alike!",
          },
          {
            name: "Takamatsu",
            description: "Island gateways and bold moves—connect and conquer!",
          },
          {
            name: "Okinawa",
            description: "Beach vibes, chill minds—play smart, relax hard!",
          },
        ],
      },
      {
        name: "Jordan",
        description:
          "A country in the Middle East, known for its ancient landmarks like Petra and the Dead Sea.",
        topics: [],
        rooms: [
          {
            name: "Amman",
            description:
              "A buzzing capital where modern moves meet ancient minds—fast-paced and strategic!",
          },
          {
            name: "Petra",
            description:
              "A room carved for the brave—mysteries, puzzles, and epic wins await!",
          },
          {
            name: "Aqaba",
            description:
              "Sun, sea, and smooth gameplay—relax and rule this coastal showdown!",
          },
          {
            name: "Irbid",
            description:
              "Student smarts and clever plays—welcome to the thinking hub!",
          },
          {
            name: "Zarqa",
            description:
              "Industrial energy and solid moves—where precision matters most!",
          },
          {
            name: "Madaba",
            description:
              "Map your way to victory in this colorful and clever room!",
          },
          {
            name: "Jerash",
            description:
              "Step into ancient arenas—where every round feels like a gladiator's challenge!",
          },
          {
            name: "Ma'an",
            description:
              "Desert winds carry bold plays—navigate wisely in this fierce zone!",
          },
          {
            name: "Karak",
            description:
              "Castles, courage, and cunning moves—rule the game like a medieval knight!",
          },
          {
            name: "Tafilah",
            description:
              "Quiet strength and natural charm—win with subtle strategy!",
          },
          {
            name: "Balqa",
            description:
              "Mountain vibes and sharp minds—play with an edge from the highlands!",
          },
          {
            name: "Ajloun",
            description:
              "Forested flair and hidden tactics—where nature meets clever moves!",
          },
        ],
      },
      {
        name: "Kazakhstan",
        description:
          "A large landlocked country in Central Asia, known for its vast steppes and oil resources.",
        topics: [],
        rooms: [
          {
            name: "Astana",
            description:
              "The futuristic capital where strategy meets innovation—play with vision!",
          },
          {
            name: "Almaty",
            description:
              "A vibrant hub of culture and excitement—bring your best moves to the table!",
          },
          {
            name: "Shymkent",
            description: "A bustling southern hotspot—play fast, think faster!",
          },
          {
            name: "Karaganda",
            description: "A mining town of resilience—dig deep for victory!",
          },
          {
            name: "Aktau",
            description:
              "Coastal charm meets calculated moves—navigate the waves to win!",
          },
          {
            name: "Atyrau",
            description:
              "Oil-rich and resourceful—win big with well-planned strategies!",
          },
          {
            name: "Pavlodar",
            description:
              "Industrial strength and solid plays—dominate with precision!",
          },
          {
            name: "Kostanay",
            description:
              "Agricultural heartland—harvest clever wins with creative tactics!",
          },
          {
            name: "Taraz",
            description:
              "Ancient crossroads of trade—barter your way to victory!",
          },
          {
            name: "Ust-Kamenogorsk",
            description:
              "A city of rivers and resourcefulness—flow smoothly to the top!",
          },
          {
            name: "Semey",
            description:
              "A historical town with modern flair—combine wit and wisdom to win!",
          },
          {
            name: "Kyzylorda",
            description:
              "Desert determination—turn the heat up in every round!",
          },
          {
            name: "Baikonur",
            description:
              "Launch your strategy into orbit—play like a true explorer!",
          },
        ],
      },
      {
        name: "Kenya",
        description:
          "A country in East Africa, known for its wildlife safaris and natural beauty.",
        topics: [],
        rooms: [
          {
            name: "Nairobi",
            description:
              "The buzzing heart of Kenya—fast-paced, vibrant, and full of surprises!",
          },
          {
            name: "Mombasa",
            description:
              "Coastal chill meets spicy thrills. Sun, sea, and some tricky puzzles!",
          },
          {
            name: "Kisumu",
            description:
              "A lakeside adventure where cool breezes and brain teasers flow together.",
          },
          {
            name: "Nakuru",
            description: "Where flamingos fly and your ideas soar. Let's play!",
          },
          {
            name: "Eldoret",
            description: "Home of champions—can you keep up with the pace?",
          },
          {
            name: "Thika",
            description:
              "Industrial strength thinking and sweet banana breaks!",
          },
          {
            name: "Malindi",
            description:
              "A tropical twist awaits—get ready for island-style fun!",
          },
          {
            name: "Kitale",
            description:
              "Plow through puzzles in this farming town of brainy harvests.",
          },
          {
            name: "Nyeri",
            description: "A cool mountain breeze and some hot competition!",
          },
          {
            name: "Kericho",
            description:
              "Brew your best game moves—this town runs on tea and wit!",
          },
          {
            name: "Machakos",
            description:
              "Where gravity might fool you—but your mind stays sharp!",
          },
          {
            name: "Naivasha",
            description:
              "Sail into fun by the lake—wildlife, wonder, and wordplay!",
          },
          {
            name: "Meru",
            description: "Climb higher with every round—Mount Kenya style!",
          },
          {
            name: "Kakamega",
            description:
              "Forest vibes and leafy riddles—nature meets challenge.",
          },
          {
            name: "Embu",
            description:
              "A quiet town where calm minds make the sharpest moves.",
          },
          {
            name: "Lamu",
            description: "Ancient charm and modern mind games—set sail!",
          },
          {
            name: "Garissa",
            description:
              "Desert winds carry clever clues. Stay sharp in the sand!",
          },
          {
            name: "Voi",
            description: "Start your safari of smarts here—Tsavo tests await!",
          },
          {
            name: "Busia",
            description: "Borderline brilliance—cross into the fun zone!",
          },
          {
            name: "Migori",
            description: "A colorful corner where creativity runs wild.",
          },
          {
            name: "Homa Bay",
            description: "Where lake legends are born—ready to make your mark?",
          },
          {
            name: "Isiolo",
            description:
              "The future flows through here—hop on the smart train!",
          },
          {
            name: "Wajir",
            description:
              "A desert gem full of tricky treasures and clever turns.",
          },
          {
            name: "Mandera",
            description:
              "Edge of the map, center of the challenge—show your skill!",
          },
          {
            name: "Marsabit",
            description:
              "Dusty roads, deep puzzles—navigate your way to glory!",
          },
          {
            name: "Bungoma",
            description: "Rustic roots and rapid riddles—play the rural way!",
          },
          {
            name: "Nanyuki",
            description: "Mountains, stars, and strategy—what a combo!",
          },
          {
            name: "Kilifi",
            description:
              "Beach vibes and breezy games—surf your way to the top!",
          },
          {
            name: "Kisii",
            description:
              "Smooth moves from the soapstone city—polish your skills!",
          },
          {
            name: "Taveta",
            description: "Crossroads of fun and challenge—play your path!",
          },
        ],
      },
      {
        name: "Kiribati",
        description:
          "A small island nation in the Pacific Ocean, facing challenges due to climate change.",
        topics: [],
        rooms: [
          {
            name: "Tarawa",
            description:
              "The capital buzzes with island vibes and endless game waves!",
          },
          {
            name: "South Tarawa",
            description:
              "Where the action heats up—think fast, play hard, surf smarter!",
          },
          {
            name: "Betio",
            description:
              "A tiny town with big game energy—can you conquer the coast?",
          },
          {
            name: "Bairiki",
            description: "The seat of smarts! Ready to rule the trivia island?",
          },
          {
            name: "Bonriki",
            description:
              "Land at the airport, and take off into fun and games!",
          },
          {
            name: "Abaiang",
            description:
              "Calm lagoons, deep thoughts—float through the challenges!",
          },
          {
            name: "Abemama",
            description:
              "A chill island with hot questions. Stay cool, think quick!",
          },
          {
            name: "Butaritari",
            description: "Tropical tricks and oceanic odds—game on!",
          },
          {
            name: "Marakei",
            description:
              "Circle the island, unlock the riddles—round and round it goes!",
          },
          {
            name: "Kiritimati",
            description:
              "The world’s biggest coral island—big fun, big puzzles!",
          },
          {
            name: "Tabuaeran",
            description:
              "Known as Fanning Island—get ready for a breeze of brain games!",
          },
          {
            name: "Teraina",
            description:
              "Lush, remote, and ready to test your island instincts!",
          },
          {
            name: "Arorae",
            description:
              "At the southern tip—navigate your way through wild game twists!",
          },
          {
            name: "Onotoa",
            description: "Peaceful waters, tricky puzzles—stay steady!",
          },
          {
            name: "Tamana",
            description:
              "Small but mighty—don’t underestimate the island challenge!",
          },
          {
            name: "Maiana",
            description: "Catch the current of clues in this laid-back lagoon!",
          },
          {
            name: "Nonouti",
            description:
              "A long stretch of fun—paddle your brain down the trivia stream!",
          },
          {
            name: "Beru",
            description:
              "From fish to facts—cast your net and see what you catch!",
          },
          {
            name: "Nikunau",
            description: "Where quiet shores meet sharp minds—let’s play!",
          },
          {
            name: "Tabiteuea",
            description: "Twist through twin islands with twice the fun!",
          },
        ],
      },
      {
        name: "Kuwait",
        description:
          "A small country in the Middle East, known for its oil reserves and wealthy economy.",
        topics: [],
        rooms: [
          {
            name: "Kuwait City",
            description:
              "The buzzing capital where every game gets electrified!",
          },
          {
            name: "Salmiya",
            description:
              "Seaside fun and clever moves—surf your way to victory!",
          },
          {
            name: "Hawally",
            description:
              "Where the techies and strategists collide—outsmart your opponents here!",
          },
          {
            name: "Fahaheel",
            description:
              "Chill by the coast and challenge your skills to the max!",
          },
          {
            name: "Farwaniya",
            description: "Fast-paced action in the heart of the city buzz!",
          },
          {
            name: "Jahra",
            description:
              "Desert vibes meet daring gameplay—ready to take the heat?",
          },
          {
            name: "Sabah Al Salem",
            description:
              "A calm zone with a wild side—perfect for cunning players!",
          },
          {
            name: "Mubarak Al-Kabeer",
            description:
              "Hidden gems and sneaky plays await in this quiet town!",
          },
        ],
      },
      {
        name: "Kyrgyzstan",
        description:
          "A country in Central Asia, known for its mountains and nomadic culture.",
        topics: [],
        rooms: [
          {
            name: "Bishkek",
            description: "The buzzing capital full of energy and clever moves.",
          },
          {
            name: "Osh",
            description:
              "A historic city where legends are born and strategies clash.",
          },
          {
            name: "Jalal-Abad",
            description:
              "Lush valleys and quick wits make this a game hotspot.",
          },
          {
            name: "Karakol",
            description: "Mountain air sharpens your mind for epic battles.",
          },
          {
            name: "Naryn",
            description:
              "Chilly peaks and hot tactics meet in this highland room.",
          },
          {
            name: "Talas",
            description:
              "Where history fuels your gameplay and every move counts.",
          },
          {
            name: "Cholpon-Ata",
            description: "Lakeside fun with plenty of room for surprises.",
          },
          {
            name: "Batken",
            description: "A gateway to adventure with tricky challenges ahead.",
          },
          {
            name: "Kochkor",
            description: "Rugged terrain and sharp minds win the day here.",
          },
          {
            name: "Balykchy",
            description:
              "By the lake, where calm waters hide fierce competition.",
          },
          {
            name: "Tokmok",
            description:
              "Ancient ruins inspire clever strategies and bold moves.",
          },
          {
            name: "Kyzyl-Kiya",
            description: "Mining town with rich resources and rich gameplay.",
          },
        ],
      },
      {
        name: "Laos",
        description:
          "A landlocked country in Southeast Asia, known for its Buddhist culture and natural beauty.",
        topics: [],
        rooms: [
          {
            name: "Vientiane",
            description:
              "The chill capital where ancient temples meet modern vibes.",
          },
          {
            name: "Luang Prabang",
            description:
              "A serene town filled with monks, waterfalls, and peaceful strategy.",
          },
          {
            name: "Pakse",
            description:
              "Gateway to the south, where rivers and tactics flow freely.",
          },
          {
            name: "Savannakhet",
            description: "Historic charm with plenty of room for clever plays.",
          },
          {
            name: "Thakhek",
            description:
              "Adventure hub surrounded by limestone mountains and bold moves.",
          },
          {
            name: "Muang Xay",
            description:
              "Northern highlands with cool air and hot competitions.",
          },
          {
            name: "Phonsavan",
            description:
              "Land of the mysterious Plain of Jars and unexpected twists.",
          },
          {
            name: "Champasak",
            description:
              "Where ancient ruins and fresh ideas collide in gameplay.",
          },
          {
            name: "Bolaven Plateau",
            description:
              "Coffee, waterfalls, and strategy steeped to perfection.",
          },
          {
            name: "Xam Neua",
            description:
              "Eastern mountain town with sharp tactics and vibrant culture.",
          },
        ],
      },
      {
        name: "Latvia",
        description:
          "A Baltic country in Northern Europe, known for its medieval architecture and forests.",
        topics: [],
        rooms: [
          {
            name: "Riga",
            description:
              "The vibrant capital where history and hip vibes collide.",
          },
          {
            name: "Daugavpils",
            description: "A lively city with cool culture and crafty moves.",
          },
          {
            name: "Liepāja",
            description: "Coastal charm with a splash of music and strategy.",
          },
          {
            name: "Jelgava",
            description:
              "Green parks and clever plays in this university town.",
          },
          {
            name: "Ventspils",
            description: "A bustling port city with a breeze of fresh tactics.",
          },
          {
            name: "Valmiera",
            description:
              "Northern vibes with a twist of fun and forest adventures.",
          },
          {
            name: "Cēsis",
            description: "Medieval castles and modern gaming quests.",
          },
          {
            name: "Jūrmala",
            description: "Beachside fun and seaside strategies await.",
          },
          {
            name: "Rezekne",
            description: "Eastern flair with a mix of culture and cunning.",
          },
          {
            name: "Kuldīga",
            description: "Waterfalls, cobblestones, and creative gameplay.",
          },
        ],
      },
      {
        name: "Lesotho",
        description:
          "A landlocked country in Southern Africa, known for its mountainous terrain and wool production.",
        topics: [],
        rooms: [
          {
            name: "Maseru",
            description:
              "The bustling capital city where tradition meets modern vibes.",
          },
          {
            name: "Teyateyaneng",
            description:
              "A lively town famous for its colorful markets and creative spirit.",
          },
          {
            name: "Mafeteng",
            description:
              "A charming place with friendly locals and scenic views all around.",
          },
          {
            name: "Hlotse",
            description:
              "Also called Leribe, a city full of history and warm community vibes.",
          },
          {
            name: "Mohale's Hoek",
            description:
              "Where mountain adventures and local culture collide in perfect harmony.",
          },
          {
            name: "Quthing",
            description:
              "A hidden gem known for its stunning landscapes and cultural heritage.",
          },
          {
            name: "Butha-Buthe",
            description:
              "A gateway to mountainous fun and traditional Basotho hospitality.",
          },
          {
            name: "Mokhotlong",
            description:
              "High up in the mountains, a town full of cool air and cooler stories.",
          },
          {
            name: "Maputsoe",
            description:
              "A vibrant border town buzzing with trade and everyday excitement.",
          },
          {
            name: "Roma",
            description:
              "Home to universities and youthful energy, with a touch of mountain charm.",
          },
        ],
      },
      {
        name: "Liberia",
        description:
          "A country in West Africa, known for its history as a settlement for freed American slaves.",
        topics: [],
        rooms: [
          {
            name: "Monrovia",
            description:
              "The bustling capital city where history meets lively markets and coastal vibes.",
          },
          {
            name: "Gbarnga",
            description:
              "A vibrant city with colorful streets and a friendly community spirit.",
          },
          {
            name: "Buchanan",
            description:
              "A coastal city famous for its sandy beaches and laid-back atmosphere.",
          },
          {
            name: "Kakata",
            description:
              "Known for its local flavors and warm hospitality, a city full of surprises.",
          },
          {
            name: "Greenville",
            description:
              "A lively port city with a mix of tradition and modern charm.",
          },
          {
            name: "Harper",
            description:
              "A charming city with a rich cultural heritage and scenic river views.",
          },
          {
            name: "Zwedru",
            description:
              "A city surrounded by lush greenery and buzzing with local energy.",
          },
          {
            name: "Voinjama",
            description:
              "A friendly town where community and nature come together in harmony.",
          },
          {
            name: "Robertsport",
            description: "A surfer’s paradise with cool waves and chill vibes.",
          },
          {
            name: "Tubmanburg",
            description:
              "A historic town nestled near hills, full of stories and warm smiles.",
          },
        ],
      },
      {
        name: "Libya",
        description:
          "A North African country famous for its desert landscapes and rich history.",
        topics: [],
        rooms: [
          {
            name: "Tripoli",
            description:
              "The bustling capital where history meets the Mediterranean breeze.",
          },
          {
            name: "Benghazi",
            description:
              "A lively city with coastal charm and stories around every corner.",
          },
          {
            name: "Misrata",
            description: "Known for its vibrant markets and energetic spirit.",
          },
          {
            name: "Al Khums",
            description:
              "A coastal gem with stunning beaches and friendly locals.",
          },
          {
            name: "Zuwara",
            description:
              "A colorful town where tradition and seaside vibes mix perfectly.",
          },
          {
            name: "Sabha",
            description:
              "The desert hub with endless sand dunes and warm hospitality.",
          },
          {
            name: "Tobruk",
            description:
              "A historic port city with tales from the past and ocean views.",
          },
          {
            name: "Sirte",
            description:
              "Where the desert meets the sea, full of hidden adventures.",
          },
          {
            name: "Derna",
            description:
              "A city known for its rugged coastlines and mountain backdrop.",
          },
          {
            name: "Ajdabiya",
            description:
              "A lively crossroads town with desert charm and vibrant culture.",
          },
          {
            name: "Gharyan",
            description:
              "Nestled in the mountains, famous for its cool climate and caves.",
          },
          {
            name: "Nalut",
            description:
              "A historic mountain town with ancient forts and stunning views.",
          },
          {
            name: "Zliten",
            description:
              "A town rich in culture, where tradition meets modern life.",
          },
          {
            name: "Janzur",
            description:
              "A coastal retreat with beautiful beaches and a laid-back vibe.",
          },
        ],
      },
      {
        name: "Liechtenstein",
        description:
          "A tiny yet mighty alpine country, packed with castles, charm, and a dash of luxury.",
        topics: [],
        rooms: [
          {
            name: "Vaduz",
            description:
              "The vibrant capital where history and modern life mix with stunning mountain views.",
          },
          {
            name: "Schaan",
            description:
              "The bustling hub of commerce and culture, with a welcoming small-town vibe.",
          },
          {
            name: "Triesen",
            description:
              "A cozy town known for its friendly people and beautiful trails.",
          },
          {
            name: "Balzers",
            description:
              "Home to medieval castles and picturesque streets ready for adventure.",
          },
          {
            name: "Eschen",
            description:
              "A lively community with a mix of tradition and modern fun.",
          },
          {
            name: "Mauren",
            description: "Where charming village life meets alpine beauty.",
          },
          {
            name: "Ruggell",
            description:
              "The northern gateway town with plenty of local character and outdoor fun.",
          },
          {
            name: "Gamprin",
            description: "A peaceful spot with great views and lots of heart.",
          },
        ],
      },
      {
        name: "Lithuania",
        description:
          "A Baltic gem with a rich history, charming old towns, and vibrant culture.",
        topics: [],
        rooms: [
          {
            name: "Vilnius",
            description:
              "The lively capital full of winding streets, cozy cafés, and artistic vibes.",
          },
          {
            name: "Kaunas",
            description:
              "A youthful city buzzing with energy, street art, and riverfront views.",
          },
          {
            name: "Klaipėda",
            description:
              "A cool port city where the sea breeze meets quirky architecture.",
          },
          {
            name: "Šiauliai",
            description:
              "Known for its sunny hills and friendly faces, ready for your next adventure.",
          },
          {
            name: "Panevėžys",
            description:
              "A vibrant city with parks, theaters, and a welcoming atmosphere.",
          },
          {
            name: "Alytus",
            description:
              "Nestled by the river, perfect for chill vibes and nature lovers.",
          },
          {
            name: "Marijampolė",
            description:
              "A charming town with a warm community and lively festivals.",
          },
        ],
      },
      {
        name: "Luxembourg",
        description:
          "A tiny powerhouse full of history, castles, and cosmopolitan charm.",
        topics: [],
        rooms: [
          {
            name: "Luxembourg City",
            description:
              "The bustling capital where history meets modern charm — perfect for city explorers!",
          },
          {
            name: "Esch-sur-Alzette",
            description:
              "A lively industrial hub with a creative twist, where old meets new energy.",
          },
          {
            name: "Differdange",
            description:
              "A cozy town with a big heart and even bigger steel heritage vibes.",
          },
          {
            name: "Dudelange",
            description:
              "Where culture and community come together in a friendly neighborhood scene.",
          },
          {
            name: "Ettelbruck",
            description:
              "A gateway town known for its scenic views and warm welcomes.",
          },
          {
            name: "Diekirch",
            description:
              "Famous for its festive spirit and a dash of military history — a place to celebrate!",
          },
          {
            name: "Grevenmacher",
            description:
              "A charming town famous for vineyards and riverside relaxation.",
          },
          {
            name: "Remich",
            description:
              "The ‘Pearl of the Moselle’ where wine flows and good times roll.",
          },
          {
            name: "Wiltz",
            description:
              "A mountainous retreat full of nature trails and quiet adventures.",
          },
          {
            name: "Bertrange",
            description:
              "A suburban gem with a mix of peaceful parks and lively local spots.",
          },
        ],
      },
      {
        name: "Madagascar",
        description:
          "An island country off the coast of Africa, known for its unique wildlife and rainforests.",
        topics: [],
        rooms: [
          {
            name: "Antananarivo",
            description:
              "The bustling capital full of colorful markets and vibrant street life.",
          },
          {
            name: "Toamasina",
            description:
              "A lively port city where the sea breeze meets tropical vibes.",
          },
          {
            name: "Antsirabe",
            description:
              "A cool highland town famous for its relaxing hot springs and charming streets.",
          },
          {
            name: "Fianarantsoa",
            description:
              "The cultural heartland with historic buildings and a touch of adventure.",
          },
          {
            name: "Mahajanga",
            description:
              "A sunny coastal city with beautiful beaches and a laid-back spirit.",
          },
          {
            name: "Toliara",
            description:
              "A gateway to stunning coral reefs and desert landscapes.",
          },
          {
            name: "Morondava",
            description:
              "Home to the iconic baobabs and unforgettable sunsets.",
          },
          {
            name: "Antsiranana",
            description:
              "A northern city where nature and history create a perfect getaway.",
          },
        ],
      },
      {
        name: "Malawi",
        description:
          "A landlocked country in Southeast Africa, known for its lakes and wildlife.",
        topics: [],
        rooms: [
          {
            name: "Lilongwe",
            description: "The cool capital city where game decisions are made.",
          },
          {
            name: "Blantyre",
            description:
              "Business vibes and big fun—where action never sleeps!",
          },
          {
            name: "Mzuzu",
            description: "Northern charm meets highland adventures!",
          },
          {
            name: "Zomba",
            description: "Scenic hills and smart moves—strategy lives here.",
          },
          {
            name: "Mangochi",
            description: "Lake views, laid-back vibes, and splashy games!",
          },
          {
            name: "Kasungu",
            description: "Farm fields and fearless players—grow your score!",
          },
          {
            name: "Salima",
            description: "Sun, sand, and side quests—beach energy, game focus!",
          },
          {
            name: "Karonga",
            description: "Fossils and firepower—dig deep to win big!",
          },
          {
            name: "Nkhotakota",
            description: "Wildlife and wildcards—expect the unexpected.",
          },
          {
            name: "Liwonde",
            description: "Gateway to nature and next-level challenges!",
          },
        ],
      },
      {
        name: "Malaysia",
        description:
          "A country in Southeast Asia, known for its modern cities and tropical rainforests.",
        topics: [],
        rooms: [
          {
            name: "Kuala Lumpur",
            description:
              "Where skyscrapers meet street food and vibrant nights!",
          },
          {
            name: "George Town",
            description: "A heritage haven with murals, markets, and magic.",
          },
          {
            name: "Johor Bahru",
            description:
              "A southern spark buzzing with malls and border vibes!",
          },
          {
            name: "Ipoh",
            description:
              "The land of limestone hills and lip-smacking delights.",
          },
          {
            name: "Shah Alam",
            description: "Home of giant domes and laid-back city life.",
          },
          {
            name: "Malacca",
            description:
              "History comes alive with trishaws, lanterns, and old forts.",
          },
          {
            name: "Kota Kinabalu",
            description: "Sunsets, seafood, and mountain moods await you!",
          },
          {
            name: "Kuching",
            description: "Cat statues, riverside vibes, and charming chaos.",
          },
          {
            name: "Miri",
            description:
              "A breezy blend of oil town roots and outdoor adventures.",
          },
          {
            name: "Alor Setar",
            description: "Northern charm with rice fields and local tales.",
          },
          {
            name: "Seremban",
            description: "Where modern meets traditional in cozy corners.",
          },
          {
            name: "Petaling Jaya",
            description: "Suburban splash with shopping sprees and food hunts.",
          },
          {
            name: "Putrajaya",
            description:
              "Futuristic bridges, grand buildings, and garden walks.",
          },
          {
            name: "Langkawi",
            description: "Island paradise with cable cars and coconut dreams.",
          },
          {
            name: "Taiping",
            description: "Rainy days, colonial charm, and peaceful parks.",
          },
          {
            name: "Sibu",
            description: "River tales, food trails, and a heart of Sarawak.",
          },
          {
            name: "Sandakan",
            description: "Wildlife wonders and jungle escapes await.",
          },
          {
            name: "Kuantan",
            description: "East coast breeze with sandy toes and sunrise views.",
          },
          {
            name: "Bintulu",
            description: "Industrial pulse with hidden natural gems.",
          },
          {
            name: "Tawau",
            description: "A trading post with tropical twists and tasty bites.",
          },
        ],
      },
      {
        name: "Maldives",
        description:
          "An island nation in the Indian Ocean, famous for its luxury resorts and coral reefs.",
        topics: [],
        rooms: [
          {
            name: "Malé",
            description:
              "The buzzing capital island—tiny, lively, and always in motion!",
          },
          {
            name: "Hulhumalé",
            description:
              "A futuristic island city rising from the ocean—urban beach vibes!",
          },
          {
            name: "Addu City",
            description:
              "A string of southern islands with a chilled-out island city feel.",
          },
          {
            name: "Fuvahmulah",
            description:
              "An all-in-one island that's totally different from the rest!",
          },
          {
            name: "Kulhudhuffushi",
            description:
              "Northern charm meets mangrove magic—quiet but full of life.",
          },
          {
            name: "Thinadhoo",
            description:
              "A peaceful escape with a spark of adventure waiting to be explored!",
          },
          {
            name: "Naifaru",
            description:
              "A bustling little hub with loads of local color and energy!",
          },
          {
            name: "Villingili",
            description:
              "A breezy, laid-back corner of the capital with beachy streets.",
          },
          {
            name: "Hithadhoo",
            description:
              "The largest island of Addu—where calm lagoons meet cozy towns.",
          },
          {
            name: "Maafushi",
            description:
              "Tourist-central with hostels, beaches, and friendly island vibes!",
          },
          {
            name: "Eydhafushi",
            description:
              "A cultural center in Baa Atoll—small town, big personality.",
          },
          {
            name: "Dhidhdhoo",
            description:
              "Quiet charm up north—fishing boats and friendly folks.",
          },
          {
            name: "Veymandoo",
            description:
              "Laid-back and green—perfect for low-key island exploration.",
          },
          {
            name: "Nilandhoo",
            description:
              "Colorful homes and a tight-knit community on a sleepy isle.",
          },
          {
            name: "Fonadhoo",
            description:
              "Part of a long island chain—chill vibes and crystal clear waters.",
          },
          {
            name: "Gan",
            description:
              "A historic island with an old British airbase and new island adventures.",
          },
          {
            name: "Mahibadhoo",
            description: "Warm welcomes and classic island life in Alif Dhaal!",
          },
          {
            name: "Manadhoo",
            description:
              "The heart of Noonu Atoll, with peaceful lagoons and pretty shores.",
          },
          {
            name: "Funadhoo",
            description:
              "Shaviyani's capital island—serene, green, and full of smiles.",
          },
          {
            name: "Kudahuvadhoo",
            description:
              "Dhaalu's gem—quiet streets and a mysterious ancient mound!",
          },
        ],
      },
      {
        name: "Mali",
        description:
          "A country in West Africa, known for its ancient culture and desert landscapes.",
        topics: [],
        rooms: [
          {
            name: "Bamako",
            description:
              "The lively capital where music meets markets and motorbikes!",
          },
          {
            name: "Timbuktu",
            description:
              "A legendary desert city that's full of mystery and stories.",
          },
          {
            name: "Gao",
            description:
              "Where the Niger River bends and history whispers from the dunes.",
          },
          {
            name: "Kayes",
            description:
              "Hot, historic, and bustling—a gateway to Mali’s west!",
          },
          {
            name: "Sikasso",
            description:
              "Green and vibrant, with friendly vibes and fresh fruit galore!",
          },
          {
            name: "Mopti",
            description:
              "A river town full of boats, culture, and colorful chaos.",
          },
          {
            name: "Segou",
            description:
              "Chill by the river with art, tradition, and ancient vibes.",
          },
          {
            name: "Koutiala",
            description:
              "A cotton town with heart, rhythm, and energy to spare!",
          },
          {
            name: "San",
            description: "A peaceful pit stop packed with community charm.",
          },
          {
            name: "Djenné",
            description:
              "Home to the world’s biggest mud building—seriously epic!",
          },
        ],
      },
      {
        name: "Malta",
        description:
          "An island nation in the Mediterranean, known for its history and beaches.",
        topics: [],
        rooms: [
          {
            name: "Valletta",
            description:
              "The bustling capital where history meets lively street vibes.",
          },
          {
            name: "Mdina",
            description:
              "The silent city full of ancient walls and timeless charm.",
          },
          {
            name: "Sliema",
            description:
              "A seaside hotspot perfect for shopping and sunset strolls.",
          },
          {
            name: "St. Julian’s",
            description: "Where nightlife sparkles and fun never sleeps.",
          },
          {
            name: "Birgu",
            description: "A historic harbor town with stories in every corner.",
          },
          {
            name: "Rabat",
            description: "A town rich in culture, caves, and friendly faces.",
          },
          {
            name: "Mosta",
            description:
              "Famous for its massive dome and vibrant community spirit.",
          },
          {
            name: "Marsaxlokk",
            description:
              "A colorful fishing village where boats and traditions shine.",
          },
          {
            name: "Birkirkara",
            description: "A lively town known for festivals and local flavors.",
          },
          {
            name: "Qormi",
            description:
              "Where baking smells fill the air and traditions run deep.",
          },
          {
            name: "Żabbar",
            description:
              "A friendly town with rich religious heritage and events.",
          },
          {
            name: "Żejtun",
            description:
              "A charming town blending history and modern life seamlessly.",
          },
          {
            name: "Ħamrun",
            description:
              "A neighborhood buzzing with sports, shops, and local life.",
          },
        ],
      },
      {
        name: "Marshall Islands",
        description:
          "An island country in the Pacific Ocean, known for its tropical vibes and marine wonders.",
        topics: [],
        rooms: [
          {
            name: "Majuro",
            description:
              "The bustling capital island where island life meets modern fun!",
          },
          {
            name: "Ebeye",
            description:
              "The lively island known for its friendly locals and vibrant community spirit.",
          },
          {
            name: "Kwajalein",
            description:
              "Home to stunning lagoons and lots of island adventures.",
          },
          {
            name: "Wotje",
            description:
              "A peaceful atoll perfect for nature lovers and ocean explorers.",
          },
          {
            name: "Jaluit",
            description:
              "An island full of history and laid-back island charm.",
          },
          {
            name: "Ailinglaplap",
            description:
              "Where traditional culture meets beautiful sandy shores.",
          },
          {
            name: "Mili",
            description:
              "A quiet getaway spot with crystal clear waters and lots to discover.",
          },
          {
            name: "Arno",
            description:
              "An island paradise for fishing, boating, and relaxing by the sea.",
          },
          {
            name: "Enewetak",
            description:
              "A remote atoll known for its unique history and stunning marine life.",
          },
          {
            name: "Rongelap",
            description: "Where nature thrives and island tales come alive.",
          },
          {
            name: "Lae",
            description:
              "A small island with big island vibes and endless ocean views.",
          },
          {
            name: "Ujelang",
            description:
              "A hidden gem for adventurers seeking quiet island beauty.",
          },
        ],
      },
      {
        name: "Mauritania",
        description:
          "A country in West Africa, known for its desert landscapes and ancient history.",
        topics: [],
        rooms: [
          {
            name: "Nouakchott",
            description:
              "The bustling capital where desert vibes meet coastal breezes.",
          },
          {
            name: "Nouadhibou",
            description:
              "A vibrant port city famous for its lively markets and ocean views.",
          },
          {
            name: "Atar",
            description:
              "Gateway to the Sahara with endless sand dunes and starry nights.",
          },
          {
            name: "Zouérat",
            description:
              "A mining town surrounded by rocky landscapes and rich minerals.",
          },
          {
            name: "Kiffa",
            description:
              "A charming oasis town known for its local crafts and culture.",
          },
          {
            name: "Rosso",
            description:
              "A riverside town where the desert meets the water in style.",
          },
          {
            name: "Tidjikja",
            description:
              "An ancient town with rich traditions and peaceful desert vibes.",
          },
          {
            name: "Aioun",
            description:
              "A desert town famous for its vibrant community and camel caravans.",
          },
        ],
      },
      {
        name: "Mauritius",
        description:
          "An island nation in the Indian Ocean, known for its beaches, reefs, and luxury resorts.",
        topics: [],
        rooms: [
          {
            name: "Port Louis",
            description:
              "The vibrant capital city, buzzing with markets and harbor views.",
          },
          {
            name: "Curepipe",
            description:
              "A cool, hilly town famous for shopping and beautiful gardens.",
          },
          {
            name: "Quatre Bornes",
            description:
              "A lively city known for its colorful street markets and friendly vibes.",
          },
          {
            name: "Vacoas-Phoenix",
            description:
              "A bustling town perfect for exploring local culture and street food.",
          },
          {
            name: "Mahébourg",
            description:
              "A historic seaside town with charming colonial architecture.",
          },
          {
            name: "Flic en Flac",
            description:
              "A beach lover’s paradise with golden sands and stunning sunsets.",
          },
          {
            name: "Grand Baie",
            description:
              "A fun-filled coastal town famous for nightlife and water sports.",
          },
        ],
      },
      {
        name: "Mexico",
        description:
          "A country in North America, known for its rich culture, history, and cuisine.",
        topics: [],
        rooms: [
          {
            name: "Mexico City",
            description:
              "The bustling heart of Mexico, where history meets modern life and tacos are always fresh.",
          },
          {
            name: "Guadalajara",
            description:
              "Land of mariachi music and colorful traditions — join the fiesta anytime here!",
          },
          {
            name: "Monterrey",
            description:
              "A vibrant industrial hub with stunning mountain views and a spicy food scene.",
          },
          {
            name: "Puebla",
            description:
              "Famous for its colonial charm and delicious mole sauce — taste the culture!",
          },
          {
            name: "Tijuana",
            description:
              "The lively border city where fun never stops and street art decorates every corner.",
          },
          {
            name: "León",
            description:
              "Known as the leather capital, get ready to walk stylishly through this bustling city.",
          },
          {
            name: "Ciudad Juárez",
            description:
              "A border city with a resilient spirit and plenty of stories to share.",
          },
          {
            name: "Toluca",
            description:
              "Surrounded by volcanoes and history, this city keeps things cool and exciting.",
          },
          {
            name: "Mérida",
            description:
              "The cultural gem of the Yucatán with vibrant markets and sunny plazas.",
          },
          {
            name: "Culiacán",
            description:
              "A city full of energy, known for its agriculture and lively festivals.",
          },
          {
            name: "Querétaro",
            description:
              "A mix of old-world charm and new-world innovation — history meets progress here.",
          },
          {
            name: "San Luis Potosí",
            description:
              "A city with baroque beauty and adventurous spirit — ready to explore?",
          },
          {
            name: "Aguascalientes",
            description:
              "Famous for its hot springs and annual festivals — soak up the fun!",
          },
          {
            name: "Morelia",
            description:
              "Colonial architecture and a romantic vibe make this city unforgettable.",
          },
          {
            name: "Hermosillo",
            description:
              "The sunny capital of Sonora, where desert landscapes meet urban life.",
          },
          {
            name: "Saltillo",
            description:
              "A city with a proud mining past and a bright cultural scene.",
          },
          {
            name: "Veracruz",
            description:
              "A lively port city with Caribbean vibes and endless seafood delights.",
          },
          {
            name: "Cancún",
            description:
              "Famous for its beaches and nightlife — paradise found for every player!",
          },
          {
            name: "Chihuahua",
            description:
              "Gateway to the desert and home of wild adventures and rich history.",
          },
          {
            name: "Mazatlán",
            description:
              "Known for golden beaches and festive spirit — dive into the fun!",
          },
        ],
      },
      {
        name: "Micronesia",
        description:
          "A country in the Pacific Ocean, known for its islands and unique culture.",
        topics: [],
        rooms: [
          {
            name: "Pohnpei",
            description:
              "Lush tropical paradise where ancient ruins meet vibrant island life.",
          },
          {
            name: "Chuuk",
            description:
              "Dive into history with beautiful lagoons and underwater shipwrecks.",
          },
          {
            name: "Yap",
            description:
              "Home of the famous stone money and rich traditional customs.",
          },
          {
            name: "Kosrae",
            description:
              "The untouched island with waterfalls and peaceful green landscapes.",
          },
        ],
      },
      {
        name: "Moldova",
        description:
          "A charming landlocked country in Eastern Europe, famous for its wines and cozy vibes.",
        topics: [],
        rooms: [
          {
            name: "Chișinău",
            description:
              "The bustling capital city where history meets modern life and coffee breaks happen everywhere.",
          },
          {
            name: "Tiraspol",
            description:
              "A city with a unique vibe, blending Soviet nostalgia and local charm.",
          },
          {
            name: "Bălți",
            description:
              "The lively northern city full of friendly faces and hidden gems.",
          },
          {
            name: "Bender (Tighina)",
            description:
              "A riverside city where old fortress walls whisper stories from the past.",
          },
          {
            name: "Rîbnița",
            description:
              "An industrial town with a heart of steel and a spirit of adventure.",
          },
          {
            name: "Soroca",
            description:
              "Known for its medieval fortress and vibrant cultural scene.",
          },
          {
            name: "Cahul",
            description:
              "A southern city famous for warm weather and fun festivals.",
          },
          {
            name: "Ungheni",
            description:
              "A border town where the journey begins and new friendships spark.",
          },
          {
            name: "Orhei",
            description:
              "A historic spot where ancient ruins meet scenic beauty.",
          },
          {
            name: "Dubăsari",
            description:
              "A peaceful riverside town perfect for a chill game night.",
          },
        ],
      },
      {
        name: "Monaco",
        description:
          "A tiny but dazzling gem on the Mediterranean coast, famous for glam, games, and grand casinos.",
        topics: [],
        rooms: [
          {
            name: "Monte Carlo",
            description:
              "The playground of the rich and famous, where luck and luxury go hand in hand.",
          },
          {
            name: "La Condamine",
            description:
              "Bustling harbor vibes with markets and a lively waterfront scene.",
          },
          {
            name: "Fontvieille",
            description:
              "A modern district with parks, shopping, and a dash of seaside charm.",
          },
          {
            name: "Monaco-Ville",
            description:
              "The old town with narrow streets and royal tales waiting to be discovered.",
          },
        ],
      },
      {
        name: "Mongolia",
        description:
          "A land of endless steppes, nomads, and epic adventures under the big sky.",
        topics: [],
        rooms: [
          {
            name: "Ulaanbaatar",
            description:
              "The vibrant capital where tradition meets modern hustle.",
          },
          {
            name: "Erdenet",
            description: "A mining town with rugged charm and scenic views.",
          },
          {
            name: "Darkhan",
            description: "An industrial hub with a cool, laid-back vibe.",
          },
          {
            name: "Choibalsan",
            description:
              "Eastern gateway with rich history and friendly faces.",
          },
          {
            name: "Mörön",
            description: "Heart of the north, surrounded by stunning nature.",
          },
        ],
      },
      {
        name: "Montenegro",
        description:
          "A small country in Southeastern Europe, known for its Adriatic coast and rugged mountains.",
        topics: [],
        rooms: [
          {
            name: "Podgorica",
            description:
              "The bustling capital city where history meets modern life — ready for your next adventure!",
          },
          {
            name: "Nikšić",
            description:
              "A lively city famous for its breweries and vibrant nightlife — cheers to fun!",
          },
          {
            name: "Herceg Novi",
            description:
              "A charming coastal town with stunning views and a relaxed vibe — sea breeze included!",
          },
          {
            name: "Pljevlja",
            description:
              "Nestled among mountains, this city offers a cozy retreat with rich culture and nature.",
          },
          {
            name: "Bijelo Polje",
            description:
              "The gateway to northern Montenegro, full of friendly faces and hidden gems to explore.",
          },
          {
            name: "Bar",
            description:
              "A port city where the sea meets history — perfect for explorers and beach lovers alike!",
          },
          {
            name: "Budva",
            description:
              "Famous for its sandy beaches and buzzing summer scene — party or relax, your call!",
          },
          {
            name: "Tivat",
            description:
              "Home to luxury marinas and sunny days — come sail away and soak up the glamour.",
          },
          {
            name: "Cetinje",
            description:
              "The historic royal capital, where tradition and stories come alive in every corner.",
          },
        ],
      },
      {
        name: "Morocco",
        description:
          "A country in North Africa, known for its deserts, mountains, and ancient cities.",
        topics: [],
        rooms: [
          {
            name: "Rabat",
            description:
              "The capital city where history and modern vibes blend perfectly.",
          },
          {
            name: "Casablanca",
            description:
              "The bustling city with a movie-famous name and plenty of coastal charm.",
          },
          {
            name: "Marrakech",
            description:
              "A colorful city full of markets, spices, and vibrant energy.",
          },
          {
            name: "Fes",
            description:
              "Step into the maze-like old city where tradition meets timeless beauty.",
          },
          {
            name: "Tangier",
            description:
              "The gateway between Africa and Europe, full of mystery and seaside views.",
          },
          {
            name: "Agadir",
            description:
              "A sunny beach city perfect for relaxing and catching some waves.",
          },
          {
            name: "Meknes",
            description:
              "Discover the city of palaces and ancient gates waiting to be explored.",
          },
          {
            name: "Ouarzazate",
            description:
              "The desert’s movie studio city, where adventure stories come to life.",
          },
          {
            name: "Essaouira",
            description:
              "A charming coastal town known for its fresh seafood and ocean breeze.",
          },
          {
            name: "Nador",
            description:
              "A lively city on the Mediterranean coast with a unique blend of cultures.",
          },
          {
            name: "Kenitra",
            description:
              "A growing city with green spaces and a welcoming vibe.",
          },
          {
            name: "Safi",
            description:
              "The pottery capital with ocean views and creative spirit.",
          },
        ],
      },

      {
        name: "Mozambique",
        description:
          "A country in Southeast Africa, known for its Indian Ocean coastline and wildlife.",
        topics: [],
        rooms: [
          {
            name: "Maputo",
            description:
              "The vibrant capital city buzzing with culture and coastal charm.",
          },
          {
            name: "Beira",
            description: "A bustling port city with a laid-back beach vibe.",
          },
          {
            name: "Nampula",
            description:
              "The gateway to northern Mozambique, full of energy and tradition.",
          },
          {
            name: "Quelimane",
            description:
              "A riverside city where history flows as freely as the water.",
          },
          {
            name: "Tete",
            description:
              "Known for its mining and beautiful landscapes along the Zambezi River.",
          },
          {
            name: "Chimoio",
            description:
              "A green city surrounded by mountains and natural beauty.",
          },
          {
            name: "Xai-Xai",
            description:
              "A coastal getaway famous for its beaches and relaxed pace.",
          },
          {
            name: "Pemba",
            description:
              "A northern coastal city with stunning coral reefs and marine life.",
          },
          {
            name: "Lichinga",
            description:
              "A highland town known for cool weather and rich culture.",
          },
        ],
      },
      {
        name: "Myanmar",
        description:
          "A country in Southeast Asia, known for its Buddhist culture and colonial architecture.",
        topics: [],
        rooms: [
          {
            name: "Yangon",
            description:
              "The bustling former capital where colonial charm meets vibrant street life.",
          },
          {
            name: "Mandalay",
            description:
              "A cultural hub famous for ancient temples and royal heritage.",
          },
          {
            name: "Naypyidaw",
            description:
              "The quiet and spacious capital city with surprises around every corner.",
          },
          {
            name: "Bago",
            description:
              "A city rich in history and legendary pagodas — mystical vibes guaranteed!",
          },
          {
            name: "Mawlamyine",
            description:
              "Charming riverside city with colonial buildings and laid-back vibes.",
          },
          {
            name: "Taunggyi",
            description:
              "Gateway to the scenic Shan Hills — adventure awaits in every alley.",
          },
          {
            name: "Hpa-An",
            description:
              "A picturesque town surrounded by stunning limestone mountains.",
          },
        ],
      },
      {
        name: "Namibia",
        description:
          "A country in Southern Africa, known for its deserts and wildlife reserves.",
        topics: [],
        rooms: [
          {
            name: "Windhoek",
            description:
              "The vibrant capital city where adventure meets city life — a perfect mix of culture and modern vibes!",
          },
          {
            name: "Swakopmund",
            description:
              "Coastal charm and desert dunes collide in this beach town, ideal for thrill-seekers and sun lovers.",
          },
          {
            name: "Walvis Bay",
            description:
              "A bustling port city famous for its lagoon and flamingos — nature and industry side by side!",
          },
          {
            name: "Rundu",
            description:
              "Gateway to the Kavango region, where river life and local culture flow together beautifully.",
          },
          {
            name: "Oshakati",
            description:
              "A lively commercial hub in the north, full of markets, energy, and local flavor.",
          },
          {
            name: "Lüderitz",
            description:
              "A quirky coastal town with a touch of German heritage and spectacular sea views.",
          },
          {
            name: "Keetmanshoop",
            description:
              "Step into the heart of the south, surrounded by unique rock formations and quiet charm.",
          },
          {
            name: "Katima Mulilo",
            description:
              "Where Namibia meets Zambia and Botswana — a melting pot of cultures along the Zambezi.",
          },
          {
            name: "Omaruru",
            description:
              "A small town with a big personality, known for its vineyards and artistic vibe.",
          },
          {
            name: "Tsumeb",
            description:
              "Mining history meets natural wonders in this northern city surrounded by stunning landscapes.",
          },
        ],
      },
      {
        name: "Nauru",
        description:
          "The smallest country in the world, located in the Pacific Ocean, known for its phosphate mining.",
        topics: [],
        rooms: [
          {
            name: "Aiwo",
            description:
              "The energetic district where industry meets island life — phosphate mining hub with tropical vibes!",
          },
          {
            name: "Anabar",
            description:
              "A peaceful coastal area perfect for chill chats and seaside fun.",
          },
          {
            name: "Anetan",
            description:
              "Known for its warm community and lovely landscapes — a cozy spot to hang out!",
          },
          {
            name: "Anibare",
            description:
              "Home to stunning beaches and great views — dive into fun and relaxation here.",
          },
          {
            name: "Baiti",
            description:
              "A small but lively district full of island spirit and local stories.",
          },
          {
            name: "Boe",
            description:
              "Catch the sunset and good vibes in this charming part of the island.",
          },
          {
            name: "Buada",
            description:
              "The lush green heart of Nauru, perfect for nature lovers and quiet conversations.",
          },
          {
            name: "Denigomodu",
            description:
              "A central district buzzing with local life and island energy.",
          },
          {
            name: "Ewa",
            description:
              "A district known for its friendly locals and peaceful atmosphere.",
          },
          {
            name: "Ijuw",
            description:
              "Where tradition meets tranquility — a great place for calm and connection.",
          },
          {
            name: "Meneng",
            description:
              "Vibrant and lively, this district is perfect for energetic players and social butterflies.",
          },
          {
            name: "Nibok",
            description:
              "A hidden gem with beautiful landscapes and a close-knit community feel.",
          },
          {
            name: "Uaboe",
            description:
              "Small and welcoming, a cozy room for relaxed gameplay and friendly chats.",
          },
          {
            name: "Yaren",
            description:
              "Nauru's unofficial capital — the heart of island politics and daily buzz.",
          },
        ],
      },
      {
        name: "Nepal",
        description:
          "A country in the Himalayas, known for its mountains and being the home of Mount Everest.",
        topics: [],
        rooms: [
          {
            name: "Kathmandu",
            description:
              "The bustling capital city where tradition meets vibrant street life and ancient temples.",
          },
          {
            name: "Pokhara",
            description:
              "A scenic city by the lake, perfect for adventurers and nature lovers.",
          },
          {
            name: "Lalitpur (Patan)",
            description:
              "Famous for its rich culture, arts, and beautiful Newari architecture.",
          },
          {
            name: "Bhaktapur",
            description:
              "A medieval city frozen in time, full of historic palaces and artisan crafts.",
          },
          {
            name: "Biratnagar",
            description:
              "An industrial hub with a lively atmosphere and growing urban energy.",
          },
          {
            name: "Birgunj",
            description:
              "A gateway city to India, known for its trade and cultural diversity.",
          },
          {
            name: "Dharan",
            description:
              "A city surrounded by hills and forests, great for peaceful escapes.",
          },
          {
            name: "Janakpur",
            description:
              "Famous for its religious sites and colorful festivals.",
          },
          {
            name: "Hetauda",
            description:
              "A quiet city nestled near the hills, ideal for relaxing gameplay.",
          },
          {
            name: "Dhangadhi",
            description:
              "A growing city in the far west, known for its dynamic pace and culture.",
          },
        ],
      },
      {
        name: "Netherlands",
        description:
          "A country in Western Europe, known for its tulips, windmills, and canals.",
        topics: [],
        rooms: [
          {
            name: "Amsterdam",
            description:
              "The vibrant capital city famous for its canals, art museums, and lively nightlife.",
          },
          {
            name: "Rotterdam",
            description:
              "A modern port city known for innovative architecture and bustling harbors.",
          },
          {
            name: "The Hague",
            description:
              "The seat of government, home to international courts and elegant seaside views.",
          },
          {
            name: "Utrecht",
            description:
              "A charming city with ancient churches and cozy canals.",
          },
          {
            name: "Eindhoven",
            description:
              "A tech and design hub with a youthful and creative vibe.",
          },
          {
            name: "Groningen",
            description:
              "A lively university city with a mix of history and modern culture.",
          },
          {
            name: "Maastricht",
            description:
              "A city with a rich history, known for its medieval architecture and tasty cuisine.",
          },
          {
            name: "Leiden",
            description:
              "A historic city with beautiful botanical gardens and a prestigious university.",
          },
          {
            name: "Nijmegen",
            description:
              "One of the oldest cities, known for its green spaces and vibrant festivals.",
          },
          {
            name: "Delft",
            description: "Famous for its blue pottery and picturesque canals.",
          },
        ],
      },
      {
        name: "New Zealand",
        description:
          "An island nation in the Pacific Ocean, known for its nature, indigenous culture, and movie industry.",
        topics: [],
        rooms: [
          {
            name: "Auckland",
            description:
              "The largest city, famous for its vibrant waterfront and diverse culture.",
          },
          {
            name: "Wellington",
            description:
              "The capital city known for its arts scene and picturesque harbor.",
          },
          {
            name: "Christchurch",
            description:
              "A city rebuilding with creativity, surrounded by beautiful gardens and parks.",
          },
          {
            name: "Hamilton",
            description: "Known for its lush farmland and growing urban charm.",
          },
          {
            name: "Tauranga",
            description:
              "A coastal city popular for beaches and outdoor adventures.",
          },
          {
            name: "Dunedin",
            description:
              "A city with Scottish heritage and rich wildlife nearby.",
          },
          {
            name: "Napier",
            description:
              "Famous for its Art Deco architecture and sunny climate.",
          },
          {
            name: "Rotorua",
            description: "Known for geothermal wonders and Maori culture.",
          },
          {
            name: "New Plymouth",
            description:
              "A coastal city with stunning mountain views and surfing spots.",
          },
          {
            name: "Invercargill",
            description:
              "One of the southernmost cities, close to rugged natural beauty.",
          },
        ],
      },
      {
        name: "Nicaragua",
        description:
          "A country in Central America, known for its volcanic landscapes and colonial architecture.",
        topics: [],
        rooms: [
          {
            name: "Managua",
            description:
              "The bustling capital city with lakeside views and vibrant markets.",
          },
          {
            name: "Granada",
            description:
              "A charming colonial city known for its colorful buildings and history.",
          },
          {
            name: "León",
            description:
              "Famous for its cathedrals, art, and revolutionary spirit.",
          },
          {
            name: "Masaya",
            description:
              "Known as the city of flowers and crafts, near active volcanoes.",
          },
          {
            name: "Estelí",
            description:
              "A mountainous city celebrated for its tobacco farms and cigars.",
          },
          {
            name: "Bluefields",
            description:
              "A coastal city rich in Afro-Caribbean culture and beautiful beaches.",
          },
          {
            name: "Jinotega",
            description:
              "Nestled in the mountains, famous for coffee and lush landscapes.",
          },
        ],
      },
      {
        name: "Niger",
        description:
          "A landlocked country in West Africa, known for its desert landscapes and rich history.",
        topics: [],
        rooms: [
          {
            name: "Niamey",
            description:
              "The lively capital city on the Niger River, full of culture and markets.",
          },
          {
            name: "Agadez",
            description:
              "Gateway to the Sahara, famous for its historic mud-brick architecture.",
          },
          {
            name: "Zinder",
            description:
              "A historic city with vibrant bazaars and rich traditions.",
          },
          {
            name: "Maradi",
            description:
              "An important trade hub surrounded by Sahelian landscapes.",
          },
          {
            name: "Tahoua",
            description:
              "A city known for its colorful festivals and nearby desert adventures.",
          },
          {
            name: "Dosso",
            description:
              "A peaceful town famous for its royal heritage and farming culture.",
          },
          {
            name: "Tillabéri",
            description:
              "A town near the borders, rich with nature and local traditions.",
          },
        ],
      },
      {
        name: "Nigeria",
        description:
          "A country in West Africa, known for its large population, oil reserves, and vibrant culture.",
        topics: [],
        rooms: [
          {
            name: "Abia Braves",
            description: "Join the game in God's Own State.",
          },
          {
            name: "Adamawa Kickers",
            description: "Test your skills in the Land of Beauty.",
          },
          {
            name: "Akwa Ibom Stars",
            description: "Play in the Land of Promise.",
          },
          {
            name: "Anambra Kings",
            description: "Compete in the Light of the Nation.",
          },
          {
            name: "Bauchi Strikers",
            description: "Battle in the Pearl of Tourism.",
          },
          {
            name: "Bayelsa United",
            description: "Challenge yourself in the Glory of All Lands.",
          },
          {
            name: "Benue Warriors",
            description: "Compete in the Food Basket of the Nation.",
          },
          {
            name: "Borno Knights",
            description: "Join the fun in the Home of Peace.",
          },
          {
            name: "Cross River Legends",
            description: "Explore the Land of Tourism.",
          },
          {
            name: "Delta Diamonds",
            description: "Shine in the Big Heart of the Nation.",
          },
          {
            name: "Ebonyi Titans",
            description: "Compete in the Salt of the Nation.",
          },
          {
            name: "Edo Royals",
            description: "Play in the Heartbeat of the Nation.",
          },
          {
            name: "Ekiti Champs",
            description: "Join the game in the Land of Honor.",
          },
          {
            name: "Enugu Flames",
            description: "Challenge yourself in the Coal City State.",
          },
          {
            name: "Gombe Falcons",
            description: "Play in the Jewel in the Savannah.",
          },
          {
            name: "Imo Stallions",
            description: "Join the fun in the Eastern Heartland.",
          },
          { name: "Jigawa Jets", description: "Fly high in the New World." },
          {
            name: "Kaduna Warriors",
            description: "Play in the Centre of Learning.",
          },
          {
            name: "Kano Rovers",
            description: "Explore the Centre of Commerce.",
          },
          {
            name: "Katsina Stars",
            description: "Shine bright in the Home of Hospitality.",
          },
          {
            name: "Kebbi Tigers",
            description: "Battle in the Land of Equity.",
          },
          {
            name: "Kogi Strikers",
            description: "Compete in the Confluence State.",
          },
          {
            name: "Kwara Falcons",
            description: "Soar high in the State of Harmony.",
          },
          {
            name: "Lagos Legends",
            description: "Play in the Centre of Excellence.",
          },
          {
            name: "Nasarawa Lions",
            description: "Join the game in the Home of Solid Minerals.",
          },
          {
            name: "Niger Gladiators",
            description: "Compete in the Power State.",
          },
          { name: "Ogun Giants", description: "Battle in the Gateway State." },
          {
            name: "Ondo Trailblazers",
            description: "Explore the Sunshine State.",
          },
          { name: "Osun Wizards", description: "Play in the Land of Virtue." },
          {
            name: "Oyo Masters",
            description: "Compete in the Pace Setter State.",
          },
          {
            name: "Plateau Heroes",
            description: "Explore the Home of Peace and Tourism.",
          },
          {
            name: "Rivers Sharks",
            description: "Join the game in the Treasure Base of the Nation.",
          },
          {
            name: "Sokoto Wolves",
            description: "Play in the Seat of the Caliphate.",
          },
          {
            name: "Taraba Legends",
            description: "Compete in the Nature's Gift to the Nation.",
          },
          {
            name: "Yobe Eagles",
            description: "Soar high in the Pride of the Sahel.",
          },
          {
            name: "Zamfara Hawks",
            description:
              "Challenge yourself in the Home of Agricultural Products.",
          },
          {
            name: "FCT Titans",
            description: "Join the game in the Centre of Unity.",
          },
        ],
      },
      {
        name: "North Macedonia",
        description:
          "A country in Southeast Europe, known for its lakes and ancient history.",
        topics: [],
        rooms: [
          {
            name: "Skopje",
            description:
              "Explore the vibrant capital full of statues, bridges, and lively markets!",
          },
          {
            name: "Bitola",
            description:
              "Step into the city of consuls, rich in culture and charming architecture.",
          },
          {
            name: "Ohrid",
            description:
              "Dive into lakeside fun and ancient churches in this historic treasure.",
          },
          {
            name: "Kumanovo",
            description:
              "Join the bustling city known for its friendly vibe and tasty food.",
          },
          {
            name: "Tetovo",
            description:
              "Discover colorful mosques and mountain views in this lively town.",
          },
          {
            name: "Prilep",
            description:
              "Visit the city famous for its tobacco fields and medieval fortress.",
          },
          {
            name: "Veles",
            description:
              "Roam around the industrial heart with a rich history and river views.",
          },
          {
            name: "Štip",
            description:
              "Experience the blend of old and new in this vibrant university city.",
          },
          {
            name: "Strumica",
            description:
              "Celebrate festivals and sunny days in this cheerful southeastern city.",
          },
          {
            name: "Gostivar",
            description:
              "Explore multicultural streets surrounded by stunning mountain scenery.",
          },
        ],
      },
      {
        name: "North Korea",
        description:
          "A country in East Asia, known for its authoritarian regime and history of conflict.",
        topics: [],
        rooms: [
          {
            name: "Pyongyang",
            description:
              "The capital of challenges—strategize your way to the top!",
          },
          {
            name: "Hamhung",
            description:
              "Where puzzles spark like industry—keep the momentum going!",
          },
          {
            name: "Chongjin",
            description:
              "Bright minds in the city of steel—are you tough enough?",
          },
          {
            name: "Nampo",
            description:
              "The port of possibilities—navigate the currents of trivia!",
          },
          {
            name: "Wonsan",
            description: "Sunny coastlines and cool games—dive into the fun!",
          },
          {
            name: "Sinuiju",
            description:
              "Right on the border of brilliance—think fast, win faster!",
          },
          {
            name: "Kaesong",
            description:
              "History meets hustle—unlock ancient secrets in modern games!",
          },
          {
            name: "Rason",
            description: "Free trade of ideas—deal your best answers and win!",
          },
          {
            name: "Haeju",
            description:
              "Quiet but clever—every move counts in this coastal game zone!",
          },
          {
            name: "Kimchaek",
            description:
              "Industrial strength trivia—power through with brain fuel!",
          },
          {
            name: "Anju",
            description:
              "Coal city with a hot streak of quiz fires—ignite your game!",
          },
          {
            name: "Kanggye",
            description:
              "Highland mind games—climb every level like a mountain!",
          },
          {
            name: "Sariwon",
            description:
              "A city of culture and clever twists—decode your way through!",
          },
        ],
      },
      {
        name: "Norway",
        description:
          "A Nordic country known for its fjords, mountains, and high quality of life.",
        topics: [],
        rooms: [
          {
            name: "Oslo",
            description:
              "The vibrant capital with a mix of modern life and rich history.",
          },
          {
            name: "Bergen",
            description:
              "Gateway to the fjords, famous for colorful wooden houses and fish markets.",
          },
          {
            name: "Trondheim",
            description:
              "A charming city with a great university and beautiful cathedral.",
          },
          {
            name: "Stavanger",
            description:
              "Oil capital by the sea with stunning nearby cliffs and hiking spots.",
          },
          {
            name: "Tromsø",
            description:
              "Northern lights haven and Arctic adventure playground.",
          },
          {
            name: "Kristiansand",
            description:
              "Sunny beaches and lively festivals make this southern city a hit.",
          },
          {
            name: "Drammen",
            description:
              "A riverside city blending nature and urban life perfectly.",
          },
          {
            name: "Fredrikstad",
            description:
              "Historic fortress city with charming old town streets to explore.",
          },
          {
            name: "Ålesund",
            description:
              "Art Nouveau beauty on the west coast, surrounded by fjords.",
          },
          {
            name: "Bodø",
            description:
              "Gateway to the dramatic Lofoten Islands and coastal wonders.",
          },
        ],
      },
      {
        name: "Oman",
        description:
          "A country on the Arabian Peninsula, known for its desert landscapes and historic architecture.",
        topics: [],
        rooms: [
          {
            name: "Muscat",
            description:
              "The stunning capital city blending modern charm with ancient forts.",
          },
          {
            name: "Salalah",
            description:
              "A lush city famous for its monsoon season and beautiful beaches.",
          },
          {
            name: "Nizwa",
            description:
              "Historic city known for its ancient fortress and vibrant souks.",
          },
          {
            name: "Sohar",
            description:
              "An industrial hub with deep historical roots and coastal vibes.",
          },
          {
            name: "Sur",
            description:
              "Famous for traditional dhow boat building and seaside charm.",
          },
          {
            name: "Rustaq",
            description:
              "City with hot springs and towering castles, perfect for adventurers.",
          },
          {
            name: "Ibri",
            description:
              "Gateway to the desert, with archaeological sites and rugged landscapes.",
          },
        ],
      },
      {
        name: "Pakistan",
        description:
          "A country in South Asia, known for its diverse landscapes, culture, and rich history.",
        topics: [],
        rooms: [
          {
            name: "Islamabad",
            description:
              "The modern capital city, famous for its greenery and peaceful vibe.",
          },
          {
            name: "Karachi",
            description:
              "The bustling metropolis and economic hub with vibrant nightlife and beaches.",
          },
          {
            name: "Lahore",
            description:
              "The cultural heart of Pakistan, known for its historic sites and delicious food.",
          },
          {
            name: "Faisalabad",
            description:
              "An industrial city famous for its textile industry and hardworking spirit.",
          },
          {
            name: "Rawalpindi",
            description:
              "A lively city with military heritage and close ties to Islamabad.",
          },
          {
            name: "Multan",
            description:
              "The city of saints, known for its shrines and rich history.",
          },
          {
            name: "Peshawar",
            description:
              "A historic city with traditional bazaars and a gateway to the Khyber Pass.",
          },
          {
            name: "Quetta",
            description:
              "A mountainous city with stunning landscapes and a blend of cultures.",
          },
          {
            name: "Sialkot",
            description:
              "Famous worldwide for producing high-quality sports goods and crafts.",
          },
          {
            name: "Gujranwala",
            description:
              "Known for its food lovers and vibrant industrial economy.",
          },
          {
            name: "Hyderabad",
            description:
              "A historic city famous for its unique blend of cultures and tasty Sindhi cuisine.",
          },
          {
            name: "Sukkur",
            description:
              "A riverfront city with a rich trading past and a lively local scene.",
          },
          {
            name: "Bahawalpur",
            description: "Known for its royal palaces and desert adventures.",
          },
          {
            name: "Sheikhupura",
            description:
              "A city with rich agricultural lands and historic landmarks.",
          },
          {
            name: "Sargodha",
            description:
              "Known for its citrus orchards and warm community spirit.",
          },
        ],
      },
      {
        name: "Palau",
        description:
          "An island country in the Pacific Ocean, famous for its biodiversity and diving spots.",
        topics: [],
        rooms: [
          {
            name: "Ngerulmud",
            description:
              "The quiet capital city with modern government buildings and tropical vibes.",
          },
          {
            name: "Koror",
            description:
              "The bustling urban center known for lively markets and access to stunning dive sites.",
          },
          {
            name: "Melekeok",
            description:
              "A scenic town near the capital, offering beautiful beaches and peaceful surroundings.",
          },
          {
            name: "Airai",
            description:
              "A vibrant community known for its local culture and gateway to the island’s beauty.",
          },
          {
            name: "Babeldaob",
            description:
              "The largest island, full of lush forests, waterfalls, and ancient ruins to explore.",
          },
        ],
      },
      {
        name: "Panama",
        description:
          "A country in Central America, famous for the Panama Canal and its beaches.",
        topics: [],
        rooms: [
          {
            name: "Panama City",
            description:
              "The bustling capital where the modern meets the historic, perfect for high-energy challenges.",
          },
          {
            name: "Colón",
            description:
              "A vibrant port city with a splash of Caribbean flair, great for adventurous game rounds.",
          },
          {
            name: "David",
            description:
              "A lively city near the mountains, ideal for strategic and nature-themed contests.",
          },
          {
            name: "La Chorrera",
            description:
              "A growing city known for its friendly vibe, perfect for casual and social games.",
          },
          {
            name: "Penonomé",
            description:
              "The heart of Coclé province, where tradition meets fun in every game session.",
          },
          {
            name: "Santiago",
            description:
              "A city full of energy and culture, perfect for fast-paced and creative challenges.",
          },
          {
            name: "Chitré",
            description:
              "A sunny city by the sea, great for relaxed and friendly competition.",
          },
          {
            name: "Aguadulce",
            description:
              "Known for its sweet vibes, this room is all about light-hearted and fun games.",
          },
          {
            name: "Las Tablas",
            description:
              "Famous for its festivals, this room is perfect for vibrant and festive game rounds.",
          },
          {
            name: "Puerto Armuelles",
            description:
              "A coastal city with a laid-back feel, ideal for chill and strategic gameplay.",
          },
        ],
      },
      {
        name: "Papua New Guinea",
        description:
          "A country in Oceania, known for its biodiversity and indigenous cultures.",
        topics: [],
        rooms: [
          {
            name: "Port Moresby",
            description:
              "The lively capital city where tradition meets modern life — perfect for dynamic game rounds.",
          },
          {
            name: "Lae",
            description:
              "A bustling port city known for its vibrant community and energy, great for fast-paced challenges.",
          },
          {
            name: "Mount Hagen",
            description:
              "Nestled in the highlands, this city offers cool vibes and strategic gameplay opportunities.",
          },
          {
            name: "Madang",
            description:
              "A coastal town known for its beautiful scenery, perfect for laid-back and scenic game sessions.",
          },
          {
            name: "Wewak",
            description:
              "A friendly seaside city, ideal for fun and relaxed multiplayer games.",
          },
          {
            name: "Kokopo",
            description:
              "A growing city with a warm tropical feel, great for vibrant and engaging game rooms.",
          },
        ],
      },
      {
        name: "Paraguay",
        description:
          "A landlocked country in South America, known for its rivers and unique culture.",
        topics: [],
        rooms: [
          {
            name: "Asunción",
            description:
              "The bustling capital city by the Paraguay River, full of history and vibrant street life.",
          },
          {
            name: "Ciudad del Este",
            description:
              "A lively commercial hub near the border, perfect for bargain hunters and adventure seekers.",
          },
          {
            name: "Encarnación",
            description:
              "Famous for its carnival and beautiful riverfront beaches, a festive place to chill and play.",
          },
          {
            name: "Concepción",
            description:
              "A riverside city with a relaxed vibe and rich cultural traditions.",
          },
          {
            name: "Pedro Juan Caballero",
            description:
              "A border town known for its markets and multicultural atmosphere.",
          },
          {
            name: "Luque",
            description:
              "Home to the national airport and famous for its artisan crafts and music.",
          },
          {
            name: "San Lorenzo",
            description:
              "A growing city known for its universities and youthful energy.",
          },
          {
            name: "Fernando de la Mora",
            description:
              "A suburban city with plenty of parks and local charm.",
          },
          {
            name: "Caaguazú",
            description:
              "The heart of Paraguay’s agricultural region, with a friendly small-town feel.",
          },
          {
            name: "Pilar",
            description:
              "A quiet city on the banks of the Paraguay River, perfect for nature lovers and explorers.",
          },
        ],
      },
      {
        name: "Peru",
        description:
          "A country in South America, known for its ancient Incan history and the Andes mountains.",
        topics: [],
        rooms: [
          {
            name: "Lima",
            description:
              "The vibrant capital by the Pacific, famous for its food scene and colonial architecture.",
          },
          {
            name: "Cusco",
            description:
              "The historic gateway to Machu Picchu, rich in Incan culture and cobblestone streets.",
          },
          {
            name: "Arequipa",
            description:
              "Known as the ‘White City’ for its beautiful volcanic stone buildings and scenic volcano views.",
          },
          {
            name: "Trujillo",
            description:
              "A coastal city with a lively atmosphere and nearby ancient ruins to explore.",
          },
          {
            name: "Chiclayo",
            description:
              "Famous for its archaeological treasures and bustling markets.",
          },
          {
            name: "Iquitos",
            description:
              "The gateway to the Amazon rainforest, surrounded by lush jungle and river adventures.",
          },
          {
            name: "Puno",
            description:
              "On the shores of Lake Titicaca, known for its traditional festivals and floating islands.",
          },
          {
            name: "Huancayo",
            description:
              "A city in the Andes with vibrant markets and mountain scenery.",
          },
          {
            name: "Tacna",
            description:
              "A sunny city near the Chilean border, known for its local cuisine and history.",
          },
        ],
      },
      {
        name: "Philippines",
        description:
          "An island nation in Southeast Asia, known for its beaches, wildlife, and history.",
        topics: [],
        rooms: [
          {
            name: "Manila",
            description:
              "Buzzing with history and chaos—perfect for high-energy trivia showdowns!",
          },
          {
            name: "Quezon City",
            description:
              "A dynamic zone for creative thinkers and quiz hustlers alike!",
          },
          {
            name: "Cebu City",
            description:
              "Island vibes meet brain vibes—come test your wits by the sea!",
          },
          {
            name: "Davao City",
            description:
              "Chill and competitive—where nature meets knowledge battles!",
          },
          {
            name: "Caloocan",
            description:
              "Quick on your feet? Prove it in this fast-paced city arena!",
          },
          {
            name: "Zamboanga City",
            description:
              "Where colorful culture meets colorful questions—are you game?",
          },
          {
            name: "Taguig",
            description:
              "Sleek and sharp—just like your answers should be here!",
          },
          {
            name: "Pasig",
            description:
              "Ready to flow through a river of riddles and fun facts?",
          },
          {
            name: "Cagayan de Oro",
            description:
              "The City of Golden Friendship—and friendly competition!",
          },
          {
            name: "Iloilo City",
            description: "A cozy spot for curious minds and clever answers!",
          },
          {
            name: "Bacolod",
            description: "Sweet city, spicy questions—bring your A-game!",
          },
          {
            name: "Baguio",
            description:
              "Cool air, hot trivia—battle it out on this mountain stage!",
          },
          {
            name: "Makati",
            description:
              "High-rise hustle meets head-scratching quizzes—let's go!",
          },
          {
            name: "General Santos",
            description: "Pack a punch in this knockout knowledge room!",
          },
          {
            name: "Antipolo",
            description: "A scenic zone for smooth thinkers and quick answers!",
          },
        ],
      },
      {
        name: "Poland",
        description:
          "A country in Central Europe, known for its history, culture, and scenic landscapes.",
        topics: [],
        rooms: [
          {
            name: "Warsaw",
            description:
              "Poland’s capital and trivia capital—only the sharpest minds survive here!",
          },
          {
            name: "Kraków",
            description:
              "Medieval charm, modern challenge—get ready for historic quizzes!",
          },
          {
            name: "Gdańsk",
            description:
              "Sail into this seaside city of cunning clues and smart answers!",
          },
          {
            name: "Wrocław",
            description:
              "The city of gnomes and brainy games—join the clever crowd!",
          },
          {
            name: "Poznań",
            description:
              "Where tradition meets trivia—expect fun with a competitive twist!",
          },
          {
            name: "Łódź",
            description:
              "Lights, camera, questions! The city of film now stars your knowledge.",
          },
          {
            name: "Szczecin",
            description:
              "Navigate your way through puzzles like a trivia sailor!",
          },
          {
            name: "Lublin",
            description:
              "A scholarly city for scholarly showdowns—let's get quizzy!",
          },
          {
            name: "Katowice",
            description:
              "Steel your mind for tough questions and harder victories!",
          },
          {
            name: "Białystok",
            description:
              "Green surroundings, fresh questions—breathe in the brainpower!",
          },
          {
            name: "Rzeszów",
            description:
              "A rising star in the trivia world—can you outshine the rest?",
          },
          {
            name: "Toruń",
            description:
              "The birthplace of Copernicus—and maybe your next big win!",
          },
        ],
      },
      {
        name: "Portugal",
        description:
          "A country in Southern Europe, known for its beaches, wines, and historical landmarks.",
        topics: [],
        rooms: [
          {
            name: "Lisbon",
            description:
              "The capital of curves, hills, and clever answers—can you rule the rooftops?",
          },
          {
            name: "Porto",
            description: "Wine and wit meet here—uncork your trivia skills!",
          },
          {
            name: "Coimbra",
            description:
              "An academic battleground where the smartest shine—get ready to study up!",
          },
          {
            name: "Braga",
            description: "A holy city of heavenly wins—bless your guesses!",
          },
          {
            name: "Faro",
            description:
              "Sunny beaches, chill vibes, and hot questions—surf through the fun!",
          },
          {
            name: "Évora",
            description:
              "Ancient streets and modern mind games—bring your A-game to this Roman gem!",
          },
          {
            name: "Aveiro",
            description:
              "The Venice of Portugal—but here you row through riddles!",
          },
          {
            name: "Guimarães",
            description:
              "The birthplace of Portugal—can you become the trivia monarch?",
          },
          {
            name: "Viseu",
            description:
              "Quiet charm, loud wins—claim your crown in this cultured city!",
          },
          {
            name: "Madeira",
            description:
              "Island paradise meets puzzle paradise—enjoy the breeze and breeze through questions!",
          },
          {
            name: "Ponta Delgada",
            description:
              "From the Azores to amazing scores—get tropical with your trivia!",
          },
        ],
      },
      {
        name: "Qatar",
        description:
          "A wealthy country in the Middle East, known for its oil reserves and modern architecture.",
        topics: [],
        rooms: [
          {
            name: "Doha",
            description:
              "Where skyscrapers meet souks — the heart of Qatar’s game vibes!",
          },
          {
            name: "Al Rayyan",
            description:
              "Big on sports, brains, and bold moves — bring your A-game!",
          },
          {
            name: "Al Wakrah",
            description:
              "By the beach and full of bounce — surf through the competition!",
          },
          {
            name: "Al Khor",
            description:
              "Chill coastal town with a competitive streak — let’s fish out the champs!",
          },
          {
            name: "Umm Salal",
            description:
              "Old forts, new plays — history and hustle go hand-in-hand here!",
          },
          {
            name: "Mesaieed",
            description:
              "Industrial flair with fiery fun — power up and play on!",
          },
          {
            name: "Dukhan",
            description:
              "Oil town energy fueling every round — let the games drill deep!",
          },
          {
            name: "Al-Shahaniya",
            description: "Camels? Yes. Racing? Absolutely. Games? You bet!",
          },
          {
            name: "Lusail",
            description:
              "Futuristic playground where every move could be legendary!",
          },
        ],
      },
      {
        name: "Romania",
        description:
          "A country in Eastern Europe, known for its castles, mountains, and rich history.",
        topics: [],
        rooms: [
          {
            name: "Bucharest",
            description:
              "The buzzing capital — where strategy meets speed in every round!",
          },
          {
            name: "Cluj-Napoca",
            description:
              "Student central and tech haven — let your brainpower shine!",
          },
          {
            name: "Timișoara",
            description:
              "The city of lights and bold plays — get ready to electrify the board!",
          },
          {
            name: "Iași",
            description:
              "Historic vibes, smart minds — outwit and outplay in the east!",
          },
          {
            name: "Constanța",
            description:
              "On the Black Sea coast — bring the heat like summer at the beach!",
          },
          {
            name: "Brașov",
            description:
              "Castles and coolness collide — a mystical arena of clever moves!",
          },
          {
            name: "Sibiu",
            description:
              "Cultural charm meets sharp challenges — the perfect place to show off!",
          },
          {
            name: "Galați",
            description: "Riverside rivalry at its finest — sail to victory!",
          },
          {
            name: "Craiova",
            description: "Energy, motion, and a splash of madness — game on!",
          },
          {
            name: "Oradea",
            description:
              "Elegant and strategic — only the smoothest players thrive here!",
          },
        ],
      },
      {
        name: "Russia",
        description:
          "A colossal nation rich in culture and history, home to everything from snowy tundras to bustling urban centers.",
        topics: [],
        rooms: [
          {
            name: "Moscow",
            description:
              "The bustling capital city, full of history, grand architecture, and vibrant culture.",
          },
          {
            name: "Saint Petersburg",
            description:
              "Known as the 'Venice of the North' with its beautiful canals and rich arts scene.",
          },
          {
            name: "Novosibirsk",
            description:
              "The Siberian hub, where the cold meets dynamic urban life.",
          },
          {
            name: "Yekaterinburg",
            description:
              "A gateway between Europe and Asia with a strong industrial heart.",
          },
          {
            name: "Nizhny Novgorod",
            description:
              "Historic city on the Volga River, blending tradition with innovation.",
          },
          {
            name: "Samara",
            description:
              "A vibrant riverside city known for its aerospace industry and beautiful embankments.",
          },
          {
            name: "Omsk",
            description:
              "Siberian city with a rich cultural tapestry and vast natural surroundings.",
          },
          {
            name: "Kazan",
            description:
              "A melting pot of cultures and religions, famous for its unique Tatar heritage.",
          },
          {
            name: "Rostov-on-Don",
            description:
              "Gateway to the Caucasus with a warm climate and lively markets.",
          },
          {
            name: "Chelyabinsk",
            description:
              "Known for its industrial might and rugged Ural Mountains backdrop.",
          },
          {
            name: "Ufa",
            description:
              "A city where Russian and Bashkir cultures blend beautifully.",
          },
          {
            name: "Volgograd",
            description:
              "Famous for its heroic history and the mighty Volga River.",
          },
          {
            name: "Perm",
            description:
              "Cultural hotspot located near the Ural Mountains, rich in art and history.",
          },
          {
            name: "Krasnoyarsk",
            description:
              "A Siberian city surrounded by stunning nature and powerful rivers.",
          },
          {
            name: "Saratov",
            description:
              "Volga city known for its universities and cultural diversity.",
          },
          {
            name: "Voronezh",
            description:
              "A city full of green parks and important historical landmarks.",
          },
          {
            name: "Tolyatti",
            description:
              "Known for its automotive industry and vibrant community life.",
          },
          {
            name: "Krasnodar",
            description:
              "A southern city with sunny weather and bustling markets.",
          },
          {
            name: "Ulyanovsk",
            description:
              "The birthplace of Lenin, rich with Soviet-era history.",
          },
          {
            name: "Izhevsk",
            description:
              "Famous for its manufacturing heritage and cultural events.",
          },
          {
            name: "Yaroslavl",
            description:
              "Historic city on the Volga, part of the Golden Ring of Russia.",
          },
          {
            name: "Barnaul",
            description:
              "A gateway to the Altai Mountains with a friendly vibe.",
          },
          {
            name: "Vladivostok",
            description:
              "Russia's Pacific port city, full of naval history and sea breeze.",
          },
          {
            name: "Irkutsk",
            description:
              "Close to Lake Baikal, blending Siberian charm and natural beauty.",
          },
          {
            name: "Khabarovsk",
            description:
              "Far East city with scenic rivers and a growing cultural scene.",
          },
          {
            name: "Makhachkala",
            description:
              "Capital of Dagestan, with a mix of mountain views and Caspian Sea vibes.",
          },
          {
            name: "Tomsk",
            description:
              "A university town with old wooden architecture and youthful energy.",
          },
          {
            name: "Orenburg",
            description: "Known for its famous shawls and steppe landscapes.",
          },
          {
            name: "Novokuznetsk",
            description: "Industrial city nestled in the Kuznetsk Basin.",
          },
          {
            name: "Kemerovo",
            description:
              "Heart of coal mining in Siberia, with a growing cultural scene.",
          },
        ],
      },

      {
        name: "Rwanda",
        description:
          "A country in East Africa, known for its wildlife, including mountain gorillas, and its recovery from the 1994 genocide.",
        topics: [],
        rooms: [
          {
            name: "Kigali",
            description:
              "The vibrant capital city buzzing with culture, markets, and mountain views.",
          },
          {
            name: "Butare",
            description:
              "A historic town known for its universities and calm, scholarly vibes.",
          },
          {
            name: "Gisenyi",
            description:
              "A lakeside city perfect for beach lovers and sunset chasers.",
          },
          {
            name: "Ruhengeri",
            description:
              "Gateway to gorilla trekking adventures and stunning volcano landscapes.",
          },
          {
            name: "Cyangugu",
            description:
              "A peaceful city nestled by Lake Kivu’s sparkling waters.",
          },
          {
            name: "Byumba",
            description:
              "A highland town with rolling hills and warm local hospitality.",
          },
          {
            name: "Kibuye",
            description:
              "Known for its beautiful lake views and tranquil natural beauty.",
          },
          {
            name: "Rwamagana",
            description:
              "A bustling market town with a friendly community and lively streets.",
          },
        ],
      },

      {
        name: "Saint Kitts and Nevis",
        description:
          "A two-island nation in the Caribbean, known for its volcanic landscapes and beaches.",
        topics: [],
        rooms: [
          {
            name: "Basseterre",
            description:
              "The lively capital of Saint Kitts, full of colorful markets and rich history.",
          },
          {
            name: "Charlestown",
            description:
              "The charming capital of Nevis, where history and island life blend perfectly.",
          },
          {
            name: "Cayon",
            description:
              "A small town with a big heart and beautiful surrounding hills.",
          },
          {
            name: "Dieppe Bay Town",
            description:
              "A peaceful fishing village known for its scenic coastline.",
          },
          {
            name: "Sandy Point Town",
            description:
              "Historic town with stunning beaches and friendly locals.",
          },
        ],
      },
      {
        name: "Saint Lucia",
        description:
          "An island nation in the Caribbean, known for its volcanic peaks and luxury resorts.",
        topics: [],
        rooms: [
          {
            name: "Castries",
            description:
              "The bustling capital city where vibrant markets and beautiful harbors meet.",
          },
          {
            name: "Soufrière",
            description:
              "Home to the famous Pitons and lush rainforests—adventure awaits here!",
          },
          {
            name: "Gros Islet",
            description:
              "Famous for its lively Friday night street parties and beautiful beaches.",
          },
          {
            name: "Vieux Fort",
            description:
              "A gateway to the southern beaches and the historic old fort ruins.",
          },
          {
            name: "Anse La Raye",
            description:
              "Charming fishing village known for its Friday fish fry and laid-back vibes.",
          },
        ],
      },
      {
        name: "Saint Vincent and the Grenadines",
        description:
          "An island nation in the Caribbean, known for its sailing and beaches.",
        topics: [],
        rooms: [
          {
            name: "Kingstown",
            description:
              "The vibrant capital city with colorful markets and lively harbor life.",
          },
          {
            name: "Barrouallie",
            description:
              "A peaceful fishing town known for its stunning coastlines and local charm.",
          },
          {
            name: "Georgetown",
            description:
              "A laid-back town famous for its lush surroundings and traditional vibes.",
          },
          {
            name: "Calliaqua",
            description:
              "A busy commercial town with friendly locals and great Caribbean culture.",
          },
        ],
      },
      {
        name: "Samoa",
        description:
          "An island nation in the Pacific Ocean, known for its Polynesian culture and beautiful beaches.",
        topics: [],
        rooms: [
          {
            name: "Apia",
            description:
              "The lively capital city where tradition meets tropical charm.",
          },
          {
            name: "Vaitele",
            description:
              "A growing town with local markets and vibrant community life.",
          },
          {
            name: "Faleula",
            description:
              "A coastal village known for its stunning views and peaceful beaches.",
          },
          {
            name: "Siusega",
            description:
              "A small village where island culture and warm smiles abound.",
          },
        ],
      },
      {
        name: "San Marino",
        description:
          "One of the world's oldest republics, located in Italy, known for its medieval architecture.",
        topics: [],
        rooms: [
          {
            name: "San Marino City",
            description:
              "The historic capital perched atop Mount Titano, full of castles and charm.",
          },
          {
            name: "Serravalle",
            description:
              "The largest town, buzzing with shops, cafes, and local life.",
          },
          {
            name: "Borgo Maggiore",
            description: "A lively market town where tradition and trade meet.",
          },
          {
            name: "Domagnano",
            description:
              "A quaint village surrounded by rolling hills and stunning views.",
          },
          {
            name: "Faetano",
            description:
              "A peaceful village known for its warm community spirit.",
          },
          {
            name: "Chiesanuova",
            description:
              "A small town with beautiful churches and friendly faces.",
          },
          {
            name: "Montegiardino",
            description:
              "The smallest municipality, perfect for a quiet escape.",
          },
        ],
      },
      {
        name: "Sao Tome and Principe",
        description:
          "An island nation in the Gulf of Guinea, known for its cocoa production and tropical climate.",
        topics: [],
        rooms: [
          {
            name: "São Tomé",
            description:
              "The vibrant capital city surrounded by lush rainforests and beautiful beaches.",
          },
          {
            name: "Neves",
            description:
              "A charming coastal town known for its fishing and friendly locals.",
          },
          {
            name: "Santa Cruz",
            description:
              "A quaint town with a rich cultural heritage and welcoming atmosphere.",
          },
          {
            name: "Trindade",
            description:
              "Nestled in the hills, this town offers stunning views and warm hospitality.",
          },
        ],
      },

      {
        name: "Saudi Arabia",
        description:
          "A country in the Middle East, known for its oil reserves, Islamic history, and desert landscapes.",
        topics: [],
        rooms: [
          {
            name: "Riyadh",
            description:
              "The vibrant capital city blending modern skyscrapers with rich culture.",
          },
          {
            name: "Jeddah",
            description:
              "A bustling port city famous for its waterfront and lively markets.",
          },
          {
            name: "Mecca",
            description:
              "The spiritual heart of Islam and a destination for millions of pilgrims.",
          },
          {
            name: "Medina",
            description:
              "A historic city known for its beautiful mosques and serene atmosphere.",
          },
          {
            name: "Dammam",
            description:
              "An energetic city on the Arabian Gulf with sunny beaches and vibrant nightlife.",
          },
          {
            name: "Khobar",
            description:
              "A coastal city famous for its shopping, dining, and beautiful corniche.",
          },
          {
            name: "Tabuk",
            description:
              "A gateway to the desert with fascinating archaeological sites.",
          },
          {
            name: "Abha",
            description:
              "A mountain city with cool climate and breathtaking landscapes.",
          },
          {
            name: "Taif",
            description:
              "Known for its rose gardens and refreshing mountain air.",
          },
          {
            name: "Buraydah",
            description:
              "A city rich in tradition and known for its date farming.",
          },
        ],
      },
      {
        name: "Senegal",
        description:
          "A country in West Africa, known for its beaches, cultural heritage, and music.",
        topics: [],
        rooms: [
          {
            name: "Dakar",
            description:
              "The vibrant capital city buzzing with music, markets, and ocean views.",
          },
          {
            name: "Thiès",
            description:
              "Known for its rich crafts and bustling train junctions.",
          },
          {
            name: "Saint-Louis",
            description:
              "A charming colonial town with beautiful architecture and river vibes.",
          },
          {
            name: "Ziguinchor",
            description:
              "The gateway to the lush Casamance region, full of culture and colors.",
          },
          {
            name: "Kaolack",
            description:
              "A lively city famous for its trade and vibrant daily markets.",
          },
          {
            name: "Rufisque",
            description:
              "A coastal city with a laid-back atmosphere and rich fishing traditions.",
          },
          {
            name: "Tambacounda",
            description:
              "The largest city in eastern Senegal, surrounded by nature and history.",
          },
          {
            name: "Mbour",
            description:
              "A popular beach town known for its lively fishing port and resorts.",
          },
          {
            name: "Louga",
            description:
              "A historic city known for its cultural festivals and warm community spirit.",
          },
        ],
      },
      {
        name: "Serbia",
        description:
          "A country in Southeastern Europe, known for its medieval history and vibrant culture.",
        topics: [],
        rooms: [
          {
            name: "Belgrade",
            description:
              "The lively capital, famous for its nightlife and historic fortress views.",
          },
          {
            name: "Novi Sad",
            description:
              "Home of the iconic EXIT music festival and beautiful riverside parks.",
          },
          {
            name: "Niš",
            description:
              "An ancient city with Roman roots and rich cultural traditions.",
          },
          {
            name: "Kragujevac",
            description:
              "Known for its industrial history and bustling urban life.",
          },
          {
            name: "Subotica",
            description:
              "A charming northern city with stunning art nouveau architecture.",
          },
          {
            name: "Zrenjanin",
            description:
              "A city with vibrant festivals and beautiful river landscapes.",
          },
          {
            name: "Čačak",
            description:
              "Nestled among mountains, a hub for culture and outdoor activities.",
          },
          {
            name: "Pančevo",
            description:
              "An industrial city near Belgrade with a lively cultural scene.",
          },
        ],
      },
      {
        name: "Seychelles",
        description:
          "An island nation in the Indian Ocean, known for its beaches and marine biodiversity.",
        topics: [],
        rooms: [
          {
            name: "Victoria",
            description:
              "The bustling capital city with colorful markets and charming colonial architecture.",
          },
          {
            name: "Anse Royale",
            description:
              "A beautiful beach town perfect for relaxing and snorkeling adventures.",
          },
          {
            name: "Beau Vallon",
            description:
              "Known for its lively beach scene and stunning sunsets.",
          },
          {
            name: "Baie Lazare",
            description: "A tranquil coastal village with amazing coral reefs.",
          },
          {
            name: "Bel Ombre",
            description:
              "A scenic area famous for its pristine beaches and nature trails.",
          },
          {
            name: "Glacis",
            description:
              "A peaceful district with lush greenery and local culture.",
          },
        ],
      },
      {
        name: "Sierra Leone",
        description:
          "A country in West Africa, known for its beaches, natural resources, and history of conflict.",
        topics: [],
        rooms: [
          {
            name: "Freetown",
            description:
              "The vibrant capital city, famous for its bustling markets and historic cotton tree.",
          },
          {
            name: "Bo",
            description:
              "A lively city known for its educational institutions and rich cultural heritage.",
          },
          {
            name: "Kenema",
            description:
              "A resourceful town surrounded by lush forests and diamond mines.",
          },
          {
            name: "Makeni",
            description:
              "A growing city with a warm community spirit and lively markets.",
          },
          {
            name: "Koidu",
            description:
              "The heart of Sierra Leone’s diamond mining region with an energetic vibe.",
          },
        ],
      },
      {
        name: "Singapore",
        description:
          "A city-state in Southeast Asia, known for its cleanliness, economy, and cultural diversity.",
        topics: [],
        rooms: [
          {
            name: "Marina Bay",
            description:
              "The futuristic heart of Singapore, glowing with iconic skyscrapers and dazzling lights.",
          },
          {
            name: "Orchard Road",
            description:
              "Shop till you drop in this bustling street filled with malls, fashion, and flavors.",
          },
          {
            name: "Chinatown",
            description:
              "A vibrant district rich in culture, food stalls, and historic temples.",
          },
          {
            name: "Sentosa",
            description:
              "The island of fun — beaches, theme parks, and endless adventures await!",
          },
          {
            name: "Little India",
            description:
              "A colorful neighborhood full of spices, markets, and lively celebrations.",
          },
          {
            name: "Bugis",
            description:
              "A trendy area with street markets, cafes, and a youthful vibe.",
          },
          {
            name: "Clarke Quay",
            description:
              "The place to be for nightlife, riverside dining, and music beats.",
          },
          {
            name: "Bukit Timah",
            description:
              "Nature lovers’ paradise with lush greenery and hiking trails.",
          },
          {
            name: "Holland Village",
            description:
              "A cozy spot known for hip cafes, art, and laid-back vibes.",
          },
          {
            name: "Tiong Bahru",
            description:
              "A charming neighborhood blending heritage architecture with modern cafes.",
          },
        ],
      },
      {
        name: "Slovakia",
        description:
          "A landlocked country in Central Europe, known for its castles, mountains, and culture.",
        topics: [],
        rooms: [
          {
            name: "Bratislava",
            description:
              "The capital city, where history meets the Danube and vibrant city life.",
          },
          {
            name: "Košice",
            description:
              "A lively cultural hub with charming old town streets and festivals.",
          },
          {
            name: "Prešov",
            description:
              "A city with rich traditions and beautiful historical architecture.",
          },
          {
            name: "Žilina",
            description:
              "Gateway to the mountains, perfect for outdoor lovers and explorers.",
          },
          {
            name: "Nitra",
            description:
              "One of the oldest cities, full of heritage and religious landmarks.",
          },
          {
            name: "Banská Bystrica",
            description:
              "Nestled in central Slovakia, known for its scenic views and vibrant culture.",
          },
          {
            name: "Trnava",
            description:
              "Called the 'Little Rome' for its many churches and charming streets.",
          },
          {
            name: "Martin",
            description:
              "Cultural and literary heartland, rich in Slovak traditions.",
          },
          {
            name: "Poprad",
            description:
              "Your gateway to the High Tatras and stunning mountain adventures.",
          },
          {
            name: "Trenčín",
            description:
              "Famous for its medieval castle and lively city atmosphere.",
          },
        ],
      },
      {
        name: "Slovenia",
        description:
          "A small country in Central Europe, known for its mountains, lakes, and history.",
        topics: [],
        rooms: [
          {
            name: "Ljubljana",
            description:
              "The charming capital city with a vibrant cultural scene and beautiful river views.",
          },
          {
            name: "Maribor",
            description:
              "Slovenia’s second-largest city, famous for its wine and lively festivals.",
          },
          {
            name: "Celje",
            description:
              "A historic town with medieval castles and rich heritage.",
          },
          {
            name: "Kranj",
            description:
              "Gateway to the Alps, perfect for adventurers and nature lovers.",
          },
          {
            name: "Velenje",
            description:
              "Known for its modern architecture and green landscapes.",
          },
          {
            name: "Koper",
            description:
              "A coastal city with a Mediterranean vibe and rich history.",
          },
          {
            name: "Novo Mesto",
            description:
              "A picturesque town along the Krka River, full of tradition.",
          },
        ],
      },
      {
        name: "Solomon Islands",
        description:
          "An island nation in the Pacific Ocean, known for its WWII history and marine biodiversity.",
        topics: [],
        rooms: [
          {
            name: "Honiara",
            description:
              "The capital city buzzing with local markets and wartime relics.",
          },
          {
            name: "Auki",
            description:
              "A tranquil town known for its friendly locals and island charm.",
          },
          {
            name: "Gizo",
            description:
              "A gateway to stunning coral reefs and diving adventures.",
          },
          {
            name: "Noro",
            description:
              "Famous for its fishing industry and beautiful coastal views.",
          },
        ],
      },
      {
        name: "Somalia",
        description:
          "A country in the Horn of Africa, known for its coastline and cultural history.",
        topics: [],
        rooms: [
          {
            name: "Mogadishu",
            description:
              "The vibrant capital city where the coast meets culture and history.",
          },
          {
            name: "Hargeisa",
            description:
              "A bustling city with rich traditions and modern vibes in the north.",
          },
          {
            name: "Kismayo",
            description: "A lively port city known for its beaches and trade.",
          },
          {
            name: "Baidoa",
            description:
              "The heartland city surrounded by plains and farming communities.",
          },
          {
            name: "Beledweyne",
            description:
              "A riverside city famous for its markets and cultural festivals.",
          },
          {
            name: "Bosaso",
            description:
              "A coastal gateway city buzzing with business and sea breeze.",
          },
          {
            name: "Garowe",
            description:
              "The administrative hub with a mix of tradition and progress.",
          },
          {
            name: "Galkayo",
            description:
              "A city known for its diversity and vibrant local life.",
          },
        ],
      },
      {
        name: "South Africa",
        description:
          "A country in Southern Africa, known for its diverse culture, wildlife, and history.",
        topics: [],
        rooms: [
          {
            name: "Johannesburg",
            description:
              "The bustling economic powerhouse with a vibrant urban spirit.",
          },
          {
            name: "Cape Town",
            description:
              "A stunning coastal city famous for Table Mountain and beaches.",
          },
          {
            name: "Durban",
            description:
              "A sunny seaside city known for its warm beaches and spicy cuisine.",
          },
          {
            name: "Pretoria",
            description:
              "The administrative capital with jacaranda-lined streets and history.",
          },
          {
            name: "Port Elizabeth",
            description:
              "A friendly harbor city known for its beaches and marine life.",
          },
          {
            name: "Bloemfontein",
            description:
              "The judicial capital with charming parks and cultural landmarks.",
          },
          {
            name: "East London",
            description:
              "A relaxed coastal city with beautiful beaches and a laid-back vibe.",
          },
          {
            name: "Nelspruit",
            description:
              "Gateway to Kruger National Park with lush greenery and wildlife.",
          },
        ],
      },
      {
        name: "South Korea",
        description:
          "A country in East Asia, known for its technology, culture, and economy.",
        topics: [],
        rooms: [
          {
            name: "Seoul",
            description:
              "The city that never stops—jump into the ultimate game rush!",
          },
          {
            name: "Busan",
            description:
              "Coastal vibes and fast-paced fun—can you ride the game wave?",
          },
          {
            name: "Incheon",
            description: "Where games take flight—strategize and soar!",
          },
          {
            name: "Daegu",
            description: "Heat up your gameplay in this city of excitement!",
          },
          {
            name: "Daejeon",
            description: "The science city of smart moves—outwit and outplay!",
          },
          {
            name: "Gwangju",
            description: "Culture meets competition—create your victory here!",
          },
          {
            name: "Ulsan",
            description:
              "Fuel your fun in the engine of the east—go full speed ahead!",
          },
          {
            name: "Suwon",
            description: "Fortified with fun—break into new levels!",
          },
          {
            name: "Changwon",
            description:
              "Balanced vibes and clever strategies—game your way through!",
          },
          {
            name: "Jeonju",
            description:
              "Feast on wins and flavors—this city is all about variety!",
          },
          {
            name: "Cheongju",
            description: "Calm, clever, and competitive—play smart to win!",
          },
          {
            name: "Gyeongju",
            description:
              "A historic twist—reveal ancient wins in modern games!",
          },
          {
            name: "Jeju City",
            description: "Island fun and breezy challenges—relax and play!",
          },
          {
            name: "Seongnam",
            description: "Techy, trendy, and totally game-ready!",
          },
          {
            name: "Pohang",
            description:
              "Steel your nerves—it’s time to battle through the brainzone!",
          },
          {
            name: "Hwaseong",
            description: "Rocket your way up—this city’s got lift-off energy!",
          },
        ],
      },
      {
        name: "South Sudan",
        description:
          "The world's newest country, located in East-Central Africa, facing ongoing challenges and full of resilient spirit.",
        topics: [],
        rooms: [
          {
            name: "Juba",
            description:
              "The bustling capital city where tradition meets growth and the Nile flows nearby.",
          },
          {
            name: "Malakal",
            description:
              "A key city known for its vibrant markets and riverside views.",
          },
          {
            name: "Wau",
            description:
              "A lively city surrounded by nature and rich cultural heritage.",
          },
          {
            name: "Bor",
            description:
              "A historic city famous for its cultural roots and community spirit.",
          },
          {
            name: "Yei",
            description:
              "A green city known for its farming and friendly people.",
          },
          {
            name: "Bentiu",
            description:
              "An energetic city where resilience and hope shine bright.",
          },
          {
            name: "Rumbek",
            description:
              "A city of tradition and stories, set against a beautiful backdrop.",
          },
          {
            name: "Aweil",
            description:
              "A vibrant town known for its markets and welcoming atmosphere.",
          },
          {
            name: "Torit",
            description:
              "A city nestled among hills, offering scenic views and local culture.",
          },
        ],
      },
      {
        name: "Spain",
        description:
          "A country in Southwestern Europe, known for its history, culture, and beautiful landscapes.",
        topics: [],
        rooms: [
          {
            name: "Madrid",
            description:
              "The vibrant capital city, full of energy, art, and delicious tapas.",
          },
          {
            name: "Barcelona",
            description:
              "Famous for its stunning architecture, beaches, and lively street life.",
          },
          {
            name: "Valencia",
            description:
              "Known for its futuristic buildings, sandy beaches, and the famous paella.",
          },
          {
            name: "Seville",
            description:
              "A city of flamenco, historic palaces, and sunny plazas.",
          },
          {
            name: "Bilbao",
            description:
              "Home to the iconic Guggenheim Museum and a hub for art lovers.",
          },
          {
            name: "Granada",
            description:
              "Where the Alhambra palace tells stories of ancient Moorish times.",
          },
          {
            name: "Malaga",
            description:
              "A coastal city with beautiful beaches and rich cultural heritage.",
          },
          {
            name: "Zaragoza",
            description:
              "Known for its impressive basilica and vibrant festivals.",
          },
          {
            name: "Cordoba",
            description:
              "A city blending Roman, Islamic, and Christian histories.",
          },
          {
            name: "Alicante",
            description:
              "Sunny shores and lively nightlife make this city a favorite getaway.",
          },
        ],
      },
      {
        name: "Sri Lanka",
        description:
          "An island country in South Asia, known for its beaches, wildlife, and Buddhist heritage.",
        topics: [],
        rooms: [
          {
            name: "Colombo",
            description:
              "The bustling capital city where tradition meets modern life.",
          },
          {
            name: "Kandy",
            description:
              "Home to the sacred Temple of the Tooth and lush hills.",
          },
          {
            name: "Galle",
            description:
              "Historic coastal city famous for its colonial fort and beaches.",
          },
          {
            name: "Jaffna",
            description:
              "A vibrant cultural hub in the northern part of the island.",
          },
          {
            name: "Anuradhapura",
            description:
              "Ancient city with ruins dating back thousands of years.",
          },
          {
            name: "Nuwara Eliya",
            description:
              "The ‘Little England’ of Sri Lanka, known for tea plantations and cool climate.",
          },
        ],
      },
      {
        name: "Sudan",
        description:
          "A country in North-East Africa, known for its ancient history and political struggles.",
        topics: [],
        rooms: [
          {
            name: "Khartoum",
            description:
              "The bustling capital city where two mighty rivers meet — a perfect spot for your next adventure!",
          },
          {
            name: "Omdurman",
            description:
              "Dive into the traditional markets and rich culture of this historic city — a treasure trove of stories awaits.",
          },
          {
            name: "Port Sudan",
            description:
              "Feel the salty breeze of the Red Sea in this vital port city — where trade and tides come together.",
          },
          {
            name: "Nyala",
            description:
              "Explore the vibrant heart of the Darfur region with its lively streets and local charm.",
          },
          {
            name: "El Obeid",
            description:
              "Step into the agricultural hub of central Sudan — where trade routes and traditions cross paths.",
          },
          {
            name: "Kassala",
            description:
              "Discover the eastern gateway near the Eritrean border, with stunning landscapes and warm hospitality.",
          },
          {
            name: "Wad Madani",
            description:
              "Wander through this commercial center in the Gezira region — a city alive with markets and movement.",
          },
          {
            name: "Kosti",
            description:
              "Travel along the White Nile to this transport hub, bridging communities and cultures.",
          },
          {
            name: "Dongola",
            description:
              "Visit this historic city along the Nile in northern Sudan, full of ancient tales and river views.",
          },
        ],
      },
      {
        name: "Suriname",
        description:
          "A country in South America, known for its rainforests and diverse culture.",
        topics: [],
        rooms: [
          {
            name: "Paramaribo",
            description:
              "The capital city buzzing with colonial charm, vibrant markets, and riverside vibes.",
          },
          {
            name: "Lelydorp",
            description:
              "A laid-back town just outside the capital — perfect for a chill competition!",
          },
          {
            name: "Nieuw Nickerie",
            description:
              "Nestled near rice fields and wetlands, it’s a scenic and serene showdown spot.",
          },
          {
            name: "Moengo",
            description:
              "A lively town with mining roots and a creative community — ready to play?",
          },
          {
            name: "Albina",
            description:
              "At the border with French Guiana, it’s the gateway to cross-cultural fun.",
          },
          {
            name: "Totness",
            description:
              "A coastal town where the breeze is fresh and the trivia is even fresher!",
          },
        ],
      },
      {
        name: "Sweden",
        description:
          "A Nordic country, known for its welfare system, forests, and historical sites.",
        topics: [],
        rooms: [
          {
            name: "Stockholm",
            description:
              "Sweden's capital spread across 14 islands — where royal flair meets techy fun!",
          },
          {
            name: "Gothenburg",
            description:
              "A coastal city full of friendly faces, seafood, and game-winning vibes.",
          },
          {
            name: "Malmö",
            description:
              "Modern, multicultural, and buzzing with bridge-connected energy!",
          },
          {
            name: "Uppsala",
            description:
              "A student city with brains, bikes, and the ultimate trivia power!",
          },
          {
            name: "Västerås",
            description:
              "An energetic lakeside town perfect for splashing into competitive fun.",
          },
          {
            name: "Örebro",
            description:
              "Home to a medieval castle and modern spirit — a solid game battleground.",
          },
          {
            name: "Linköping",
            description:
              "A tech-savvy town where jets are built and scores soar sky-high!",
          },
          {
            name: "Helsingborg",
            description:
              "Seaside charm meets old-world elegance — ready to play with flair?",
          },
          {
            name: "Lund",
            description:
              "Historic, academic, and always up for a brainy challenge.",
          },
          {
            name: "Norrköping",
            description:
              "From factories to fun — this city brings industrial grit to the game!",
          },
        ],
      },
      {
        name: "Switzerland",
        description:
          "A landlocked country in Europe, known for its neutrality, banking system, and mountains.",
        topics: [],
        rooms: [
          {
            name: "Zurich",
            description:
              "The financial powerhouse with a funky cultural twist. Watch out for sudden bursts of techno!",
          },
          {
            name: "Geneva",
            description:
              "Home to diplomats and secret agents. Try not to spill your fondue during peace talks!",
          },
          {
            name: "Bern",
            description:
              "The chill capital where bears roam and clocks tick with purpose. Perfect for relaxed strategy games.",
          },
          {
            name: "Basel",
            description:
              "Where art, science, and carnival chaos meet. Dive into colorful mischief along the Rhine!",
          },
          {
            name: "Lausanne",
            description:
              "The Olympic spirit lives here! Race to the top of the leaderboard—or the hill!",
          },
          {
            name: "Lucerne",
            description:
              "Postcard views, medieval charm, and a dragon or two hiding in the mountains.",
          },
          {
            name: "Lugano",
            description:
              "Where Switzerland meets Italy. Expect sunshine, lakeside vibes, and stylish showdowns!",
          },
          {
            name: "St. Gallen",
            description:
              "Books, baroque, and brilliant banter. The abbey may be quiet, but this room isn't!",
          },
          {
            name: "Interlaken",
            description:
              "Adrenaline and alpine adventures await—skydiving not required, but encouraged!",
          },
          {
            name: "Zermatt",
            description:
              "Matterhorn magic and snowy surprises. Beware of sneaky yetis!",
          },
        ],
      },
      {
        name: "Syria",
        description:
          "A country in the Middle East, known for its ancient history, diverse culture, and resilient spirit.",
        topics: [],
        rooms: [
          {
            name: "Damascus",
            description:
              "One of the oldest continuously inhabited cities—step into a maze of mysteries and timeless tales!",
          },
          {
            name: "Aleppo",
            description:
              "A city of strength and spice—expect legendary markets, ancient forts, and epic challenges!",
          },
          {
            name: "Homs",
            description:
              "A crossroads of civilizations—build, defend, and outwit your rivals in the heart of Syria.",
          },
          {
            name: "Latakia",
            description:
              "Sun, sea, and strategy—coastal cool meets clever competition!",
          },
          {
            name: "Hama",
            description:
              "Whirling water wheels and fast-paced puzzles—get in the flow!",
          },
          {
            name: "Deir ez-Zor",
            description:
              "Desert drama and Euphrates energy—watch for surprises from the sands!",
          },
          {
            name: "Raqqa",
            description:
              "Ancient roots meet modern moves—where every turn counts!",
          },
          {
            name: "Tartus",
            description:
              "Seaside serenity with a strategic twist—navigate the coast and conquer the board!",
          },
          {
            name: "Daraa",
            description:
              "Where it all began—expect bold moves and unexpected turns in this historic hotspot!",
          },
          {
            name: "Qamishli",
            description:
              "A diverse and dynamic city—team up, trade, and triumph on the northeastern frontier!",
          },
        ],
      },
      {
        name: "Taiwan",
        description:
          "A self-governing island nation in East Asia, known for its technology, night markets, and rich cultural heritage.",
        topics: [],
        rooms: [
          {
            name: "Taipei",
            description:
              "The buzzing capital—skyscrapers, street food, and side quests at every corner!",
          },
          {
            name: "Kaohsiung",
            description:
              "A southern port city with heart—ride the harbor, dodge the scooters, and win big!",
          },
          {
            name: "Taichung",
            description:
              "Art, parks, and playful strategy—expect surprises behind every mural!",
          },
          {
            name: "Tainan",
            description:
              "The ancient capital—battle with brains in a city full of temples and tasty treats!",
          },
          {
            name: "Hsinchu",
            description:
              "Silicon Valley of Taiwan—where tech meets tactics in a fast-paced circuit of fun!",
          },
          {
            name: "Hualien",
            description:
              "Mountains, coastlines, and unexpected challenges—adventure awaits on the east!",
          },
          {
            name: "Keelung",
            description:
              "A rainy port full of seafood and secrets—navigate the fog and find your fortune!",
          },
          {
            name: "Chiayi",
            description:
              "Gateway to Alishan—climb your way to victory through forests and folklore!",
          },
          {
            name: "Taitung",
            description:
              "Chill vibes and tribal rhythms—play your cards right in Taiwan’s eastern paradise!",
          },
          {
            name: "Yilan",
            description:
              "Hot springs and hidden strategies—don’t let the calm fool you, it’s game on!",
          },
        ],
      },
      {
        name: "Tajikistan",
        description:
          "A landlocked country in Central Asia, known for its soaring mountains, ancient Silk Road routes, and Persian heritage.",
        topics: [],
        rooms: [
          {
            name: "Dushanbe",
            description:
              "The capital city—modern meets majestic in this vibrant hub of strategy and surprises!",
          },
          {
            name: "Khujand",
            description:
              "An ancient Silk Road stop—trade, plot, and thrive in this northern jewel!",
          },
          {
            name: "Kulob",
            description:
              "History, poetry, and power plays—step into the city of heroes!",
          },
          {
            name: "Bokhtar",
            description:
              "Southern style and quick wits—make your move where sun and strategy shine!",
          },
          {
            name: "Khorugh",
            description:
              "High-altitude mind games—navigate the Pamirs and outsmart your rivals in the roof of the world!",
          },
          {
            name: "Istaravshan",
            description:
              "One of the oldest cities—every round is a timeless tale in this cultural treasure!",
          },
          {
            name: "Panjakent",
            description:
              "Ruins, riddles, and rich history—where ancient puzzles unlock modern victories!",
          },
          {
            name: "Tursunzoda",
            description:
              "Metal and might—forge your strategy in the city of industry and energy!",
          },
          {
            name: "Vahdat",
            description:
              "Unity in motion—team up or go solo in this fast-paced fusion of moves!",
          },
          {
            name: "Isfara",
            description:
              "Fruitful lands and fresh ideas—every choice blossoms into something bold!",
          },
        ],
      },
      {
        name: "Tanzania",
        description:
          "A country in East Africa, known for its wildlife reserves, Mount Kilimanjaro, and stunning landscapes.",
        topics: [],
        rooms: [
          {
            name: "Dodoma",
            description:
              "The laid-back capital—plan your power plays from the political heart of the country!",
          },
          {
            name: "Dar es Salaam",
            description:
              "A coastal metropolis—bustling markets, tropical twists, and rapid-fire rivalries!",
          },
          {
            name: "Arusha",
            description:
              "Gateway to safaris and summits—chart your course between lions and legends!",
          },
          {
            name: "Mwanza",
            description:
              "Rocky shores and bold moves—Lake Victoria's city keeps players on their toes!",
          },
          {
            name: "Zanzibar City",
            description:
              "Spice, sea, and strategy—play your hand in this magical island maze!",
          },
          {
            name: "Mbeya",
            description:
              "Highlands hustle—think fast, climb high, and rule the ridges!",
          },
          {
            name: "Morogoro",
            description:
              "Nature meets knowledge—plot your path through forested challenges and smart plays!",
          },
          {
            name: "Tanga",
            description:
              "Old-world charm with a twist—port-side puzzles and unexpected adventures await!",
          },
          {
            name: "Iringa",
            description:
              "Hilltop haven for clever thinkers—take the high ground and outplay the competition!",
          },
          {
            name: "Moshi",
            description:
              "Beneath Kilimanjaro’s shadow—every game here is an uphill battle to glory!",
          },
        ],
      },
      {
        name: "Thailand",
        description:
          "A country in Southeast Asia, known for its beaches, temples, and vibrant street life.",
        topics: [],
        rooms: [
          {
            name: "Bangkok",
            description:
              "The city that never naps—fast-paced fun through traffic, temples, and tasty treats!",
          },
          {
            name: "Chiang Mai",
            description:
              "Mountain vibes and ancient walls—meditate, then dominate with strategy and grace!",
          },
          {
            name: "Phuket",
            description:
              "Sun, surf, and surprises—paradise isn't always peaceful in this beachside brawl!",
          },
          {
            name: "Pattaya",
            description:
              "Where nightlife meets game night—bright lights, big moves, and bold plays!",
          },
          {
            name: "Ayutthaya",
            description:
              "Ancient ruins and modern rivalries—conquer this kingdom of legends!",
          },
          {
            name: "Hat Yai",
            description:
              "Southern spice and shopping smarts—trade, team up, and take the lead!",
          },
          {
            name: "Krabi",
            description:
              "Cliffs, caves, and clever climbs—navigate nature’s puzzle and win the day!",
          },
          {
            name: "Nakhon Ratchasima",
            description:
              "The gateway to Isan—bold strategies echo in this culturally rich arena!",
          },
          {
            name: "Surat Thani",
            description:
              "Jungle paths and island quests—adventure begins where the boats set sail!",
          },
          {
            name: "Chiang Rai",
            description:
              "White temples, golden triangles, and mysteries—this northern gem holds epic challenges!",
          },
        ],
      },
      {
        name: "Togo",
        description:
          "A country in West Africa, known for its beaches, cultural diversity, and vibrant traditions.",
        topics: [],
        rooms: [
          {
            name: "Lomé",
            description:
              "The buzzing capital by the sea—markets, music, and master moves await!",
          },
          {
            name: "Sokodé",
            description:
              "Central power and rhythm—dance through strategy and spin the game your way!",
          },
          {
            name: "Kara",
            description:
              "Mountain views and clever crews—where every turn could flip the board!",
          },
          {
            name: "Atakpamé",
            description:
              "Hillside hustle and thoughtful plays—where tactics climb to new heights!",
          },
          {
            name: "Dapaong",
            description:
              "Northern edge, boldest edge—heat up the game in this crossroads of challenge!",
          },
          {
            name: "Tsévié",
            description:
              "Close to the capital but full of its own flavor—expect rapid rounds and quick thinking!",
          },
          {
            name: "Aného",
            description:
              "Where the ocean breeze meets coastal games—old charm with new tricks!",
          },
          {
            name: "Kpalimé",
            description:
              "Forests, crafts, and fresh ideas—build your path through nature’s playground!",
          },
          {
            name: "Badou",
            description:
              "Waterfalls and wildcards—make waves in this lush, unexpected arena!",
          },
          {
            name: "Notsé",
            description:
              "The ancient heart of the Ewe people—honor history with strategic brilliance!",
          },
        ],
      },
      {
        name: "Tonga",
        description:
          "An island nation in the South Pacific, known for its monarchy, vibrant culture, and tropical beauty.",
        topics: [],
        rooms: [
          {
            name: "Nukuʻalofa",
            description:
              "The royal capital—where tradition meets tropical tactics in high-stakes island intrigue!",
          },
          {
            name: "Neiafu",
            description:
              "The Vavaʻu gem—sail through strategy and win beneath whale-filled waves!",
          },
          {
            name: "Pangai",
            description:
              "Heart of Haʻapai—island charm, calm waters, and quietly clever moves.",
          },
          {
            name: "ʻOhonua",
            description:
              "Eua’s green haven—hike through riddles and rule the jungle trails!",
          },
          {
            name: "Haveluloto",
            description:
              "Close to the capital, packed with punch—every move here has community spirit!",
          },
          {
            name: "Kolonga",
            description:
              "A small town with big heart—play smart and rise through peaceful play!",
          },
          {
            name: "Hihifo",
            description:
              "The western tip of Tongatapu—ride the winds and outplay the tide!",
          },
          {
            name: "Lifuka",
            description:
              "Cultural center of Haʻapai—ancient traditions inspire bold strategies!",
          },
          {
            name: "Niuatoputapu",
            description:
              "Remote and resilient—outlast and outthink in this island of surprises!",
          },
          {
            name: "Vaini",
            description:
              "Where coastal calm hides cunning plans—make your mark in the quiet waves!",
          },
        ],
      },
      {
        name: "Trinidad and Tobago",
        description:
          "An island nation in the Caribbean, known for its carnival, calypso, and diverse culture.",
        topics: [],
        rooms: [
          {
            name: "Port of Spain",
            description:
              "The vibrant capital—carnival energy, fast moves, and no shortage of sparkle!",
          },
          {
            name: "San Fernando",
            description:
              "Southside strategy and steelpan sounds—bring the heat in this lively city!",
          },
          {
            name: "Scarborough",
            description:
              "Tobago’s colorful capital—tropical vibes with sneaky surprises behind every palm!",
          },
          {
            name: "Chaguanas",
            description:
              "The bustling heart of central Trinidad—where trade, wit, and quick thinking win the day!",
          },
          {
            name: "Arima",
            description:
              "Home of parang and power plays—don’t let the music distract you from your moves!",
          },
          {
            name: "Point Fortin",
            description:
              "Small town, big energy—dance through the competition in this oil-rich zone!",
          },
          {
            name: "Sangre Grande",
            description:
              "Eastern edge excitement—where lush forests meet fast-paced challenges!",
          },
          {
            name: "Toco",
            description:
              "Remote and rugged—make bold plays on the wild northern coast!",
          },
          {
            name: "Roxborough",
            description:
              "Adventure meets culture in eastern Tobago—navigate nature and outsmart rivals!",
          },
          {
            name: "Mayaro",
            description:
              "Sun, surf, and smart strategy—win big in this beachy battleground!",
          },
        ],
      },
      {
        name: "Tunisia",
        description:
          "A country in North Africa, known for its Mediterranean beaches, desert landscapes, and ancient ruins.",
        topics: [],
        rooms: [
          {
            name: "Tunis",
            description:
              "The capital city—where ancient medinas and modern moves collide in a fast-paced arena!",
          },
          {
            name: "Sfax",
            description:
              "The economic powerhouse—trade, plan, and outmaneuver in this bustling coastal hub!",
          },
          {
            name: "Sousse",
            description:
              "Sun, sea, and surprise tactics—play smart in this seaside city of history and fun!",
          },
          {
            name: "Kairouan",
            description:
              "Spiritual center and city of puzzles—strategy flows through sacred streets!",
          },
          {
            name: "Gabès",
            description:
              "Oasis vibes and coastal tricks—dive into desert deals and win big!",
          },
          {
            name: "Bizerte",
            description:
              "Northern charm and naval flair—hold the fort and chart a bold course!",
          },
          {
            name: "Tozeur",
            description:
              "Gateway to the Sahara—dunes, dates, and daring decisions define the game!",
          },
          {
            name: "Monastir",
            description:
              "A fortress by the sea—defend your turf and set sail for victory!",
          },
          {
            name: "Mahdia",
            description:
              "Pearl of the Sahel—beautiful beaches and brilliant plays go hand-in-hand!",
          },
          {
            name: "Douz",
            description:
              "The desert’s edge—race camels, dodge sandstorms, and outwit the wilderness!",
          },
        ],
      },
      {
        name: "Turkey",
        description:
          "A country straddling Eastern Europe and Asia, known for its culture, history, and delicious food.",
        topics: [],
        rooms: [
          {
            name: "Istanbul",
            description:
              "Where continents collide—navigate bustling bazaars, ancient palaces, and epic street food showdowns!",
          },
          {
            name: "Ankara",
            description:
              "The capital hub—politics, power plays, and strategic moves at the heart of Turkey!",
          },
          {
            name: "Izmir",
            description:
              "Coastal charm with competitive spirit—race along the Aegean and outwit your rivals!",
          },
          {
            name: "Antalya",
            description:
              "Sun-soaked beaches and ancient ruins—perfect for laid-back strategies with hidden depths!",
          },
          {
            name: "Bursa",
            description:
              "Green hills and hot springs—relax, recharge, then launch a winning comeback!",
          },
          {
            name: "Gaziantep",
            description:
              "Famous for its baklava and bold moves—sweet victories await the cleverest players!",
          },
          {
            name: "Konya",
            description:
              "Land of whirling dervishes—spin your way to victory with grace and cunning!",
          },
          {
            name: "Trabzon",
            description:
              "Black Sea mysteries and mountain maneuvers—expect twists around every corner!",
          },
          {
            name: "Kayseri",
            description:
              "Cappadocian gateway—hot air balloons and high stakes in this strategic hotspot!",
          },
          {
            name: "Mardin",
            description:
              "Ancient city of stone—build your legacy among the labyrinthine streets!",
          },
        ],
      },
      {
        name: "Turkmenistan",
        description:
          "A country in Central Asia, known for its vast deserts, ancient Silk Road sites, and rich gas reserves.",
        topics: [],
        rooms: [
          {
            name: "Ashgabat",
            description:
              "The gleaming capital—marble palaces and bright ideas light up this strategic city!",
          },
          {
            name: "Turkmenabat",
            description:
              "Crossroads of commerce—trade routes and tactics collide in this eastern hub!",
          },
          {
            name: "Dashoguz",
            description:
              "Gateway to the Karakum Desert—survive the sands and outwit your opponents!",
          },
          {
            name: "Mary",
            description:
              "Ancient Merv’s legacy—dig deep for history and hidden advantages!",
          },
          {
            name: "Balkanabat",
            description:
              "Oil and gas power—fuel your game with bold moves in this western city!",
          },
          {
            name: "Tejen",
            description:
              "Oasis oasis—refresh your strategy and spring into action!",
          },
          {
            name: "Bayramaly",
            description:
              "Near the ruins of ancient cities—history and cunning go hand in hand!",
          },
          {
            name: "Serdar",
            description:
              "New town, new tactics—build fresh strategies on fertile ground!",
          },
          {
            name: "Gonur",
            description:
              "Ancient archaeological site—unearth secrets and surprise your rivals!",
          },
          {
            name: "Kaka",
            description:
              "Small but strategic—where every move counts and cunning wins!",
          },
        ],
      },
      {
        name: "Tuvalu",
        description:
          "One of the smallest countries in the world, known for its beautiful islands and climate change challenges.",
        topics: [],
        rooms: [
          {
            name: "Funafuti",
            description:
              "The bustling atoll capital—navigate waves of culture, community, and clever moves!",
          },
          {
            name: "Nanumea",
            description:
              "Northern paradise—ride the tides and outsmart the ocean’s challenges!",
          },
          {
            name: "Nanumanga",
            description:
              "Lush and lively—where every step is a careful balance of strategy and nature!",
          },
          {
            name: "Nui",
            description:
              "A peaceful atoll with hidden depths—quiet tactics lead to big wins!",
          },
          {
            name: "Vaitupu",
            description:
              "Island life with a twist—forge alliances and navigate the sea’s surprises!",
          },
          {
            name: "Nukufetau",
            description:
              "Lagoon lover’s dream—dive into deep strategy and calm waters!",
          },
          {
            name: "Nukulaelae",
            description:
              "Remote and resilient—outlast the tides in this serene game room!",
          },
          {
            name: "Niulakita",
            description:
              "Smallest inhabited island—tiny space, huge potential for clever plays!",
          },
        ],
      },
      {
        name: "Uganda",
        description:
          "A country in East Africa, known for its wildlife, lush landscapes, and mountain gorillas.",
        topics: [],
        rooms: [
          {
            name: "Kampala",
            description:
              "The buzzing capital—hustle through traffic, tech, and tactics in this fast-paced arena!",
          },
          {
            name: "Entebbe",
            description:
              "By the shores of Lake Victoria—where strategy flies high and timing is everything!",
          },
          {
            name: "Jinja",
            description:
              "Adventure central—ride the rapids and outplay your rivals where the Nile begins!",
          },
          {
            name: "Gulu",
            description:
              "Northern strength and smarts—plan your path through post-conflict resilience!",
          },
          {
            name: "Mbarara",
            description:
              "The land of milk and momentum—keep moving and stay ahead in the west!",
          },
          {
            name: "Fort Portal",
            description:
              "Gateway to crater lakes and chimpanzees—nature meets brains in this lush battleground!",
          },
          {
            name: "Mbale",
            description:
              "Mount Elgon looms large—rise to the summit with sharp and steady play!",
          },
          {
            name: "Arua",
            description:
              "Far west frontier—bold moves and border strategies rule here!",
          },
          {
            name: "Masaka",
            description:
              "South-central energy—vibrant, lively, and full of quick surprises!",
          },
          {
            name: "Kabale",
            description:
              "Near Lake Bunyonyi—deep lakes, deep thoughts, and daring plays!",
          },
        ],
      },
      {
        name: "Ukraine",
        description:
          "A country in Eastern Europe, known for its rich history, strong culture, and ongoing struggle for sovereignty.",
        topics: [],
        rooms: [
          {
            name: "Kyiv",
            description:
              "The historic capital—golden domes and sharp minds shape every strategic move here!",
          },
          {
            name: "Lviv",
            description:
              "Western charm with intellectual flair—cobblestone tactics and café debates await!",
          },
          {
            name: "Odesa",
            description:
              "By the Black Sea—smooth moves and seaside schemes make this a slick battleground!",
          },
          {
            name: "Kharkiv",
            description:
              "Academic powerhouse—brains over brawn in this tech-savvy city of thinkers!",
          },
          {
            name: "Dnipro",
            description:
              "Industrial energy and riverfront resolve—forge ahead with bold strategies!",
          },
          {
            name: "Zaporizhzhia",
            description:
              "Cossack country—channel your inner warrior in this land of fierce independence!",
          },
          {
            name: "Vinnytsia",
            description:
              "Central coordination and clean design—where every move feels engineered to win!",
          },
          {
            name: "Ivano-Frankivsk",
            description:
              "Carpathian gateway—mix mountain wisdom with cultural charm in this scenic room!",
          },
          {
            name: "Chernihiv",
            description:
              "Ancient roots, modern resolve—make thoughtful plays in a city of quiet strength!",
          },
          {
            name: "Mykolaiv",
            description:
              "Shipbuilding city—navigate complex waters with precision and daring decisions!",
          },
        ],
      },
      {
        name: "United Arab Emirates",
        description:
          "A country in the Arabian Peninsula, known for its futuristic cities, oil wealth, and blend of tradition and modernity.",
        topics: [],
        rooms: [
          {
            name: "Dubai",
            description:
              "Skyscrapers, shopping, and speed—where flash meets strategy in this glittering game zone!",
          },
          {
            name: "Abu Dhabi",
            description:
              "The powerful capital—play like royalty in this polished arena of influence and oil!",
          },
          {
            name: "Sharjah",
            description:
              "Cultural capital—art, heritage, and thoughtful plays set the tone here!",
          },
          {
            name: "Ajman",
            description:
              "Small but bold—quick thinking and local charm make this coastal room a surprise hit!",
          },
          {
            name: "Fujairah",
            description:
              "On the Gulf of Oman—where mountain tactics and ocean moves collide!",
          },
          {
            name: "Ras Al Khaimah",
            description:
              "Adventure central—scale peaks and conquer challenges with clever climbs!",
          },
          {
            name: "Umm Al Quwain",
            description:
              "Quiet and quirky—don’t underestimate this laid-back zone of strategic sneaks!",
          },
          {
            name: "Al Ain",
            description:
              "Desert oasis—where ancient forts and modern minds meet in the Garden City!",
          },
          {
            name: "Jebel Ali",
            description:
              "Port power—move your pieces like cargo and dominate the logistics of the game!",
          },
          {
            name: "Khor Fakkan",
            description:
              "East coast gem—surf the strategy wave along scenic shores and bold moves!",
          },
        ],
      },
      {
        name: "United Kingdom",
        description:
          "A country in Western Europe, known for its monarchy, historic landmarks, and global cultural influence.",
        topics: [],
        rooms: [
          {
            name: "London",
            description:
              "The royal capital—navigate iconic landmarks, political twists, and fast-paced play!",
          },
          {
            name: "Edinburgh",
            description:
              "Scotland's storied heart—castles, legends, and clever strategies rise from the mist!",
          },
          {
            name: "Manchester",
            description:
              "Music, football, and fierce competition—play with rhythm and rivalries!",
          },
          {
            name: "Birmingham",
            description:
              "The industrial powerhouse—engineer your way to victory in this dynamic arena!",
          },
          {
            name: "Glasgow",
            description:
              "Scotland’s cultural titan—where wit, grit, and charm drive the game forward!",
          },
          {
            name: "Belfast",
            description:
              "Northern Ireland’s capital—craft peace or stir the pot in a city of strong spirit!",
          },
          {
            name: "Cardiff",
            description:
              "Welsh pride and poetic moves—outmaneuver the competition in this castle-topped capital!",
          },
          {
            name: "Liverpool",
            description:
              "Home of the Beatles and bold plays—win with style in this spirited port city!",
          },
          {
            name: "Oxford",
            description:
              "Brains over brawn—prove your strategy skills in this scholarly stronghold!",
          },
          {
            name: "Cambridge",
            description:
              "Rivalry and refinement—engage in clever competition with academic flair!",
          },
        ],
      },
      {
        name: "United States",
        description:
          "A country in North America, known for its global influence, powerful economy, and diverse landscapes and cultures.",
        topics: [],
        rooms: [
          // Northeast
          {
            name: "New York City",
            description:
              "The ultimate urban jungle—build your empire one clever move at a time!",
          },
          {
            name: "Boston",
            description:
              "History and intellect meet—play like a revolutionary with polished strategy!",
          },
          {
            name: "Philadelphia",
            description:
              "Home of liberty and bold decisions—make history with every turn!",
          },
          {
            name: "Washington, D.C.",
            description:
              "Power, politics, and planning—take command in the capital!",
          },
          {
            name: "Baltimore",
            description:
              "Harbor hustle and hometown pride—where street smarts win the game!",
          },

          // Midwest
          {
            name: "Chicago",
            description:
              "Skyline, strategy, and deep-dish dominance—rule the Windy City board!",
          },
          {
            name: "Detroit",
            description:
              "Rev up your moves in the Motor City—grit and grind pay off here!",
          },
          {
            name: "Minneapolis",
            description:
              "The Twin City of big ideas—smooth, smart gameplay in every season!",
          },
          {
            name: "St. Louis",
            description:
              "Where the arch leads to adventure—launch bold plays across the board!",
          },
          {
            name: "Cleveland",
            description:
              "Lakefront logic and comeback power—win big in this underestimated gem!",
          },
          {
            name: "Columbus",
            description:
              "A hidden hero—build fast and smart in the heart of Ohio!",
          },
          {
            name: "Indianapolis",
            description:
              "Fast lanes and sharp turns—speed your way to a clever victory!",
          },
          {
            name: "Milwaukee",
            description:
              "Brews and brains—craft your way through smart, strategic play!",
          },
          {
            name: "Kansas City",
            description:
              "BBQ and bold moves—spice up your strategy in this Midwestern classic!",
          },

          // South
          {
            name: "Atlanta",
            description:
              "Peachy plays and fast-paced fun—where hustle leads to wins!",
          },
          {
            name: "Miami",
            description:
              "Bright, bold, and tropical—outshine your rivals in this sizzling city!",
          },
          {
            name: "Orlando",
            description:
              "Theme park tricks and magical moves—make every play enchanting!",
          },
          {
            name: "Tampa",
            description:
              "Sunshine and strategy—coastal plays never looked so cool!",
          },
          {
            name: "Charlotte",
            description:
              "Banking brains and business brawls—calculate your climb to the top!",
          },
          {
            name: "Raleigh",
            description:
              "Smart tech and smoother tactics—dominate the research-rich zone!",
          },
          {
            name: "Nashville",
            description:
              "Music and momentum—play in harmony or solo your way to glory!",
          },
          {
            name: "Memphis",
            description:
              "Blues and boldness—rhythm fuels strategy in this soulful city!",
          },
          {
            name: "New Orleans",
            description:
              "Jazz, jambalaya, and genius—outplay with flair and flair only!",
          },
          {
            name: "Houston",
            description:
              "Launch your strategy from Space City—where big ideas blast off!",
          },
          {
            name: "Dallas",
            description:
              "Go big or go home—business, boldness, and breakthrough plays!",
          },
          {
            name: "Austin",
            description:
              "Keep your moves weird—and wildly effective in this creative capital!",
          },
          {
            name: "San Antonio",
            description:
              "Historic heart and riverwalk tactics—plan with precision and style!",
          },

          // West
          {
            name: "Los Angeles",
            description:
              "Lights, camera, competition! Stage your greatest game yet!",
          },
          {
            name: "San Diego",
            description:
              "Sunny strategies and chill gameplay—ride the wave to victory!",
          },
          {
            name: "San Francisco",
            description:
              "Tech, tactics, and towering twists—build your way to the top!",
          },
          {
            name: "San Jose",
            description: "Code your victory in the core of Silicon Valley!",
          },
          {
            name: "Sacramento",
            description:
              "Capitol strategies and golden ideas—govern your game wisely!",
          },
          {
            name: "Las Vegas",
            description:
              "Roll the dice or play it smart—luck and logic both shine here!",
          },
          {
            name: "Phoenix",
            description:
              "Desert heat and cool plays—rise from the ashes to rule the board!",
          },
          {
            name: "Tucson",
            description:
              "A hidden gem in the sun—play smart in the Sonoran spotlight!",
          },
          {
            name: "Denver",
            description:
              "Mile-high mindset—reach new heights in this rugged, clever game!",
          },
          {
            name: "Salt Lake City",
            description:
              "Strategic serenity—plan ahead in the land of peaks and peace!",
          },
          {
            name: "Portland",
            description:
              "Keep it quirky and smart—your unique style wins the northwest!",
          },
          {
            name: "Seattle",
            description:
              "Rain, coffee, and calculated plays—brew your strategy to perfection!",
          },
        ],
      },
      {
        name: "Uruguay",
        description:
          "A small country in South America, known for its beaches, progressive politics, and strong football culture.",
        topics: [],
        rooms: [
          {
            name: "Montevideo",
            description:
              "The seaside capital—mix coastal calm with capital city competition!",
          },
          {
            name: "Punta del Este",
            description:
              "Where beach vibes meet bold strategy—sun, surf, and smart plays!",
          },
          {
            name: "Salto",
            description:
              "Thermal waters and cool tactics—relax while outsmarting your rivals!",
          },
          {
            name: "Paysandú",
            description:
              "A riverside classic—blend tradition and technique in this charming zone!",
          },
          {
            name: "Maldonado",
            description:
              "Natural beauty and beach-town brilliance—coast your way to victory!",
          },
          {
            name: "Rivera",
            description:
              "Border town battles—cross over with style and calculated moves!",
          },
          {
            name: "Tacuarembó",
            description:
              "Land of gauchos and grit—ride your strategy to a wild win!",
          },
        ],
      },
      {
        name: "Uzbekistan",
        description:
          "A landlocked country in Central Asia, known for its Silk Road heritage, historic cities, and vast deserts.",
        topics: [],
        rooms: [
          {
            name: "Tashkent",
            description:
              "The modern capital—merge ancient wisdom with urban strategy to win big!",
          },
          {
            name: "Samarkand",
            description:
              "A jewel of the Silk Road—trade brilliance for brilliance in a city of legends!",
          },
          {
            name: "Bukhara",
            description:
              "Where history lives—craft timeless moves in this ancient center of knowledge.",
          },
          {
            name: "Khiva",
            description:
              "A fortress of strategy—defend your legacy within its majestic walls!",
          },
          {
            name: "Andijan",
            description:
              "Eastern energy meets sharp tactics—power your way through the Fergana Valley!",
          },
          {
            name: "Nukus",
            description:
              "Out in the wild west—uncover hidden art and surprise your opponents!",
          },
          {
            name: "Namangan",
            description:
              "Industrial drive and creative plays—forge a path to victory!",
          },
          {
            name: "Termez",
            description:
              "A crossroads of cultures—blend ancient insights with modern strategy.",
          },
        ],
      },
      {
        name: "Vanuatu",
        description:
          "An island nation in the Pacific Ocean, known for its volcanic landscapes, crystal-clear waters, and vibrant indigenous culture.",
        topics: [],
        rooms: [
          {
            name: "Port Vila",
            description:
              "The vibrant capital—where island politics and coastal charm shape every move!",
          },
          {
            name: "Luganville",
            description:
              "A relaxed port town—dive deep into strategy beneath the calm island vibes!",
          },
          {
            name: "Tanna",
            description:
              "Home to Mount Yasur—ignite your game with volcanic energy and bold plays!",
          },
          {
            name: "Espiritu Santo",
            description:
              "White sand, blue holes, and clear strategy—navigate paradise with purpose!",
          },
          {
            name: "Malekula",
            description:
              "Cultural crossroads—use tradition and cunning to outwit the competition!",
          },
          {
            name: "Pentecost",
            description:
              "Leap into victory—where land diving meets daring game moves!",
          },
          {
            name: "Ambrym",
            description:
              "The island of fire and magic—summon your strategy in a land of mystery!",
          },
        ],
      },
      {
        name: "Vatican City",
        description:
          "The smallest country in the world, an independent city-state within Rome, known for its religious importance, Renaissance art, and spiritual influence.",
        topics: [],
        rooms: [
          {
            name: "St. Peter's Basilica",
            description:
              "The heart of the Vatican—build your strategy under the dome of greatness!",
          },
          {
            name: "Sistine Chapel",
            description:
              "Masterpiece moves only—paint your path to victory with divine precision!",
          },
          {
            name: "Vatican Museums",
            description:
              "A treasure trove of clues and cunning—outwit opponents through art and artifacts!",
          },
          {
            name: "Apostolic Palace",
            description:
              "Navigate secret chambers and holy halls—be the ultimate strategist in the Pope’s residence!",
          },
          {
            name: "St. Peter's Square",
            description:
              "Open space, infinite possibilities—command attention and control the crowd!",
          },
        ],
      },
      {
        name: "Venezuela",
        description:
          "A country in South America, known for its immense oil reserves, dramatic landscapes, and rich cultural identity.",
        topics: [],
        rooms: [
          {
            name: "Caracas",
            description:
              "The bustling capital—where sharp minds and bold moves rule the board!",
          },
          {
            name: "Maracaibo",
            description:
              "Fuel your strategy in the oil capital—power up and play strong!",
          },
          {
            name: "Valencia",
            description:
              "Industrial strength meets clever tactics—build your way to victory!",
          },
          {
            name: "Barquisimeto",
            description:
              "The musical city—compose a symphony of smart plays and swift action!",
          },
          {
            name: "Mérida",
            description:
              "Nestled in the Andes—climb to the top with high-altitude strategy!",
          },
          {
            name: "Puerto La Cruz",
            description:
              "A coastal paradise—set sail on a journey of smooth moves and surprise wins!",
          },
          {
            name: "Ciudad Guayana",
            description:
              "Forge your path in the land of industry and rivers—where strategy flows!",
          },
          {
            name: "Cumaná",
            description:
              "The oldest city in South America—where history inspires winning plays!",
          },
        ],
      },
      {
        name: "Vietnam",
        description:
          "A country in Southeast Asia, known for its rich history, flavorful cuisine, and breathtaking landscapes from mountains to coast.",
        topics: [],
        rooms: [
          {
            name: "Hanoi",
            description:
              "The historic capital—balance tradition and tactics in the heart of the north!",
          },
          {
            name: "Ho Chi Minh City",
            description:
              "Fast-paced and full of flavor—lead your revolution to victory in the south!",
          },
          {
            name: "Da Nang",
            description:
              "Where mountains meet sea—craft the perfect coastal strategy!",
          },
          {
            name: "Hue",
            description:
              "The imperial city—make royal moves in a land of ancient dynasties!",
          },
          {
            name: "Nha Trang",
            description:
              "Sun, surf, and strategy—dominate with cool island energy!",
          },
          {
            name: "Can Tho",
            description:
              "In the heart of the Mekong—navigate waterways and outwit with fluid plays!",
          },
          {
            name: "Ha Long",
            description:
              "Sail through scenic mind games—win among limestone wonders!",
          },
          {
            name: "Vung Tau",
            description:
              "A seaside escape with sharp moves—relax and rise to the top!",
          },
        ],
      },
      {
        name: "Yemen",
        description:
          "A country in the Arabian Peninsula, known for its ancient trade routes, unique architecture, and resilient culture.",
        topics: [],
        rooms: [
          {
            name: "Sana'a",
            description:
              "The ancient capital—play among towering mudbrick skyscrapers and timeless strategy!",
          },
          {
            name: "Aden",
            description:
              "The coastal gateway—ride the tides of history and make bold maritime moves!",
          },
          {
            name: "Taiz",
            description:
              "City of culture and resilience—craft smart plays under pressure!",
          },
          {
            name: "Al Hudaydah",
            description: "Port-side power plays—trade, adapt, and conquer!",
          },
          {
            name: "Mukalla",
            description:
              "A hidden gem on the Arabian Sea—quiet tactics, big impact!",
          },
          {
            name: "Ibb",
            description:
              "The green heart of Yemen—grow your influence in the highlands!",
          },
          {
            name: "Marib",
            description:
              "Land of ancient kingdoms—unearth legendary moves in the desert sands!",
          },
          {
            name: "Sa'dah",
            description:
              "Northern stronghold—defend your position with ironclad focus!",
          },
        ],
      },
      {
        name: "Zambia",
        description:
          "A landlocked country in Southern Africa, known for its incredible wildlife, national parks, and the majestic Victoria Falls.",
        topics: [],
        rooms: [
          {
            name: "Lusaka",
            description:
              "The buzzing capital—where urban hustle meets strategic muscle!",
          },
          {
            name: "Ndola",
            description:
              "The industrial powerhouse—forge ahead with strength and skill!",
          },
          {
            name: "Kitwe",
            description:
              "Copper mining central—dig deep for resources and rewards!",
          },
          {
            name: "Kabwe",
            description:
              "Historic mining town—unearth clever moves from the past!",
          },
          {
            name: "Chingola",
            description: "A mining marvel—strike rich with every smart play!",
          },
          {
            name: "Mufulira",
            description: "Where mining meets strategy—balance risk and reward!",
          },
          {
            name: "Luanshya",
            description:
              "The Copperbelt’s heart—power up and conquer the board!",
          },
          {
            name: "Livingstone",
            description:
              "Gateway to Victoria Falls—make a splash with every move!",
          },
          {
            name: "Chipata",
            description:
              "Trade crossroads—cross borders and outwit your rivals!",
          },
          {
            name: "Kasama",
            description:
              "Cultural crossroads—blend tradition and tactics for the win!",
          },
          {
            name: "Solwezi",
            description: "Mining boomtown—strike while the iron’s hot!",
          },
          {
            name: "Mansa",
            description: "Lakeside charm—navigate the waters of strategy!",
          },
          {
            name: "Mongu",
            description: "Riverside retreat—chart a course to victory!",
          },
          {
            name: "Mazabuka",
            description: "Sweet success—sugar-coated strategies await!",
          },
          {
            name: "Kafue",
            description:
              "Industrial hub—build your empire with strength and smarts!",
          },
          {
            name: "Siavonga",
            description: "Lakeside leisure—relax and reign supreme!",
          },
          {
            name: "Choma",
            description: "Southern stronghold—stand firm and strategize!",
          },
          {
            name: "Monze",
            description:
              "Fertile fields—grow your game with patience and power!",
          },
        ],
      },
      {
        name: "Zimbabwe",
        description:
          "A country in Southern Africa, known for its majestic landscapes, rich wildlife, and complex political history.",
        topics: [],
        rooms: [
          {
            name: "Harare",
            description:
              "The capital city—where bold plans and clever plays take center stage!",
          },
          {
            name: "Bulawayo",
            description:
              "The city of kings—rule the board with royal moves and historic flair!",
          },
          {
            name: "Mutare",
            description:
              "Gateway to the Eastern Highlands—scale your strategy to new heights!",
          },
          {
            name: "Gweru",
            description:
              "Heart of the Midlands—balance your tactics in this central stronghold!",
          },
          {
            name: "Kwekwe",
            description:
              "Mining and metals—forge ahead with golden strategies!",
          },
          {
            name: "Masvingo",
            description:
              "Home of Great Zimbabwe—build your empire stone by stone!",
          },
          {
            name: "Chinhoyi",
            description: "Dive into deep play in the land of mysterious caves!",
          },
          {
            name: "Victoria Falls",
            description:
              "A wonder of the world—make waves and take the leap to victory!",
          },
          {
            name: "Kariba",
            description:
              "Lakeside tactics—navigate your path with calm, cool strategy!",
          },
          {
            name: "Marondera",
            description:
              "Fertile farmlands—plant your moves and harvest success!",
          },
        ],
      },
    ],
  },
];

// premium subscription plans
const subPlans: {
  plan: Pick<
    Prisma.SubscriptionPlanCreateManyInput,
    "name" | "accountType" | "discount" | "price" | "ngnPrice" | "tier"
  >;
  feature: {
    name: string;
    items: {
      id: string;
      title: string;
      label: string;
    }[];
  };
}[] = [
    {
      plan: {
        name: "Starter",
        price: 3.99,
        ngnPrice: 5_500,
        discount: 0.1,
        accountType: UserTypeEnum.PERSONAL,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Post exposure",
            label: "Small",
          },
          {
            id: generateUniqueRef(),
            title: "Earn standard rewards",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Contains non-intrusive ads",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Send/receive friend requests in game rooms",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Premium",
        price: 8.99,
        ngnPrice: 12_250,
        discount: 0.11,
        accountType: UserTypeEnum.PERSONAL,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Post exposure",
            label: "Large",
          },
          {
            id: generateUniqueRef(),
            title: "Earn standard rewards",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Contains partial & non-intrusive ads",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Send/receive friend requests in game rooms",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Supreme",
        price: 35.99,
        ngnPrice: 50_500,
        discount: 0.12,
        accountType: UserTypeEnum.PERSONAL,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Post exposure",
            label: "Largest",
          },
          {
            id: generateUniqueRef(),
            title: "Earn standard rewards",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Contains non-intrusive ads",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Send/receive friend requests in game rooms",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Standard",
        price: 89.99,
        ngnPrice: 125_500,
        discount: 0.1,
        accountType: UserTypeEnum.BUSINESS,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Reply and profile boost",
            label: "Larger",
          },
          {
            id: generateUniqueRef(),
            title: "Priority placement in search suggestions",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Priority support for reports and issues.",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Partial Ads browsing experience",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "1 - 50 Employees",
            label: "",
          },
        ],
      },
    },

    {
      plan: {
        name: "Premium",
        price: 229.99,
        ngnPrice: 325_500,
        discount: 0.11,
        accountType: UserTypeEnum.BUSINESS,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Reply and profile boost",
            label: "Larger",
          },
          {
            id: generateUniqueRef(),
            title: "Priority placement in search suggestions",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Priority support for reports and issues.",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Partial Ads browsing experience",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "More than 50 Employees",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Supreme",
        price: 329.99,
        ngnPrice: 455_500,
        discount: 0.12,
        accountType: UserTypeEnum.BUSINESS,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Reply and profile boost",
            label: "Largest",
          },
          {
            id: generateUniqueRef(),
            title: "Priority placement in search suggestions",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Priority support for reports and issues.",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Ads-free browsing experience",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "More than 100 Employees",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Standard",
        price: 30.99,
        ngnPrice: 42_500,
        discount: 0.11,
        accountType: UserTypeEnum.GOVERNMENT,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Reply and profile boost",
            label: "Larger",
          },
          {
            id: generateUniqueRef(),
            title: "Priority placement in search suggestions",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Priority support for reports and issues.",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Partial Ads browsing experience",
            label: "",
          },
        ],
      },
    },
    {
      plan: {
        name: "Pro",
        price: 67.99,
        ngnPrice: 95_500,
        discount: 0.12,
        accountType: UserTypeEnum.GOVERNMENT,
        tier: [],
      },
      feature: {
        name: "Exclusive Experience",
        items: [
          {
            id: generateUniqueRef(),
            title: "Reply and profile boost",
            label: "Largest",
          },
          {
            id: generateUniqueRef(),
            title: "Priority placement in search suggestions",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Priority support for reports and issues.",
            label: "",
          },
          {
            id: generateUniqueRef(),
            title: "Ads-free browsing experience",
            label: "",
          },
        ],
      },
    },
  ];

const continentCountries = [
  {
    continent: {
      name: "Africa",
      code: "AF",
    },
    countries: [
      { name: "Algeria", iso2: "DZ", iso3: "DZA", emoji: "🇩🇿" },
      { name: "Angola", iso2: "AO", iso3: "AGO", emoji: "🇦🇴" },
      { name: "Benin", iso2: "BJ", iso3: "BEN", emoji: "🇧🇯" },
      { name: "Botswana", iso2: "BW", iso3: "BWA", emoji: "🇧🇼" },
      { name: "Burkina Faso", iso2: "BF", iso3: "BFA", emoji: "🇧🇫" },
      { name: "Burundi", iso2: "BI", iso3: "BDI", emoji: "🇧🇮" },
      { name: "Cabo Verde", iso2: "CV", iso3: "CPV", emoji: "🇨🇻" },
      { name: "Cameroon", iso2: "CM", iso3: "CMR", emoji: "🇨🇲" },
      {
        name: "Central African Republic",
        iso2: "CF",
        iso3: "CAF",
        emoji: "🇨🇫",
      },
      { name: "Chad", iso2: "TD", iso3: "TCD", emoji: "🇹🇩" },
      { name: "Comoros", iso2: "KM", iso3: "COM", emoji: "🇰🇲" },
      { name: "Congo", iso2: "CG", iso3: "COG", emoji: "🇨🇬" },
      { name: "Côte d'Ivoire", iso2: "CI", iso3: "CIV", emoji: "🇨🇮" },
      {
        name: "Democratic Republic of the Congo",
        iso2: "CD",
        iso3: "COD",
        emoji: "🇨🇩",
      },
      { name: "Djibouti", iso2: "DJ", iso3: "DJI", emoji: "🇩🇯" },
      { name: "Egypt", iso2: "EG", iso3: "EGY", emoji: "🇪🇬" },
      { name: "Equatorial Guinea", iso2: "GQ", iso3: "GNQ", emoji: "🇬🇶" },
      { name: "Eritrea", iso2: "ER", iso3: "ERI", emoji: "🇪🇷" },
      { name: "Eswatini", iso2: "SZ", iso3: "SWZ", emoji: "🇸🇿" },
      { name: "Ethiopia", iso2: "ET", iso3: "ETH", emoji: "🇪🇹" },
      { name: "Gabon", iso2: "GA", iso3: "GAB", emoji: "🇬🇦" },
      { name: "Gambia", iso2: "GM", iso3: "GMB", emoji: "🇬🇲" },
      { name: "Ghana", iso2: "GH", iso3: "GHA", emoji: "🇬🇭" },
      { name: "Guinea", iso2: "GN", iso3: "GIN", emoji: "🇬🇳" },
      { name: "Guinea-Bissau", iso2: "GW", iso3: "GNB", emoji: "🇬🇼" },
      { name: "Kenya", iso2: "KE", iso3: "KEN", emoji: "🇰🇪" },
      { name: "Lesotho", iso2: "LS", iso3: "LSO", emoji: "🇱🇸" },
      { name: "Liberia", iso2: "LR", iso3: "LBR", emoji: "🇱🇷" },
      { name: "Libya", iso2: "LY", iso3: "LBY", emoji: "🇱🇾" },
      { name: "Madagascar", iso2: "MG", iso3: "MDG", emoji: "🇲🇬" },
      { name: "Malawi", iso2: "MW", iso3: "MWI", emoji: "🇲🇼" },
      { name: "Mali", iso2: "ML", iso3: "MLI", emoji: "🇲🇱" },
      { name: "Mauritania", iso2: "MR", iso3: "MRT", emoji: "🇲🇷" },
      { name: "Mauritius", iso2: "MU", iso3: "MUS", emoji: "🇲🇺" },
      { name: "Morocco", iso2: "MA", iso3: "MAR", emoji: "🇲🇦" },
      { name: "Mozambique", iso2: "MZ", iso3: "MOZ", emoji: "🇲🇿" },
      { name: "Namibia", iso2: "NA", iso3: "NAM", emoji: "🇳🇦" },
      { name: "Niger", iso2: "NE", iso3: "NER", emoji: "🇳🇪" },
      { name: "Nigeria", iso2: "NG", iso3: "NGA", emoji: "🇳🇬" },
      { name: "Rwanda", iso2: "RW", iso3: "RWA", emoji: "🇷🇼" },
      { name: "Sao Tome and Principe", iso2: "ST", iso3: "STP", emoji: "🇸🇹" },
      { name: "Senegal", iso2: "SN", iso3: "SEN", emoji: "🇸🇳" },
      { name: "Seychelles", iso2: "SC", iso3: "SYC", emoji: "🇸🇨" },
      { name: "Sierra Leone", iso2: "SL", iso3: "SLE", emoji: "🇸🇱" },
      { name: "Somalia", iso2: "SO", iso3: "SOM", emoji: "🇸🇴" },
      { name: "South Africa", iso2: "ZA", iso3: "ZAF", emoji: "🇿🇦" },
      { name: "South Sudan", iso2: "SS", iso3: "SSD", emoji: "🇸🇸" },
      { name: "Sudan", iso2: "SD", iso3: "SDN", emoji: "🇸🇩" },
      { name: "Tanzania", iso2: "TZ", iso3: "TZA", emoji: "🇹🇿" },
      { name: "Togo", iso2: "TG", iso3: "TGO", emoji: "🇹🇬" },
      { name: "Tunisia", iso2: "TN", iso3: "TUN", emoji: "🇹🇳" },
      { name: "Uganda", iso2: "UG", iso3: "UGA", emoji: "🇺🇬" },
      { name: "Zambia", iso2: "ZM", iso3: "ZMB", emoji: "🇿🇲" },
      { name: "Zimbabwe", iso2: "ZW", iso3: "ZWE", emoji: "🇿🇼" },
    ],
  },
  {
    continent: {
      name: "Europe",
      code: "EU",
    },
    countries: [
      {
        name: "Albania",
        iso2: "AL",
        iso3: "ALB",
        emoji: "🇦🇱",
      },
      {
        name: "Andorra",
        iso2: "AD",
        iso3: "AND",
        emoji: "🇦🇩",
      },
      {
        name: "Austria",
        iso2: "AT",
        iso3: "AUT",
        emoji: "🇦🇹",
      },
      {
        name: "Belarus",
        iso2: "BY",
        iso3: "BLR",
        emoji: "🇧🇾",
      },
      {
        name: "Belgium",
        iso2: "BE",
        iso3: "BEL",
        emoji: "🇧🇪",
      },
      {
        name: "Bosnia and Herzegovina",
        iso2: "BA",
        iso3: "BIH",
        emoji: "🇧🇦",
      },
      {
        name: "Bulgaria",
        iso2: "BG",
        iso3: "BGR",
        emoji: "🇧🇬",
      },
      {
        name: "Croatia",
        iso2: "HR",
        iso3: "HRV",
        emoji: "🇭🇷",
      },
      {
        name: "Cyprus",
        iso2: "CY",
        iso3: "CYP",
        emoji: "🇨🇾",
      },
      {
        name: "Czech Republic",
        iso2: "CZ",
        iso3: "CZE",
        emoji: "🇨🇿",
      },
      {
        name: "Denmark",
        iso2: "DK",
        iso3: "DNK",
        emoji: "🇩🇰",
      },
      {
        name: "Estonia",
        iso2: "EE",
        iso3: "EST",
        emoji: "🇪🇪",
      },
      {
        name: "Finland",
        iso2: "FI",
        iso3: "FIN",
        emoji: "🇫🇮",
      },
      {
        name: "France",
        iso2: "FR",
        iso3: "FRA",
        emoji: "🇫🇷",
      },
      {
        name: "Germany",
        iso2: "DE",
        iso3: "DEU",
        emoji: "🇩🇪",
      },
      {
        name: "Greece",
        iso2: "GR",
        iso3: "GRC",
        emoji: "🇬🇷",
      },
      {
        name: "Hungary",
        iso2: "HU",
        iso3: "HUN",
        emoji: "🇭🇺",
      },
      {
        name: "Iceland",
        iso2: "IS",
        iso3: "ISL",
        emoji: "🇮🇸",
      },
      {
        name: "Ireland",
        iso2: "IE",
        iso3: "IRL",
        emoji: "🇮🇪",
      },
      {
        name: "Italy",
        iso2: "IT",
        iso3: "ITA",
        emoji: "🇮🇹",
      },
      {
        name: "Kosovo",
        iso2: "XK",
        iso3: "XKX",
        emoji: "🇽🇰",
      },
      {
        name: "Latvia",
        iso2: "LV",
        iso3: "LVA",
        emoji: "🇱🇻",
      },
      {
        name: "Liechtenstein",
        iso2: "LI",
        iso3: "LIE",
        emoji: "🇱🇮",
      },
      {
        name: "Lithuania",
        iso2: "LT",
        iso3: "LTU",
        emoji: "🇱🇹",
      },
      {
        name: "Luxembourg",
        iso2: "LU",
        iso3: "LUX",
        emoji: "🇱🇺",
      },
      {
        name: "Malta",
        iso2: "MT",
        iso3: "MLT",
        emoji: "🇲🇹",
      },
      {
        name: "Moldova",
        iso2: "MD",
        iso3: "MDA",
        emoji: "🇲🇩",
      },
      {
        name: "Monaco",
        iso2: "MC",
        iso3: "MCO",
        emoji: "🇲🇨",
      },
      {
        name: "Montenegro",
        iso2: "ME",
        iso3: "MNE",
        emoji: "🇲🇪",
      },
      {
        name: "Netherlands",
        iso2: "NL",
        iso3: "NLD",
        emoji: "🇳🇱",
      },
      {
        name: "North Macedonia",
        iso2: "MK",
        iso3: "MKD",
        emoji: "🇲🇰",
      },
      {
        name: "Norway",
        iso2: "NO",
        iso3: "NOR",
        emoji: "🇳🇴",
      },
      {
        name: "Poland",
        iso2: "PL",
        iso3: "POL",
        emoji: "🇵🇱",
      },
      {
        name: "Portugal",
        iso2: "PT",
        iso3: "PRT",
        emoji: "🇵🇹",
      },
      {
        name: "Romania",
        iso2: "RO",
        iso3: "ROU",
        emoji: "🇷🇴",
      },
      {
        name: "Russia",
        iso2: "RU",
        iso3: "RUS",
        emoji: "🇷🇺",
      },
      {
        name: "San Marino",
        iso2: "SM",
        iso3: "SMR",
        emoji: "🇸🇲",
      },
      {
        name: "Serbia",
        iso2: "RS",
        iso3: "SRB",
        emoji: "🇷🇸",
      },
      {
        name: "Slovakia",
        iso2: "SK",
        iso3: "SVK",
        emoji: "🇸🇰",
      },
      {
        name: "Slovenia",
        iso2: "SI",
        iso3: "SVN",
        emoji: "🇸🇮",
      },
      {
        name: "Spain",
        iso2: "ES",
        iso3: "ESP",
        emoji: "🇪🇸",
      },
      {
        name: "Sweden",
        iso2: "SE",
        iso3: "SWE",
        emoji: "🇸🇪",
      },
      {
        name: "Switzerland",
        iso2: "CH",
        iso3: "CHE",
        emoji: "🇨🇭",
      },
      {
        name: "Turkey",
        iso2: "TR",
        iso3: "TUR",
        emoji: "🇹🇷",
      },
      {
        name: "Ukraine",
        iso2: "UA",
        iso3: "UKR",
        emoji: "🇺🇦",
      },
      {
        name: "United Kingdom",
        iso2: "GB",
        iso3: "GBR",
        emoji: "🇬🇧",
      },
      {
        name: "Vatican City",
        iso2: "VA",
        iso3: "VAT",
        emoji: "🇻🇦",
      },
    ],
  },
  {
    continent: {
      name: "Asia",
      code: "AS",
    },
    countries: [
      {
        name: "Afghanistan",
        iso2: "AF",
        iso3: "AFG",
        emoji: "🇦🇫",
      },
      {
        name: "Armenia",
        iso2: "AM",
        iso3: "ARM",
        emoji: "🇦🇲",
      },
      {
        name: "Azerbaijan",
        iso2: "AZ",
        iso3: "AZE",
        emoji: "🇦🇿",
      },
      {
        name: "Bahrain",
        iso2: "BH",
        iso3: "BHR",
        emoji: "🇧🇭",
      },
      {
        name: "Bangladesh",
        iso2: "BD",
        iso3: "BGD",
        emoji: "🇧🇩",
      },
      {
        name: "Bhutan",
        iso2: "BT",
        iso3: "BTN",
        emoji: "🇧🇹",
      },
      {
        name: "Brunei",
        iso2: "BN",
        iso3: "BRN",
        emoji: "🇧🇳",
      },
      {
        name: "Cambodia",
        iso2: "KH",
        iso3: "KHM",
        emoji: "🇰🇭",
      },
      {
        name: "China",
        iso2: "CN",
        iso3: "CHN",
        emoji: "🇨🇳",
      },
      {
        name: "Georgia",
        iso2: "GE",
        iso3: "GEO",
        emoji: "🇬🇪",
      },
      {
        name: "India",
        iso2: "IN",
        iso3: "IND",
        emoji: "🇮🇳",
      },
      {
        name: "Indonesia",
        iso2: "ID",
        iso3: "IDN",
        emoji: "🇮🇩",
      },
      {
        name: "Iran",
        iso2: "IR",
        iso3: "IRN",
        emoji: "🇮🇷",
      },
      {
        name: "Iraq",
        iso2: "IQ",
        iso3: "IRQ",
        emoji: "🇮🇶",
      },
      {
        name: "Israel",
        iso2: "IL",
        iso3: "ISR",
        emoji: "🇮🇱",
      },
      {
        name: "Japan",
        iso2: "JP",
        iso3: "JPN",
        emoji: "🇯🇵",
      },
      {
        name: "Jordan",
        iso2: "JO",
        iso3: "JOR",
        emoji: "🇯🇴",
      },
      {
        name: "Kazakhstan",
        iso2: "KZ",
        iso3: "KAZ",
        emoji: "🇰🇿",
      },
      {
        name: "Kuwait",
        iso2: "KW",
        iso3: "KWT",
        emoji: "🇰🇼",
      },
      {
        name: "Kyrgyzstan",
        iso2: "KG",
        iso3: "KGZ",
        emoji: "🇰🇬",
      },
      {
        name: "Laos",
        iso2: "LA",
        iso3: "LAO",
        emoji: "🇱🇦",
      },
      {
        name: "Lebanon",
        iso2: "LB",
        iso3: "LBN",
        emoji: "🇱🇧",
      },
      {
        name: "Malaysia",
        iso2: "MY",
        iso3: "MYS",
        emoji: "🇲🇾",
      },
      {
        name: "Maldives",
        iso2: "MV",
        iso3: "MDV",
        emoji: "🇲🇻",
      },
      {
        name: "Mongolia",
        iso2: "MN",
        iso3: "MNG",
        emoji: "🇲🇳",
      },
      {
        name: "Myanmar",
        iso2: "MM",
        iso3: "MMR",
        emoji: "🇲🇲",
      },
      {
        name: "Nepal",
        iso2: "NP",
        iso3: "NPL",
        emoji: "🇳🇵",
      },
      {
        name: "North Korea",
        iso2: "KP",
        iso3: "PRK",
        emoji: "🇰🇵",
      },
      {
        name: "Oman",
        iso2: "OM",
        iso3: "OMN",
        emoji: "🇴🇲",
      },
      {
        name: "Pakistan",
        iso2: "PK",
        iso3: "PAK",
        emoji: "🇵🇰",
      },
      {
        name: "Palestine",
        iso2: "PS",
        iso3: "PSE",
        emoji: "🇵🇸",
      },
      {
        name: "Philippines",
        iso2: "PH",
        iso3: "PHL",
        emoji: "🇵🇭",
      },
      {
        name: "Qatar",
        iso2: "QA",
        iso3: "QAT",
        emoji: "🇶🇦",
      },
      {
        name: "Saudi Arabia",
        iso2: "SA",
        iso3: "SAU",
        emoji: "🇸🇦",
      },
      {
        name: "Singapore",
        iso2: "SG",
        iso3: "SGP",
        emoji: "🇸🇬",
      },
      {
        name: "South Korea",
        iso2: "KR",
        iso3: "KOR",
        emoji: "🇰🇷",
      },
      {
        name: "Sri Lanka",
        iso2: "LK",
        iso3: "LKA",
        emoji: "🇱🇰",
      },
      {
        name: "Syria",
        iso2: "SY",
        iso3: "SYR",
        emoji: "🇸🇾",
      },
      {
        name: "Taiwan",
        iso2: "TW",
        iso3: "TWN",
        emoji: "🇹🇼",
      },
      {
        name: "Tajikistan",
        iso2: "TJ",
        iso3: "TJK",
        emoji: "🇹🇯",
      },
      {
        name: "Thailand",
        iso2: "TH",
        iso3: "THA",
        emoji: "🇹🇭",
      },
      {
        name: "Timor-Leste",
        iso2: "TL",
        iso3: "TLS",
        emoji: "🇹🇱",
      },
      {
        name: "Turkmenistan",
        iso2: "TM",
        iso3: "TKM",
        emoji: "🇹🇲",
      },
      {
        name: "United Arab Emirates",
        iso2: "AE",
        iso3: "ARE",
        emoji: "🇦🇪",
      },
      {
        name: "Uzbekistan",
        iso2: "UZ",
        iso3: "UZB",
        emoji: "🇺🇿",
      },
      {
        name: "Vietnam",
        iso2: "VN",
        iso3: "VNM",
        emoji: "🇻🇳",
      },
      {
        name: "Yemen",
        iso2: "YE",
        iso3: "YEM",
        emoji: "🇾🇪",
      },
    ],
  },
  {
    continent: {
      name: "North America",
      code: "NA",
    },
    countries: [
      {
        name: "United States",
        iso2: "US",
        iso3: "USA",
        emoji: "🇺🇸",
      },
      {
        name: "Canada",
        iso2: "CA",
        iso3: "CAN",
        emoji: "🇨🇦",
      },
      {
        name: "Mexico",
        iso2: "MX",
        iso3: "MEX",
        emoji: "🇲🇽",
      },
      {
        name: "Guatemala",
        iso2: "GT",
        iso3: "GTM",
        emoji: "🇬🇹",
      },
      {
        name: "Cuba",
        iso2: "CU",
        iso3: "CUB",
        emoji: "🇨🇺",
      },
      {
        name: "Haiti",
        iso2: "HT",
        iso3: "HTI",
        emoji: "🇭🇹",
      },
      {
        name: "Dominican Republic",
        iso2: "DO",
        iso3: "DOM",
        emoji: "🇩🇴",
      },
      {
        name: "Honduras",
        iso2: "HN",
        iso3: "HND",
        emoji: "🇭🇳",
      },
      {
        name: "Jamaica",
        iso2: "JM",
        iso3: "JAM",
        emoji: "🇯🇲",
      },
      {
        name: "El Salvador",
        iso2: "SV",
        iso3: "SLV",
        emoji: "🇸🇻",
      },
      {
        name: "Costa Rica",
        iso2: "CR",
        iso3: "CRI",
        emoji: "🇨🇷",
      },
      {
        name: "Panama",
        iso2: "PA",
        iso3: "PAN",
        emoji: "🇵🇦",
      },
      {
        name: "Nicaragua",
        iso2: "NI",
        iso3: "NIC",
        emoji: "🇳🇮",
      },
      {
        name: "Belize",
        iso2: "BZ",
        iso3: "BLZ",
        emoji: "🇧🇿",
      },
      {
        name: "Bahamas",
        iso2: "BS",
        iso3: "BHS",
        emoji: "🇧🇸",
      },
      {
        name: "Barbados",
        iso2: "BB",
        iso3: "BRB",
        emoji: "🇧🇧",
      },
      {
        name: "Trinidad and Tobago",
        iso2: "TT",
        iso3: "TTO",
        emoji: "🇹🇹",
      },
      {
        name: "Saint Lucia",
        iso2: "LC",
        iso3: "LCA",
        emoji: "🇱🇨",
      },
      {
        name: "Grenada",
        iso2: "GD",
        iso3: "GRD",
        emoji: "🇬🇩",
      },
      {
        name: "Saint Vincent and the Grenadines",
        iso2: "VC",
        iso3: "VCT",
        emoji: "🇻🇨",
      },
      {
        name: "Antigua and Barbuda",
        iso2: "AG",
        iso3: "ATG",
        emoji: "🇦🇬",
      },
      {
        name: "Dominica",
        iso2: "DM",
        iso3: "DMA",
        emoji: "🇩🇲",
      },
      {
        name: "Saint Kitts and Nevis",
        iso2: "KN",
        iso3: "KNA",
        emoji: "🇰🇳",
      },
    ],
  },
  {
    continent: {
      name: "South America",
      code: "SA",
    },
    countries: [
      {
        name: "Brazil",
        iso2: "BR",
        iso3: "BRA",
        emoji: "🇧🇷",
      },
      {
        name: "Argentina",
        iso2: "AR",
        iso3: "ARG",
        emoji: "🇦🇷",
      },
      {
        name: "Colombia",
        iso2: "CO",
        iso3: "COL",
        emoji: "🇨🇴",
      },
      {
        name: "Peru",
        iso2: "PE",
        iso3: "PER",
        emoji: "🇵🇪",
      },
      {
        name: "Venezuela",
        iso2: "VE",
        iso3: "VEN",
        emoji: "🇻🇪",
      },
      {
        name: "Chile",
        iso2: "CL",
        iso3: "CHL",
        emoji: "🇨🇱",
      },
      {
        name: "Ecuador",
        iso2: "EC",
        iso3: "ECU",
        emoji: "🇪🇨",
      },
      {
        name: "Bolivia",
        iso2: "BO",
        iso3: "BOL",
        emoji: "🇧🇴",
      },
      {
        name: "Paraguay",
        iso2: "PY",
        iso3: "PRY",
        emoji: "🇵🇾",
      },
      {
        name: "Uruguay",
        iso2: "UY",
        iso3: "URY",
        emoji: "🇺🇾",
      },
      {
        name: "Guyana",
        iso2: "GY",
        iso3: "GUY",
        emoji: "🇬🇾",
      },
      {
        name: "Suriname",
        iso2: "SR",
        iso3: "SUR",
        emoji: "🇸🇷",
      },
      {
        name: "Falkland Islands",
        iso2: "FK",
        iso3: "FLK",
        emoji: "🇫🇰",
      },
    ],
  },

  {
    continent: {
      name: "Australia/Oceania",
      code: "OC",
    },
    countries: [
      {
        name: "Australia",
        iso2: "AU",
        iso3: "AUS",
        emoji: "🇦🇺",
      },
      {
        name: "New Zealand",
        iso2: "NZ",
        iso3: "NZL",
        emoji: "🇳🇿",
      },
      {
        name: "Fiji",
        iso2: "FJ",
        iso3: "FJI",
        emoji: "🇫🇯",
      },
      {
        name: "Papua New Guinea",
        iso2: "PG",
        iso3: "PNG",
        emoji: "🇵🇬",
      },
      {
        name: "Samoa",
        iso2: "WS",
        iso3: "WSM",
        emoji: "🇼🇸",
      },
      {
        name: "Tonga",
        iso2: "TO",
        iso3: "TON",
        emoji: "🇹🇴",
      },
      {
        name: "Solomon Islands",
        iso2: "SB",
        iso3: "SLB",
        emoji: "🇸🇧",
      },
      {
        name: "Vanuatu",
        iso2: "VU",
        iso3: "VUT",
        emoji: "🇻🇺",
      },
      {
        name: "Micronesia",
        iso2: "FM",
        iso3: "FSM",
        emoji: "🇫🇲",
      },
      {
        name: "Palau",
        iso2: "PW",
        iso3: "PLW",
        emoji: "🇵🇼",
      },
      {
        name: "Marshall Islands",
        iso2: "MH",
        iso3: "MHL",
        emoji: "🇲🇭",
      },
      {
        name: "Kiribati",
        iso2: "KI",
        iso3: "KIR",
        emoji: "🇰🇮",
      },
      {
        name: "Nauru",
        iso2: "NR",
        iso3: "NRU",
        emoji: "🇳🇷",
      },
      {
        name: "Tuvalu",
        iso2: "TV",
        iso3: "TUV",
        emoji: "🇹🇻",
      },
    ],
  },
];

// Random function
function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/** Normalize all existing room labels in place, preserving Country Mania names. */
export async function syncGenericGameRooms(tx: Prisma.TransactionClient) {
  const definitions = new Map(games.filter(game => game.name !== "Country Mania").flatMap(game =>
    game.categories.map(category => [JSON.stringify([game.name, category.name]), category] as const)
  ));
  const categories = await tx.gameCategory.findMany({
    where: {game: {name: {not: "Country Mania"}}},
    select: {
      id: true, name: true, description: true, game: {select: {name: true}},
      rooms: {
        orderBy: [{createdAt: "asc"}, {id: "asc"}],
        select: {id: true, name: true, description: true},
      },
    },
  });
  let categoriesUpdated = 0;
  const roomUpdates: {id: string; name: string; description: string}[] = [];
  for (const category of categories) {
    const definition = definitions.get(JSON.stringify([category.game.name, category.name]));
    if (definition && category.description !== definition.description) {
      await tx.gameCategory.update({where: {id: category.id}, data: {description: definition.description}});
      categoriesUpdated++;
    }
    const labels = genericGameRooms(category.name, category.rooms.length, category.game.name === "MindMash");
    category.rooms.forEach((room, index) => {
      const label = labels[index];
      if (room.name !== label.name || room.description !== label.description) {
        roomUpdates.push({id: room.id, ...label});
      }
    });
  }
  // Batch writes to avoid thousands of database round trips during deployment.
  let roomsUpdated = 0;
  for (let offset = 0; offset < roomUpdates.length; offset += 200) {
    const values = roomUpdates.slice(offset, offset + 200).map(room =>
      Prisma.sql`(${room.id}, ${room.name}, ${room.description})`
    );
    roomsUpdated += await tx.$executeRaw(Prisma.sql`
      UPDATE "GameRoom" AS room
      SET "name" = labels.name, "description" = labels.description, "updatedAt" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values)}) AS labels(id, name, description)
      WHERE room.id = labels.id
    `);
  }
  console.log(`Game room labels: updated ${categoriesUpdated} categories and ${roomsUpdated} rooms.`);
  return {categoriesUpdated, roomsUpdated};
}

/** Add seed topics to existing categories without recreating games or rooms. */
export async function syncGameCategoryTopics(
  tx: Prisma.TransactionClient,
  seedGames: { name: string; categories: { name: string; topics: string[] }[] }[] = games
) {
  const definitions = new Map<string, string[]>();
  for (const game of seedGames) {
    for (const category of game.categories) {
      const key = JSON.stringify([game.name, category.name]);
      const topics = [...new Set(category.topics.map(topic => topic.trim()).filter(Boolean))];
      if (topics.length) definitions.set(key, [...new Set([...(definitions.get(key) ?? []), ...topics])]);
    }
  }
  const categories = await tx.gameCategory.findMany({
    where: { game: { name: { in: seedGames.map(game => game.name) } } },
    select: { id: true, name: true, topics: true, game: { select: { name: true } } },
  });
  let updated = 0;
  let added = 0;
  const matched = new Set<string>();
  for (const category of categories) {
    const key = JSON.stringify([category.game.name, category.name]);
    const seedTopics = definitions.get(key);
    if (!seedTopics) continue;
    matched.add(key);
    const missing = seedTopics.filter(topic => !category.topics.includes(topic));
    if (!missing.length) continue;
    await tx.gameCategory.update({
      where: { id: category.id },
      data: { topics: [...category.topics, ...missing] },
    });
    updated++;
    added += missing.length;
  }
  const missingCategories = definitions.size - matched.size;
  console.log(`Game topics: updated ${updated} categories, added ${added} topics; ${missingCategories} seed categories not found in database.`);
  return { updated, added, missingCategories };
}

const gameBannerFiles: Record<string, string> = {
  "Trivia & Quiz": "trivia-and-quiz.webp",
  "Acronym Arcade": "acronym-arcade.webp",
  "Academia Adventure": "academia-adventure.webp",
  "Sports & Games": "sports-and-games.webp",
  "MindMash": "mindmash.webp",
  "Country Mania": "country-mania.webp",
};

export function gameBannerThumbnail(gameName: string) {
  const filename = gameBannerFiles[gameName];
  if (!filename) return undefined;
  const base = (process.env.CLOUDFLARE_PUBLIC_MEDIA_URL || "https://media.kwonnet.com").replace(/\/+$/, "");
  return `${base}/static/games/${filename}`;
}

/** Refresh existing artwork without recreating games or changing room history. */
export async function syncGameBannerThumbnails(tx: Prisma.TransactionClient) {
  const rows = await tx.game.findMany({
    where: {name: {in: Object.keys(gameBannerFiles)}},
    select: {id: true, name: true, thumbnail: true},
  });
  let gamesUpdated = 0, categoriesUpdated = 0, roomsUpdated = 0;
  for (const game of rows) {
    const thumbnail = gameBannerThumbnail(game.name);
    if (!thumbnail) continue;
    if (game.thumbnail !== thumbnail) {
      await tx.game.update({where: {id: game.id}, data: {thumbnail}});
      gamesUpdated++;
    }
    // Country categories and their rooms use individual flags instead of the banner.
    if (game.name === "Country Mania") continue;
    const stale = {OR: [{thumbnail: null}, {thumbnail: {not: thumbnail}}]};
    const categories = await tx.gameCategory.updateMany({
      where: {gameId: game.id, ...stale}, data: {thumbnail},
    });
    const rooms = await tx.gameRoom.updateMany({
      where: {category: {gameId: game.id}, ...stale}, data: {thumbnail},
    });
    categoriesUpdated += categories.count;
    roomsUpdated += rooms.count;
  }
  console.log(`Game banners: updated ${gamesUpdated} games, ${categoriesUpdated} categories and ${roomsUpdated} rooms.`);
  return {gamesUpdated, categoriesUpdated, roomsUpdated};
}

/** Country assets match kwonweb2/public/flags; no sibling checkout is needed at deploy time. */
export function countryGameThumbnail(countryName: string) {
  const filename = countryName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = (process.env.CLOUDFLARE_PUBLIC_MEDIA_URL || "https://media.kwonnet.com").replace(/\/+$/, "");
  return `${base}/static/flags/${filename}.webp`;
}

/** Backfill thumbnails without recreating countries, rooms or game history. */
export async function syncCountryGameThumbnails(tx: Prisma.TransactionClient) {
  const categories = await tx.gameCategory.findMany({
    where: {game: {name: "Country Mania"}}, select: {id: true, name: true, thumbnail: true},
  });
  let categoriesUpdated = 0, roomsUpdated = 0;
  for (const category of categories) {
    const thumbnail = countryGameThumbnail(category.name);
    if (category.thumbnail !== thumbnail) {
      await tx.gameCategory.update({where: {id: category.id}, data: {thumbnail}});
      categoriesUpdated++;
    }
    const result = await tx.gameRoom.updateMany({
      where: {catId: category.id, OR: [{thumbnail: null}, {thumbnail: {not: thumbnail}}]},
      data: {thumbnail},
    });
    roomsUpdated += result.count;
  }
  console.log(`Country flags: updated ${categoriesUpdated} categories and ${roomsUpdated} rooms.`);
  return {categoriesUpdated, roomsUpdated};
}

async function seedReferenceData(prisma: Prisma.TransactionClient) {
    await prisma.chargeRate.upsert({where:{id:"default"},update:{},create:{id:"default"}});
    // seed coin packages
    const totalPackages = await prisma.coinPackage.count();
    if (totalPackages === 0) {
      await prisma.coinPackage.createMany({ data: coinPackages });
      console.log("seeding complete.... coin packages created successfully");
    } else {
      console.log("Seeding complete .... coin packages  already exists");
    }

    await seedTipPackages(prisma);

    // seed game milestones
    const totalMilestones = await prisma.gameMilestone.count();
    if (totalMilestones === 0) {
      await prisma.gameMilestone.createMany({ data: gameMilestones });
      console.log("seeding complete.... game milestones created successfully");
    } else {
      console.log("Seeding complete.... game milestones  already exists");
    }
    // seed game
    const totalGames = await prisma.game.count();
    if (totalGames === 0) {
      for (let index = 0; index < games.length; index++) {
        const el = games[index];
        const gameName = el.name.toLocaleLowerCase();
        const isAcronym = gameName.startsWith("acronym");
        await prisma.game.create({
          data: {
            name: el.name,
            thumbnail: gameBannerThumbnail(el.name),
            description: el.description,
            modes: isAcronym
              ? [GameMode.MULTI]
              : [GameMode.MULTI, GameMode.SINGLE],
            categories: {
              create: el.categories.map((item) => ({
                name: item.name,
                description: item.description,
                topics: item.topics,
                thumbnail: el.name === "Country Mania" ? countryGameThumbnail(item.name) : gameBannerThumbnail(el.name),
                rooms: { create: item.rooms.map(room => ({...room,
                  thumbnail: el.name === "Country Mania" ? countryGameThumbnail(item.name) : gameBannerThumbnail(el.name),
                })) },
              })),
            },
          },
        });
      }
      console.log("seeding complete.... games created successfully");
    } else {
      console.log("Seeding complete.... games  already exists");
    }
    await syncGenericGameRooms(prisma);
    await syncGameCategoryTopics(prisma);
    await syncGameBannerThumbnails(prisma);
    await syncCountryGameThumbnails(prisma);
    // seed app subscriptions
    const plans = await prisma.subscriptionPlan.count();
    if (plans === 0) {
      for (let { plan, feature } of subPlans) {
        await prisma.subscriptionPlan.create({
          data: { ...plan, features: { create: feature } },
        });
      }
      console.log(
        "seeding complete.... subscription plans created successfully"
      );
    } else {
      console.log("Seeding complete.... subscription plans  already exists");
    }
    // seed countries
    const countries = await prisma.country.count();
    const continents = await prisma.continent.count();
    if (continents === 0 && countries === 0) {
      for (const item of continentCountries) {
        const continent = await prisma.continent.create({
          data: item.continent,
        });
        await prisma.country.createMany({
          data: item.countries.map((i) => ({
            ...i,
            continentId: continent.id,
          })),
        });
      }
      console.log(
        "seeding complete.... Continent & countries created successfully"
      );
    } else {
      console.log("Seeding complete.... Continent & countries  already exists");
    }
}

export async function main() {
  if (process.argv.includes("--tips")) {await seedTipPackages();return;}
  const demo = process.argv.includes("--demo");
  const topicsOnly = process.argv.includes("--game-topics");
  if (demo && topicsOnly) throw new Error("Choose either --demo or --game-topics");
  if (demo && process.env.NODE_ENV === "production") {
    throw new Error("Demo seeding is disabled in production");
  }
  // Serialize release seeds and roll back reference data together on failure.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73190241)`;
    if (topicsOnly) await syncGameCategoryTopics(tx);
    else await seedReferenceData(tx);
  }, { timeout: 300000, maxWait: 10000 });
  if (!demo) return;
    // send users
    const userCount = await prisma.user.count();
    if (userCount < 10) {
      const uniqueEmails = faker.helpers.uniqueArray(faker.internet.email, 100); // will generate 1000 unique email addresses
      const uniqueUsernames = faker.helpers.uniqueArray(
        faker.internet.username,
        100
      ); // will generate 1000 unique email addresses
      const fakeUsers = Array.from({ length: 100 }, (_, i) => ({
        name: faker.person.fullName(),
        email: uniqueEmails[i] ?? faker.internet.email(),
        username: uniqueUsernames[i] ?? faker.internet.username(),
        avatar: faker.image.avatar(),
        password:
          "$2b$10$0BSAg6Mu3K4k83FsLIVRl.642jOuCNRYF0tV9B4xKtdK9IO1UI6Zq",
      }));
      const result = await Promise.all(
        fakeUsers.map((user) => {
          return prisma.user.create({
            data: {
              ...user,
              wallet: { create: { bonus: 100 } },
            },
          });
        })
      );
      console.log(
        `seeding complete ${result.length}.... users created successfully`
      );
    } else {
      console.log("Seeding complete.... users already exists");
    }
    // seed posts
    // send users
    const users = await prisma.user.findMany({ select: { id: true } });
    const postCount = await prisma.post.count();
    if (users.length > 0 && postCount === 0) {
      const shuffledUsers = users?.map((item) => item.id)
      const postData = dummyPosts.map((content) => ({
        kind: PostKindEnum.ROOT,
        type: PostTypeEnum.CONTENT,
        userId: getRandomElement(shuffledUsers),
        content,
      }));

      const result = await prisma.post.createMany({
        data: postData,
      });

      console.log(
        `seeding complete ${result.count}.... posts created successfully`
      );
    } else {
      console.log("Seeding complete.... posts already exists");
    }
}

export async function seedTipPackages(client?:Prisma.TransactionClient) {
  const sync=async(tx:Prisma.TransactionClient)=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73190241)`;
    // Snapshot old gift names/assets before deleting their catalog entries.
    await tx.$executeRaw`UPDATE "PostTip" t SET "giftName"=COALESCE(t."giftName",p.name), "giftThumbnail"=COALESCE(t."giftThumbnail",p.thumbnail), "giftCoinsSnapshot"=COALESCE(t."giftCoinsSnapshot",p.price) FROM "TipPackage" p WHERE t."tipId"=p.id`;
    for(const gift of tipPackages) await tx.tipPackage.upsert({where:{id:gift.id},create:gift,update:{...gift,isActive:true,endDate:null}});
    await tx.tipPackage.deleteMany({where:{id:{notIn:tipPackages.map(gift=>gift.id)}}});
  };
  if(client)await sync(client);else await prisma.$transaction(sync,{timeout:300000,maxWait:10000});
  console.log(`Gift catalog synchronized: ${tipPackages.length} gifts`);
}

if (require.main === module) {
  async function runSeed(){try{await main();}catch(error:any){console.error("Error seeding data",error?.message);process.exitCode=1;}finally{await prisma.$disconnect();}}
  runSeed();
}

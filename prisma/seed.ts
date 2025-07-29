import {
  GameMilestone,
  GameMode,
  MilestoneNameEnum,
  PrismaClient,
  RewardReasonEnum,
  RewardTypeEnum,
  SubscriptionPlan,
  UserTypeEnum,
} from "@prisma/client";
import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

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


const coinPackages = [
  {
    name: "Starter Pack",
    amount: 30,
    price: 0.42,
    bonus: 25,
    ngnBonus: 12,
    ngnPrice: 560,
  },
  {
    name: "Bronze Pack",
    amount: 85,
    price: 1.18,
    bonus: 35,
    ngnBonus: 22,
    ngnPrice: 1_590,
  },

  {
    name: "Silver Pack",
    amount: 100,
    price: 1.37,
    bonus: 85,
    ngnBonus: 45,
    ngnPrice: 1_950,
  },
  {
    name: "Gold Pack",
    amount: 277,
    price: 3.75,
    bonus: 99,
    ngnBonus: 67,
    ngnPrice: 5_515,
  },
  {
    name: "Elite Pack",
    amount: 320,
    price: 4.32,
    bonus: 113,
    ngnBonus: 88,
    ngnPrice: 6_315,
  },
  {
    name: "Pro Pack",
    amount: 635,
    price: 8.57,
    bonus: 145,
    ngnBonus: 102,
    ngnPrice: 12_640,
  },
  {
    name: "Mega Pack",
    amount: 1280,
    price: 17.15,
    bonus: 387,
    ngnBonus: 223,
    ngnPrice: 25_550,
  },
  {
    name: "Ultra Pack",
    amount: 5305,
    price: 70.5,
    bonus: 467,
    ngnBonus: 392,
    ngnPrice: 103_325,
  },
  {
    name: "Master Pack",
    amount: 10505,
    price: 138.6,
    bonus: 543,
    ngnBonus: 469,
    ngnPrice: 200_690,
  },
  {
    name: "Legend Pack",
    amount: 25500,
    price: 336.6,
    bonus: 799,
    ngnBonus: 677,
    ngnPrice: 475_390,
  },
  {
    name: "Titan Pack",
    amount: 70000,
    price: 915,
    bonus: 2230,
    ngnBonus: 1450,
    ngnPrice: 1_308_000,
  },
  {
    name: "Giant Pack",
    amount: 100_000,
    price: 1300,
    bonus: 3200,
    ngnBonus: 2100,
    ngnPrice: 1_860_000,
  },
  {
    name: "Colossal Pack",
    amount: 145_000,
    price: 1870.5,
    bonus: 4700,
    ngnBonus: 2800,
    ngnPrice: 2_690_250,
  },
  {
    name: "Zenith Pack",
    amount: 187_000,
    price: 2393.6,
    bonus: 5300,
    ngnBonus: 3720,
    ngnPrice: 3_450_440,
  },
  {
    name: "Infinity Pack",
    amount: 205_000,
    price: 2605.3,
    bonus: 7432,
    ngnBonus: 5333,
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

const tipPackages = [
  { name: "Spark Drop", price: 5 },
  { name: "Pulse Stone", price: 10 },
  { name: "Bronze Ember", price: 25 },
  { name: "Silver Blaze", price: 50 },
  { name: "Golden Flame", price: 1_636 },
  { name: "Crystal Crown", price: 3_788 },
  { name: "Nova Charge", price: 5_372 },
  { name: "Starlight Burst", price: 10_397 },
  { name: "Radiant Surge", price: 15_489 },
  { name: "Mystic Vault", price: 19_735 },
  { name: "Echo Halo", price: 22_592 },
  { name: "Titan Beam", price: 27_876 },
  { name: "Giant Gleam", price: 30_320 },
  { name: "Colossal Blaze", price: 32_000 },
  { name: "Zenith Flash", price: 38_600 },
  { name: "Infinity Pulse", price: 45_500 },
];

const gameMilestones = [
  // room winning streak
  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIVE_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 20,
    milestone: 5,
    thumbnail: "/static/trophies/silver-4.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TEN_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 30,
    milestone: 10,
    thumbnail: "/static/trophies/silver-3.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TWENTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 55,
    milestone: 20,
    thumbnail: "/static/trophies/silver-2.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIFTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 75,
    milestone: 50,
    thumbnail: "/static/trophies/silver-1.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.HUNDRED_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 100,
    milestone: 100,
    thumbnail: "/static/trophies/gold-1.jpeg",
  },

  // week
  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.TOP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 150,
    milestone: 1,
    thumbnail: "/static/trophies/gold-1.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 135,
    milestone: 2,
    thumbnail: "/static/trophies/gold-2.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 110,
    milestone: 3,
    thumbnail: "/static/trophies/gold-3.jpeg",
  },

  // Month
  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.TOP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 770,
    milestone: 1,
    thumbnail: "/static/trophies/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 539,
    milestone: 2,
    thumbnail: "/static/trophies/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.COINS,
    reward: 385,
    milestone: 3,
    thumbnail: "/static/trophies/gold-6.jpeg",
  },

  // Year
  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.TOP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 1539,
    milestone: 1,
    thumbnail: "/static/trophies/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 1231,
    milestone: 2,
    thumbnail: "/static/trophies/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 924,
    milestone: 3,
    thumbnail: "/static/trophies/gold-6.jpeg",
  },
  //   champ
  {
    name: MilestoneNameEnum.CHAMP,
    reason: RewardReasonEnum.CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 2308,
    milestone: 1,
    thumbnail: "/static/trophies/diamond-1.jpeg",
  },

  {
    name: MilestoneNameEnum.GRAND_CHAMP,
    reason: RewardReasonEnum.GRAND_CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 3847,
    milestone: 1,
    thumbnail: "/static/trophies/diamond-2.jpeg",
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
        rooms: [
          {
            name: "Mystery Mansion",
            description: "Solve the riddles to escape the haunted house.",
          },
          {
            name: "Space Expedition",
            description: "Explore the galaxy and uncover hidden treasures.",
          },
          {
            name: "Pirate's Cove",
            description: "Search for lost pirate treasure in the open seas.",
          },
          {
            name: "Ancient Egypt",
            description: "Uncover secrets from the pyramids and the Pharaohs.",
          },
          {
            name: "Underwater Adventure",
            description: "Dive deep to discover mysterious underwater cities.",
          },
          {
            name: "Lost in Time",
            description: "Travel through time and change history.",
          },
          {
            name: "Wild West Showdown",
            description: "Outlaw duels and treasure hunts in the Wild West.",
          },
          {
            name: "The Dragon's Lair",
            description: "Battle dragons and find the enchanted artifacts.",
          },
          {
            name: "Space Station Zeta",
            description:
              "Survive a malfunction on a space station in deep space.",
          },
          {
            name: "Secret Agent Mission",
            description:
              "Complete covert missions for the intelligence agency.",
          },
          {
            name: "The Jungle Hunt",
            description:
              "Navigate the dense jungle to find rare and hidden gems.",
          },
          {
            name: "The Viking Quest",
            description:
              "Embark on a raid to discover treasures of the Norse gods.",
          },
          {
            name: "Mythical Creatures",
            description:
              "Track down and tame mythical beasts from ancient legends.",
          },
          {
            name: "Mysterious Island",
            description:
              "Stranded on an island, uncover its secrets to escape.",
          },
          {
            name: "The Alien Invasion",
            description: "Defend Earth from a wave of alien invaders.",
          },
          {
            name: "The Arctic Expedition",
            description:
              "Survive the frozen wilderness and uncover hidden treasures.",
          },
          {
            name: "Treasure Hunt",
            description:
              "Follow clues to unearth ancient treasure hidden around the world.",
          },
          {
            name: "Superhero Academy",
            description:
              "Train to become the next superhero and save the city.",
          },
          {
            name: "Secret Jungle Temple",
            description:
              "Find the ancient temple deep in the jungle and unlock its secrets.",
          },
          {
            name: "The Time Machine",
            description:
              "Hop through different eras and complete historical challenges.",
          },
          {
            name: "Haunted Forest",
            description: "Brave a haunted forest full of eerie creatures.",
          },
          {
            name: "The Sorcerer's Tower",
            description:
              "Climb the wizard's tower and face magical challenges.",
          },
          {
            name: "Steampunk City",
            description:
              "Explore a city powered by steam and mechanical wonders.",
          },
          {
            name: "Cliffside Escape",
            description: "Escape from a crumbling cliffside fortress.",
          },
          {
            name: "The Pharaoh's Curse",
            description:
              "Escape the deadly traps of the ancient Pharaoh's tomb.",
          },
          {
            name: "Mayan Mystery",
            description: "Unveil the mysteries hidden in ancient Mayan ruins.",
          },
          {
            name: "The Robot Uprising",
            description:
              "Fight back against a world taken over by rogue robots.",
          },
          {
            name: "Nautical Adventure",
            description:
              "Sail across the seas to explore new lands and treasures.",
          },
          {
            name: "Dungeon Crawl",
            description:
              "Fight through dangerous dungeons to retrieve ancient relics.",
          },
          {
            name: "Monster Hunter",
            description: "Hunt down mythical monsters lurking in the dark.",
          },
        ],
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
        rooms: [
          {
            name: "Physics Pioneers",
            description: "Explore the wonders of motion, energy, and matter.",
          },
          {
            name: "Chemistry Lab",
            description:
              "Dive into the world of atoms, elements, and reactions.",
          },
          {
            name: "Biology Explorers",
            description: "Uncover the mysteries of life and living organisms.",
          },
          {
            name: "Space Odyssey",
            description: "Journey through the cosmos and explore the universe.",
          },
          {
            name: "Earth Science Hub",
            description:
              "Learn about the planet's structure, climate, and history.",
          },
          {
            name: "Genetics Lab",
            description: "Discover the secrets of DNA and the code of life.",
          },
          {
            name: "Tech Wizards",
            description:
              "Innovate with cutting-edge technology and inventions.",
          },
          {
            name: "Environmental Quest",
            description:
              "Understand ecosystems and the importance of sustainability.",
          },
          {
            name: "Quantum Realm",
            description: "Enter the mind-bending world of quantum physics.",
          },
          {
            name: "Astronomy Club",
            description: "Gaze at the stars and uncover celestial secrets.",
          },
          {
            name: "Robotics Arena",
            description: "Build and program the machines of the future.",
          },
          {
            name: "Medical Marvels",
            description: "Learn about breakthroughs in health and medicine.",
          },
          {
            name: "Geology Rocks",
            description:
              "Study the Earth's rocks, minerals, and natural phenomena.",
          },
          {
            name: "AI Frontiers",
            description:
              "Explore artificial intelligence and machine learning.",
          },
          {
            name: "Science Trivia",
            description:
              "Test your knowledge with fun and challenging science facts.",
          },
          {
            name: "Innovation Station",
            description: "Discover inventions that changed the world.",
          },
          {
            name: "Microscope World",
            description:
              "Zoom into the microscopic universe of cells and bacteria.",
          },
          {
            name: "Weather Watchers",
            description: "Track storms, climate, and atmospheric science.",
          },
          {
            name: "Future Tech Talks",
            description: "Discuss the latest trends in futuristic technology.",
          },
          {
            name: "Engineering Minds",
            description:
              "Tackle real-world problems with creative engineering.",
          },
          {
            name: "Science Fair Lab",
            description: "Showcase your science projects and experiments.",
          },
          {
            name: "Nuclear Nexus",
            description: "Learn about nuclear energy and atomic science.",
          },
          {
            name: "Ocean Depths",
            description: "Explore marine biology and underwater ecosystems.",
          },
          {
            name: "Mathematical Wonders",
            description: "Unlock the magic of numbers and mathematical theory.",
          },
          {
            name: "Cybersecurity Central",
            description: "Dive into data protection and ethical hacking.",
          },
          {
            name: "3D Printing Zone",
            description: "Design and print amazing 3D models and prototypes.",
          },
          {
            name: "Tech Ethics Forum",
            description: "Discuss the ethics and implications of modern tech.",
          },
          {
            name: "Renewable Energy Lab",
            description: "Explore solar, wind, and sustainable power sources.",
          },
          {
            name: "Nanotech Nucleus",
            description: "Enter the tiny world of nanotechnology.",
          },
          {
            name: "Data Science Den",
            description: "Extract insights and make predictions with data.",
          },
        ],
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
        rooms: [
          {
            name: "Ancient Empires",
            description:
              "Test your knowledge of early global civilizations like Rome, Egypt, and Mesopotamia.",
          },
          {
            name: "World at War",
            description:
              "Dive into the major battles, events, and leaders of World War I and II.",
          },
          {
            name: "Lost Cities",
            description:
              "Guess the names and facts about mythical and ancient lost cities around the world.",
          },
          {
            name: "Great Explorers",
            description:
              "Match explorers to their journeys and discoveries across the globe.",
          },
          {
            name: "Country Capitals",
            description:
              "Challenge yourself to name the capital cities of countries worldwide.",
          },
          {
            name: "Historical Leaders",
            description:
              "Identify iconic leaders and their roles in shaping history.",
          },
          {
            name: "Invention Timeline",
            description:
              "Put major inventions in chronological order and guess their inventors.",
          },
          {
            name: "Map Challenge",
            description:
              "Guess the country or city based on a silhouette or map snippet.",
          },
          {
            name: "Revolutions",
            description:
              "Explore famous revolutions and the events that sparked them.",
          },
          {
            name: "Historical Quotes",
            description:
              "Match powerful quotes to historical figures who said them.",
          },
          {
            name: "World Wonders",
            description:
              "Test your knowledge of the ancient and modern wonders of the world.",
          },
          {
            name: "Colonial History",
            description:
              "Identify colonies, empires, and independence movements.",
          },
          {
            name: "Flags & Facts",
            description: "Guess the country based on its flag and a hint.",
          },
          {
            name: "Famous Battles",
            description:
              "Guess the location and significance of famous historical battles.",
          },
          {
            name: "Cultural Heritage",
            description:
              "Match cultural landmarks to their countries or origins.",
          },
          {
            name: "Political Maps",
            description:
              "Analyze historical political boundaries and changes over time.",
          },
          {
            name: "Historical Timelines",
            description: "Arrange events in the correct chronological order.",
          },
          {
            name: "Voyages & Routes",
            description: "Track famous sea and land explorations.",
          },
          {
            name: "Cold War Quiz",
            description:
              "Explore the politics, spies, and stand-offs of the Cold War era.",
          },
          {
            name: "Geography Trivia",
            description:
              "Answer geography-based questions from all over the world.",
          },
          {
            name: "City Origins",
            description:
              "Identify cities from their founding stories and namesakes.",
          },
          {
            name: "Historic Monuments",
            description: "Match famous monuments to their countries and eras.",
          },
          {
            name: "Global Empires",
            description:
              "Explore how different empires expanded and collapsed over time.",
          },
          {
            name: "Historic Inventions",
            description:
              "Guess revolutionary inventions and the people behind them.",
          },
          {
            name: "Landmarks by Continent",
            description: "Name the continent from its iconic landmarks.",
          },
          {
            name: "Timeline Blitz",
            description:
              "Fast-paced event-sequencing challenge across centuries.",
          },
          {
            name: "War Strategy",
            description:
              "Dive into strategies and turning points of historic wars.",
          },
          {
            name: "Geo Facts",
            description:
              "Quick-fire geographical facts and trivia from all regions.",
          },
          {
            name: "Rise & Fall",
            description:
              "Trace the rise and decline of civilizations and kingdoms.",
          },
          {
            name: "Historic Myths",
            description:
              "Uncover the truth behind famous historical myths and legends.",
          },
        ],
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
        rooms: [
          {
            name: "Hollywood Hits",
            description:
              "Guess acronyms inspired by blockbuster movies and famous Hollywood dialogues.",
          },
          {
            name: "TV Time",
            description:
              "Decode acronyms based on popular TV shows and their iconic moments.",
          },
          {
            name: "Chart-Topping Tunes",
            description:
              "Uncover acronyms from hit songs, artists, and music genres.",
          },
          {
            name: "Internet Memes",
            description:
              "Crack acronyms from viral memes and internet sensations.",
          },
          {
            name: "Slang Savvy",
            description:
              "Test your knowledge of trendy texting and social media slang.",
          },
          {
            name: "Streaming Stars",
            description:
              "Guess acronyms from famous series and characters on streaming platforms.",
          },
          {
            name: "Pop Icons",
            description:
              "Identify acronyms related to legendary pop culture figures and celebrities.",
          },
          {
            name: "Award Season",
            description:
              "Explore acronyms tied to award-winning movies, shows, and performances.",
          },
          {
            name: "Fandom Frenzy",
            description:
              "Guess acronyms from famous fan bases and their beloved franchises.",
          },
          {
            name: "Classic Cinema",
            description:
              "Decode acronyms from timeless movies and classic Hollywood.",
          },
          {
            name: "Social Media Buzz",
            description:
              "Uncover acronyms from trending hashtags and viral challenges.",
          },
          {
            name: "Gaming Glory",
            description:
              "Identify acronyms from iconic video games and esports legends.",
          },
          {
            name: "Retro Vibes",
            description: "Guess acronyms inspired by 80s and 90s pop culture.",
          },
          {
            name: "Blockbuster Bonanza",
            description:
              "Decode acronyms from the biggest box office hits of all time.",
          },
          {
            name: "Lyrics Labyrinth",
            description: "Unravel acronyms hidden in famous song lyrics.",
          },
          {
            name: "Animated Adventures",
            description:
              "Guess acronyms from beloved animated movies and series.",
          },
          {
            name: "Comedy Gold",
            description:
              "Identify acronyms from iconic comedians and hilarious sitcoms.",
          },
          {
            name: "Drama Queens",
            description:
              "Decode acronyms tied to emotional TV dramas and soap operas.",
          },
          {
            name: "Fashion Faves",
            description:
              "Uncover acronyms related to iconic fashion moments and designers.",
          },
          {
            name: "Romantic Classics",
            description:
              "Guess acronyms from beloved romantic movies and songs.",
          },
          {
            name: "Streaming Craze",
            description:
              "Decode acronyms from trending shows and movies on streaming platforms.",
          },
          {
            name: "Sci-Fi Spectacles",
            description:
              "Identify acronyms from legendary sci-fi movies and franchises.",
          },
          {
            name: "Fantasy Fandom",
            description:
              "Unravel acronyms from magical worlds and fantasy sagas.",
          },
          {
            name: "Superhero Spotlight",
            description:
              "Guess acronyms tied to superheroes and their epic adventures.",
          },
          {
            name: "Reality TV Drama",
            description:
              "Decode acronyms from famous reality shows and their stars.",
          },
          {
            name: "Villain Vault",
            description:
              "Identify acronyms from iconic villains and their evil plans.",
          },
          {
            name: "Musical Legends",
            description:
              "Guess acronyms from legendary bands and solo artists.",
          },
          {
            name: "Teen Trends",
            description:
              "Decode acronyms from shows, movies, and slang popular among teens.",
          },
          {
            name: "Horror Haven",
            description:
              "Identify acronyms from spine-chilling horror movies and stories.",
          },
          {
            name: "Adventure Awaits",
            description:
              "Unravel acronyms tied to epic adventure movies and characters.",
          },
          {
            name: "Action Packed",
            description:
              "Guess acronyms from thrilling action movies and series.",
          },
          {
            name: "K-Pop Craze",
            description: "Decode acronyms from famous K-Pop groups and songs.",
          },
          {
            name: "Bollywood Beats",
            description:
              "Identify acronyms from iconic Bollywood movies and stars.",
          },
          {
            name: "Slang Central",
            description:
              "Guess acronyms from global slang and internet culture.",
          },
          {
            name: "Dance Floor Anthems",
            description: "Decode acronyms from famous party and dance songs.",
          },
          {
            name: "Award Show Icons",
            description:
              "Identify acronyms from unforgettable award show moments.",
          },
          {
            name: "Cult Classics",
            description:
              "Unravel acronyms from movies and shows with a cult following.",
          },
          {
            name: "Fantasy TV Tales",
            description:
              "Guess acronyms from magical TV shows and their characters.",
          },
          {
            name: "Sitcom Spotlight",
            description:
              "Decode acronyms from beloved sitcoms and their hilarious casts.",
          },
          {
            name: "True Crime Stories",
            description:
              "Identify acronyms from gripping true crime series and podcasts.",
          },
          {
            name: "Digital Influencers",
            description:
              "Guess acronyms from famous YouTubers and TikTok stars.",
          },
          {
            name: "Streaming Binge",
            description:
              "Decode acronyms tied to binge-worthy shows and series.",
          },
          {
            name: "Texting Trends",
            description:
              "Unravel acronyms from modern texting habits and emojis.",
          },
          {
            name: "Inspirational Icons",
            description:
              "Guess acronyms from motivational figures in pop culture.",
          },
          {
            name: "Gamer's Galaxy",
            description:
              "Decode acronyms from iconic games and online communities.",
          },
          {
            name: "Epic Sagas",
            description:
              "Identify acronyms from long-running TV and movie franchises.",
          },
          {
            name: "Music Madness",
            description:
              "Guess acronyms from top-charting songs and album titles.",
          },
          {
            name: "Virtual Celebrities",
            description:
              "Decode acronyms tied to avatars and virtual influencers.",
          },
        ],
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
        rooms: [
          {
            name: "Global Bites",
            description:
              "Explore iconic dishes and drinks from different cultures.",
          },
          {
            name: "Festival Fever",
            description:
              "Dive into colorful festivals and global celebrations.",
          },
          {
            name: "Style Timeline",
            description: "Trace fashion trends from ancient to modern times.",
          },
          {
            name: "Art Epochs",
            description: "Journey through the great art movements in history.",
          },
          {
            name: "Legendary Lore",
            description: "Uncover the myths, gods, and folklore of the world.",
          },
          {
            name: "Tribal Echoes",
            description: "Learn about the traditions of indigenous tribes.",
          },
          {
            name: "Rhythm Roots",
            description:
              "Celebrate traditional dances and their cultural meanings.",
          },
          {
            name: "Cultural Cocktails",
            description: "Discover the origins of famous cultural drinks.",
          },
          {
            name: "Rituals & Rites",
            description: "Examine unique coming-of-age rituals and ceremonies.",
          },
          {
            name: "Dress Code",
            description: "See how cultural identity is reflected in clothing.",
          },
          {
            name: "Artisan Crafts",
            description:
              "Explore handmade crafts and their cultural significance.",
          },
          {
            name: "Sacred Stories",
            description: "Delve into spiritual tales and legendary figures.",
          },
          {
            name: "Modern Lifestyles",
            description:
              "Compare contemporary ways of living across countries.",
          },
          {
            name: "Cultural Icons",
            description: "Meet key figures who shaped global culture.",
          },
          {
            name: "Taste Trails",
            description: "Follow food origins through regions and traditions.",
          },
          {
            name: "Historic Fashion",
            description: "Look at what people wore in different time periods.",
          },
          {
            name: "Street Style",
            description: "Explore how culture influences urban fashion trends.",
          },
          {
            name: "Cultural Etiquette",
            description: "Understand do's and don'ts across cultures.",
          },
          {
            name: "Nomadic Lives",
            description: "Discover how nomadic groups live and move.",
          },
          {
            name: "Sacred Symbols",
            description: "Interpret the meanings behind cultural symbols.",
          },
          {
            name: "Urban Art",
            description: "Experience culture through murals and graffiti.",
          },
          {
            name: "Dance the World",
            description: "Learn how dance expresses identity and community.",
          },
          {
            name: "Myths of Nature",
            description: "Stories that explain natural phenomena through myth.",
          },
          {
            name: "Celebration Styles",
            description:
              "How weddings, birthdays, and holidays are celebrated globally.",
          },
          {
            name: "Cultural Flavors",
            description: "Fusion food and its cultural connections.",
          },
          {
            name: "Traditional Wear",
            description: "National dress and what it signifies.",
          },
          {
            name: "Legend Hunters",
            description:
              "Explore tales of creatures, heroes, and haunted places.",
          },
          {
            name: "Village Life",
            description: "The traditions and simplicity of rural lifestyles.",
          },
          {
            name: "Food Rituals",
            description: "How food is tied to religion and ceremony.",
          },
          {
            name: "Museums of the World",
            description: "Virtual tours of culture-packed museums.",
          },
        ],
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
        rooms: [
          {
            name: "Poetry Corner",
            description: "Where rhymes go to feel important.",
          },
          {
            name: "Quote Vault",
            description: "Stealing wisdom one quote at a time.",
          },
          {
            name: "Word Origins",
            description: "Because etymology is just history for nerds.",
          },
          {
            name: "Grammar Gurus",
            description: "Where the commas matter... a lot.",
          },
          { name: "Book Club", description: "We read, we judge, we sip tea." },
          { name: "Short Stories", description: "Tiny tales with big drama." },
          {
            name: "Language Lovers",
            description: "Fluent in sarcasm and three other languages.",
          },
          {
            name: "Punctuation Pros",
            description: "Saving lives, one comma at a time.",
          },
          {
            name: "Author Spotlight",
            description: "We stalk famous writers (respectfully).",
          },
          {
            name: "Literary Genres",
            description: "Pick your flavor: mystery or misery?",
          },
          { name: "Riddle Room", description: "Where confusion is the goal." },
          { name: "Poets' Society", description: "We cry in metaphors here." },
          {
            name: "Word of the Day",
            description: "Flex your vocab. Confuse your friends.",
          },
          {
            name: "Literary Debates",
            description: "Civil wars over favorite characters.",
          },
          {
            name: "Spelling Bee",
            description: "Bee-lieve in yourself. Or not.",
          },
          {
            name: "Writing Prompts",
            description: "Fuel for the next unfinished novel.",
          },
          {
            name: "World Literature",
            description: "Books from places you can't pronounce.",
          },
          {
            name: "Children's Tales",
            description: "Stories that raised us... and scarred us.",
          },
          { name: "Epic Tales", description: "Big swords. Bigger drama." },
          {
            name: "Scriptwriting 101",
            description: "Lights, camera... rewrite.",
          },
          { name: "Fan Fiction Zone", description: "Where canon goes to die." },
          {
            name: "Haiku Haven",
            description: "So few syllables. So much angst.",
          },
          {
            name: "Publishing Talk",
            description: "The dream: book deal. The reality: coffee.",
          },
          {
            name: "Flash Fiction",
            description: "Stories that end before your snack does.",
          },
          {
            name: "Language Games",
            description: "Fun with words (and occasional brain cramps).",
          },
          {
            name: "Translation Tips",
            description: "Lost in translation? We all are.",
          },
          {
            name: "Book Recommendations",
            description: "Read this or regret it forever.",
          },
          {
            name: "Dialogue Writers",
            description: "Talking to yourself, professionally.",
          },
          {
            name: "Etymology Lab",
            description: "Where words spill their ancient secrets.",
          },
          {
            name: "Poetic Devices",
            description: "It's all similes and games.",
          },
        ],
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
        rooms: [
          {
            name: "Box Office Buzz",
            description: "Test your knowledge of blockbuster hits.",
          },
          {
            name: "Sitcom Central",
            description: "Trivia from classic and modern TV comedies.",
          },
          {
            name: "Award Show Time",
            description: "Think you know your Oscars and Emmys?",
          },
          {
            name: "Director's Cut",
            description: "Explore the world of famous filmmakers.",
          },
          {
            name: "Trending Now",
            description: "Pop culture moments and viral content.",
          },
          {
            name: "Viral Vault",
            description: "Guess the video from its internet fame.",
          },
          {
            name: "Quote This!",
            description: "Name the movie from its iconic line.",
          },
          {
            name: "Game On!",
            description: "Explore the evolution of video games.",
          },
          {
            name: "TV Throwback",
            description: "Nostalgic trivia from TV's golden days.",
          },
          {
            name: "Streaming Stars",
            description: "Netflix, Hulu, and beyond.",
          },
          {
            name: "Movie Soundtracks",
            description: "Match the tune to the film.",
          },
          {
            name: "Animated Legends",
            description: "From Pixar to anime icons.",
          },
          {
            name: "Internet Icons",
            description: "Memes, creators, and digital legends.",
          },
          { name: "Reality Check", description: "Reality TV trivia showdown." },
          {
            name: "Red Carpet Ready",
            description: "Famous fashion moments & events.",
          },
          {
            name: "Cult Classics",
            description: "Obscure gems and fan favorites.",
          },
          {
            name: "TV Drama Club",
            description: "Think you know your thrillers and soaps?",
          },
          {
            name: "Hollywood History",
            description: "Golden Age to modern marvels.",
          },
          { name: "YouTube Years", description: "Milestones in online video." },
          {
            name: "Gaming Nostalgia",
            description: "Classic consoles and 8-bit memories.",
          },
          {
            name: "Voice Actors",
            description: "Guess who voiced your favorite character.",
          },
          {
            name: "Late Night Laughs",
            description: "Talk shows, skits, and viral bits.",
          },
          {
            name: "Superhero Central",
            description: "Marvel, DC, and cinematic universes.",
          },
          {
            name: "Rom-Coms & Tears",
            description: "Love stories and emotional arcs.",
          },
          { name: "Film Flops", description: "Legendary box office bombs." },
          {
            name: "Trivia Royale",
            description: "A mix of all things entertainment!",
          },
          {
            name: "Indie Vibes",
            description: "Offbeat and underrated cinema.",
          },
          {
            name: "Behind the Scenes",
            description: "Movie magic and making-of trivia.",
          },
          {
            name: "TV Show Quotes",
            description: "Match the quote to the show.",
          },
          {
            name: "Fan Fandom",
            description: "Dive into fan theories and lore.",
          },
        ],
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
        rooms: [
          {
            name: "Wildlife Wonders",
            description: "Discover fascinating creatures across the globe.",
          },
          {
            name: "Park Patrol",
            description: "Test your knowledge on famous national parks.",
          },
          {
            name: "Eco Warriors",
            description: "Explore green heroes and their missions.",
          },
          {
            name: "Ocean Deep",
            description: "Dive into the mysteries of the sea.",
          },
          {
            name: "Forest Talk",
            description: "Learn about the world's most vital trees and plants.",
          },
          {
            name: "Endangered Echoes",
            description: "Spotlight on species fighting for survival.",
          },
          {
            name: "Nature's Fury",
            description: "Quiz on natural disasters and their impact.",
          },
          {
            name: "Planet Protectors",
            description: "Topics around climate action and sustainability.",
          },
          {
            name: "Rainforest Realm",
            description: "Explore the biodiversity of rainforests.",
          },
          {
            name: "Eco Innovations",
            description: "How technology helps save the planet.",
          },
          {
            name: "Polar Pulse",
            description: "All about the Arctic, Antarctic, and melting ice.",
          },
          {
            name: "Desert Diaries",
            description: "Life and survival in Earth's driest regions.",
          },
          {
            name: "Green Legends",
            description: "Famous environmentalists and activists.",
          },
          {
            name: "Wild Tracks",
            description: "Animal migrations and their patterns.",
          },
          {
            name: "Nature's Architects",
            description: "Marvel at creatures that build and shape.",
          },
          {
            name: "Treetop Trails",
            description: "A look at canopy ecosystems and species.",
          },
          {
            name: "Savanna Stories",
            description: "Quiz on life in grassy plains and open woodlands.",
          },
          {
            name: "Coral Kingdoms",
            description: "Discover colorful reefs and marine diversity.",
          },
          {
            name: "Rewilding Earth",
            description: "Restoration of wild habitats and species.",
          },
          {
            name: "Climate Clues",
            description: "Track signs of global warming and change.",
          },
          {
            name: "Planet Earth 101",
            description: "General nature knowledge for beginners.",
          },
          {
            name: "Eco Footprint",
            description: "How our actions impact the planet.",
          },
          {
            name: "River Riddles",
            description: "Facts and mysteries about Earth's rivers.",
          },
          {
            name: "Volcano Vault",
            description: "Explore volcanic eruptions and their legacy.",
          },
          {
            name: "Sky Safari",
            description: "Birds, clouds, and weather systems above.",
          },
          {
            name: "Jungle Jigsaw",
            description: "Match species and facts from tropical jungles.",
          },
          {
            name: "Nature in Crisis",
            description: "Real-time threats and urgent conservation.",
          },
          {
            name: "Backyard Biomes",
            description: "Discover ecosystems closer than you think.",
          },
          {
            name: "Frozen Frontiers",
            description: "Quiz on glacial life and icy terrains.",
          },
          {
            name: "Planet Quizzer",
            description: "A mixed-bag challenge for nature lovers.",
          },
        ],
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
        rooms: [
          {
            name: "AI Buzz",
            description: "Talk about the latest in artificial intelligence.",
          },
          {
            name: "Tech Titans",
            description: "Discuss major tech companies and their impact.",
          },
          {
            name: "Gadget Geek",
            description: "Explore cutting-edge devices and cool gadgets.",
          },
          {
            name: "Smart Futures",
            description: "Predict how tech will change our lives.",
          },
          {
            name: "Next-Gen Energy",
            description: "Dive into solar, wind, and green energy trends.",
          },
          {
            name: "Coding Era",
            description: "Chat about software, programming, and apps.",
          },
          {
            name: "Robo World",
            description: "Explore how robots are reshaping industries.",
          },
          {
            name: "Quantum Realm",
            description: "Discuss quantum computing and its future.",
          },
          {
            name: "Digital Past",
            description: "Learn about the evolution of computers.",
          },
          {
            name: "Tech & Society",
            description: "Explore tech's impact on our daily lives.",
          },
          {
            name: "Mobile Mania",
            description: "Stay updated on the latest smartphones.",
          },
          {
            name: "AR/VR Lab",
            description: "Explore augmented and virtual reality spaces.",
          },
          {
            name: "Startup Scene",
            description: "Talk about rising tech startups and innovation.",
          },
          {
            name: "Crypto Chat",
            description: "Discuss cryptocurrency and blockchain trends.",
          },
          {
            name: "Wearables",
            description: "Smartwatches, fitness bands, and more.",
          },
          {
            name: "Home Smart",
            description: "Talk about smart homes and automation.",
          },
          {
            name: "Tech Ethics",
            description: "Debate the moral side of innovation.",
          },
          {
            name: "Space Tech",
            description: "Explore rockets, satellites, and beyond.",
          },
          {
            name: "BioTech Buzz",
            description: "Where biology meets high-tech solutions.",
          },
          { name: "EdTech", description: "Technology transforming education." },
          {
            name: "Health Tech",
            description: "Gadgets and apps improving healthcare.",
          },
          {
            name: "Tech Events",
            description: "Share insights from tech conferences.",
          },
          {
            name: "5G Talk",
            description: "What 5G means for devices and speed.",
          },
          {
            name: "Future Jobs",
            description: "Tech roles shaping tomorrow's workforce.",
          },
          {
            name: "E-Waste Watch",
            description: "How to manage tech waste and recycling.",
          },
          {
            name: "Game Tech",
            description: "Discuss gaming hardware and software.",
          },
          {
            name: "Drones & Beyond",
            description: "From aerial footage to deliveries.",
          },
          {
            name: "AI & Art",
            description: "Explore how AI is revolutionizing creativity.",
          },
          {
            name: "Green Tech",
            description: "Innovations tackling climate change.",
          },
          {
            name: "Tech Throwbacks",
            description: "Nostalgia and retro technology.",
          },
        ],
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
        rooms: [
          {
            name: "Cultural Currents",
            description: "Explore evolving customs across continents.",
          },
          {
            name: "Sacred Spaces",
            description: "Dive into world religions and sacred practices.",
          },
          {
            name: "Royal Realms",
            description: "Meet the legendary monarchs of history.",
          },
          {
            name: "Festivals & Feasts",
            description:
              "Uncover the stories behind vibrant global celebrations.",
          },
          {
            name: "Food & Flavor",
            description: "Taste the traditions through international cuisine.",
          },
          {
            name: "Dress & Identity",
            description: "Explore how attire reflects cultural heritage.",
          },
          {
            name: "Lingua Terra",
            description: "Discover the rich languages spoken across the globe.",
          },
          {
            name: "Cultural Taboos",
            description: "Understand what's forbidden and why.",
          },
          {
            name: "Art & Artifacts",
            description: "Examine objects that shaped civilizations.",
          },
          {
            name: "Indigenous Insight",
            description: "Learn from native traditions and beliefs.",
          },
          {
            name: "Migration Tales",
            description: "Follow cultural changes across diasporas.",
          },
          {
            name: "Music & Meaning",
            description: "Feel the rhythm of world traditions.",
          },
          {
            name: "Ceremonies & Rites",
            description: "See how humanity marks life's milestones.",
          },
          {
            name: "Spiritual Pathways",
            description: "Journey through diverse belief systems.",
          },
          {
            name: "Cultural Conflicts",
            description: "Analyze clashes and fusions of traditions.",
          },
          {
            name: "Traditional Tech",
            description: "Old tools, new understanding.",
          },
          {
            name: "Oral Histories",
            description: "Listen to cultures passed down through stories.",
          },
          {
            name: "Global Etiquette",
            description: "Master manners from every continent.",
          },
          {
            name: "Cultural Symbols",
            description: "Decode the meanings of iconic emblems.",
          },
          {
            name: "World Myths",
            description: "Enter the realm of gods, heroes, and monsters.",
          },
          {
            name: "Sacred Texts",
            description: "Examine writings that shaped spiritual beliefs.",
          },
          {
            name: "Tribal Traditions",
            description: "Step into ancient social structures.",
          },
          {
            name: "Architecture & Identity",
            description: "Study how buildings reflect culture.",
          },
          {
            name: "Colonial Echoes",
            description: "Understand post-colonial cultural shifts.",
          },
          {
            name: "Nomadic Ways",
            description: "Trace the footsteps of roaming cultures.",
          },
          {
            name: "Festival Origins",
            description: "Learn how famous festivals began.",
          },
          {
            name: "Cultural Pioneers",
            description: "Celebrate individuals who shaped heritage.",
          },
          {
            name: "Cuisine & Culture",
            description: "Explore how food defines community.",
          },
          {
            name: "Ritual Objects",
            description: "See the tools of tradition in context.",
          },
          {
            name: "Modern Traditions",
            description: "How old customs adapt in today's world.",
          },
        ],
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
        rooms: [
          {
            name: "Tease Me",
            description: "Quick brain teasers to test your wits.",
          },
          {
            name: "Puzzle Panic",
            description: "Logic puzzles under pressure.",
          },
          {
            name: "Twist It",
            description: "Tongue twisters that'll trip you up!",
          },
          {
            name: "Word Warp",
            description: "Unscramble words in record time.",
          },
          {
            name: "Fun Facts 101",
            description: "Did-you-know facts and trivia.",
          },
          {
            name: "Riddle Me This",
            description: "Classic and new riddles to solve.",
          },
          { name: "Brain Blitz", description: "Fast-paced brain games." },
          { name: "Logic Lab", description: "Tough logic challenges await." },
          { name: "Twister Time", description: "Rapid-fire tongue twisters." },
          {
            name: "Word Jumble",
            description: "Mix, match, and make sense of words.",
          },
          {
            name: "Trivia Tunnel",
            description: "Escape with the right trivia answers.",
          },
          {
            name: "Mind Maze",
            description: "Navigate your way through tricky puzzles.",
          },
          { name: "Scramble Zone", description: "All things word scrambles." },
          { name: "Witty Quips", description: "Test your wit and speed." },
          {
            name: "Logic Loop",
            description: "Puzzles that go round and round.",
          },
          {
            name: "Twister Duel",
            description: "Compete with others in verbal gymnastics.",
          },
          {
            name: "Fact Factory",
            description: "Endless streams of fun facts.",
          },
          {
            name: "Riddle Royale",
            description: "One riddle champion to rule them all.",
          },
          {
            name: "Smart Shots",
            description: "Mini trivia shots for quick play.",
          },
          { name: "Puzzle Party", description: "Group up and solve together." },
          { name: "Word Dash", description: "Race to find the right words." },
          {
            name: "Funhouse Facts",
            description: "Bizarre and funny trivia facts.",
          },
          {
            name: "Think Tank",
            description: "Stretch your thinking with riddles.",
          },
          {
            name: "Twist & Talk",
            description: "Can you say it ten times fast?",
          },
          {
            name: "Jumbled Minds",
            description: "Challenge your brain with word messes.",
          },
          {
            name: "Teaser Tower",
            description: "Stack your scores solving teasers.",
          },
          {
            name: "Quick Quirks",
            description: "Speed rounds of strange facts.",
          },
          {
            name: "Brain Buffet",
            description: "A bit of everything to test your brain.",
          },
          {
            name: "Logic Lockdown",
            description: "Escape logic traps before time's up.",
          },
          {
            name: "Fact Sprint",
            description: "Who knows the most in 60 seconds?",
          },
        ],
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
        rooms: [
          {
            name: "Paris Wonders",
            description: "Explore the charm of the City of Light.",
          },
          {
            name: "Beach Bliss",
            description: "Uncover the world's most exotic beaches.",
          },
          {
            name: "Secret Getaways",
            description: "Discuss off-the-radar travel spots.",
          },
          {
            name: "Budget Backpacking",
            description: "Tips for traveling the world on a budget.",
          },
          {
            name: "City Skylines",
            description: "Admire the views from iconic global cities.",
          },
          {
            name: "UNESCO Sites",
            description: "Talk about cultural and natural heritage locations.",
          },
          {
            name: "Mountain Escapes",
            description: "From Everest to the Alps, find your next peak.",
          },
          {
            name: "Local Cuisines",
            description: "Taste the world through travel stories.",
          },
          {
            name: "Airbnb Gems",
            description: "Share and find unique places to stay.",
          },
          {
            name: "Desert Dreams",
            description: "Adventure across vast sandscapes.",
          },
          {
            name: "Island Hopping",
            description: "Tips for tropical island adventures.",
          },
          {
            name: "Solo Travels",
            description: "Advice and stories from solo explorers.",
          },
          {
            name: "Train Routes",
            description: "Scenic train journeys across continents.",
          },
          {
            name: "Hidden Europe",
            description: "Underrated travel spots in Europe.",
          },
          {
            name: "Asia Treks",
            description: "Explore ancient temples and bustling cities.",
          },
          {
            name: "Americas Unseen",
            description: "Travel beyond the typical U.S. sights.",
          },
          {
            name: "African Adventures",
            description: "Safari dreams and cultural insights.",
          },
          {
            name: "Oceania Vibes",
            description: "Discover New Zealand, Australia, and the Pacific.",
          },
          {
            name: "Historic Roads",
            description: "Follow the paths of history around the globe.",
          },
          {
            name: "Festival Trails",
            description: "Plan trips around the world's biggest festivals.",
          },
          {
            name: "Airport Hacks",
            description: "Best tips for flying smarter.",
          },
          {
            name: "Travel with Kids",
            description: "Family-friendly destinations and hacks.",
          },
          {
            name: "Cruise Routes",
            description: "Discuss sea-bound adventures.",
          },
          {
            name: "Travel Horror",
            description: "Share funny or scary travel experiences.",
          },
          {
            name: "Work & Travel",
            description: "For digital nomads and remote workers.",
          },
          {
            name: "Travel Photography",
            description: "Capture the journey with the perfect shot.",
          },
          {
            name: "Luxury Escapes",
            description: "Dream destinations and 5-star indulgence.",
          },
          {
            name: "Language & Culture",
            description: "Learn through travel and cultural exchange.",
          },
          {
            name: "Visa Talk",
            description: "Ask questions and share tips on travel visas.",
          },
          {
            name: "Travel Planning",
            description: "Help others build their perfect itinerary.",
          },
        ],
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
        rooms: [
          {
            name: "Greek Myths",
            description:
              "Dive into tales of gods, heroes, and monsters of ancient Greece.",
          },
          {
            name: "Folklore",
            description:
              "Explore traditional stories passed down through generations worldwide.",
          },
          {
            name: "Urban Legends",
            description: "Discuss modern-day myths and spooky urban tales.",
          },
          {
            name: "Legendary Heroes",
            description:
              "Celebrate the greatest heroes from legends across cultures.",
          },
          {
            name: "Mythical Beasts",
            description:
              "Discover dragons, griffins, and other legendary creatures.",
          },
          {
            name: "Norse Sagas",
            description: "Unravel the myths and gods of Norse tradition.",
          },
          {
            name: "Asian Myths",
            description: "Explore legends and deities from Asian cultures.",
          },
          {
            name: "Ancient Gods",
            description: "Learn about gods worshiped in ancient civilizations.",
          },
          {
            name: "Celtic Legends",
            description: "Explore myths from Celtic culture and folklore.",
          },
          {
            name: "Egyptian Myths",
            description:
              "Discuss stories of pharaohs, gods, and the afterlife.",
          },
          {
            name: "Native Legends",
            description:
              "Share folklore and legends of Native American tribes.",
          },
          {
            name: "Mythical Places",
            description: "Explore fabled lands like Atlantis and El Dorado.",
          },
          {
            name: "Heroic Quests",
            description: "Talk about epic journeys and heroic adventures.",
          },
          {
            name: "Demigods",
            description: "Delve into stories of gods mixed with mortals.",
          },
          {
            name: "Mythical Artifacts",
            description: "Discover legendary objects and their powers.",
          },
          {
            name: "Japanese Legends",
            description:
              "Explore yokai, samurai tales, and ancient Japanese myths.",
          },
          {
            name: "African Myths",
            description: "Uncover folklore and gods from African cultures.",
          },
          {
            name: "Greek Heroes",
            description:
              "Focus on the legendary Greek heroes and their exploits.",
          },
          {
            name: "Mythical Creatures",
            description:
              "Discuss a variety of legendary beasts from around the world.",
          },
          {
            name: "Roman Myths",
            description: "Explore myths of Rome and its gods and heroes.",
          },
          {
            name: "Mythology in Art",
            description: "Examine how myths influenced art across time.",
          },
          {
            name: "Legendary Women",
            description: "Highlight female figures from myth and legend.",
          },
          {
            name: "Mythology in Literature",
            description: "Discuss books and poems inspired by myths.",
          },
          {
            name: "Mythological Symbols",
            description: "Explore the meaning behind myth-related symbols.",
          },
          {
            name: "Folklore Festivals",
            description: "Learn about cultural festivals inspired by folklore.",
          },
          {
            name: "Myth & Religion",
            description:
              "Explore the connection between myths and religious beliefs.",
          },
          {
            name: "Mythology Today",
            description: "Discuss modern retellings and adaptations of myths.",
          },
          {
            name: "Epic Poems",
            description:
              "Talk about legendary epic poetry like the Iliad and Mahabharata.",
          },
          {
            name: "Mythical Landscapes",
            description:
              "Explore legendary mountains, rivers, and forests from myths.",
          },
          {
            name: "Trickster Tales",
            description:
              "Share stories about cunning and clever mythic characters.",
          },
        ],
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
        rooms: [
          {
            name: "Medical Discoveries",
            description: "Where science meets surprise needles.",
          },
          {
            name: "Fitness Trends",
            description: "Running in circles—sometimes literally.",
          },
          {
            name: "Nutrition and Diet",
            description: "Kale may be watching. Proceed cautiously.",
          },
          {
            name: "Alternative Medicine",
            description: "Crystals, herbs, and questionable teas welcome.",
          },
          {
            name: "Mental Health",
            description: "Because overthinking is an extreme sport.",
          },
          {
            name: "Herbal Remedies",
            description: "Leaves, roots, and a sprinkle of mystery.",
          },
          { name: "Famous Doctors", description: "Paging trivia. Dr. Who?" },
          {
            name: "History of Medicine",
            description: "From leeches to lasers—what a journey.",
          },
          {
            name: "Yoga and Wellness",
            description: "Flex your mind, not just your hamstrings.",
          },
          {
            name: "Better Sleep",
            description: "Yawn your way to the leaderboard.",
          },
          {
            name: "Stress Relief",
            description: "The only pressure here is the timer.",
          },
          {
            name: "First Aid Basics",
            description: "For boo-boos and brain benders alike.",
          },
          {
            name: "Vitamins and Supplements",
            description: "No actual gummies included. Sorry.",
          },
          {
            name: "Mental Fitness",
            description: "Brain squats. No dumbbells required.",
          },
          {
            name: "Fitness Technology",
            description: "Where sweat meets silicon.",
          },
          {
            name: "Healthy Aging",
            description: "Because trivia never gets old.",
          },
          { name: "Skin Care", description: "Glow up your trivia game." },
          {
            name: "Heart Health",
            description: "Pump up the knowledge, not just iron.",
          },
          {
            name: "Boost Immunity",
            description: "A trivia shot of mental vitamin C.",
          },
          { name: "Gut Health", description: "Trust your gut… or Google." },
          {
            name: "Fitness Myths",
            description: "No, muscle doesn't turn into fat.",
          },
          {
            name: "Detox Facts",
            description: "Cleansing the nonsense one fact at a time.",
          },
          {
            name: "Medical Technology",
            description: "Lasers, robots, and other doctor sidekicks.",
          },
          { name: "Self Care", description: "A bubble bath for your brain." },
          {
            name: "Nutrition Science",
            description: "Where calories get calculated and mocked.",
          },
          {
            name: "Mental Disorders",
            description: "Serious brains, silly questions.",
          },
          {
            name: "Fitness Gear",
            description: "Spandex not required, but admired.",
          },
          {
            name: "Wellness Tips",
            description:
              "Trick your body into thinking you've got it together.",
          },
          {
            name: "Public Health",
            description: "All aboard the sanitation nation.",
          },
          {
            name: "Nutrition Plans",
            description: "Meal-prep your answers here.",
          },
        ],
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
        rooms: [
          { name: "Runway", description: "Join this room to chat and play." },
          { name: "Designers", description: "A place for fun and games." },
          { name: "Decades", description: "Casual chat and challenges here." },
          {
            name: "Accessories",
            description: "Meet others and enjoy the game.",
          },
          { name: "Sustain", description: "Play and chat with friends." },
          {
            name: "Street",
            description: "Casual room for chatting and gaming.",
          },
          { name: "Haute", description: "Join in for fun and social play." },
          { name: "Icons", description: "Friendly chats and games here." },
          {
            name: "Fabric",
            description: "Casual room for chatting and gaming.",
          },
          { name: "Colors", description: "Meet up and play games here." },
          {
            name: "Vintage",
            description: "Relax and enjoy chatting or playing.",
          },
          { name: "Footwear", description: "Social room for fun and games." },
          { name: "Tech", description: "Join for casual fun and chat." },
          { name: "DIY", description: "Casual chats and games welcome." },
          { name: "Menswear", description: "Friendly game and chat room." },
          { name: "Womenswear", description: "Join in for fun and games." },
          { name: "Kids", description: "Casual room for fun and chatting." },
          { name: "Brands", description: "Relax and join for games and chat." },
          { name: "Stars", description: "Chat and game with others here." },
          { name: "SustainTech", description: "Casual fun and chatting." },
          {
            name: "Patterns",
            description: "Join for friendly games and chat.",
          },
          { name: "Events", description: "Socialize and play games here." },
          { name: "Hair", description: "Casual chat and fun games." },
          { name: "Makeup", description: "Join to chat and enjoy games." },
          { name: "Eco", description: "Friendly room for games and chat." },
          { name: "Tips", description: "Chat, relax, and play games." },
          { name: "Streetwear", description: "Casual room for fun and chat." },
          { name: "Luxury", description: "Meet and play games here." },
          {
            name: "Business",
            description: "Join for friendly chat and games.",
          },
          { name: "Upcycle", description: "Casual game and chat room." },
        ],
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
        rooms: [
          { name: "Orbit Lab", description: "A place to connect and compete." },
          { name: "Gadget Hub", description: "Where ideas and players meet." },
          { name: "Net Nexus", description: "Challenge yourself with peers." },
          { name: "Crypto Vault", description: "Join the fast-paced action." },
          { name: "Future Forge", description: "Engage in exciting gameplay." },
          { name: "Auto Drive", description: "Test your skills here." },
          {
            name: "City Grid",
            description: "Compete in dynamic environments.",
          },
          {
            name: "Rocket Deck",
            description: "Fast and fun challenges await.",
          },
          { name: "Tech Pulse", description: "A vibrant place for players." },
          { name: "Code Stream", description: "Enter and enjoy the game." },
          { name: "Block Chain", description: "Compete and have fun." },
          {
            name: "Smart Zone",
            description: "Where strategy meets excitement.",
          },
          { name: "AI Arena", description: "Challenge minds and reflexes." },
          { name: "Gizmo Room", description: "Test your wit with others." },
          {
            name: "Data Vault",
            description: "For players who love challenge.",
          },
          { name: "Future Path", description: "Join the excitement here." },
          { name: "Drive Lane", description: "Experience the thrill." },
          {
            name: "City Lights",
            description: "Compete with players worldwide.",
          },
          {
            name: "Ethos Hall",
            description: "Where players gather and compete.",
          },
          { name: "Star Deck", description: "Engage in fast-paced rounds." },
          { name: "Tech Hive", description: "A buzzing place for gamers." },
          { name: "Net Loft", description: "Connect and play together." },
          { name: "Chain Link", description: "A space for sharp minds." },
          { name: "Smart Hub", description: "Test your strategies here." },
          { name: "AI Nexus", description: "Competitive and fun gameplay." },
          { name: "Gadget Den", description: "Where challenges come alive." },
          { name: "Data Stream", description: "Join the fast-paced fun." },
          { name: "Future Base", description: "A spot for energetic play." },
          { name: "Auto Track", description: "Test your gaming skills." },
          { name: "City Beat", description: "Challenge players globally." },
        ],
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
        rooms: [
          {
            name: "Market Pulse",
            description: "Join this room to engage in exciting challenges.",
          },
          {
            name: "Trade Winds",
            description: "A place for sharp minds and quick moves.",
          },
          {
            name: "Startup Hub",
            description: "Gather here to test your skills in a lively setting.",
          },
          {
            name: "Money Maze",
            description: "Compete with others in this vibrant space.",
          },
          {
            name: "Economy Edge",
            description: "A room designed for dynamic gameplay.",
          },
          {
            name: "Global Grid",
            description: "An arena for competitive and fun sessions.",
          },
          {
            name: "Biz Blitz",
            description: "Fast-paced action awaits in this room.",
          },
          {
            name: "Profit Path",
            description: "Challenge yourself in this engaging environment.",
          },
          {
            name: "Capital Quest",
            description: "A space for focused and fun contests.",
          },
          {
            name: "Trade Track",
            description: "Where strategy and knowledge meet.",
          },
          {
            name: "Market Matrix",
            description: "Step into this vibrant game zone.",
          },
          {
            name: "Startup Sprint",
            description: "A lively spot for sharp contenders.",
          },
          {
            name: "Fiscal Field",
            description: "Join others in this active gaming room.",
          },
          {
            name: "Revenue Rally",
            description: "Engage in challenging yet fun gameplay.",
          },
          {
            name: "Commerce Core",
            description: "A hub for competitive spirits.",
          },
          {
            name: "Stock Stream",
            description: "Where players meet for exciting rounds.",
          },
          {
            name: "Money Market",
            description: "An energetic space for game lovers.",
          },
          {
            name: "Profit Play",
            description: "Challenge yourself in this friendly room.",
          },
          {
            name: "Capital Club",
            description: "Meet and compete with others here.",
          },
          {
            name: "Trade Tower",
            description: "A dynamic zone for smart moves.",
          },
          {
            name: "Biz Base",
            description: "Test your wits in this gaming area.",
          },
          {
            name: "Growth Grid",
            description: "Engage in fun, competitive sessions.",
          },
          {
            name: "Money Mile",
            description: "A place for quick and sharp games.",
          },
          {
            name: "Economy Expo",
            description: "Gather here for lively challenges.",
          },
          {
            name: "Fiscal Flow",
            description: "A room designed for active players.",
          },
          {
            name: "Profit Peak",
            description: "Join the action and test your skills.",
          },
          {
            name: "Startup Stage",
            description: "Where players meet to compete and have fun.",
          },
          {
            name: "Market Mile",
            description: "A space for dynamic game rounds.",
          },
          {
            name: "Trade Track",
            description: "Test your strategy in this gaming room.",
          },
          {
            name: "Capital Corner",
            description: "An engaging room for competitive play.",
          },
        ],
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
        rooms: [
          {
            name: "Classical Legends",
            description: "A space filled with timeless melodies and heritage.",
          },
          {
            name: "Afrobeat Vibes",
            description: "A vibrant room pulsating with energetic rhythms.",
          },
          {
            name: "Hip Hop Beats",
            description: "A dynamic environment rich with urban culture.",
          },
          {
            name: "Rnb Grooves",
            description: "A smooth and soulful atmosphere to enjoy.",
          },
          {
            name: "Country Roads",
            description: "A cozy spot with a rustic musical spirit.",
          },
          {
            name: "Pop Hits",
            description: "A lively setting that celebrates chart toppers.",
          },
          {
            name: "Famous Canvases",
            description: "An inspiring area dedicated to visual masterpieces.",
          },
          {
            name: "Global Instruments",
            description:
              "A diverse collection of sounds from around the world.",
          },
          {
            name: "Street Art",
            description: "An edgy room showcasing modern urban creativity.",
          },
          {
            name: "Award Night",
            description: "A glamorous space with a touch of fame and prestige.",
          },
          {
            name: "Album Art",
            description: "A creative hub highlighting iconic visuals.",
          },
          {
            name: "Opera Tales",
            description: "A dramatic and elegant setting for classic stories.",
          },
          {
            name: "Dance Evolution",
            description: "A rhythmic space moving through time and styles.",
          },
          {
            name: "Composer Spotlight",
            description: "A refined corner for musical geniuses.",
          },
          {
            name: "Afrobeat Legends",
            description: "A powerful room filled with rhythmic energy.",
          },
          {
            name: "Hip Hop Culture",
            description: "A spirited venue rich with lyrical expression.",
          },
          {
            name: "Soulful Rnb",
            description: "A mellow place to embrace smooth sounds.",
          },
          {
            name: "Country Classics",
            description: "A nostalgic setting with heartfelt tunes.",
          },
          {
            name: "Pop Icons",
            description: "A colorful room with memorable hits.",
          },
          {
            name: "Painting Gallery",
            description: "A tranquil space filled with artistic wonders.",
          },
          {
            name: "World Music",
            description: "A multicultural corner with varied harmonies.",
          },
          {
            name: "Graffiti Zone",
            description: "An urban playground of vibrant expression.",
          },
          {
            name: "Music Honors",
            description: "A prestigious room celebrating excellence.",
          },
          {
            name: "Cover Art",
            description: "A stylish place highlighting album visuals.",
          },
          {
            name: "Opera House",
            description: "An elegant hall echoing timeless performances.",
          },
          {
            name: "Dance Floor",
            description: "A lively place for movement and rhythm.",
          },
          {
            name: "Composer Room",
            description: "A focused space for musical creativity.",
          },
          {
            name: "Afrobeat Pulse",
            description: "A vibrant setting filled with rhythmic beats.",
          },
          {
            name: "Hip Hop Jam",
            description: "An energetic room buzzing with urban vibes.",
          },
          {
            name: "RnB Lounge",
            description: "A chill environment with smooth melodies.",
          },
        ],
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
        rooms: [
          {
            name: "Mountain Range",
            description: "A room for exploring geographic wonders.",
          },
          {
            name: "Desert Plains",
            description: "Discover diverse and intriguing places.",
          },
          {
            name: "Ocean Depths",
            description: "Connect with a global community.",
          },
          {
            name: "Island Life",
            description: "Join others in this engaging space.",
          },
          {
            name: "Border Lines",
            description: "An environment to enjoy and share.",
          },
          {
            name: "Climate Zone",
            description: "A gathering spot for enthusiasts.",
          },
          {
            name: "River Paths",
            description: "Where interesting facts come alive.",
          },
          {
            name: "Country Focus",
            description: "A shared space for curious minds.",
          },
          {
            name: "Peak Points",
            description: "Explore and engage with others.",
          },
          {
            name: "World Deserts",
            description: "A room filled with intrigue.",
          },
          { name: "Geopolitics", description: "A place to connect and learn." },
          {
            name: "Island Nations",
            description: "A space for diverse perspectives.",
          },
          {
            name: "Famous Borders",
            description: "Gather and explore together.",
          },
          {
            name: "Climatic Zones",
            description: "Where exploration meets community.",
          },
          {
            name: "Mountain Tops",
            description: "Engage in a vibrant environment.",
          },
          {
            name: "Desert Trails",
            description: "A space designed for curiosity.",
          },
          { name: "Ocean Waves", description: "Join a dynamic group here." },
          { name: "Island Chains", description: "Connect with others easily." },
          { name: "Border Views", description: "A place to gather and share." },
          {
            name: "Climate Types",
            description: "Discover new things together.",
          },
          { name: "River Banks", description: "Engage in this active room." },
          {
            name: "Country Insights",
            description: "A hub for shared interests.",
          },
          { name: "Peak Views", description: "Join a focused gathering." },
          {
            name: "Desert Sands",
            description: "An inviting place to connect.",
          },
          { name: "Geo Trivia", description: "Meet like-minded explorers." },
          { name: "Island Life", description: "A room for discovery and fun." },
          {
            name: "Border Stories",
            description: "Exchange ideas freely here.",
          },
          {
            name: "Climate Facts",
            description: "A friendly environment to join.",
          },
          { name: "River Flows", description: "Connect and enjoy the space." },
          { name: "Country Maps", description: "A room to share interests." },
        ],
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
        rooms: [
          {
            name: "Galactic Core",
            description: "Centered on cosmic themes and stellar puzzles.",
          },
          {
            name: "Crater Zone",
            description: "Explore rocky topics with challenging clues.",
          },
          {
            name: "Nebula Drift",
            description: "A slow swirl of trivia through the stars.",
          },
          {
            name: "Dark Matter",
            description: "Tackle the unknown in a mysterious setting.",
          },
          {
            name: "Lunar Vault",
            description: "Moon-themed challenges and celestial facts.",
          },
          {
            name: "Comet Trail",
            description: "Speed through quick-fire cosmic rounds.",
          },
          {
            name: "Red Planet",
            description: "Mars-focused content with universal appeal.",
          },
          {
            name: "Cosmic Echo",
            description: "Bounce between deep questions and clues.",
          },
          {
            name: "Astral Field",
            description: "A broad expanse of stellar topics.",
          },
          {
            name: "Starlink",
            description: "Connect ideas across light-years of trivia.",
          },
          {
            name: "Gravity Zone",
            description: "Feel the pull of challenging space clues.",
          },
          {
            name: "Orbit Station",
            description: "Stay in orbit while navigating space questions.",
          },
          {
            name: "Photon Burst",
            description: "Quick-paced bursts of high-energy rounds.",
          },
          {
            name: "Rocket Lab",
            description: "Launch your thinking into trivia space.",
          },
          {
            name: "Solar Winds",
            description: "Drift through a wide array of topics.",
          },
          {
            name: "Astro Deck",
            description: "Step onto a deck of stargazing puzzles.",
          },
          {
            name: "Time Warp",
            description: "Travel through trivia at light-speed.",
          },
          {
            name: "Alien Archive",
            description: "Speculative fun with factual foundations.",
          },
          {
            name: "Spacewalk",
            description: "A gentle stroll across intergalactic ideas.",
          },
          {
            name: "Plasma Zone",
            description: "Where science and surprises collide.",
          },
          {
            name: "Meteor Belt",
            description: "Navigate scattered knowledge in motion.",
          },
          {
            name: "Wormhole",
            description: "Jump between topics with cosmic shortcuts.",
          },
          {
            name: "Apollo Bay",
            description: "Mission-inspired challenges for all players.",
          },
          {
            name: "Asteroid Field",
            description: "Quick thinking required in this dense cluster.",
          },
          {
            name: "Zenith Point",
            description: "Aim high with top-tier trivia.",
          },
          {
            name: "Supernova",
            description: "Explosive challenges with dazzling variety.",
          },
          {
            name: "Pulsar Station",
            description: "Regular rhythms of rotating questions.",
          },
          {
            name: "Kepler Zone",
            description: "Explore the boundaries of discovery.",
          },
          {
            name: "Event Horizon",
            description: "Push to the edge of what's known.",
          },
          {
            name: "Quasar Gate",
            description: "Bright bursts of themed space challenges.",
          },
        ],
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
        rooms: [
          {
            name: "Black Holes",
            description: "A room filled with cosmic wonders.",
          },
          {
            name: "Milky Way",
            description: "Connect with the vastness beyond.",
          },
          {
            name: "Mars Base",
            description: "Join others in a stellar setting.",
          },
          { name: "Exoplanets", description: "A space for shared curiosity." },
          {
            name: "Spacecraft",
            description: "Engage in this cosmic environment.",
          },
          {
            name: "Astro Events",
            description: "A room for space enthusiasts.",
          },
          {
            name: "Universe Theories",
            description: "Where ideas float in space.",
          },
          {
            name: "Space-Time",
            description: "An area for cosmic connections.",
          },
          {
            name: "Orbit Paths",
            description: "Explore the celestial paths here.",
          },
          {
            name: "Galaxy Clusters",
            description: "A place for starry discussions.",
          },
          { name: "Red Planet", description: "A room with cosmic ambiance." },
          { name: "Deep Space", description: "Engage with a cosmic vibe." },
          { name: "Solar Winds", description: "A hub of space-related chats." },
          { name: "Nebula Clouds", description: "Join a stellar gathering." },
          {
            name: "Rocket Launch",
            description: "A cosmic-themed environment.",
          },
          { name: "Asteroid Belt", description: "A space for star seekers." },
          { name: "Pulsar Beats", description: "A vibrant cosmic room." },
          { name: "Cosmic Rays", description: "Where space ideas converge." },
          { name: "Quasar Glow", description: "A room filled with mystery." },
          { name: "Dark Matter", description: "An area for cosmic minds." },
          { name: "Solar Flares", description: "Engage in stellar ambiance." },
          { name: "Comet Trail", description: "A space for cosmic journeys." },
          { name: "Space Probes", description: "Connect in an astral space." },
          { name: "Event Horizon", description: "A room with cosmic energy." },
          {
            name: "Lunar Orbit",
            description: "An environment for star talks.",
          },
          { name: "Gamma Rays", description: "A vibrant cosmic hub." },
          { name: "Space Dust", description: "A room for stellar minds." },
          { name: "Astro Maps", description: "Join an astral community." },
          { name: "Orbital Station", description: "A cosmic-themed space." },
          {
            name: "Celestial Sphere",
            description: "Where stars come together.",
          },
        ],
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
        rooms: [
          {
            name: "Spice Bar",
            description: "Join this room to explore flavorful themes.",
          },
          {
            name: "Brew Haven",
            description: "A relaxed space for beverage-based fun.",
          },
          {
            name: "Sweet Spot",
            description: "A cozy room with sugar-coated topics.",
          },
          {
            name: "Grill House",
            description: "Heated rounds await in this sizzling room.",
          },
          {
            name: "Fresh Market",
            description: "Naturally fun vibes with every round.",
          },
          {
            name: "Flavor Town",
            description: "Bold themes and flavorful fun here.",
          },
          {
            name: "Toast Club",
            description: "Light and warm rounds served daily.",
          },
          {
            name: "Midnight Snack",
            description: "Where cravings and curiosity meet.",
          },
          {
            name: "Rolling Pin",
            description: "A smooth place to mix up your skills.",
          },
          {
            name: "Sizzle Room",
            description: "Lively themes always on high heat.",
          },
          {
            name: "Citrus Cove",
            description: "Bright and zesty moments await.",
          },
          {
            name: "Tapas Table",
            description: "Bite-sized fun, full of variety.",
          },
          {
            name: "Daily Roast",
            description: "A warm setting with rich themes.",
          },
          {
            name: "Snack Shack",
            description: "Quick, light, and full of flavor.",
          },
          {
            name: "Cocoa Cabin",
            description: "A cozy place for smooth rounds.",
          },
          {
            name: "Sour Patch",
            description: "Tangy twists and unexpected turns.",
          },
          {
            name: "Veggie Vault",
            description: "Greens and games all in one room.",
          },
          {
            name: "The Pantry",
            description: "A stocked space for trivia lovers.",
          },
          {
            name: "Spill the Tea",
            description: "Pour into rounds full of surprise.",
          },
          {
            name: "The Fryer",
            description: "Crispy themes and golden questions.",
          },
          {
            name: "Bistro Lane",
            description: "A charming stop for curious minds.",
          },
          {
            name: "The Juicery",
            description: "Pure fun squeezed into every round.",
          },
          {
            name: "Taco Stand",
            description: "Quick bites and fun topics await.",
          },
          {
            name: "Bottle Cap",
            description: "Pop into flavorful trivia rounds.",
          },
          {
            name: "The Oven",
            description: "Hot and ready rounds on the menu.",
          },
          { name: "Creamery", description: "Cool vibes with smooth themes." },
          {
            name: "Chop Station",
            description: "Sharpen your wits and dig in.",
          },
          {
            name: "Dough Room",
            description: "Rise through rounds in this space.",
          },
          {
            name: "Mint Room",
            description: "Fresh themes served with coolness.",
          },
          {
            name: "The Kettle",
            description: "A bubbling space of lively questions.",
          },
        ],
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
        rooms: [
          {
            name: "Einstein",
            description: "A place inspired by curious minds.",
          },
          {
            name: "Cleopatra",
            description: "Elegant and powerful historical aura.",
          },
          {
            name: "Mandela",
            description: "Quiet strength and resilience echo here.",
          },
          { name: "Tesla", description: "A room charged with innovation." },
          {
            name: "Curie",
            description: "A brilliant space with timeless impact.",
          },
          { name: "Lincoln", description: "A calm space with historic depth." },
          { name: "Joan", description: "Bold energy with fearless vibes." },
          {
            name: "Socrates",
            description: "Reflective and thoughtful atmosphere.",
          },
          {
            name: "Columbus",
            description: "For those drawn to unknown paths.",
          },
          {
            name: "Ada",
            description: "Sharp, structured, and quietly iconic.",
          },
          {
            name: "Bowie",
            description: "Eclectic and unexpected inspiration.",
          },
          {
            name: "Malala",
            description: "Youthful energy with global spirit.",
          },
          { name: "Da Vinci", description: "A space of diverse curiosity." },
          { name: "Gandhi", description: "Peaceful and deliberate ambiance." },
          { name: "Mozart", description: "Melodic and gracefully vibrant." },
          { name: "Newton", description: "Precise and grounded atmosphere." },
          { name: "Oprah", description: "Warmth and influence come together." },
          {
            name: "Shakespeare",
            description: "Layered and timeless elegance.",
          },
          { name: "Tubman", description: "Steadfast and quietly powerful." },
          { name: "Churchill", description: "Bold and strategic energy here." },
          { name: "Hypatia", description: "Ancient intellect meets clarity." },
          { name: "Freud", description: "A space with subtle complexity." },
          { name: "Hawking", description: "Cosmic calm and quiet brilliance." },
          { name: "Darwin", description: "Rooted and ever-evolving tone." },
          { name: "Mandela", description: "Echoes of dignity and courage." },
          { name: "Aristotle", description: "Structured with quiet depth." },
          { name: "Tesla", description: "Where sparks of thought gather." },
          { name: "Rosa", description: "Grace with unshaken resolve." },
          { name: "Jobs", description: "Polished and forward-focused." },
          {
            name: "Nightingale",
            description: "Gentle focus with resilient grace.",
          },
        ],
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
        rooms: [
          {
            name: "Carnival",
            description:
              "Join this room to dive into festive vibes and global joy.",
          },
          {
            name: "Solstice",
            description: "A space where seasonal traditions take center stage.",
          },
          {
            name: "Harmony",
            description:
              "Experience the unity of celebrations across cultures.",
          },
          {
            name: "Bloom",
            description:
              "Celebrate vibrant traditions in a room full of color and life.",
          },
          {
            name: "Radiance",
            description: "Feel the warmth of festivities under bright lights.",
          },
          {
            name: "Harvest",
            description: "Enter a world where traditions bloom with gratitude.",
          },
          {
            name: "Serenade",
            description: "Where music and joy echo through every celebration.",
          },
          {
            name: "Jubilee",
            description: "A cheerful space filled with festive energy.",
          },
          {
            name: "Echo",
            description:
              "Listen to traditions passed down through generations.",
          },
          {
            name: "Pulse",
            description: "Catch the rhythm of worldwide festive beats.",
          },
          {
            name: "Aurora",
            description: "Light up your journey through magical celebrations.",
          },
          {
            name: "Cascade",
            description: "Dive into layers of cultural and seasonal cheer.",
          },
          {
            name: "Lantern",
            description: "A soft glow guiding you through joyful events.",
          },
          {
            name: "Timbre",
            description: "Tune in to the sounds of celebration and unity.",
          },
          {
            name: "Parade",
            description: "Follow the footsteps of lively global traditions.",
          },
          {
            name: "Twilight",
            description: "Explore the evening wonders of worldwide holidays.",
          },
          {
            name: "Crescent",
            description: "A room reflecting moonlit cultural events.",
          },
          {
            name: "Flare",
            description: "Where every moment bursts with celebration.",
          },
          {
            name: "Oasis",
            description: "Find peace and festivity in a vibrant atmosphere.",
          },
          {
            name: "Gleam",
            description: "Step into a shining space of joy and tradition.",
          },
          {
            name: "Reverie",
            description: "Dreamy vibes inspired by cherished events.",
          },
          {
            name: "Chorus",
            description: "Voices rise in harmony, echoing festive spirits.",
          },
          {
            name: "Melody",
            description: "A room in tune with the world's happiest moments.",
          },
          {
            name: "Lumen",
            description: "Brighten your time with cultural festivities.",
          },
          {
            name: "Crimson",
            description: "Rich traditions in a warm and welcoming setting.",
          },
          {
            name: "Whirl",
            description: "Spin through the colorful world of celebrations.",
          },
          {
            name: "Feather",
            description: "Lighthearted fun and gentle tradition in one place.",
          },
          {
            name: "Grove",
            description:
              "A natural space for peaceful and lively events alike.",
          },
          {
            name: "Bell",
            description: "Let the sounds of celebration ring through the air.",
          },
          {
            name: "Vista",
            description: "A panoramic view of the world's cultural joy.",
          },
        ],
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
        rooms: [
          {
            name: "Wobble",
            description: "A place where things don't quite line up.",
          },
          {
            name: "Zonko",
            description: "Expect the unexpected and the unexplained.",
          },
          {
            name: "Fizzbit",
            description: "Where oddities bubble to the surface.",
          },
          {
            name: "Snuzzle",
            description: "Full of peculiar and fuzzy curiosities.",
          },
          {
            name: "Quonk",
            description: "Everything feels just a bit off, in a fun way.",
          },
          {
            name: "Glimmer",
            description: "A strange shine in a world of odd.",
          },
          { name: "Plink", description: "The sound of weird ideas landing." },
          {
            name: "Boof",
            description: "Fluffy chaos meets strange brilliance.",
          },
          { name: "Gribble", description: "Slightly absurd, gently wild." },
          { name: "Snork", description: "Uncommon air for uncommon minds." },
          { name: "Zindle", description: "Odd turns and curious corners." },
          {
            name: "Crabble",
            description: "Little weird things crawling through.",
          },
          {
            name: "Mizzle",
            description: "Softly strange with a twist of weird.",
          },
          { name: "Thwip", description: "Quick and quirky, never dull." },
          { name: "Flibber", description: "Oddness dances lightly here." },
          { name: "Dazzle", description: "Bright lights and stranger things." },
          {
            name: "Jumble",
            description: "Tangled and bizarre in the best ways.",
          },
          { name: "Squib", description: "Tiny room, big weirdness." },
          {
            name: "Clonk",
            description: "Sounds off and so does everything else.",
          },
          { name: "Zorp", description: "No one really knows why it exists." },
          {
            name: "Snizzle",
            description: "A foggy playground of curiosities.",
          },
          { name: "Twerple", description: "A twist of color, a dash of odd." },
          { name: "Boingle", description: "Bounces with absurdity." },
          { name: "Florp", description: "Everything here defies logic." },
          { name: "Crizzle", description: "Cracked but charming." },
          { name: "Wizzle", description: "Swirls with nonsense and fun." },
          { name: "Glunk", description: "Heavy with mystery and madness." },
          { name: "Borp", description: "Simple name, strange vibes." },
          { name: "Murk", description: "Darkly odd, deeply strange." },
          { name: "Waddle", description: "Slow, silly, and very odd." },
        ],
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
        rooms: [
          {
            name: "Metro",
            description: "A fast-paced room for players who enjoy city vibes.",
          },
          {
            name: "Downtown",
            description: "Hang out in this central hub of action and fun.",
          },
          {
            name: "Skyline",
            description: "Soar to the top with every round you play.",
          },
          {
            name: "Crosswalk",
            description: "Where different minds intersect for a good game.",
          },
          {
            name: "Subway",
            description: "Underground energy and fast turns await you.",
          },
          {
            name: "Uptown",
            description: "Take a trip to the upscale side of play.",
          },
          {
            name: "Gridlock",
            description: "Traffic isn't a problem here, just challenge.",
          },
          {
            name: "Avenue",
            description: "Stroll into fun and meet fellow city explorers.",
          },
          {
            name: "Plaza",
            description: "A lively place full of games and conversations.",
          },
          {
            name: "Boulevard",
            description: "Where every move feels wide and open.",
          },
          {
            name: "Block",
            description: "Step into the neighborhood and get started.",
          },
          {
            name: "Transit",
            description: "A mobile room that never stops moving.",
          },
          {
            name: "Overpass",
            description: "Take the high road in your game journey.",
          },
          {
            name: "Parkway",
            description: "Smooth games and relaxed vibes all around.",
          },
          {
            name: "Corner",
            description: "Catch your turn at this city junction.",
          },
          {
            name: "District",
            description: "Enter a place with its own competitive culture.",
          },
          {
            name: "Loft",
            description: "A chill high-rise spot for trivia lovers.",
          },
          {
            name: "Station",
            description: "Your next stop for consistent challenges.",
          },
          {
            name: "Alley",
            description: "Tight corners and sharp minds gather here.",
          },
          {
            name: "Bridge",
            description: "Connecting players from all walks of life.",
          },
          {
            name: "Tower",
            description: "Rise through the ranks floor by floor.",
          },
          {
            name: "Harbor",
            description: "Drop anchor and enjoy steady gameplay.",
          },
          {
            name: "Canal",
            description: "Flow through a stream of entertaining questions.",
          },
          { name: "Circle", description: "Round and round with endless fun." },
          {
            name: "Lane",
            description: "A narrow path to quick thinking and wins.",
          },
          {
            name: "Market",
            description: "Bustling with activity and player spirit.",
          },
          {
            name: "Forum",
            description: "Where ideas and games come together.",
          },
          {
            name: "Arcade",
            description: "Classic fun with a modern urban twist.",
          },
          { name: "Track", description: "Stay on course and race ahead." },
          {
            name: "Wharf",
            description: "Dock in for a session full of surprises.",
          },
        ],
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
        rooms: [
          {
            name: "ByteHub",
            description: "A lively space to test your digital knowledge.",
          },
          {
            name: "PixelCore",
            description: "Where tech enthusiasts gather for fun.",
          },
          {
            name: "CodeNest",
            description: "A place for those fluent in the language of the web.",
          },
          {
            name: "StreamZone",
            description: "Join fellow players in a flowing game of trivia.",
          },
          {
            name: "CyberCircle",
            description: "Hang out in a loop of digital excitement.",
          },
          {
            name: "ClickHouse",
            description: "Clicks and questions go hand in hand here.",
          },
          {
            name: "The Grid",
            description: "Stay wired in this tech-centric room.",
          },
          {
            name: "PingPod",
            description: "Bounce your brain power in real time.",
          },
          {
            name: "ScrollBase",
            description: "Keep scrolling, keep answering.",
          },
          { name: "404 Room", description: "The fun is never not found here." },
          { name: "TechLounge", description: "Where digital minds unwind." },
          {
            name: "LinkDock",
            description: "A dock for connected quiz lovers.",
          },
          { name: "NerdZone", description: "Only the nerdiest survive." },
          {
            name: "BitBunker",
            description: "A secure space for trivia buffs.",
          },
          { name: "HashNode", description: "Where ideas and questions trend." },
          { name: "MetaSpace", description: "It's bigger than the internet." },
          {
            name: "AppCave",
            description: "Find your people in this digital den.",
          },
          {
            name: "TabLab",
            description: "Keep your tabs open and your mind sharper.",
          },
          {
            name: "CacheRoom",
            description: "Where knowledge is never flushed.",
          },
          {
            name: "ScriptHive",
            description: "Buzzing with quick questions and answers.",
          },
          {
            name: "AltWorld",
            description: "An alternative zone of trivia energy.",
          },
          { name: "ZeroDay", description: "Always fresh, always challenging." },
          {
            name: "UploadBay",
            description: "Bring your thoughts to the surface.",
          },
          {
            name: "SignalNest",
            description: "Tuned in for real-time brain games.",
          },
          {
            name: "DigitalDen",
            description: "All things internet, all in one place.",
          },
          {
            name: "NodeRealm",
            description: "A connected room for every techie.",
          },
          {
            name: "CloudCore",
            description: "Soar high with fast-paced trivia.",
          },
          { name: "PingZone", description: "Low latency, high fun." },
          {
            name: "EchoLab",
            description: "Your thoughts bounce back with energy.",
          },
          {
            name: "KeyBoard",
            description: "Where every stroke sparks a question.",
          },
        ],
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
        rooms: [
          {
            name: "Nebula",
            description: "A quiet place with deep cosmic vibes.",
          },
          { name: "Epoch", description: "Where eras meet and moments linger." },
          { name: "Singularity", description: "A dense space full of ideas." },
          { name: "Continuum", description: "Where time flows freely." },
          { name: "Orbit", description: "Constant motion in a circular path." },
          {
            name: "Lightyear",
            description: "A stretch of space with quiet echoes.",
          },
          { name: "Pulse", description: "A steady beat in the void." },
          {
            name: "Chronos",
            description: "Timeless space with classic rhythm.",
          },
          { name: "Eventide", description: "A gentle dusk of curious minds." },
          { name: "Zenith", description: "The peak of cosmic stillness." },
          { name: "Twilight", description: "A space for dimming thoughts." },
          {
            name: "Quasar",
            description: "Bright and bursting with potential.",
          },
          { name: "Drift", description: "Slow shifts and endless movement." },
          { name: "Equinox", description: "Perfectly balanced and neutral." },
          { name: "Ripple", description: "Subtle changes spreading outward." },
          { name: "Nova", description: "A fresh burst of stellar calm." },
          { name: "Aeon", description: "Timeless and vast in scope." },
          { name: "Loop", description: "Repetition wrapped in comfort." },
          { name: "Beacon", description: "A guiding light in vastness." },
          { name: "Wormhole", description: "A shortcut to curious realms." },
          { name: "Axis", description: "The pivot around which things turn." },
          { name: "Momentum", description: "Everything in motion here." },
          { name: "Glide", description: "Smooth and steady atmosphere." },
          { name: "Phase", description: "A shift waiting to happen." },
          { name: "Halo", description: "A soft ring of presence." },
          { name: "Tide", description: "Waves of thought and flow." },
          { name: "Realm", description: "A zone between now and beyond." },
          { name: "Echo", description: "Sounds and thoughts reverberate." },
          { name: "Shadow", description: "Quiet and slightly mysterious." },
          { name: "Vector", description: "Directional space full of intent." },
        ],
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
        rooms: [
          {
            name: "Battlefront",
            description: "Join the action and test your knowledge here.",
          },
          {
            name: "Warzone",
            description: "Enter and experience the thrill of conflict.",
          },
          {
            name: "The Armory",
            description: "A place for strategy, history, and challenge.",
          },
          {
            name: "Command Post",
            description: "Where trivia meets tactical precision.",
          },
          {
            name: "Under Siege",
            description: "Engage in non-stop war-themed challenges.",
          },
          {
            name: "Front Lines",
            description: "Step into the heart of historical tension.",
          },
          {
            name: "Victory Lane",
            description: "Where battles are won with knowledge.",
          },
          {
            name: "Peacekeepers",
            description: "Balance the chaos with calm insight.",
          },
          {
            name: "No Man's Land",
            description: "A neutral zone of fierce competition.",
          },
          {
            name: "Red Alert",
            description: "High intensity and high stakes await.",
          },
          {
            name: "Iron Curtain",
            description: "Cross into Cold War-inspired games.",
          },
          {
            name: "Silent Guns",
            description: "Quiet battles with loud outcomes.",
          },
          {
            name: "Trenches",
            description: "Dig deep into conflict-themed trivia.",
          },
          {
            name: "Firestorm",
            description: "Fast-paced and full of explosive fun.",
          },
          {
            name: "Checkmate",
            description: "Where war and tactics go head to head.",
          },
          {
            name: "The Citadel",
            description: "Fortified fun for every player.",
          },
          {
            name: "Watchtower",
            description: "Stay sharp and on guard in every round.",
          },
          {
            name: "Overwatch",
            description: "Oversee the battlefield of trivia.",
          },
          {
            name: "Black Ops",
            description: "Shadowy skirmishes of knowledge.",
          },
          {
            name: "Tactical Zone",
            description: "Challenge yourself in high-risk rooms.",
          },
          {
            name: "Echo Base",
            description: "A hidden outpost of strategic trivia.",
          },
          {
            name: "Dust Storm",
            description: "Swirl into action with battlefield flair.",
          },
          {
            name: "Dark Horizon",
            description: "Where conflict looms over every choice.",
          },
          {
            name: "Strike Team",
            description: "Join others on high-impact missions.",
          },
          {
            name: "Stronghold",
            description: "Defend your lead through every question.",
          },
          {
            name: "Crossfire",
            description: "Don't get caught between clever minds.",
          },
          {
            name: "Blast Radius",
            description: "Explosive rounds and tricky trivia.",
          },
          {
            name: "Spearhead",
            description: "Lead the charge in competitive rooms.",
          },
          {
            name: "Deadlock",
            description: "Where battles end in brains, not brawn.",
          },
          {
            name: "Shadow Line",
            description: "Play on the edges of knowledge and conflict.",
          },
        ],
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
        rooms: [
          {
            name: "Socrates",
            description: "A place for thoughtful and curious minds.",
          },
          {
            name: "Freud",
            description: "Where deep insights meet the subconscious.",
          },
          {
            name: "Karma",
            description: "An arena of reflective and inward thinkers.",
          },
          {
            name: "Zenith",
            description: "Serene space for philosophical immersion.",
          },
          { name: "Echo", description: "Where thoughts reverberate and grow." },
          { name: "Agora", description: "A common ground for mind explorers." },
          {
            name: "Nexus",
            description: "Connect with deep and abstract ideas.",
          },
          { name: "Muse", description: "A haven for inspiration and thought." },
          { name: "Mirror", description: "Where minds reflect and discover." },
          { name: "Plato", description: "Ideal for exploring timeless ideas." },
          {
            name: "Bloom",
            description: "For those who love growth of thought.",
          },
          { name: "Drift", description: "Let your mind wander freely." },
          { name: "Logos", description: "A logical space for seekers." },
          { name: "Pulse", description: "Where ideas flow with energy." },
          { name: "Vibe", description: "A calm zone for shared insight." },
          { name: "Ripple", description: "Every idea starts a wave here." },
          { name: "Mythos", description: "For stories that shape thinking." },
          { name: "Hume", description: "A tribute to empirical minds." },
          { name: "Aura", description: "Ideas and presence merge here." },
          { name: "Verve", description: "Lively minds meet and mingle." },
          {
            name: "Quest",
            description: "A path for inner and outer discovery.",
          },
          { name: "Tao", description: "Balance and wisdom flow here." },
          { name: "Thrive", description: "Grow your mind with others." },
          { name: "Chime", description: "Harmonize your thoughts together." },
          { name: "Spark", description: "Where ideas ignite and inspire." },
          { name: "Atlas", description: "Hold big thoughts with ease." },
          { name: "Ink", description: "A canvas for expressive minds." },
          { name: "Orbit", description: "Thoughts revolve and evolve here." },
          { name: "Pathos", description: "Feel and think in equal measure." },
          {
            name: "Noesis",
            description: "A pure space for intellectual play.",
          },
        ],
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
        rooms: [
          {
            name: "Valhalla",
            description: "A realm of ancient tales and timeless lore.",
          },
          {
            name: "Olympus",
            description: "Where old legends echo across the ages.",
          },
          {
            name: "Asgard",
            description: "A gateway to mythic realms and heroic sagas.",
          },
          {
            name: "Elysium",
            description: "Tranquil ground for mythic wanderers.",
          },
          {
            name: "Underworld",
            description: "Whispers of forgotten stories dwell here.",
          },
          {
            name: "Avalon",
            description: "A place steeped in legendary whispers.",
          },
          {
            name: "Zion",
            description: "Legacies of gods and spirits converge.",
          },
          {
            name: "Babylon",
            description: "Mystical echoes from ancient lands.",
          },
          {
            name: "Atlantis",
            description: "A mythical hub of endless intrigue.",
          },
          {
            name: "Shambhala",
            description: "Hidden depths of sacred mythologies.",
          },
          { name: "Erebus", description: "Shadows of myths long passed." },
          { name: "Yomi", description: "Echoes from ancient eastern stories." },
          {
            name: "Ragnarok",
            description: "A meeting point for epic legends.",
          },
          { name: "Du'at", description: "Where divine tales unfold slowly." },
          {
            name: "Tír na nÓg",
            description: "Boundless realms of mythical wonder.",
          },
          {
            name: "Helheim",
            description: "Where frostbitten myths find voice.",
          },
          {
            name: "Purgatory",
            description: "Timeless zone for mythical musings.",
          },
          {
            name: "Mount Meru",
            description: "A sacred peak of mythical origins.",
          },
          { name: "Niflheim", description: "Cold winds of old stories swirl." },
          {
            name: "Nine Realms",
            description: "All corners of myth gathered here.",
          },
          { name: "Aztlan", description: "A place of legend and mystery." },
          { name: "Annwn", description: "Where Celtic tales come alive." },
          {
            name: "Hyperborea",
            description: "Distant echoes of ancient lore.",
          },
          { name: "Mictlan", description: "Steps through a mythic journey." },
          {
            name: "Kumari Kandam",
            description: "Vanished worlds with rich tales.",
          },
          { name: "Tartarus", description: "Deep within mythical narratives." },
          { name: "Sumer", description: "Where gods once walked." },
          { name: "Xibalba", description: "Myths emerge from sacred trials." },
          { name: "Leng", description: "Obscure paths of legendary tales." },
          { name: "Arcadia", description: "Where stories drift with time." },
        ],
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
        rooms: [
          {
            name: "Torazon",
            description: "A room where ideas spark and flow.",
          },
          {
            name: "Edison",
            description: "A space to explore bright concepts.",
          },
          { name: "Curie", description: "Where innovation meets curiosity." },
          { name: "Wright", description: "A place for new perspectives." },
          { name: "Bell", description: "Room buzzing with creativity." },
          {
            name: "DaVinci",
            description: "An environment of timeless inspiration.",
          },
          { name: "Newton", description: "Room filled with dynamic thinking." },
          { name: "Archimedes", description: "Where knowledge moves forward." },
          { name: "Galileo", description: "A hub of discovery and insight." },
          { name: "Marconi", description: "Room charged with new ideas." },
          { name: "Franklin", description: "A space for bright minds." },
          { name: "Pasteur", description: "Where ideas evolve and grow." },
          { name: "Faraday", description: "Room alive with innovation." },
          { name: "Bell Labs", description: "A place for future pioneers." },
          { name: "Sputnik", description: "Room orbiting fresh concepts." },
          { name: "Curiosity", description: "A zone of endless exploration." },
          { name: "Jetsons", description: "Where imagination takes flight." },
          { name: "Tesla Coil", description: "Room buzzing with energy." },
          { name: "Hubble", description: "A space to see far and beyond." },
          { name: "Kepler", description: "Where ideas revolve." },
          { name: "Eureka", description: "Room for sudden insights." },
          { name: "Voyager", description: "A hub for bold journeys." },
          {
            name: "Rutherford",
            description: "Room filled with atomic thoughts.",
          },
          { name: "Bell Tower", description: "A place of clear signals." },
          { name: "Pharos", description: "Guiding light for ideas." },
          {
            name: "Atlas",
            description: "Room bearing the weight of knowledge.",
          },
          { name: "Lab", description: "Where sparks ignite progress." },
          { name: "Pioneer", description: "Room for new frontiers." },
          { name: "Ada", description: "A space inspired by early computing." },
          { name: "Fermi", description: "Room charged with nuclear ideas." },
        ],
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
        rooms: [
          {
            name: "Blockbusters",
            description: "Join this room for exciting challenges.",
          },
          { name: "Sitcoms", description: "A fun space to test your skills." },
          {
            name: "Pop Hits",
            description: "Engage in lively guessing games here.",
          },
          { name: "Viral Memes", description: "A room for fast-paced fun." },
          {
            name: "Chat Slang",
            description: "Try your luck with modern slang acronyms.",
          },
          {
            name: "Classic Films",
            description: "Sharpen your mind with classic content.",
          },
          { name: "Reality TV", description: "A room full of surprises." },
          {
            name: "Rock & Roll",
            description: "Challenge yourself with music themes.",
          },
          {
            name: "Internet Buzz",
            description: "Test your knowledge of trends.",
          },
          { name: "Text Talk", description: "Quick guesses are the key here." },
          {
            name: "Animated Shows",
            description: "A playful room for everyone.",
          },
          { name: "Hip Hop", description: "Get ready for some rhythmic fun." },
          {
            name: "Celebrity",
            description: "Guess acronyms related to famous faces.",
          },
          {
            name: "Streaming Hits",
            description: "Dive into popular online shows.",
          },
          { name: "Indie Music", description: "A room for unique sounds." },
          {
            name: "Social Media",
            description: "Stay current with trending topics.",
          },
          {
            name: "Teen Drama",
            description: "Relive your favorite storylines.",
          },
          { name: "Comedy Central", description: "Laugh while you play." },
          {
            name: "Dance Beats",
            description: "Move to the rhythm of the game.",
          },
          { name: "Tech Slang", description: "Decode tech-related acronyms." },
          {
            name: "Cult Classics",
            description: "Test your knowledge of niche favorites.",
          },
          {
            name: "Pop Icons",
            description: "Guess acronyms linked to legends.",
          },
          { name: "Late Night", description: "A room for night owls." },
          {
            name: "Fantasy Shows",
            description: "Step into worlds of imagination.",
          },
          {
            name: "Music Festivals",
            description: "Experience the vibe through words.",
          },
          {
            name: "Web Series",
            description: "Focus on bite-sized entertainment.",
          },
          { name: "Emoji Talk", description: "Guess acronyms with a twist." },
          {
            name: "Urban Legends",
            description: "Explore modern myths in the game.",
          },
          { name: "Pop Art", description: "Colors and culture collide here." },
          { name: "Gaming Slang", description: "Level up your guessing game." },
        ],
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
        rooms: [
          {
            name: "Boardroom",
            description: "Tackle executive-level topics and terms.",
          },
          {
            name: "Startup Garage",
            description: "Explore early-stage business language.",
          },
          {
            name: "Pitch Deck",
            description: "Navigate startup lingo and investor speak.",
          },
          {
            name: "Finance Hub",
            description: "Focused on numbers, margins, and returns.",
          },
          {
            name: "The Briefcase",
            description: "Quick-hit corporate concepts and buzzwords.",
          },
          {
            name: "Strategy Room",
            description: "Solve structured, big-picture challenges.",
          },
          {
            name: "Agile Circle",
            description: "Lean, iterative rounds with flexible content.",
          },
          {
            name: "Sales Floor",
            description: "Buzzing with commercial and client terms.",
          },
          {
            name: "Marketing Suite",
            description: "Unpack jargon from the branding world.",
          },
          {
            name: "Venture Vault",
            description: "Unlock ideas from the startup ecosystem.",
          },
          {
            name: "Executive Track",
            description: "Navigate the top-tier titles and roles.",
          },
          {
            name: "Growth Lane",
            description: "Focus on scaling terms and expansion.",
          },
          {
            name: "Project Pad",
            description: "PM-heavy content in organized rounds.",
          },
          {
            name: "Innovation Lab",
            description: "Explore terminology from modern business ideas.",
          },
          {
            name: "Balance Sheet",
            description: "Drill into finance basics and reporting terms.",
          },
          {
            name: "Compliance Zone",
            description: "Step through rules, policies, and regulations.",
          },
          {
            name: "Workplace Wire",
            description: "Relatable acronyms from the 9-to-5 grind.",
          },
          {
            name: "Consulting Bay",
            description: "Tackle terms from client-focused sectors.",
          },
          {
            name: "E-Comm Corner",
            description: "Where business meets tech and shopping.",
          },
          {
            name: "Investor Den",
            description: "Explore capital, equity, and returns.",
          },
          {
            name: "Product Suite",
            description: "Centered on product, teams, and delivery.",
          },
          {
            name: "Team Huddle",
            description: "Group-based phrases and coordination terms.",
          },
          {
            name: "Remote Ops",
            description: "All about virtual workflows and tools.",
          },
          {
            name: "Budget Desk",
            description: "Break down numbers, costs, and forecasts.",
          },
          {
            name: "Outreach Bay",
            description: "Dive into PR, CRM, and lead generation.",
          },
          {
            name: "KPI Lounge",
            description: "Set your sights on goals and performance.",
          },
          {
            name: "Brand Studio",
            description: "Explore the language of identity and image.",
          },
          {
            name: "Pitch Room",
            description: "Step into the world of persuasive comms.",
          },
          {
            name: "C-Suite",
            description: "Home to acronyms at the executive level.",
          },
          {
            name: "Org Chart",
            description: "From intern to CEO, all roles covered.",
          },
        ],
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
        rooms: [
          {
            name: "Quantum Lab",
            description: "Explore the building blocks of the universe.",
          },
          {
            name: "Bio Dome",
            description: "Dive into life sciences and living systems.",
          },
          {
            name: "Code Cell",
            description: "Navigate acronyms from the world of software.",
          },
          {
            name: "AI Core",
            description:
              "Discover terms from machine learning and intelligence.",
          },
          {
            name: "Rocket Bay",
            description: "Launch into topics about space and beyond.",
          },
          {
            name: "Nano Zone",
            description: "Focus on small particles and big discoveries.",
          },
          {
            name: "Lab Bench",
            description: "A mix of hands-on science and technical trivia.",
          },
          {
            name: "Data Stream",
            description: "Travel through logic, info, and binary buzz.",
          },
          {
            name: "Orbit Base",
            description: "Explore space missions, satellites, and systems.",
          },
          {
            name: "Neural Net",
            description: "A mind map of brainy AI acronyms.",
          },
          {
            name: "Fusion Point",
            description: "Where energy, physics, and technology collide.",
          },
          {
            name: "Genetics Hub",
            description: "Crack the code of biology and heredity.",
          },
          {
            name: "Hack Lab",
            description: "Touch on cyber, code, and clever solutions.",
          },
          {
            name: "Cosmic Deck",
            description: "Browse stellar knowledge from the universe.",
          },
          {
            name: "Server Rack",
            description: "Explore backend tech, data, and hardware terms.",
          },
          {
            name: "Turing Room",
            description: "Where computing history meets modern tech.",
          },
          {
            name: "Tech Frontier",
            description: "Step into the edge of innovation.",
          },
          {
            name: "Bot Bay",
            description: "Automation, robotics, and future tech await.",
          },
          {
            name: "Field Test",
            description: "Put your applied science knowledge to work.",
          },
          {
            name: "Cloud Space",
            description: "Buzzwords from hosting, scaling, and storage.",
          },
          {
            name: "Research Wing",
            description: "Study-focused terminology in science and tech.",
          },
          {
            name: "Logic Gate",
            description: "Digital circuits and binary challenges.",
          },
          {
            name: "Deep Space",
            description: "Go far out with distant and theoretical ideas.",
          },
          {
            name: "Bio Lab",
            description: "Microscopes, molecules, and mystery facts.",
          },
          {
            name: "AI Lab",
            description: "Neurons, algorithms, and learning machines.",
          },
          {
            name: "Digital Circuit",
            description: "Electric energy flows through these clues.",
          },
          {
            name: "Black Box",
            description: "Mysterious tech and opaque systems revealed.",
          },
          {
            name: "Innovation Pod",
            description: "Home of breakthroughs and fresh ideas.",
          },
          {
            name: "The Observatory",
            description: "Watch the stars, and decode the science.",
          },
          {
            name: "Tech Terminal",
            description: "A launchpad for gadgetry and software terms.",
          },
        ],
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
        rooms: [
          {
            name: "Capitol Hall",
            description: "Where national systems and structures meet.",
          },
          {
            name: "Justice Bench",
            description: "Legal minds and courtroom clues converge here.",
          },
          {
            name: "Policy Chamber",
            description: "Unpack the layers of governance and law.",
          },
          {
            name: "The Constitution",
            description: "Terms rooted in foundational governance.",
          },
          {
            name: "Defense Wing",
            description: "Military and strategic acronyms take the floor.",
          },
          {
            name: "Civic Forum",
            description: "Public services, structures, and civil terms.",
          },
          {
            name: "Party Lines",
            description: "Navigate through acronyms of political ideologies.",
          },
          {
            name: "The Senate",
            description: "Step into a room of structured debates and codes.",
          },
          {
            name: "Legal Pad",
            description: "Sift through clauses, briefs, and rulings.",
          },
          {
            name: "Military Base",
            description: "Acronyms from combat zones to command centers.",
          },
          {
            name: "Bill Draft",
            description: "Where policies, procedures, and reforms emerge.",
          },
          {
            name: "Civic Desk",
            description: "Terms from the public service and government roles.",
          },
          {
            name: "Federal Hub",
            description: "National organizations and central agencies unite.",
          },
          {
            name: "The Lobby",
            description: "Acronyms that move the needle behind the scenes.",
          },
          {
            name: "Command Post",
            description: "Decode chain-of-command and agency terms.",
          },
          {
            name: "Courtroom Floor",
            description: "Trials, precedents, and judicial lingo live here.",
          },
          {
            name: "Parliament Place",
            description: "Parliamentary concepts from global systems.",
          },
          {
            name: "Treaty Table",
            description: "Explore international agreements and legal lingo.",
          },
          {
            name: "Constitution Row",
            description: "Deep dive into the structures that shape law.",
          },
          {
            name: "Homeland Deck",
            description: "Domestic policies and internal security terms.",
          },
          {
            name: "Law Library",
            description: "A place for terminology from the books.",
          },
          {
            name: "Security Briefing",
            description: "Classified acronyms meet open questions.",
          },
          {
            name: "Policy Lab",
            description: "Experiment with government-related themes.",
          },
          {
            name: "Election Bay",
            description: "Navigate acronyms from the campaign trail.",
          },
          {
            name: "The Agency",
            description: "A safehouse for acronym-heavy departments.",
          },
          {
            name: "Bill Room",
            description: "Track the journey from proposal to policy.",
          },
          {
            name: "Case Docket",
            description: "Legal processes, filings, and courtroom terms.",
          },
          {
            name: "Public Chamber",
            description: "Governance, regulation, and civil discussion.",
          },
          {
            name: "Statute Hall",
            description: "Where rules, acts, and codes line the walls.",
          },
          {
            name: "Diplomatic Deck",
            description: "Embassies, treaties, and international affairs.",
          },
        ],
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
        rooms: [
          {
            name: "Stadium Zone",
            description: "Big plays, big names, and bigger noise.",
          },
          {
            name: "Esports Arena",
            description: "Digital battles and tactical titles await.",
          },
          {
            name: "The Locker Room",
            description: "Sports talk and sweaty strategies collide.",
          },
          {
            name: "Controller Chaos",
            description: "Fast fingers meet faster reflexes.",
          },
          {
            name: "The Dugout",
            description: "Home base for teams, scores, and stats.",
          },
          {
            name: "Gaming Grid",
            description: "A digital playground of acronyms and power-ups.",
          },
          {
            name: "The Pitch",
            description: "Where leagues, goals, and football terms thrive.",
          },
          {
            name: "Board Game Base",
            description: "Roll the dice, and test your brain.",
          },
          {
            name: "Tactics Room",
            description: "Strategies, counters, and coaching codes.",
          },
          {
            name: "Arcade Alley",
            description: "Retro buzz meets modern pixels.",
          },
          {
            name: "Match Point",
            description: "Serving up sports terms with style.",
          },
          {
            name: "PvP Lobby",
            description: "1v1 terms and online showdown slang.",
          },
          {
            name: "Fantasy Draft",
            description: "Pick your team, learn the lingo.",
          },
          {
            name: "Speed Run",
            description: "Race through fast-paced gaming references.",
          },
          {
            name: "Team Chat",
            description: "Squad lingo and multiplayer madness.",
          },
          {
            name: "Overtime",
            description: "Because the game's never really over.",
          },
          {
            name: "Guild Hall",
            description: "Where alliances, raids, and roles reign.",
          },
          {
            name: "Penalty Box",
            description: "Rules, fouls, and a touch of mischief.",
          },
          {
            name: "XP Farm",
            description: "Grind your way through gaming jargon.",
          },
          {
            name: "Coach's Corner",
            description: "Training terms and winning talk.",
          },
          {
            name: "Final Boss",
            description: "Endgame acronyms with high-stakes energy.",
          },
          {
            name: "Highlight Reel",
            description: "Top plays and iconic sports slang.",
          },
          {
            name: "Midfield",
            description: "A central mix of leagues and lingo.",
          },
          {
            name: "Minigame Zone",
            description: "Short bursts of acronym-packed play.",
          },
          {
            name: "The Arena",
            description: "Classic battles, iconic venues, sharp minds.",
          },
          {
            name: "Clan Wars",
            description: "Competitive terms from team-based titles.",
          },
          {
            name: "Sub Bench",
            description: "Where backups get their time to shine.",
          },
          {
            name: "Ref's Whistle",
            description: "Rules, reviews, and regulatory talk.",
          },
          {
            name: "Power Play",
            description: "Amped-up rounds full of energy and edge.",
          },
          {
            name: "Game Lobby",
            description: "The wait before the storm of acronym action.",
          },
        ],
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
        rooms: [
          {
            name: "Wellness Hub",
            description: "Where good vibes and better terms live.",
          },
          {
            name: "Fit Zone",
            description: "Packed with reps, routines, and rare acronyms.",
          },
          {
            name: "Mental Gym",
            description: "Flex your brain cells and mindful memory.",
          },
          {
            name: "The Clinic",
            description: "A clean space for clinical curiosities.",
          },
          {
            name: "Detox Bay",
            description: "Light and breezy wellness-focused terms.",
          },
          {
            name: "Nutrition Lab",
            description: "Serving alphabet soup with a healthy twist.",
          },
          {
            name: "Yoga Mat",
            description: "Stretch out the acronyms and good posture.",
          },
          {
            name: "Heart Room",
            description: "Pump through cardio terms and caring concepts.",
          },
          {
            name: "Brain Boost",
            description: "Mental health meets acronym mystery.",
          },
          {
            name: "The Pharmacy",
            description: "Prescriptions, pills, and plenty of puns.",
          },
          {
            name: "First Aid Tent",
            description: "Quick care terms—bandage not included.",
          },
          {
            name: "Self-Care Suite",
            description: "Relax, recharge, and recognize acronyms.",
          },
          {
            name: "Doctor's Desk",
            description: "Paging trivia professionals to decode terms.",
          },
          {
            name: "Stretch Station",
            description: "Light moves and lighter meanings.",
          },
          {
            name: "Mind Spa",
            description: "A relaxing soak in acronyms of clarity.",
          },
          {
            name: "Cardio Corner",
            description: "Quick, intense, and acronym-heavy.",
          },
          {
            name: "Sleep Lab",
            description: "Rest easy, but don't snooze on the clues.",
          },
          { name: "Muscle Mode", description: "Lift heavy... vocabulary." },
          {
            name: "Hydration Point",
            description: "Quench your thirst for terminology.",
          },
          {
            name: "The Waiting Room",
            description: "Patience is a virtue—so is acronym knowledge.",
          },
          {
            name: "Wellbeing Wing",
            description: "A gentle stroll through healthy lingo.",
          },
          {
            name: "Herbal Room",
            description: "Natural terms with slightly spicy meanings.",
          },
          {
            name: "Therapy Couch",
            description: "Sit back and solve some feel-good terms.",
          },
          {
            name: "Fit Tracker",
            description: "Steps, stats, and fitness talk all around.",
          },
          { name: "Body Scan", description: "Zoom into anatomical acronyms." },
          {
            name: "Recovery Room",
            description: "Slow-paced, healing-themed fun.",
          },
          {
            name: "Medical Maze",
            description: "Navigate a twisty corridor of clinical terms.",
          },
          {
            name: "The Syringe",
            description: "Sharp clues with precision points.",
          },
          {
            name: "Vital Signs",
            description: "Stable trivia for unstable answers.",
          },
          {
            name: "The Pulse",
            description: "Always on beat with the latest health lingo.",
          },
        ],
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
        rooms: [],
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
        rooms: [
          {
            name: "Globe Trotters",
            description: "Wander the world, one acronym at a time.",
          },
          {
            name: "Air Control",
            description: "Where runways and codes go full throttle.",
          },
          {
            name: "Checkpoint",
            description: "Stop here for a border-crossing brain workout.",
          },
          {
            name: "Travel Desk",
            description: "Your one-stop trivia agency for global lingo.",
          },
          {
            name: "Jetstream",
            description: "Catch high-altitude terms on the fly.",
          },
          {
            name: "Island Hopper",
            description: "Jump between destinations—no passport needed.",
          },
          {
            name: "Map Room",
            description: "Get lost in coordinates, codes, and clues.",
          },
          {
            name: "Baggage Claim",
            description: "Pick up scattered trivia from all over.",
          },
          {
            name: "Terminal Gate",
            description: "Your departure point for acronym adventures.",
          },
          {
            name: "Continental Drift",
            description: "Move between landmasses and layered lingo.",
          },
          {
            name: "Border Patrol",
            description: "Scan through codes and customs trivia.",
          },
          {
            name: "Mountainside",
            description: "High-altitude landmarks and steep clues.",
          },
          {
            name: "City Central",
            description: "Where urban names and codes converge.",
          },
          {
            name: "Runway Lane",
            description: "Takeoff with airport acronyms and sky-high facts.",
          },
          {
            name: "The Compass",
            description:
              "North, South, East, West—your brain goes all directions.",
          },
          {
            name: "Ticket Booth",
            description: "Pick a trivia destination and punch your card.",
          },
          {
            name: "Harbor View",
            description: "Sail through ports, coasts, and coastal codes.",
          },
          {
            name: "Passport Zone",
            description: "International trivia with a stamped flair.",
          },
          {
            name: "The Outpost",
            description: "Remote trivia locations with distant charm.",
          },
          {
            name: "Subway Line",
            description: "Underground clues with fast tracks to answers.",
          },
          {
            name: "Travel Guide",
            description: "Navigate through terms like a seasoned tourist.",
          },
          {
            name: "Wayfinder",
            description: "Direction-based clues with global vibes.",
          },
          {
            name: "Tour Bus",
            description: "Hop on for trivia stops across the globe.",
          },
          {
            name: "Global Station",
            description: "Where all routes and questions connect.",
          },
          {
            name: "Cruise Deck",
            description: "Set sail with smooth-sounding acronyms.",
          },
          {
            name: "Desert Trail",
            description: "Dry humor and sandy trivia await.",
          },
          {
            name: "Rail Stop",
            description: "Trackside terms for trivia travelers.",
          },
          {
            name: "Sky Tower",
            description: "Tall on trivia, high on travel facts.",
          },
          {
            name: "Lagoon Lounge",
            description: "Chill trivia with an island twist.",
          },
          {
            name: "Time Zone",
            description: "No jet lag here—just round-the-world riddles.",
          },
        ],
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
        rooms: [
          {
            name: "Time Capsule",
            description: "Where old terms are sealed with curiosity.",
          },
          {
            name: "The Archive",
            description: "A quiet corner filled with loud legacies.",
          },
          {
            name: "Tradition Trail",
            description: "Follow customs, rituals, and coded clues.",
          },
          {
            name: "Rewind Room",
            description: "Back in time, forward with trivia.",
          },
          {
            name: "Legends Lounge",
            description: "Pull up a chair beside historical greatness.",
          },
          {
            name: "Festival Field",
            description: "Where global celebrations throw trivia confetti.",
          },
          {
            name: "Hall of Names",
            description: "Famous figures, unforgettable acronyms.",
          },
          {
            name: "Monument Mile",
            description: "Stone cold clues with historical charm.",
          },
          {
            name: "The Citadel",
            description: "Strongholds of tradition and acronym strength.",
          },
          {
            name: "Era Room",
            description: "Walk through timelines without the time travel.",
          },
          {
            name: "Culture Club",
            description: "Pop in for a dose of global flair.",
          },
          {
            name: "Dynasty Den",
            description: "Royal trivia with regal relevance.",
          },
          {
            name: "Scroll Chamber",
            description: "Unroll history's most cryptic abbreviations.",
          },
          {
            name: "Past & Present",
            description: "Where yesterday's terms meet today's trivia.",
          },
          {
            name: "Torch Bearers",
            description: "Guided by leaders, lit with legacy.",
          },
          {
            name: "Tradition Hall",
            description: "No dress code required—just classic knowledge.",
          },
          {
            name: "Historic Crossroads",
            description: "Decisions, dates, and documented turns.",
          },
          {
            name: "Cultural Circuit",
            description: "Loop around the globe without leaving your seat.",
          },
          { name: "Legacy Room", description: "A chamber of timeless trivia." },
          {
            name: "Folk Hall",
            description: "Tune into traditions and timeless talk.",
          },
          {
            name: "Heritage Square",
            description: "Foundations laid in acronym-shaped bricks.",
          },
          {
            name: "War Room",
            description: "Tactics, treaties, and tough terms.",
          },
          {
            name: "Festival Tent",
            description: "A party of clues from every culture.",
          },
          {
            name: "The Archives",
            description: "Deep dives into dusty details.",
          },
          {
            name: "Pioneer Path",
            description: "Trailblazers and trendsetters trivia.",
          },
          {
            name: "The Vault",
            description: "Locked away stories waiting to be solved.",
          },
          {
            name: "March of Time",
            description: "Step-by-step through milestones and mystery.",
          },
          {
            name: "Hero's Hall",
            description: "Salute the acronyms of courage and change.",
          },
          {
            name: "The Timeline",
            description: "From ancient to modern, all in one scroll.",
          },
          {
            name: "Civic Circle",
            description: "Public movements and historic acronyms unite.",
          },
        ],
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
        rooms: [
          {
            name: "Red Carpet",
            description: "Shiny trivia moments, no dress code required.",
          },
          {
            name: "Streaming Room",
            description: "Binge-worthy acronyms on demand.",
          },
          {
            name: "Studio A",
            description: "Lights, camera, clue-solving action.",
          },
          {
            name: "Popcorn Booth",
            description: "Hot trivia served with extra butter.",
          },
          {
            name: "Channel Surf",
            description: "Flip through trivia faster than TV ads.",
          },
          {
            name: "Award Shelf",
            description: "Trophies, titles, and terms in gold.",
          },
          {
            name: "Hollywood Lane",
            description: "Big lights, bigger abbreviations.",
          },
          {
            name: "Script Room",
            description: "Plot twists and punchlines in acronym form.",
          },
          {
            name: "Cinema Club",
            description: "Where every clue deserves a sequel.",
          },
          {
            name: "The Binge Zone",
            description: "One clue per episode... or thirty.",
          },
          {
            name: "Network Hub",
            description: "Televised trivia from the acronym universe.",
          },
          {
            name: "Fandom Lounge",
            description: "Obsess responsibly over media-laced clues.",
          },
          {
            name: "Behind the Scenes",
            description: "Trivia from the cutting room floor.",
          },
          {
            name: "Media Vault",
            description: "Locked-in legends and catchy codes.",
          },
          { name: "Showtime", description: "Roll the trivia reel!" },
          {
            name: "The Premiere",
            description: "Opening night for brain-bending trivia.",
          },
          {
            name: "TV Guide",
            description: "Every clue's got a scheduled appearance.",
          },
          {
            name: "Casting Call",
            description: "Try your luck on trivia's main stage.",
          },
          {
            name: "The Credits",
            description: "Everyone gets mentioned—including acronyms.",
          },
          {
            name: "Director's Cut",
            description: "Extra scenes, extended clues.",
          },
          {
            name: "Sitcom Set",
            description: "Laugh tracks not included—but clues are.",
          },
          {
            name: "The Trailer",
            description: "Preview some wild acronym action.",
          },
          {
            name: "Blockbuster Bay",
            description: "Big hits, big clues, big popcorn.",
          },
          {
            name: "Animation Station",
            description: "Drawn-out clues with animated fun.",
          },
          {
            name: "Spoiler Zone",
            description: "Warning: Trivia may reveal plot twists.",
          },
          {
            name: "Broadcast Booth",
            description: "Loud, clear, and trivia-ready.",
          },
          {
            name: "Playlist Room",
            description: "Streamlined challenges in audio-visual form.",
          },
          {
            name: "Series Central",
            description: "Keep up with episodic acronyms.",
          },
          {
            name: "The Reboot",
            description: "Same old category, brand new clues.",
          },
          {
            name: "Laugh Track",
            description: "Comedy and clues go hand in hand.",
          },
        ],
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
        rooms: [
          {
            name: "Bull Market",
            description: "Things are up... except your clue-solving speed.",
          },
          {
            name: "The Vault",
            description: "Secure your knowledge before the market closes.",
          },
          {
            name: "Crypto Cave",
            description: "Mined clues and digital mysteries await.",
          },
          {
            name: "Dividend Den",
            description: "Paying out clues at regular intervals.",
          },
          {
            name: "Fiscal Floor",
            description: "Where budget terms meet big trivia.",
          },
          {
            name: "Investment Club",
            description: "Speculate wildly on acronym returns.",
          },
          {
            name: "The Exchange",
            description: "Trade clues like stocks—carefully and quickly.",
          },
          {
            name: "Risk Zone",
            description: "High risk, high reward... or high confusion.",
          },
          {
            name: "The Ledger",
            description: "Where clues are always balanced (we hope).",
          },
          {
            name: "Cash Flow",
            description: "Clues coming in fast, like liquid assets.",
          },
          {
            name: "Piggy Bank",
            description: "Small terms, big savings on brainpower.",
          },
          {
            name: "Inflation Station",
            description: "Expect clues to grow and burst.",
          },
          {
            name: "Stock Ticker",
            description: "Clues scroll fast—don't miss your entry point.",
          },
          {
            name: "Budget Booth",
            description: "Clues allocated line by line.",
          },
          {
            name: "The Treasury",
            description: "Packed with valuable, golden terms.",
          },
          {
            name: "Credit Line",
            description: "Solve now, think later—just like a loan.",
          },
          {
            name: "Capital Gains",
            description: "Where smart moves earn bragging rights.",
          },
          {
            name: "Debt Desk",
            description: "Pay your dues in answers and guesses.",
          },
          {
            name: "Bear Market",
            description: "Clues are tough, and the trend is downward.",
          },
          {
            name: "Rate Watch",
            description: "Time your answers like interest spikes.",
          },
          {
            name: "Bonds Room",
            description: "Strong connections between questions.",
          },
          {
            name: "Economic Engine",
            description: "Fueled by theories and jargon.",
          },
          {
            name: "Safe Deposit",
            description: "Your best guesses go here for safekeeping.",
          },
          {
            name: "IPO Zone",
            description: "New questions hit the market hot!",
          },
          {
            name: "Commodities Corner",
            description: "Where trivia is the real gold.",
          },
          { name: "Audit Trail", description: "Every clue has a paper trail." },
          {
            name: "Monetary Maze",
            description: "Find your way through fiscal confusion.",
          },
          {
            name: "Portfolio Place",
            description: "Diversify your clues for optimal returns.",
          },
          {
            name: "Gold Standard",
            description: "Only premium trivia here, naturally.",
          },
          {
            name: "Wall Street Wing",
            description: "Busy buzzwords and boardroom-ready trivia.",
          },
        ],
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
        rooms: [
          {
            name: "Green Zone",
            description: "Fresh air, fresh clues — keep it clean.",
          },
          {
            name: "Eco Chamber",
            description: "Where ideas (and trivia) echo green values.",
          },
          {
            name: "Recycle Bin",
            description: "No wrong answers go to waste here.",
          },
          {
            name: "Carbon Cave",
            description: "Trace the emissions of mysterious acronyms.",
          },
          {
            name: "The Canopy",
            description: "Leafy trivia from the top of the green world.",
          },
          {
            name: "Solar Station",
            description: "Powered by light... and obscure knowledge.",
          },
          {
            name: "Wind Tunnel",
            description: "Clues that blow your mind, sustainably.",
          },
          {
            name: "Trash Talk",
            description: "Sort through the mess and find the facts.",
          },
          {
            name: "Greenhouse",
            description: "Grow ideas and occasionally sweat a little.",
          },
          {
            name: "Ocean Watch",
            description: "Waves of trivia, no plastic in sight.",
          },
          {
            name: "The Compost",
            description: "Old clues break down into fresh insights.",
          },
          {
            name: "Rainforest Room",
            description: "Thick with terms, dense with drama.",
          },
          {
            name: "The Glacier",
            description: "Cool clues that melt your brain.",
          },
          {
            name: "Sustainable Street",
            description: "Built with eco-friendly facts and recycled jokes.",
          },
          {
            name: "Wildlife Walk",
            description: "Tiptoe through nature-themed challenges.",
          },
          {
            name: "The Carbon Market",
            description: "Offset your confusion with better guesses.",
          },
          {
            name: "Nature Nook",
            description: "A cozy green space for leafy questions.",
          },
          {
            name: "Pollution Patrol",
            description: "Smoggy terms with a clear solution.",
          },
          {
            name: "The Reserve",
            description: "Protecting rare acronyms from extinction.",
          },
          { name: "Eco Alert", description: "Flash trivia warnings ahead!" },
          {
            name: "Sustainability Circle",
            description: "A loop of renewable clues.",
          },
          {
            name: "The Deforested Desk",
            description: "Paperless puzzles with environmental edge.",
          },
          {
            name: "Plastic Free Zone",
            description: "No wrappers, just raw questions.",
          },
          {
            name: "The Water Table",
            description: "Dive deep, avoid the trivia drought.",
          },
          {
            name: "Zero Waste Room",
            description: "Nothing thrown out—especially bad guesses.",
          },
          {
            name: "Climate Watch",
            description: "Forecast calls for cloudy with a chance of trivia.",
          },
          {
            name: "BioDome",
            description: "A self-contained ecosystem of puzzling clues.",
          },
          {
            name: "The Habitat",
            description: "Safe space for wild terms and conservation chaos.",
          },
          {
            name: "Green Bill",
            description: "Policy-packed puzzles with legislative flair.",
          },
          { name: "The Earth Deck", description: "One planet, many puzzles." },
        ],
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
        rooms: [
          {
            name: "Style Studio",
            description: "Where clues always dress to impress.",
          },
          {
            name: "The Runway",
            description: "Strut your smarts like it's fashion week.",
          },
          {
            name: "Wardrobe Box",
            description: "Packed with chic and confusing terms.",
          },
          {
            name: "Beauty Bar",
            description: "Glossy trivia with a matte finish.",
          },
          {
            name: "Trend Spot",
            description: "Only the latest looks in clue couture.",
          },
          {
            name: "Glam Lounge",
            description: "Sparkly vibes and glam-packed puzzles.",
          },
          {
            name: "Sneaker Room",
            description: "Fresh kicks and fresher trivia.",
          },
          {
            name: "The Lookbook",
            description: "Flip through some stylish brain teasers.",
          },
          {
            name: "Vibe Check",
            description: "Your answers better match the aesthetic.",
          },
          {
            name: "The Catwalk",
            description: "Elegant terms with tricky turns.",
          },
          {
            name: "Closet Chaos",
            description: "Clues hidden between coats and chaos.",
          },
          {
            name: "Trendsetters",
            description: "Lead the game in high-style guessing.",
          },
          {
            name: "Fit Check",
            description: "Is your brain dressed for success?",
          },
          {
            name: "Glow Up",
            description: "From zero to style hero, clue by clue.",
          },
          {
            name: "Lifestyle Lab",
            description: "Mix and match ideas like outfits.",
          },
          {
            name: "The Mirror Room",
            description: "Look sharp—trivia's watching you.",
          },
          {
            name: "Brand Box",
            description: "Where popular names hide in plain sight.",
          },
          {
            name: "Style Council",
            description: "Vote on trends, slay the questions.",
          },
          {
            name: "The Hanger",
            description: "Where we hang clues... and maybe coats.",
          },
          {
            name: "Minimal Mood",
            description: "Sleek puzzles. Simple answers. Maximum vibes.",
          },
          {
            name: "Glitz Grid",
            description: "A matrix of glam and glossy challenges.",
          },
          {
            name: "The Mannequin",
            description: "Still puzzles with high-fashion form.",
          },
          { name: "Haute Spot", description: "High-end clues, low-key chaos." },
          {
            name: "Yoga Mat",
            description: "Stretch your thoughts, flex your trivia.",
          },
          { name: "Chic Circle", description: "Only stylish minds allowed." },
          {
            name: "The Label Room",
            description: "Decode what's behind the brand tags.",
          },
          {
            name: "Fitspiration",
            description: "Work out your brain with aesthetic clues.",
          },
          { name: "Look Good", description: "Feel good. Guess better." },
          { name: "The Lounge", description: "Soft pillows, strong answers." },
          {
            name: "Polish Pad",
            description: "Everything here is sleek—except the clues.",
          },
        ],
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
        rooms: [
          {
            name: "Command Post",
            description: "Where orders fly and answers deploy.",
          },
          { name: "The Barracks", description: "Get your facts in formation." },
          {
            name: "Recon Room",
            description: "Scout the area for hidden clues.",
          },
          {
            name: "Alpha Base",
            description: "Ground zero for tactical trivia.",
          },
          {
            name: "Mission Brief",
            description: "Get briefed and baffled all at once.",
          },
          {
            name: "The Hangar",
            description: "Park your doubts, launch your logic.",
          },
          {
            name: "Tactical Zone",
            description: "Engage targets with precision and guesses.",
          },
          {
            name: "Delta Ops",
            description: "Special forces-level clue cracking.",
          },
          {
            name: "The Arsenal",
            description: "Loaded with powerful terminology.",
          },
          { name: "Echo Squad", description: "Repeat after me: ‘I got this.'" },
          {
            name: "Supply Chain",
            description: "Delivering clues with military efficiency.",
          },
          {
            name: "Secure Perimeter",
            description: "Nothing gets in but answers.",
          },
          { name: "The Bunker", description: "Safe place for risky guesses." },
          { name: "Air Strike", description: "Clues drop fast — stay alert." },
          {
            name: "Naval Ops",
            description: "Smooth sailing or sinking facts?",
          },
          {
            name: "Code Red",
            description: "It's not an emergency, just tricky trivia.",
          },
          {
            name: "Foxtrot Field",
            description: "A fancy way to dance around questions.",
          },
          { name: "Blackout Room", description: "Go dark, think deep." },
          {
            name: "Bravo Bunker",
            description: "Applaud yourself for showing up.",
          },
          {
            name: "Combat Deck",
            description: "Locked, loaded, and clue-ready.",
          },
          { name: "Radar Room", description: "Nothing gets past your signal." },
          {
            name: "Peace Zone",
            description: "Tranquil vibes, tactical trivia.",
          },
          {
            name: "The Outpost",
            description: "Remote questions from deep cover.",
          },
          {
            name: "Launch Pad",
            description: "Blast off with powerful guesses.",
          },
          { name: "War Room", description: "Strategy meets sudden brain fog." },
          {
            name: "Field Manual",
            description: "Clues come with no instructions.",
          },
          {
            name: "Sentry Point",
            description: "Keep watch over tricky acronyms.",
          },
          {
            name: "Parade Ground",
            description: "March your thoughts into formation.",
          },
          {
            name: "Recon Base",
            description: "Intel gathering disguised as trivia.",
          },
          {
            name: "Zone Zero",
            description: "Where things begin... and go boom.",
          },
        ],
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
        rooms: [
          {
            name: "The Pantry",
            description: "Stocked with clues you might actually use.",
          },
          {
            name: "Shortcut Keys",
            description: "Quick trivia for the daily multitasker.",
          },
          {
            name: "The Bus Stop",
            description: "Don't miss the next clue—next stop: genius.",
          },
          {
            name: "App World",
            description: "All your favorite apps... with extra confusion.",
          },
          {
            name: "Laundry Room",
            description: "Spin cycles and mind puzzles included.",
          },
          {
            name: "Coffee Break",
            description: "Perk up your brain while the kettle boils.",
          },
          {
            name: "Daily Dose",
            description: "One trivia question a day keeps the fog away.",
          },
          {
            name: "Inbox Overflow",
            description: "Because your brain has no spam filter.",
          },
          {
            name: "The Hallway",
            description: "Where everyday thoughts wander freely.",
          },
          {
            name: "Kitchen Sink",
            description: "Trivia with everything (and the sink).",
          },
          {
            name: "Phone Zone",
            description: "Tap your memory like it's a touchscreen.",
          },
          {
            name: "Living Room",
            description: "Comfortable chaos and cozy confusion.",
          },
          {
            name: "Morning Routine",
            description: "Rise, shine, and scramble for answers.",
          },
          { name: "FAQ Room", description: "Frequently unanswered questions." },
          {
            name: "Service Station",
            description: "Where facts get a quick tune-up.",
          },
          { name: "Metro Line", description: "A fast track to trivia town." },
          {
            name: "Toolbox",
            description: "Wrenches, screwdrivers, and mental fixes.",
          },
          {
            name: "Ping Room",
            description: "Clues incoming... better answer fast.",
          },
          {
            name: "Smart Home",
            description: "Automated chaos and trivia control.",
          },
          {
            name: "Daily Grind",
            description: "Work your way through some casual confusion.",
          },
          {
            name: "Trash Day",
            description: "Sort through nonsense for hidden gems.",
          },
          {
            name: "The Mall",
            description: "Trivia shopping with mental coupons.",
          },
          {
            name: "Recycle Center",
            description: "Where old clues find new meaning.",
          },
          {
            name: "Sticky Notes",
            description: "Little reminders of how much you don't know.",
          },
          {
            name: "Quick Fix",
            description: "Short, sharp, and oddly satisfying trivia.",
          },
          {
            name: "The Fridge",
            description: "Cool storage for lukewarm guesses.",
          },
          {
            name: "Lost & Found",
            description: "Find the clue, lose your sanity.",
          },
          {
            name: "Remote Control",
            description: "Flip through trivia channels on demand.",
          },
          {
            name: "Fast Lane",
            description: "Everyday questions at top speed.",
          },
          {
            name: "Public Notice",
            description: "General facts for general people.",
          },
        ],
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
        rooms: [
          {
            name: "The Equation Den",
            description: "Where numbers gather and plot things.",
          },
          {
            name: "Pi Room",
            description: "Endless trivia... just like the number.",
          },
          {
            name: "The Variable Vault",
            description: "x marks the spot, but where?",
          },
          {
            name: "Infinity Loop",
            description: "This might go on forever... or not.",
          },
          {
            name: "The Hypotenuse",
            description: "Where all sides are equally confused.",
          },
          {
            name: "Number Crunch",
            description: "Chew through digits, spit out facts.",
          },
          {
            name: "The Proof Room",
            description: "Where nothing is assumed... except fun.",
          },
          {
            name: "Tangent Territory",
            description: "Try to stay on topic — good luck.",
          },
          {
            name: "The Function Lab",
            description: "All functions, little functionality.",
          },
          { name: "Graph Zone", description: "Plot twists and XY drama." },
          {
            name: "Prime Time",
            description: "Only the finest, indivisible questions.",
          },
          {
            name: "The Radian Room",
            description: "It's not irrational to play here.",
          },
          {
            name: "Factor Field",
            description: "Breaking things down is half the fun.",
          },
          {
            name: "The Log Cabin",
            description: "Exponential fun. Logarithmic confusion.",
          },
          {
            name: "Sigma Space",
            description: "Everything adds up… eventually.",
          },
          {
            name: "The Math Cave",
            description: "Echoes of equations everywhere.",
          },
          {
            name: "Decimal Point",
            description: "Just enough trivia to shift the balance.",
          },
          {
            name: "Random Walk",
            description: "Guess and go with statistical swagger.",
          },
          {
            name: "Parallel Place",
            description: "You'll never intersect with boredom.",
          },
          {
            name: "The Matrix",
            description: "There is no spoon, but there are numbers.",
          },
          {
            name: "Modulo Hub",
            description: "Things get weird after division.",
          },
          {
            name: "The Derivative Den",
            description: "Everything changes. Constantly.",
          },
          { name: "Cube Corner", description: "All sides point to confusion." },
          {
            name: "Zero Zone",
            description: "The starting point of trivia greatness.",
          },
          {
            name: "Angle Alley",
            description: "All perspectives welcome, even obtuse ones.",
          },
          {
            name: "The Mean Room",
            description: "Where statistics come to misbehave.",
          },
          {
            name: "Circle Sector",
            description: "Round and round the answers go.",
          },
          {
            name: "Probability Pit",
            description: "Chances are, you'll guess it right.",
          },
          {
            name: "Quadratic Quarters",
            description: "Solutions come in pairs, mostly.",
          },
          {
            name: "The Sum Room",
            description: "The total experience in every way.",
          },
        ],
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
        rooms: [
          {
            name: "The Lab Coat",
            description: "Things get messy, but in a smart way.",
          },
          {
            name: "Elemental Zone",
            description: "Where trivia reacts explosively.",
          },
          {
            name: "Petri Dish",
            description: "Culturing curiosity since forever.",
          },
          {
            name: "Gravity Chamber",
            description: "What goes up… gets questioned here.",
          },
          {
            name: "Atomic Lounge",
            description: "Small particles, big confusion.",
          },
          {
            name: "The Greenhouse",
            description: "Where answers grow unpredictably.",
          },
          {
            name: "DNA Den",
            description: "Twisted fun in every double helix.",
          },
          {
            name: "The Bunsen Room",
            description: "Things heat up fast — no goggles needed.",
          },
          {
            name: "Star Field",
            description: "Out-of-this-world trivia every time.",
          },
          {
            name: "The Cell Block",
            description: "Microscopic chaos, huge fun.",
          },
          {
            name: "Reaction Room",
            description: "Mix knowledge and see what blows up.",
          },
          {
            name: "The Particle Pit",
            description: "Where quarks and confusion collide.",
          },
          {
            name: "The Fossil Site",
            description: "Dig deep. Or just wildly guess.",
          },
          {
            name: "Orbit Zone",
            description: "Trivia that keeps going in circles.",
          },
          {
            name: "Telescope Deck",
            description: "Zoom in on universal weirdness.",
          },
          {
            name: "The Ecosphere",
            description: "Balanced chaos in every round.",
          },
          {
            name: "Quantum Corner",
            description: "You both know and don't know the answer.",
          },
          {
            name: "Volcano Bay",
            description: "Eruptions of facts and wild guesses.",
          },
          {
            name: "The Magnet Room",
            description: "Attracting the strangest questions.",
          },
          {
            name: "The Nervous System",
            description: "Tingling with scientific suspense.",
          },
          {
            name: "Black Hole HQ",
            description: "Once you're in, there's no escape.",
          },
          {
            name: "Chemical Bond",
            description: "Forming unstable trivia connections.",
          },
          {
            name: "Storm Cellar",
            description: "Where lightning strikes your brain.",
          },
          {
            name: "The Tectonic Lab",
            description: "Shifting knowledge under pressure.",
          },
          {
            name: "Genome Gym",
            description: "Stretch your strands of thought.",
          },
          {
            name: "Rocket Pad",
            description: "Launch into layers of nerdy fun.",
          },
          { name: "Wave Lab", description: "Catch a trivia frequency." },
          {
            name: "The Mutation Zone",
            description: "Where facts evolve in strange ways.",
          },
          { name: "Matter Market", description: "Buy low, think high." },
          {
            name: "The Observatory",
            description: "Seeing stars — and maybe answers.",
          },
        ],
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
        rooms: [
          {
            name: "Time Travelers",
            description: "No flux capacitor required, just facts.",
          },
          {
            name: "The Old Scroll",
            description: "Dusty knowledge and classic chaos.",
          },
          {
            name: "Empire Echoes",
            description: "Ruins of trivia from great empires.",
          },
          {
            name: "The Archive",
            description: "All the stuff they didn't teach in school.",
          },
          {
            name: "History Hall",
            description: "Echoes of the past, and a bit of confusion.",
          },
          {
            name: "The Battlefield",
            description: "Trivia wars with zero casualties.",
          },
          {
            name: "Founding Room",
            description: "Where it all kind of started.",
          },
          {
            name: "The Crown Room",
            description: "Heavy lies the head… that guesses wrong.",
          },
          {
            name: "Ancient Alley",
            description: "Old places. New questions. Same confusion.",
          },
          {
            name: "Timeline Tavern",
            description: "Pour a round of random centuries.",
          },
          {
            name: "Revolution Room",
            description: "Facts that change the game. Literally.",
          },
          {
            name: "The Treaty Table",
            description: "Compromises not required here.",
          },
          {
            name: "Dynasty Den",
            description: "Generations of trivia in one room.",
          },
          {
            name: "History Repeats",
            description: "If you missed it once, here it is again.",
          },
          {
            name: "The Archive Vault",
            description: "Locked-in answers from unlocked pasts.",
          },
          {
            name: "Ancient Debates",
            description: "Still arguing over the pyramid builders.",
          },
          {
            name: "Statue Circle",
            description: "Frozen in time, but not in trivia.",
          },
          {
            name: "The Sphinx Riddle",
            description: "Nothing mysterious… except everything.",
          },
          {
            name: "Colonial Quarters",
            description: "Where revolutions and wrong guesses live.",
          },
          {
            name: "War Room",
            description: "Strategize before you guess wildly.",
          },
          {
            name: "The Scroll Room",
            description: "Roll out the history, one clue at a time.",
          },
          {
            name: "Historic Halls",
            description: "Where the walls whisper trivia.",
          },
          {
            name: "The Dictator's Desk",
            description: "Commanding questions with iron facts.",
          },
          {
            name: "Decade Dungeon",
            description: "Pick an era, roll the dice.",
          },
          { name: "Monarch Manor", description: "Long live the guessers!" },
          {
            name: "Artifacts Room",
            description: "Old objects, new levels of confusion.",
          },
          {
            name: "The Reign Room",
            description: "Reigning over royal-level trivia.",
          },
          {
            name: "Past Tense",
            description: "It was fun. It is fun. It shall be fun.",
          },
          {
            name: "The Great Debate",
            description: "Still no agreement on what happened.",
          },
          {
            name: "Time Capsule",
            description: "Sealed with trivia. Opened with guesses.",
          },
        ],
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
        rooms: [
          {
            name: "The Book Nook",
            description: "Where characters live rent-free in your head.",
          },
          {
            name: "Plot Twist",
            description: "Expect the unexpected… or just forget the plot.",
          },
          {
            name: "Writer's Block",
            description: "Stuck between brilliance and blank pages.",
          },
          {
            name: "Verse Vault",
            description: "For poetry lovers and confused rhymers.",
          },
          {
            name: "Prologue Place",
            description: "It all begins here — kind of.",
          },
          {
            name: "The Ink Well",
            description: "Where ideas flow… sometimes messily.",
          },
          {
            name: "Genre Junction",
            description: "Mystery? Romance? Who knows anymore?",
          },
          {
            name: "The Dust Jacket",
            description: "Don't judge a room by its cover.",
          },
          {
            name: "Epic Room",
            description: "Not short. Not sweet. Just epic.",
          },
          { name: "Page Turners", description: "Every clue is a cliffhanger." },
          {
            name: "Cliffhanger Club",
            description: "You'll never guess what's next. Literally.",
          },
          { name: "Chapter One", description: "We're starting strong… maybe." },
          {
            name: "The Margins",
            description: "Notes on everything, answers on nothing.",
          },
          {
            name: "Classic Corner",
            description: "Old books, timeless confusion.",
          },
          {
            name: "The Author's Lounge",
            description: "Where pens are mighty and questions vague.",
          },
          {
            name: "Metaphor Market",
            description: "It's like trivia… but deeper.",
          },
          {
            name: "Shakespearean Space",
            description: "To guess or not to guess?",
          },
          {
            name: "The Library",
            description: "Silent chaos between the stacks.",
          },
          {
            name: "Fiction Junction",
            description: "Real fun in imaginary worlds.",
          },
          {
            name: "The Blurb Room",
            description: "Short, sweet, and totally misleading.",
          },
          { name: "Irony Island", description: "Nothing is what it seems." },
          {
            name: "Quill & Scroll",
            description: "Old school tools, modern confusion.",
          },
          {
            name: "Narrative Nest",
            description: "All the plot twists live here.",
          },
          {
            name: "Symbolism Station",
            description: "Nothing means what it says.",
          },
          {
            name: "The Thesaurus Pit",
            description: "A place of synonymic chaos.",
          },
          {
            name: "The Forbidden Chapter",
            description: "Probably not supposed to be here.",
          },
          {
            name: "Literary Lounge",
            description: "Relax with a quote and a guess.",
          },
          {
            name: "Bookworm Burrow",
            description: "Squirm in delight and mild confusion.",
          },
          {
            name: "The Editor's Desk",
            description: "Correctness not guaranteed.",
          },
          {
            name: "Imaginary Realms",
            description: "Where fantasy and failed guesses meet.",
          },
        ],
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
        rooms: [
          {
            name: "Map Masters",
            description: "Where the world is your playground… sort of.",
          },
          {
            name: "Border Patrol",
            description: "No passport needed, just guesses.",
          },
          {
            name: "Capital Chaos",
            description: "You know the capital. Or do you?",
          },
          {
            name: "Globe Trotters",
            description: "Spinning through trivia at top speed.",
          },
          {
            name: "Continental Drift",
            description: "It's moving… and so are the questions.",
          },
          {
            name: "The Equator Line",
            description: "Hot trivia served globally.",
          },
          {
            name: "Mountain High",
            description: "Answers are steep, views not included.",
          },
          {
            name: "Island Hop",
            description: "Jump from question to question without getting wet.",
          },
          {
            name: "The Latitude Lounge",
            description: "Somewhere between chill and challenge.",
          },
          { name: "Desert Storm", description: "Dry facts, wild guesses." },
          { name: "River Run", description: "Where trivia flows endlessly." },
          { name: "Tundra Talks", description: "Cold facts. Cooler vibes." },
          {
            name: "World Wonders",
            description: "Seven wonders. Thirty questions. Good luck.",
          },
          {
            name: "The Compass Room",
            description: "Spin around until you find the answer.",
          },
          {
            name: "Ocean Depths",
            description: "Dive deep for surface-level answers.",
          },
          {
            name: "The Valley Vault",
            description: "Low ground, high pressure.",
          },
          {
            name: "Atlas Arena",
            description: "Bring your mental maps and hope.",
          },
          {
            name: "Country Club",
            description: "Not that kind — this one tests you.",
          },
          {
            name: "Climate Control",
            description: "All weather accepted. Especially stormy guesses.",
          },
          {
            name: "Peak Position",
            description: "Only the highest scorers summit.",
          },
          {
            name: "GeoQuiz Central",
            description: "Geography from A to… whatever Z looks like.",
          },
          {
            name: "Volcano Zone",
            description: "Erupting with unpredictable trivia.",
          },
          {
            name: "Archipelago Alley",
            description: "More scattered than your answers.",
          },
          {
            name: "Hemisphere Hangout",
            description: "North? South? Who even knows anymore?",
          },
          {
            name: "Plate Tectonics",
            description: "Things shift. So do your scores.",
          },
          {
            name: "Jungle Junction",
            description: "It's a trivia jungle out there.",
          },
          {
            name: "City Circuit",
            description: "Round and round the capitals we go.",
          },
          {
            name: "Natural Habitat",
            description: "Where knowledge lives (or barely survives).",
          },
          {
            name: "The Time Zone",
            description: "No matter the zone, it's trivia time.",
          },
          {
            name: "Geo Puzzle",
            description: "Putting the world together, one guess at a time.",
          },
        ],
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
        rooms: [
          { name: "Comma Club", description: "Pause here… but only briefly." },
          {
            name: "The Wordsmiths",
            description: "Forging brilliance one word at a time.",
          },
          {
            name: "Grammar Gurus",
            description: "Where rules exist, but vibes matter.",
          },
          {
            name: "Spelling Bee",
            description: "Buzzing with tricky letter combos.",
          },
          {
            name: "The Edit Desk",
            description: "Where mistakes go to be judged silently.",
          },
          {
            name: "Punctuation Station",
            description: "Dots, dashes, and drama.",
          },
          {
            name: "Vocabulary Vault",
            description: "Unlocking big words you'll forget tomorrow.",
          },
          {
            name: "Paragraph Party",
            description: "Where structure meets social chaos.",
          },
          {
            name: "Capital Matters",
            description: "Uppercase energy. Lowercase pressure.",
          },
          { name: "The Reading Room", description: "Please read responsibly." },
          {
            name: "Silent Letters",
            description: "The letters we never speak of.",
          },
          {
            name: "The Syntax Squad",
            description: "Arranging confusion into semi-order.",
          },
          {
            name: "The Red Pen",
            description: "Marking up fun with precision.",
          },
          {
            name: "Adjective Alley",
            description: "Descriptive. Delightful. Dangerously random.",
          },
          {
            name: "Conjunction Junction",
            description: "Hooking thoughts together since forever.",
          },
          {
            name: "Proofreaders' Pit",
            description: "Spot the oops, earn the brag.",
          },
          {
            name: "The Semicolon Spot",
            description: "Half comma, half colon, all attitude.",
          },
          {
            name: "Run-On Room",
            description:
              "Where the sentence never ends it just keeps going and—",
          },
          {
            name: "Sentence Builders",
            description: "Constructing greatness one clause at a time.",
          },
          {
            name: "Reading Rangers",
            description: "Patrolling pages like it's a mission.",
          },
          {
            name: "Homophone Hangout",
            description: "They're there in their own way.",
          },
          {
            name: "Metaphor Mile",
            description: "Like a racetrack of imagination… or something.",
          },
          {
            name: "Apostrophe Academy",
            description: "Its vs. it's — may the odds be ever in your favor.",
          },
          { name: "Tense Time", description: "Past, present, or stressed?" },
          {
            name: "Dialogue Den",
            description: "“Say something clever,” he said nervously.",
          },
          {
            name: "Spaced Out",
            description: "Double spaces. Triple confusion.",
          },
          {
            name: "The Draft Zone",
            description: "Unfinished thoughts welcome.",
          },
          {
            name: "Alliteration Alley",
            description: "Playfully puzzling, possibly pointless.",
          },
          {
            name: "The Reading Comprehenders",
            description: "Reading between the lines since line one.",
          },
          {
            name: "Writer's Retreat",
            description: "Less peace. More punctuation panic.",
          },
        ],
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
        rooms: [
          {
            name: "The Color Palette",
            description: "Everything but beige opinions.",
          },
          {
            name: "Beethoven's Basement",
            description: "Silence isn't always golden.",
          },
          {
            name: "Brushstroke Lounge",
            description: "Where strokes of genius get messy.",
          },
          {
            name: "The Orchestra Pit",
            description: "Harmony, chaos, and one rogue triangle.",
          },
          {
            name: "Canvas Zone",
            description: "Paint outside the trivia lines.",
          },
          {
            name: "Chords & Chaos",
            description: "Strum it, hum it, guess it.",
          },
          {
            name: "Gallery Gossip",
            description: "What the art world never told you.",
          },
          {
            name: "Jazz Junction",
            description: "Unexpected notes and even more unexpected answers.",
          },
          { name: "Doodle Den", description: "Where every squiggle is valid." },
          { name: "Tempo Town", description: "Fast facts and faster guesses." },
          {
            name: "Muse Room",
            description: "Inspiration shows up… eventually.",
          },
          { name: "Art Attack", description: "The only safe kind of attack." },
          { name: "Major & Minor", description: "It's all key-dependent." },
          {
            name: "The Sculptor's Studio",
            description: "Chisel your knowledge, no dust masks needed.",
          },
          {
            name: "Vinyl Vault",
            description: "Spinning trivia with retro vibes.",
          },
          {
            name: "The Abstract Zone",
            description: "Nothing makes sense, but it's still brilliant.",
          },
          {
            name: "Rhythm Room",
            description: "If you miss a beat, just nod confidently.",
          },
          { name: "The Art Market", description: "Buy low, guess high." },
          {
            name: "Melody Makers",
            description: "Composing guesses one note at a time.",
          },
          {
            name: "Portrait Place",
            description: "Where everyone's a masterpiece… sort of.",
          },
          {
            name: "The Scoreboard Symphony",
            description: "Points in harmony, or not.",
          },
          {
            name: "Gallery of Guessing",
            description: "Curated confusion in every frame.",
          },
          {
            name: "The Drum Circle",
            description: "Keep the beat, drop the facts.",
          },
          {
            name: "Minimalism Mode",
            description: "Just the basics. And maybe one chair.",
          },
          {
            name: "Brush and Bass",
            description: "Painting soundscapes and confusing everyone.",
          },
          { name: "Treble Trouble", description: "High notes, higher stakes." },
          {
            name: "The Stage Lights",
            description: "Step into the spotlight and blank out.",
          },
          {
            name: "Creative Block",
            description: "Where no one knows what they're doing.",
          },
          {
            name: "Frame by Frame",
            description: "Zooming in on every pixel of trivia.",
          },
          {
            name: "The Encore",
            description: "You thought it was over… it's not.",
          },
        ],
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
        rooms: [
          {
            name: "The Locker Room",
            description: "Smells like knowledge and socks.",
          },
          {
            name: "Stretch Zone",
            description: "Reach for the facts… carefully.",
          },
          { name: "Cardio Club", description: "Fast beats. Faster guesses." },
          { name: "Muscle Memory", description: "If you know it, flex it." },
          {
            name: "Team Spirit",
            description: "No ‘I' in trivia... except maybe in spelling.",
          },
          {
            name: "The Warm-Up",
            description: "Get loose and limber with light confusion.",
          },
          { name: "Nutrition Nook", description: "Snack on facts, not chips." },
          {
            name: "The Huddle",
            description: "Quick pep talk, then brain blitz.",
          },
          {
            name: "Goal Zone",
            description: "Score points—no cleats required.",
          },
          { name: "Rep Room", description: "One answer. Ten mental reps." },
          {
            name: "Cool Down Corner",
            description: "Catch your breath, lose your mind.",
          },
          {
            name: "Coach's Clipboard",
            description: "Strategies scribbled and guesses fumbled.",
          },
          { name: "Jumpstart", description: "High energy, low expectations." },
          { name: "Power Play", description: "Big moves. Bold guesses." },
          {
            name: "The Sideline",
            description: "Where the real chatter happens.",
          },
          {
            name: "The Sprint Zone",
            description: "Fast-paced questions. Slower reflexes.",
          },
          {
            name: "Hydration Station",
            description: "Stay cool. Stay confused.",
          },
          {
            name: "Gym Class Heroes",
            description: "Because someone has to guess right.",
          },
          {
            name: "Penalty Box",
            description: "For when your answers break the rules.",
          },
          { name: "The Bench", description: "Sitting out? Still judging." },
          {
            name: "The Mat Room",
            description: "Roll with it. Or stretch the truth.",
          },
          {
            name: "Training Day",
            description: "It's always leg day for the brain.",
          },
          {
            name: "The Endurance Test",
            description: "Long game, longer questions.",
          },
          {
            name: "Slam Dunk Zone",
            description: "When trivia hits nothing but net.",
          },
          {
            name: "Push-Up Parade",
            description: "Raise the bar, and your eyebrows.",
          },
          {
            name: "Agility Alley",
            description: "Quick shifts. Even quicker guesses.",
          },
          {
            name: "Balance Beam",
            description: "Wobble between fact and fiction.",
          },
          {
            name: "Fitness Freaks",
            description: "Gym brains and protein facts.",
          },
          { name: "The Final Lap", description: "Almost there… maybe." },
          { name: "Tug of Facts", description: "Mental strength over muscle." },
        ],
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
        rooms: [
          {
            name: "Civic Circle",
            description: "Discuss the basics of government and citizenship.",
          },
          {
            name: "Economic Exchange",
            description: "Trade your knowledge on markets and money.",
          },
          {
            name: "Culture Corner",
            description: "Dive into traditions, customs, and world cultures.",
          },
          {
            name: "Political Plaza",
            description: "Debate political systems and ideologies.",
          },
          {
            name: "Law Lab",
            description: "Break down legal systems and landmark cases.",
          },
          {
            name: "Social Spectrum",
            description: "Explore sociology and human behavior.",
          },
          {
            name: "Policy Pavilion",
            description: "Understand how laws and policies shape society.",
          },
          {
            name: "Global Gateway",
            description:
              "Connect with global issues and international relations.",
          },
          {
            name: "Market Street",
            description: "Navigate the ins and outs of economics and trade.",
          },
          {
            name: "Justice Junction",
            description: "Where fairness and law intersect.",
          },
          {
            name: "Cultural Crossroads",
            description: "Where diverse traditions meet and mingle.",
          },
          {
            name: "Democracy Den",
            description: "All about democratic principles and governance.",
          },
          {
            name: "Sociology Studio",
            description: "Study the patterns of human society.",
          },
          {
            name: "Political Pulse",
            description: "Stay current on political movements and parties.",
          },
          {
            name: "Economic Engine",
            description: "Fuel your knowledge on finance and markets.",
          },
          {
            name: "Rights & Responsibilities",
            description: "Learn about citizens' roles and freedoms.",
          },
          {
            name: "Culture Clash",
            description: "Explore cultural conflicts and resolutions.",
          },
          {
            name: "Government Grounds",
            description: "The nuts and bolts of governance and administration.",
          },
          {
            name: "Law Library",
            description: "Your source for legal terms and court decisions.",
          },
          {
            name: "Society Central",
            description: "Where social norms and change are examined.",
          },
          {
            name: "Econ Essentials",
            description: "Back to basics in economics and finance.",
          },
          {
            name: "Political Playground",
            description: "Light-hearted look at politics and power.",
          },
          {
            name: "Justice Hall",
            description: "Explore courts, trials, and justice systems.",
          },
          {
            name: "Culture Capsule",
            description: "Snapshots of global cultures through time.",
          },
          {
            name: "Policy Pathways",
            description: "Follow the road from idea to law.",
          },
          {
            name: "Social Sciences Spot",
            description: "A hub for all things social science.",
          },
          {
            name: "Economic Expedition",
            description: "Journey through economic concepts and trends.",
          },
          {
            name: "Government Gallery",
            description: "Display of government forms and functions.",
          },
          {
            name: "Rights Room",
            description: "Focus on human rights and legal protections.",
          },
          {
            name: "Cultural Collective",
            description: "Celebrate diversity and heritage.",
          },
        ],
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
        rooms: [
          {
            name: "Code Corner",
            description: "Where code comes to life and bugs get squashed!",
          },
          {
            name: "Tech Trends",
            description: "Chat about the coolest new gadgets and gizmos.",
          },
          {
            name: "Cyber Safe",
            description: "Keep it secure and stay one step ahead of hackers.",
          },
          {
            name: "AI Arena",
            description: "Robots, brains, and all things artificial!",
          },
          {
            name: "Digital Literacy Lab",
            description: "Master the digital world like a pro.",
          },
          {
            name: "Hardware Hub",
            description:
              "Talk circuits, chips, and all the techy stuff inside.",
          },
          {
            name: "Programming Paradigms",
            description: "From Python to Java — let's talk code styles.",
          },
          {
            name: "Innovation Incubator",
            description: "Dream up the next big tech breakthrough.",
          },
          {
            name: "Security Shield",
            description: "Guard your data like a digital superhero.",
          },
          {
            name: "AI Ethics",
            description: "Think about robots' morals (yes, they have some!).",
          },
          {
            name: "App Dev Alley",
            description: "Build apps that make life easier and more fun.",
          },
          {
            name: "Networking Node",
            description: "Connect the dots in the world of networks.",
          },
          {
            name: "Code Review Room",
            description: "Swap tips, tricks, and a bit of code gossip.",
          },
          {
            name: "Tech Support",
            description: "Help and hacks for your everyday tech troubles.",
          },
          {
            name: "Machine Learning Meetup",
            description: "Train your machines to learn and amaze.",
          },
          {
            name: "Digital Design Den",
            description: "Make things look good and work even better.",
          },
          {
            name: "Cloud Computing Cloud",
            description: "Store it, share it, and surf the cloud waves.",
          },
          {
            name: "Open Source Oasis",
            description: "Share your code and find new friends to build with.",
          },
          {
            name: "Data Science Depot",
            description: "Turn numbers into stories and cool insights.",
          },
          {
            name: "IoT Island",
            description: "Everything smart, connected, and ready to rock.",
          },
          {
            name: "Virtual Reality Vault",
            description: "Step into new worlds and epic adventures.",
          },
          {
            name: "Tech History Hall",
            description: "Discover how tech shaped the world we know.",
          },
          {
            name: "Programming Challenges",
            description: "Show off your coding chops and beat the clock.",
          },
          {
            name: "Security Breach Briefing",
            description: "Spy the biggest hacks and what we learned.",
          },
          {
            name: "AI Research Room",
            description: "Dive into the coolest AI discoveries.",
          },
          {
            name: "Tech Startup Street",
            description: "Where ideas turn into tomorrow's tech giants.",
          },
          {
            name: "Software Engineering Suite",
            description: "Build software that just works (mostly!).",
          },
          {
            name: "Gadget Garage",
            description: "Show off your favorite tech toys and tools.",
          },
          {
            name: "Digital Ethics Exchange",
            description: "Chat about what's right and wrong in tech.",
          },
          {
            name: "Quantum Computing Quarters",
            description: "Get quantum curious with the next frontier.",
          },
        ],
      },
      {
        name: "Foreign Languages",
        description: "Learn and test your skills in various foreign languages.",
        topics: ["Spanish", "French", "German", "Latin", "Mandarin", "Italian"],
        rooms: [
          {
            name: "Spanish Speak-Up",
            description: "Practice your español and share cool phrases!",
          },
          {
            name: "French Flair",
            description: "Bonjour! Chat about French words and culture.",
          },
          {
            name: "German Gabfest",
            description: "Say hallo and dive into German grammar fun.",
          },
          {
            name: "Latin Legends",
            description: "Step back in time with classical Latin phrases.",
          },
          {
            name: "Mandarin Moments",
            description: "Master tones and characters one chat at a time.",
          },
          {
            name: "Italian Inspirations",
            description: "Speak like you're in Rome — with style and gusto!",
          },
          {
            name: "Language Games",
            description: "Fun challenges to test your vocab skills.",
          },
          {
            name: "Grammar Gurus",
            description: "Tackle tricky rules and win the grammar game.",
          },
          {
            name: "Phrasebook Fun",
            description: "Swap useful phrases for travel and chatting.",
          },
          {
            name: "Accent Adventure",
            description: "Perfect your accent and impress your friends.",
          },
          {
            name: "Idioms & Expressions",
            description: "Discover quirky sayings and what they mean.",
          },
          {
            name: "Language Exchange",
            description: "Teach a phrase, learn a phrase — everyone wins!",
          },
          {
            name: "Travel Talk",
            description: "Learn words to help you on your adventures.",
          },
          {
            name: "Language Challenges",
            description: "Try tongue twisters and tricky words.",
          },
          {
            name: "Culture Connect",
            description: "Explore the culture behind the language.",
          },
          {
            name: "Writing Wizards",
            description: "Practice writing in foreign scripts and alphabets.",
          },
          {
            name: "Listening Lounge",
            description: "Sharpen your ears with audio clips and chats.",
          },
          {
            name: "Pronunciation Practice",
            description: "Say it right every time with helpful tips.",
          },
          {
            name: "Language Trivia",
            description: "Test your knowledge with fun language facts.",
          },
          {
            name: "Language Tips & Tricks",
            description: "Share hacks to learn faster and easier.",
          },
          {
            name: "Slang Spot",
            description: "Get the scoop on informal and cool language.",
          },
          {
            name: "Language Learners' Lounge",
            description: "Chat with fellow learners and share progress.",
          },
          {
            name: "Multilingual Mix",
            description: "Switch between languages and keep it lively.",
          },
          {
            name: "History of Languages",
            description: "Discover how languages evolved over time.",
          },
          {
            name: "Translation Tavern",
            description: "Try your hand at translating fun texts.",
          },
          {
            name: "Language Apps & Tools",
            description: "Share your favorite learning apps and resources.",
          },
          {
            name: "Storytelling Studio",
            description: "Create and share stories in foreign tongues.",
          },
          {
            name: "Language Challenges",
            description: "Daily challenges to boost your skills.",
          },
          {
            name: "Foreign Films & Music",
            description: "Chat about movies and songs in other languages.",
          },
          {
            name: "Language Practice Partners",
            description: "Find buddies to practice with regularly.",
          },
        ],
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
        rooms: [
          {
            name: "Wisdom",
            description: "Dive into big ideas and ancient thoughts.",
          },
          {
            name: "Reason",
            description: "Test your logic with fun puzzles and challenges.",
          },
          {
            name: "Ethics",
            description:
              "Explore what's right, wrong, and everything in between.",
          },
          {
            name: "Mind",
            description:
              "Wonder about thinking, consciousness, and perception.",
          },
          {
            name: "Truth",
            description: "Discuss what's real and what's just a theory.",
          },
          {
            name: "Logic",
            description: "Sharpen your reasoning skills with brain teasers.",
          },
          {
            name: "Debate",
            description: "Friendly battles of ideas and opinions.",
          },
          {
            name: "Mystery",
            description: "Explore the unknown and unexplainable questions.",
          },
          {
            name: "Theory",
            description: "Chat about cool philosophical concepts and theories.",
          },
          {
            name: "Puzzle",
            description: "Solve tricky problems and test your thinking.",
          },
          {
            name: "Insight",
            description: "Share those ‘aha!' moments and clever ideas.",
          },
          {
            name: "Dilemma",
            description: "Face tough choices and moral puzzles together.",
          },
          {
            name: "Existence",
            description: "Ponder life's big questions in a fun way.",
          },
          {
            name: "Thought",
            description: "Explore creative and curious ways of thinking.",
          },
          {
            name: "Reasoning",
            description: "Put your critical thinking skills to the test.",
          },
          {
            name: "Imagination",
            description: "Use your mind to explore new possibilities.",
          },
          {
            name: "Focus",
            description: "Concentrate on logic and clear thinking games.",
          },
          {
            name: "LogicLab",
            description: "Experiment with reasoning in a playful space.",
          },
          {
            name: "Explore",
            description: "Discover new ideas and challenge your mind.",
          },
          {
            name: "Balance",
            description: "Weigh ideas and arguments with a curious mind.",
          },
          {
            name: "Journey",
            description: "Travel through thought experiments and puzzles.",
          },
          {
            name: "Vision",
            description: "Imagine new perspectives and possibilities.",
          },
          {
            name: "Challenge",
            description: "Take on fun and brainy challenges.",
          },
          {
            name: "Clarity",
            description: "Find simple truths in complex ideas.",
          },
          {
            name: "Focus",
            description: "Practice sharp and clear thinking exercises.",
          },
          {
            name: "Insight",
            description: "Share deep thoughts and clever insights.",
          },
          {
            name: "LogicPlay",
            description: "Have fun with logic games and riddles.",
          },
          {
            name: "Mindset",
            description: "Train your brain with thoughtful activities.",
          },
          {
            name: "Wonder",
            description: "Let curiosity guide your philosophical explorations.",
          },
          {
            name: "Balance",
            description: "Explore harmony between ideas and logic.",
          },
        ],
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
        rooms: [
          {
            name: "Nature",
            description: "Dive into the beauty of the natural world.",
          },
          {
            name: "Green",
            description: "Celebrate all things eco-friendly and sustainable.",
          },
          {
            name: "Earth",
            description: "Discover what makes our planet unique.",
          },
          {
            name: "Climate",
            description: "Chat about weather, seasons, and global changes.",
          },
          {
            name: "Forest",
            description: "Explore the secrets of trees and woodlands.",
          },
          {
            name: "Ocean",
            description: "Plunge into the deep blue and marine life.",
          },
          {
            name: "Recycle",
            description: "Learn how to give things a second life.",
          },
          {
            name: "Energy",
            description: "Power up with clean and renewable sources.",
          },
          {
            name: "Wildlife",
            description: "Meet the amazing animals that share our planet.",
          },
          {
            name: "Pollution",
            description: "Talk about ways to keep our world clean.",
          },
          {
            name: "Habitat",
            description: "Discover where animals and plants call home.",
          },
          { name: "Solar", description: "Soak up the power of the sun." },
          {
            name: "Wind",
            description: "Feel the breeze and learn about wind energy.",
          },
          {
            name: "Water",
            description: "Dive into the importance of freshwater.",
          },
          {
            name: "Eco",
            description: "Celebrate earth-friendly habits and ideas.",
          },
          {
            name: "Biodiversity",
            description: "Discover the incredible variety of life.",
          },
          { name: "Trees", description: "Explore the lungs of our planet." },
          { name: "Soil", description: "Dig into the foundation of life." },
          {
            name: "Carbon",
            description: "Learn about the invisible gas changing our world.",
          },
          {
            name: "Future",
            description: "Imagine a cleaner, greener tomorrow.",
          },
          {
            name: "Clean",
            description: "Share tips on keeping the planet tidy.",
          },
          { name: "OceanLife", description: "Swim with creatures of the sea." },
          {
            name: "RecycleIt",
            description: "Turn trash into treasure with recycling fun.",
          },
          {
            name: "Sustain",
            description: "Explore ways to live in harmony with nature.",
          },
          {
            name: "EnergyLab",
            description: "Experiment with cool renewable energy ideas.",
          },
          {
            name: "ClimateTalk",
            description: "Discuss changes and how we can help.",
          },
          {
            name: "Wild",
            description: "Celebrate untamed nature and its wonders.",
          },
          {
            name: "EcoTips",
            description: "Share and learn simple eco-friendly habits.",
          },
          { name: "EarthDay", description: "Celebrate our planet every day." },
          {
            name: "Harmony",
            description: "Discover balance between humans and nature.",
          },
        ],
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
        rooms: [
          {
            name: "Body",
            description: "Explore the amazing machine that is you.",
          },
          {
            name: "Food",
            description: "Discover tasty ways to fuel your body.",
          },
          {
            name: "Mind",
            description: "Learn tricks to keep your brain happy and healthy.",
          },
          { name: "Safety", description: "Stay smart and safe every day." },
          {
            name: "FirstAid",
            description: "Master the basics of helping others in a pinch.",
          },
          {
            name: "Wellness",
            description: "Find your balance and feel your best.",
          },
          {
            name: "Muscles",
            description: "Flex your knowledge about strength and movement.",
          },
          {
            name: "Vitamins",
            description: "Get the scoop on essential nutrients.",
          },
          { name: "Stress", description: "Chill out and learn ways to relax." },
          {
            name: "Sleep",
            description: "Discover why catching Zzz's is so important.",
          },
          { name: "Hydrate", description: "Keep cool and stay refreshed." },
          {
            name: "Heart",
            description: "Beat with the rhythm of a healthy lifestyle.",
          },
          {
            name: "Hygiene",
            description: "Stay fresh and clean with easy tips.",
          },
          {
            name: "Exercise",
            description: "Move it and groove it for a stronger you.",
          },
          {
            name: "SafetyTips",
            description: "Learn quick tips to avoid everyday risks.",
          },
          {
            name: "Nutrition",
            description: "Snack smart and eat well for energy.",
          },
          {
            name: "Brain",
            description: "Boost your brainpower with fun facts.",
          },
          {
            name: "Immunity",
            description: "Discover how your body fights off bugs.",
          },
          { name: "Balance", description: "Find your calm in body and mind." },
          {
            name: "Medic",
            description: "Learn first steps in health emergencies.",
          },
          {
            name: "Breath",
            description: "Breathe deep and learn calming techniques.",
          },
          {
            name: "Posture",
            description: "Stand tall and keep your spine happy.",
          },
          {
            name: "Vaccine",
            description: "Understand how shots keep you safe.",
          },
          { name: "Mood", description: "Feel good and manage your emotions." },
          {
            name: "Checkup",
            description: "Know the basics of health check routines.",
          },
          {
            name: "SafetyGear",
            description: "Protect yourself with the right equipment.",
          },
          {
            name: "Dental",
            description: "Keep that smile bright and healthy.",
          },
          {
            name: "Yoga",
            description: "Stretch, breathe, and relax your body.",
          },
          { name: "Kids", description: "Health tips for the little ones." },
          {
            name: "Public",
            description: "Learn how communities stay healthy together.",
          },
        ],
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
        rooms: [
          {
            name: "News",
            description:
              "Catch up on the latest headlines and breaking stories.",
          },
          {
            name: "Politics",
            description: "Dive into debates and decisions shaping our world.",
          },
          {
            name: "World",
            description: "Explore global happenings from every corner.",
          },
          {
            name: "Climate",
            description: "Learn about Earth's changing weather and policies.",
          },
          {
            name: "Rights",
            description: "Understand the fight for justice and equality.",
          },
          {
            name: "Elections",
            description: "Test your knowledge on voting and campaigns.",
          },
          {
            name: "Economy",
            description:
              "Discover how money flows through countries and markets.",
          },
          {
            name: "Tech",
            description: "Explore innovations changing daily life worldwide.",
          },
          {
            name: "Culture",
            description:
              "Celebrate traditions and trends from around the globe.",
          },
          {
            name: "Health",
            description: "Stay informed about global health and wellness.",
          },
          {
            name: "Space",
            description: "Look up and learn about cosmic news and discoveries.",
          },
          {
            name: "Conflict",
            description: "Understand ongoing struggles and peace efforts.",
          },
          {
            name: "Science",
            description: "Keep up with breakthroughs and discoveries.",
          },
          {
            name: "Sports",
            description: "Catch the latest wins and world records.",
          },
          {
            name: "Weather",
            description: "Track storms, sunshine, and surprises in the sky.",
          },
          {
            name: "Travel",
            description: "Explore places making headlines around the world.",
          },
          {
            name: "Media",
            description: "Learn about news sources and how stories spread.",
          },
          {
            name: "Policy",
            description: "Discover rules and laws shaping societies.",
          },
          {
            name: "Activism",
            description: "Get inspired by movements making a difference.",
          },
          {
            name: "Diplomacy",
            description: "Test your knowledge of international relations.",
          },
          {
            name: "Environment",
            description: "Explore efforts to protect our planet.",
          },
          {
            name: "Justice",
            description: "Learn about courts, laws, and fairness worldwide.",
          },
          {
            name: "Energy",
            description: "Discover power sources shaping the future.",
          },
          {
            name: "Innovation",
            description: "Stay updated on cutting-edge advancements.",
          },
          {
            name: "Education",
            description: "Explore trends and challenges in learning worldwide.",
          },
          {
            name: "Space",
            description: "Stay curious about cosmic news and discoveries.",
          },
          {
            name: "Culture",
            description:
              "Celebrate traditions and pop culture from everywhere.",
          },
          {
            name: "Media",
            description: "Understand how stories reach the world.",
          },
          {
            name: "Finance",
            description: "Learn about markets, trade, and money matters.",
          },
          {
            name: "Environment",
            description: "Discover ways the world is going green.",
          },
        ],
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
        rooms: [
          {
            name: "WorldCup",
            description: "Test your knowledge of football's biggest stage!",
          },
          {
            name: "Clubs",
            description: "Dive into the clubs that make football legends.",
          },
          {
            name: "Nations",
            description: "Show off what you know about national teams.",
          },
          {
            name: "Tactics",
            description: "Master the strategies behind the beautiful game.",
          },
          {
            name: "History",
            description:
              "Travel through football's epic moments and milestones.",
          },
          {
            name: "Positions",
            description: "Know your forwards from defenders? Prove it!",
          },
          {
            name: "Players",
            description:
              "Famous faces and legends of football await your guess.",
          },
          {
            name: "Leagues",
            description:
              "From Premier League to La Liga, test your league smarts.",
          },
          {
            name: "Referees",
            description:
              "How well do you know the rules and the men in charge?",
          },
          {
            name: "Gear",
            description:
              "From boots to balls, learn about the essentials on the pitch.",
          },
          {
            name: "Olympics",
            description: "Discover football moments from the Olympic games.",
          },
          {
            name: "Athletes",
            description:
              "Not just football—test your sports all-star knowledge.",
          },
          {
            name: "Basketball",
            description: "Cross-sport trivia that links football and hoops.",
          },
          {
            name: "Esports",
            description: "Step into the world where gaming meets football.",
          },
          {
            name: "Unusual",
            description:
              "Explore weird and wonderful sports you didn't know existed.",
          },
          {
            name: "BoardGames",
            description: "Trivia about your favorite board games and beyond.",
          },
          {
            name: "Cricket",
            description:
              "Not football, but test your cricket and baseball knowledge.",
          },
          {
            name: "Baseball",
            description: "Swing into this room for America's pastime trivia.",
          },
          {
            name: "Extreme",
            description:
              "Adrenaline sports for thrill-seekers and trivia lovers.",
          },
          {
            name: "Fans",
            description: "Are you a true football fan? Prove it here!",
          },
          {
            name: "Transfers",
            description: "Know the hottest player moves and transfer rumors.",
          },
          {
            name: "Records",
            description: "Test your knowledge of football's greatest records.",
          },
          {
            name: "Coaches",
            description: "Learn about the masterminds behind the teams.",
          },
          {
            name: "Stadiums",
            description: "Explore famous football arenas worldwide.",
          },
          {
            name: "Champions",
            description: "Who has won the most? Challenge your knowledge.",
          },
          {
            name: "Fansongs",
            description: "Sing along with football's iconic chants and songs.",
          },
          {
            name: "Legends",
            description: "Meet the players who shaped football history.",
          },
          {
            name: "Derbies",
            description:
              "Rivalries that set the pitch on fire—how much do you know?",
          },
          {
            name: "Youth",
            description: "Discover the stars of tomorrow in this fun room.",
          },
          {
            name: "Skills",
            description:
              "Show off your knowledge of football tricks and moves.",
          },
        ],
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
        rooms: [
          {
            name: "Basketball",
            description:
              "Dribble, shoot, and score your way through hoops trivia!",
          },
          {
            name: "Baseball",
            description:
              "Step up to the plate and swing for the fences with baseball facts.",
          },
          {
            name: "Rugby",
            description:
              "Tackle tough questions about this rough and exciting sport.",
          },
          {
            name: "Hockey",
            description:
              "Skate through the fast-paced world of ice and field hockey.",
          },
          {
            name: "Volleyball",
            description:
              "Serve up some fun and spike your way to victory here.",
          },
          {
            name: "Lacrosse",
            description: "Get ready to scoop up some cool lacrosse trivia.",
          },
          {
            name: "WaterPolo",
            description: "Dive into the pool for water polo facts and fun.",
          },
          {
            name: "Handball",
            description:
              "Catch all the action and score big with handball trivia.",
          },
          {
            name: "Fans",
            description:
              "Are you a true team sports fan? Prove it in this room!",
          },
          {
            name: "Leagues",
            description:
              "Know your leagues? Test your knowledge of team competitions.",
          },
          {
            name: "Positions",
            description:
              "From forwards to goalies, how well do you know the roles?",
          },
          {
            name: "Records",
            description:
              "Who holds the records? Take on this challenge and find out!",
          },
          {
            name: "Rules",
            description:
              "Master the rules and regulations of your favorite team sports.",
          },
          {
            name: "Coaches",
            description:
              "Learn about the leaders who guide their teams to victory.",
          },
          {
            name: "Tactics",
            description:
              "Strategy is key—show off your knowledge of team sport tactics.",
          },
          {
            name: "Champions",
            description:
              "Celebrate the winners and legends of team sports history.",
          },
          {
            name: "Equipment",
            description: "Get to know the gear that keeps players in the game.",
          },
          {
            name: "Derbies",
            description:
              "Feel the heat of fierce rivalries and classic matchups.",
          },
          {
            name: "Youth",
            description:
              "Discover the rising stars and young talents in team sports.",
          },
          {
            name: "Olympics",
            description:
              "Team sports on the world's biggest stage—how much do you know?",
          },
          {
            name: "Drafts",
            description:
              "Test your knowledge of player drafts and team selections.",
          },
          {
            name: "Rivalries",
            description:
              "Explore the fiercest competitions in team sports history.",
          },
          {
            name: "Playoffs",
            description:
              "How well do you know the thrilling end-of-season battles?",
          },
          {
            name: "Trades",
            description: "Get the inside scoop on player trades and transfers.",
          },
          {
            name: "Injuries",
            description:
              "Learn about common injuries and comebacks in team sports.",
          },
          {
            name: "Referees",
            description:
              "Know your officials? Test your referee and umpire knowledge.",
          },
          {
            name: "Fans",
            description:
              "The heart of the game—celebrate fan culture and traditions.",
          },
          {
            name: "Mascots",
            description:
              "Fun and quirky mascots that bring team spirit to life.",
          },
          {
            name: "Stadiums",
            description:
              "From iconic arenas to home fields, test your stadium knowledge.",
          },
          {
            name: "Announcers",
            description:
              "Famous voices and catchphrases in team sports broadcasting.",
          },
        ],
      },
      {
        name: "Racquets",
        description:
          "Swing into action and test your knowledge of all things racquet sports!",
        topics: ["Tennis", "Badminton", "Table Tennis", "Squash", "Pickleball"],
        rooms: [
          {
            name: "Tennis",
            description:
              "Serve, volley, and ace your way through tennis trivia!",
          },
          {
            name: "Badminton",
            description:
              "Smash and rally your knowledge of fast-paced badminton.",
          },
          {
            name: "PingPong",
            description:
              "Spin the ball and test your table tennis skills here.",
          },
          {
            name: "Squash",
            description: "Hit the walls with quick thinking in squash trivia.",
          },
          {
            name: "Pickleball",
            description:
              "A fun mix of tennis and ping pong — show your pickleball smarts!",
          },
          {
            name: "Serves",
            description:
              "Master the art of the perfect serve in racquet sports.",
          },
          {
            name: "Rallies",
            description:
              "How long can you keep the ball going? Test your rally knowledge!",
          },
          {
            name: "Grip",
            description:
              "Get a grip on all things about holding and swinging your racket.",
          },
          {
            name: "Courts",
            description:
              "From grass to indoor — know your racquet sport courts.",
          },
          {
            name: "Rules",
            description: "Play by the rules and show off your game know-how.",
          },
          {
            name: "Shots",
            description:
              "Forehands, backhands, smashes — what's your favorite shot?",
          },
          {
            name: "Players",
            description:
              "Famous players and legends of the racquet world await your guess.",
          },
          {
            name: "Tournaments",
            description:
              "Grand slams and opens — know your biggest competitions.",
          },
          {
            name: "History",
            description: "Discover how racquet sports have evolved over time.",
          },
          {
            name: "Equipment",
            description:
              "Rackets, strings, and gear — test your equipment expertise.",
          },
          {
            name: "Scoring",
            description: "Know your points, sets, and matches like a pro.",
          },
          {
            name: "Techniques",
            description:
              "Perfect your swing with knowledge of racquet techniques.",
          },
          {
            name: "Training",
            description:
              "Learn how pros train to stay at the top of their game.",
          },
          {
            name: "Strategy",
            description: "Smart plays win games — test your tactical thinking.",
          },
          {
            name: "Doubles",
            description: "Team up and know the ins and outs of doubles play.",
          },
          {
            name: "Fitness",
            description:
              "Racquet sports need speed and stamina — test your fitness facts.",
          },
          {
            name: "Shuttle",
            description:
              "Badminton fans, get ready for shuttlecock challenges!",
          },
          {
            name: "Spin",
            description:
              "Master the art of putting spin on the ball or shuttle.",
          },
          {
            name: "Footwork",
            description:
              "Quick feet make great players — test your footwork knowledge.",
          },
          {
            name: "Umpires",
            description:
              "Know the officials and calls that keep the game fair.",
          },
          {
            name: "Clubs",
            description:
              "From local courts to elite clubs — explore racquet sport communities.",
          },
          {
            name: "Fans",
            description:
              "Celebrate the passionate fans of racquet sports worldwide.",
          },
          {
            name: "Legends",
            description: "Pay tribute to the legends who shaped the game.",
          },
          {
            name: "Challenges",
            description:
              "Face off in fun challenges across all racquet sports.",
          },
          {
            name: "Skills",
            description:
              "Sharpen your skills with trivia on racquet sports mastery.",
          },
          {
            name: "Events",
            description: "Major events and classic matches come alive here.",
          },
        ],
      },
      {
        name: "Combat",
        description:
          "Step into the ring and test your skills in the world of fighting sports!",
        topics: ["Boxing", "MMA", "Wrestling", "Fencing"],
        rooms: [
          {
            name: "Boxing",
            description: "Throw punches and dodge trivia in the boxing ring!",
          },
          {
            name: "MMA",
            description:
              "Mixed martial arts fans, get ready to grapple with tough questions.",
          },
          {
            name: "Wrestling",
            description:
              "Pin down your knowledge of wrestling moves and legends.",
          },
          {
            name: "Fencing",
            description:
              "En garde! Show your skill with the foil, epee, and saber.",
          },
          {
            name: "Strikes",
            description: "Master the art of punches, kicks, and strikes.",
          },
          {
            name: "Grappling",
            description: "Lock in your facts about holds and submissions.",
          },
          {
            name: "Tactics",
            description: "Plan your next move with combat strategy trivia.",
          },
          {
            name: "Legends",
            description:
              "Honor the fighters who made history in combat sports.",
          },
          {
            name: "Rules",
            description: "Know the rules that keep the fights fair and safe.",
          },
          {
            name: "Training",
            description: "Learn how fighters train to stay sharp and strong.",
          },
          {
            name: "Events",
            description:
              "Major fight nights and tournaments await your knowledge.",
          },
          {
            name: "Weight",
            description: "Weight classes and divisions — do you know them all?",
          },
          {
            name: "Gear",
            description:
              "Gloves, masks, and mats — test your equipment know-how.",
          },
          {
            name: "Moves",
            description:
              "From jabs to takedowns, recall your favorite techniques.",
          },
          {
            name: "Champions",
            description: "Who's the best? Show off your champion knowledge.",
          },
          {
            name: "Fights",
            description:
              "Classic bouts and memorable moments in combat sports.",
          },
          {
            name: "Fitness",
            description:
              "Combat sports require peak fitness — prove your facts.",
          },
          {
            name: "Judges",
            description: "Know how fights are scored and decided.",
          },
          {
            name: "Referees",
            description: "Keep the match fair — what do referees watch for?",
          },
          {
            name: "History",
            description: "Explore the roots and evolution of fighting sports.",
          },
          {
            name: "Skills",
            description: "Sharpen your skills with challenging combat trivia.",
          },
          {
            name: "Technique",
            description: "Perfect your knowledge of combat moves and form.",
          },
          {
            name: "Gyms",
            description:
              "Where the fighters train — know the famous gyms worldwide.",
          },
          {
            name: "Fans",
            description: "Celebrate the passionate fans of combat sports.",
          },
          {
            name: "Tournaments",
            description:
              "From local fights to global contests, test your knowledge.",
          },
          {
            name: "Fitness",
            description:
              "Strength, speed, and stamina — the keys to fighting success.",
          },
          {
            name: "Defense",
            description: "Learn how fighters protect themselves in the ring.",
          },
          {
            name: "Spirit",
            description:
              "The heart and willpower behind every fighter's journey.",
          },
          {
            name: "Titles",
            description: "Know the belts, crowns, and titles of combat sports.",
          },
          {
            name: "Challenges",
            description: "Face off in exciting combat sports trivia battles.",
          },
        ],
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
        rooms: [
          {
            name: "Swimming",
            description: "Make waves with your swimming skills and trivia!",
          },
          {
            name: "Surfing",
            description:
              "Ride the waves of fun facts about surfing and surfers.",
          },
          {
            name: "Canoeing",
            description:
              "Paddle through questions about canoeing and kayaking.",
          },
          {
            name: "Sailing",
            description:
              "Set your sails for trivia on sailing adventures and gear.",
          },
          {
            name: "Rowing",
            description:
              "Row your way through challenges on rowing and regattas.",
          },
          {
            name: "WaterPolo",
            description: "Dive into the fast-paced world of water polo trivia.",
          },
          {
            name: "Diving",
            description:
              "Take the plunge with facts about diving and dive sites.",
          },
          {
            name: "Boating",
            description: "Explore trivia about boats, yachts, and watercraft.",
          },
          {
            name: "Windsurf",
            description: "Catch the wind with questions on windsurfing skills.",
          },
          {
            name: "Kitesurf",
            description: "Soar above water with kitesurfing knowledge.",
          },
          {
            name: "Marathon",
            description: "Swim your way through long-distance swimming trivia.",
          },
          {
            name: "Rescue",
            description: "Learn about water rescue techniques and safety.",
          },
          {
            name: "Equipment",
            description:
              "Know your paddles, boards, and gear for water sports.",
          },
          {
            name: "Tides",
            description: "Ride the tides of trivia about oceans and currents.",
          },
          {
            name: "Records",
            description:
              "Celebrate amazing water sport records and achievements.",
          },
          {
            name: "Events",
            description:
              "Test your knowledge on famous water sport competitions.",
          },
          {
            name: "Rules",
            description: "Know the rules that keep water sports fair and fun.",
          },
          {
            name: "Fitness",
            description: "Learn how athletes stay fit for water sports.",
          },
          {
            name: "History",
            description: "Explore the history and origins of water sports.",
          },
          {
            name: "Techniques",
            description:
              "Master the techniques behind top water sport athletes.",
          },
          {
            name: "Champions",
            description: "Celebrate the champions of water sports worldwide.",
          },
          {
            name: "Safety",
            description: "Stay safe on and in the water with important tips.",
          },
          {
            name: "Adventure",
            description: "Dive into thrilling water sport adventures.",
          },
          {
            name: "Travel",
            description:
              "Discover the best places around the world for water sports.",
          },
          {
            name: "Culture",
            description: "Learn about water sports traditions and communities.",
          },
          {
            name: "Competitions",
            description:
              "Know your major water sport contests and tournaments.",
          },
          {
            name: "Tricks",
            description: "Show off your knowledge of cool moves and stunts.",
          },
          {
            name: "Environment",
            description: "Understand how water sports interact with nature.",
          },
          {
            name: "Training",
            description:
              "Find out how athletes train for water sports success.",
          },
          {
            name: "Gear",
            description:
              "Get to know the gear that makes water sports possible.",
          },
        ],
      },
      {
        name: "Winter",
        description:
          "Chill out and have fun with cool trivia about sports on snow and ice!",
        topics: ["Skiing", "Snowboarding", "Ice Skating", "Speed Skating"],
        rooms: [
          {
            name: "Skiing",
            description:
              "Hit the slopes with your skiing knowledge and skills!",
          },
          {
            name: "Snowboard",
            description: "Ride the snowy hills and master snowboard trivia.",
          },
          {
            name: "IceSkate",
            description: "Glide gracefully through questions on ice skating.",
          },
          {
            name: "SpeedSkate",
            description: "Race through fast facts about speed skating.",
          },
          {
            name: "Bobsled",
            description: "Zoom down the ice track with bobsled trivia.",
          },
          {
            name: "Luge",
            description: "Slide into knowledge about luge competitions.",
          },
          {
            name: "Curling",
            description: "Sweep your way through curling fun facts.",
          },
          {
            name: "Biathlon",
            description:
              "Combine skiing and shooting in this unique sport trivia.",
          },
          {
            name: "Snowshoe",
            description: "Walk through snowy trails with snowshoe knowledge.",
          },
          {
            name: "Freestyle",
            description:
              "Show off your freestyle skiing and snowboarding know-how.",
          },
          {
            name: "Halfpipe",
            description: "Master the tricks and moves in halfpipe events.",
          },
          {
            name: "IceHockey",
            description:
              "Skate into the fast-paced world of ice hockey trivia.",
          },
          {
            name: "SkiJump",
            description: "Take a leap with ski jumping fun facts.",
          },
          {
            name: "SnowboardCross",
            description: "Race and jump through snowboard cross trivia.",
          },
          {
            name: "SpeedTrail",
            description: "Explore the fastest trails in speed skating.",
          },
          {
            name: "SnowFest",
            description: "Celebrate winter sports festivals and events.",
          },
          {
            name: "Equipment",
            description: "Know your skis, boards, and ice gear.",
          },
          {
            name: "Rules",
            description: "Keep up with the rules that keep winter sports safe.",
          },
          {
            name: "Champions",
            description: "Celebrate the legends of winter sports.",
          },
          {
            name: "Training",
            description: "Learn how athletes prepare for the chill.",
          },
          {
            name: "History",
            description: "Discover the origins of winter sports.",
          },
          {
            name: "Tricks",
            description: "Show off your knowledge of cool winter sport tricks.",
          },
          {
            name: "Competitions",
            description: "Know your Winter Olympics and major contests.",
          },
          {
            name: "Safety",
            description: "Stay safe while having fun on ice and snow.",
          },
          {
            name: "Adventure",
            description: "Dive into thrilling winter sport adventures.",
          },
          {
            name: "Travel",
            description: "Find the best winter sport destinations.",
          },
          {
            name: "Culture",
            description: "Explore winter sports traditions worldwide.",
          },
          {
            name: "Fitness",
            description: "Learn about fitness for winter athletes.",
          },
          {
            name: "SnowTech",
            description: "Discover the tech behind winter sports gear.",
          },
          {
            name: "Fans",
            description: "Celebrate the passionate fans of winter sports.",
          },
        ],
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
        rooms: [
          {
            name: "Climbing",
            description: "Scale the heights with your rock climbing skills!",
          },
          {
            name: "Parkour",
            description: "Leap, jump, and sprint through parkour trivia.",
          },
          {
            name: "Hiking",
            description: "Explore trails and nature with hiking knowledge.",
          },
          {
            name: "Cycling",
            description: "Pedal your way through cycling facts and feats.",
          },
          {
            name: "Mountain",
            description: "Tackle the rugged terrain of mountain biking.",
          },
          {
            name: "Trails",
            description: "Navigate exciting trails and outdoor routes.",
          },
          { name: "Gear", description: "Know your adventure gear inside out." },
          {
            name: "Safety",
            description: "Learn how to stay safe while chasing thrills.",
          },
          {
            name: "Techniques",
            description: "Master the techniques behind each sport.",
          },
          {
            name: "Competitions",
            description: "Compete with the best in adventure sports events.",
          },
          {
            name: "Endurance",
            description: "Test your stamina and endurance knowledge.",
          },
          {
            name: "Urban",
            description:
              "Discover urban adventures like parkour and freerunning.",
          },
          {
            name: "Nature",
            description: "Connect with nature in every adventure sport.",
          },
          {
            name: "Challenges",
            description: "Overcome challenges in adventurous ways.",
          },
          {
            name: "Legends",
            description: "Celebrate legends and pioneers of adventure sports.",
          },
          {
            name: "Records",
            description: "Know the records and milestones achieved outdoors.",
          },
          {
            name: "Training",
            description: "Prepare your body and mind for adventure.",
          },
          {
            name: "Stunts",
            description: "Learn about daring stunts and tricks.",
          },
          {
            name: "Events",
            description: "Stay updated on major adventure sports events.",
          },
          {
            name: "Exploration",
            description: "Explore new frontiers and unknown paths.",
          },
          {
            name: "Fitness",
            description: "Stay fit for your next big adventure.",
          },
          {
            name: "Mountains",
            description: "Discover the best mountains for adventure sports.",
          },
          {
            name: "Biking",
            description: "Dive into all things biking and cycling.",
          },
          {
            name: "Clubs",
            description: "Join clubs and groups for adventure lovers.",
          },
          {
            name: "Travel",
            description: "Find the coolest destinations for thrill-seekers.",
          },
          {
            name: "Tips",
            description: "Get handy tips for your next outdoor quest.",
          },
          {
            name: "Weather",
            description: "Learn how weather impacts adventure sports.",
          },
          {
            name: "History",
            description: "Trace the roots and evolution of adventure sports.",
          },
          {
            name: "Community",
            description: "Connect with other adventure enthusiasts.",
          },
          {
            name: "Wildlife",
            description: "Respect and understand wildlife on your journeys.",
          },
        ],
      },
      {
        name: "Motorsports",
        description:
          "Feel the rush of speed and roar of engines in thrilling races!",
        topics: ["Formula 1", "MotoGP", "Rally Racing", "NASCAR", "Go-Karting"],
        rooms: [
          {
            name: "Speed",
            description: "Test your knowledge of all things fast and furious!",
          },
          {
            name: "Tracks",
            description: "Learn about the most famous racing circuits.",
          },
          {
            name: "Drivers",
            description: "Know the legends and stars behind the wheel.",
          },
          {
            name: "Engines",
            description: "Dive into the power behind the machines.",
          },
          {
            name: "Teams",
            description: "Discover top racing teams and their histories.",
          },
          {
            name: "Races",
            description: "Explore iconic races and epic finishes.",
          },
          {
            name: "MotoGP",
            description: "Zoom into the world of motorcycle racing.",
          },
          { name: "NASCAR", description: "Get the scoop on stock car racing." },
          {
            name: "Rally",
            description: "Conquer the twists and turns of rally racing.",
          },
          {
            name: "Go-Kart",
            description: "Start your engines with karting basics.",
          },
          {
            name: "Champions",
            description: "Celebrate the champions of motorsports.",
          },
          {
            name: "Rules",
            description: "Understand the rules that keep races fair.",
          },
          {
            name: "Pitstop",
            description: "Learn the secrets of fast pit stops.",
          },
          {
            name: "History",
            description: "Trace the history of motorsport competitions.",
          },
          { name: "Gear", description: "Know your racing gear and equipment." },
          {
            name: "Safety",
            description: "Stay safe with motorsport safety facts.",
          },
          {
            name: "Tires",
            description: "Discover the importance of tires on race day.",
          },
          {
            name: "Aerodynamics",
            description: "Understand the science of speed and drag.",
          },
          {
            name: "Records",
            description: "Challenge yourself with record-breaking feats.",
          },
          {
            name: "Technology",
            description: "Explore cutting-edge tech in motorsports.",
          },
          { name: "Fans", description: "Connect with motorsport fan culture." },
          {
            name: "Legends",
            description: "Know the legends who shaped the sport.",
          },
          {
            name: "Events",
            description: "Stay updated on major motorsport events.",
          },
          {
            name: "Fuel",
            description: "Learn about the fuel that powers these beasts.",
          },
          {
            name: "Navigation",
            description: "Master the art of navigating tough courses.",
          },
          {
            name: "Sponsorship",
            description: "Explore the business side of racing.",
          },
          {
            name: "Innovation",
            description: "Discover innovations that changed the game.",
          },
          {
            name: "Offroad",
            description: "Dive into the rugged world of off-road racing.",
          },
          {
            name: "Qualifying",
            description: "Test your knowledge of qualifying rounds.",
          },
          {
            name: "Strategy",
            description: "Learn the strategies that win races.",
          },
        ],
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
        rooms: [
          {
            name: "Lift",
            description: "Discover the art of lifting heavy weights.",
          },
          {
            name: "Power",
            description: "Learn about raw strength and power moves.",
          },
          {
            name: "CrossFit",
            description: "Dive into the world of high-intensity workouts.",
          },
          {
            name: "Strongman",
            description: "Explore epic feats from strongman contests.",
          },
          {
            name: "Training",
            description: "Get tips on training for strength sports.",
          },
          {
            name: "Records",
            description: "Challenge yourself with world records.",
          },
          {
            name: "Nutrition",
            description: "Fuel your strength with the right nutrition.",
          },
          {
            name: "Techniques",
            description: "Master the techniques behind the lifts.",
          },
          {
            name: "Competitions",
            description: "Learn about famous strength competitions.",
          },
          {
            name: "Athletes",
            description: "Meet legendary strength athletes.",
          },
          {
            name: "Equipment",
            description: "Know the gear used in strength sports.",
          },
          {
            name: "History",
            description: "Trace the history of strength sports.",
          },
          {
            name: "Challenges",
            description: "Take on fun strength challenges.",
          },
          {
            name: "Safety",
            description: "Learn how to stay safe while lifting.",
          },
          {
            name: "Workouts",
            description: "Explore popular strength training workouts.",
          },
          {
            name: "Powerlifting",
            description: "Focus on squat, bench, and deadlift.",
          },
          { name: "Olympic", description: "Dive into Olympic weightlifting." },
          {
            name: "Endurance",
            description: "Balance strength with endurance training.",
          },
          {
            name: "Recovery",
            description: "Know how athletes recover from tough training.",
          },
          {
            name: "Motivation",
            description: "Stay inspired with strength sport stories.",
          },
          {
            name: "Flexibility",
            description: "Combine strength with flexibility.",
          },
          {
            name: "CrossTraining",
            description: "Explore cross-training techniques.",
          },
          {
            name: "Events",
            description: "Stay updated on upcoming strength events.",
          },
          { name: "Technique", description: "Perfect your lifting form." },
          {
            name: "Records",
            description: "Learn about world and personal records.",
          },
          { name: "Nutrition", description: "Fuel up for peak performance." },
          { name: "Gear", description: "Get to know the equipment pros use." },
          {
            name: "Community",
            description: "Connect with strength sport enthusiasts.",
          },
          {
            name: "Mindset",
            description: "Develop the mental strength to push limits.",
          },
          {
            name: "History",
            description: "Explore the evolution of strength sports.",
          },
          {
            name: "Power",
            description: "Understand how to generate explosive power.",
          },
        ],
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
        rooms: [
          { name: "Golf", description: "Tee off and learn all about golf." },
          { name: "Tennis", description: "Serve up some tennis trivia." },
          { name: "Bowling", description: "Strike it big with bowling facts." },
          {
            name: "Archery",
            description: "Hit the bullseye with archery knowledge.",
          },
          { name: "Snooker", description: "Master the angles in snooker." },
          { name: "Billiards", description: "Rack 'em up in billiards." },
          { name: "Darts", description: "Aim high with darts challenges." },
          {
            name: "Skills",
            description: "Sharpen your individual sport skills.",
          },
          { name: "Rules", description: "Know the rules of solo sports." },
          {
            name: "History",
            description: "Explore the history of individual sports.",
          },
          {
            name: "Equipment",
            description: "Get to know gear used in solo sports.",
          },
          {
            name: "Champions",
            description: "Learn about top individual athletes.",
          },
          {
            name: "Training",
            description: "Discover training tips for solo sports.",
          },
          {
            name: "Tournaments",
            description: "Stay updated on major tournaments.",
          },
          {
            name: "Techniques",
            description: "Master techniques for better performance.",
          },
          { name: "Strategy", description: "Develop winning strategies." },
          {
            name: "Fitness",
            description: "Get fit for peak individual performance.",
          },
          { name: "Mental", description: "Build focus and mental toughness." },
          {
            name: "Records",
            description: "Challenge yourself with record trivia.",
          },
          {
            name: "Legends",
            description: "Meet the legends of individual sports.",
          },
          {
            name: "Competitions",
            description: "Test your knowledge of competitions.",
          },
          { name: "Scoring", description: "Understand scoring systems." },
          { name: "Skills", description: "Improve key skills step by step." },
          { name: "History", description: "Discover origins and evolution." },
          { name: "Gear", description: "Know your sports equipment." },
          { name: "Tactics", description: "Plan your game like a pro." },
          {
            name: "Championships",
            description: "Learn about famous championships.",
          },
          {
            name: "Sportsmanship",
            description: "Celebrate fair play and respect.",
          },
          {
            name: "Techniques",
            description: "Perfect your playing techniques.",
          },
          {
            name: "Challenge",
            description: "Take on fun individual challenges.",
          },
        ],
      },
      {
        name: "Equestrian",
        description:
          "Gallop into the exciting world of horse sports and riding skills!",
        topics: ["Horse Racing", "Polo", "Equestrian Jumping", "Dressage"],
        rooms: [
          {
            name: "Racing",
            description: "Speed through the thrills of horse racing.",
          },
          { name: "Polo", description: "Master the fast-paced game of polo." },
          {
            name: "Jumping",
            description: "Leap over challenges in equestrian jumping.",
          },
          {
            name: "Dressage",
            description: "Gracefully explore the art of dressage.",
          },
          {
            name: "Breeds",
            description: "Learn about different horse breeds.",
          },
          { name: "Tack", description: "Get to know horse riding equipment." },
          {
            name: "Training",
            description: "Discover how riders train their horses.",
          },
          {
            name: "Competitions",
            description: "Explore famous equestrian events.",
          },
          {
            name: "History",
            description: "Ride back through equestrian history.",
          },
          {
            name: "Techniques",
            description: "Improve your riding techniques.",
          },
          {
            name: "Rules",
            description: "Understand the rules of equestrian sports.",
          },
          { name: "Care", description: "Learn horse care and grooming tips." },
          {
            name: "Champions",
            description: "Meet legendary riders and horses.",
          },
          {
            name: "Stables",
            description: "Discover the world of horse stables.",
          },
          {
            name: "Events",
            description: "Stay updated on upcoming horse events.",
          },
          {
            name: "Safety",
            description: "Learn about safety in horse sports.",
          },
          { name: "Gear", description: "Know your riding gear essentials." },
          { name: "Styles", description: "Explore different riding styles." },
          {
            name: "Breeding",
            description: "Dive into horse breeding knowledge.",
          },
          {
            name: "Careers",
            description: "Find out about careers in equestrian sports.",
          },
          {
            name: "Legends",
            description: "Discover famous horses and riders.",
          },
          { name: "Strategy", description: "Plan your winning moves." },
          {
            name: "Fitness",
            description: "Stay fit for top riding performance.",
          },
          { name: "Grooming", description: "Master horse grooming skills." },
          {
            name: "Etiquette",
            description: "Learn riding etiquette and manners.",
          },
          { name: "Jumping", description: "Perfect your jumping skills." },
          {
            name: "Dressage",
            description: "Fine-tune your dressage knowledge.",
          },
          { name: "Polo", description: "Score points in the polo arena." },
          { name: "Racing", description: "Race your way to the finish line." },
          {
            name: "Challenges",
            description: "Test yourself with fun horse challenges.",
          },
        ],
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
        rooms: [
          {
            name: "Skateboard",
            description: "Master tricks and skills on the board.",
          },
          {
            name: "BMX",
            description: "Jump, spin, and race on your BMX bike.",
          },
          {
            name: "Snowboard",
            description: "Carve down snowy slopes with style.",
          },
          {
            name: "Surf",
            description: "Ride the waves and catch the perfect swell.",
          },
          {
            name: "Motocross",
            description: "Show off daring moves on dirt bikes.",
          },
          {
            name: "Climbing",
            description: "Scale rocks and cliffs with courage.",
          },
          {
            name: "Parkour",
            description: "Run, jump, and vault through urban landscapes.",
          },
          {
            name: "Skydive",
            description: "Feel the rush of freefalling from the sky.",
          },
          {
            name: "Wingsuit",
            description: "Fly like a bird with your wingsuit gear.",
          },
          {
            name: "BaseJump",
            description: "Leap from fixed objects with precision.",
          },
          {
            name: "KiteSurf",
            description: "Harness the wind and ride the waves.",
          },
          {
            name: "Wakeboard",
            description: "Glide and jump over water with your board.",
          },
          {
            name: "Bungee",
            description: "Experience the thrill of bungee jumping.",
          },
          {
            name: "Freestyle",
            description: "Show your flair in freestyle sports.",
          },
          {
            name: "Skimboard",
            description: "Skim across shallow water with style.",
          },
          {
            name: "Snowmobile",
            description: "Race and jump over snowy terrains.",
          },
          {
            name: "Rollerblade",
            description: "Cruise and perform tricks on wheels.",
          },
          {
            name: "MountainBike",
            description: "Race through rugged mountain trails.",
          },
          { name: "Park", description: "Hit the park and perform tricks." },
          { name: "Trail", description: "Explore off-road trails with skill." },
          {
            name: "Scooter",
            description: "Pop tricks and race on your scooter.",
          },
          {
            name: "SkatePark",
            description: "Perfect your skills in the skatepark.",
          },
          { name: "Jump", description: "Fly high with big jumps and tricks." },
          {
            name: "Flip",
            description: "Master flips and spins on your board.",
          },
          { name: "Grind", description: "Slide and grind rails with finesse." },
          {
            name: "Balance",
            description: "Test your balance in extreme moves.",
          },
          {
            name: "Speed",
            description: "Race to the finish with lightning speed.",
          },
          {
            name: "Stunts",
            description: "Pull off jaw-dropping stunts and tricks.",
          },
          {
            name: "Gear",
            description: "Know your gear for extreme sports safety.",
          },
          { name: "Legends", description: "Learn about extreme sports icons." },
        ],
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
        rooms: [
          { name: "Golf", description: "Hit the greens and aim for the hole." },
          {
            name: "Tennis",
            description: "Serve, volley, and smash on the court.",
          },
          {
            name: "Baseball",
            description: "Pitch, bat, and run bases like a pro.",
          },
          {
            name: "Basketball",
            description: "Dribble, shoot, and dunk to win.",
          },
          {
            name: "Cricket",
            description: "Bowl, bat, and field in this classic game.",
          },
          { name: "Rugby", description: "Tackle, pass, and score tries." },
          { name: "Football", description: "Pass, run, and score touchdowns." },
          {
            name: "Volleyball",
            description: "Spike, set, and serve to win points.",
          },
          {
            name: "Handball",
            description: "Fast-paced play with quick passes.",
          },
          { name: "PingPong", description: "Fast reflexes and quick shots." },
          {
            name: "Softball",
            description: "Swing big in this softball showdown.",
          },
          {
            name: "Kickball",
            description: "Kick, run, and have fun in this backyard classic.",
          },
          {
            name: "Lacrosse",
            description: "Catch, throw, and score with a stick.",
          },
          {
            name: "Bowling",
            description: "Roll the ball and knock down pins.",
          },
          {
            name: "Squash",
            description: "Fast indoor rallies with a small ball.",
          },
          {
            name: "CricketT20",
            description: "Short and exciting cricket format.",
          },
          { name: "Futsal", description: "Indoor soccer with quick moves." },
          {
            name: "WaterPolo",
            description: "Swim, pass, and score goals in the pool.",
          },
          {
            name: "BeachVolleyball",
            description: "Sun, sand, and spikes on the beach.",
          },
          { name: "TableTennis", description: "Fast-paced ping pong action." },
          { name: "FootGolf", description: "Kick the ball into golf holes." },
          {
            name: "HandballPro",
            description: "Competitive handball at its best.",
          },
          {
            name: "TennisDoubles",
            description: "Team up for doubles tennis fun.",
          },
          {
            name: "StreetBasketball",
            description: "Play hoops on the street courts.",
          },
          {
            name: "CricketTest",
            description: "The classic, longer format cricket game.",
          },
          {
            name: "AmericanFootball",
            description: "The gridiron battle for touchdowns.",
          },
          {
            name: "MiniGolf",
            description: "Putt your way through fun obstacles.",
          },
          {
            name: "BallSkills",
            description: "Practice your ball control skills.",
          },
          { name: "Catch", description: "Improve your catching and throwing." },
          {
            name: "Freestyle",
            description: "Show off your ball tricks and flair.",
          },
        ],
      },
      {
        name: "Track",
        description:
          "Dash, jump, and race your way through thrilling track events!",
        topics: ["Cycling", "Sprinting", "Hurdles", "Relay"],
        rooms: [
          { name: "Sprint", description: "Speed off in short distance races." },
          {
            name: "Hurdles",
            description: "Leap over barriers and race to the finish.",
          },
          {
            name: "Relay",
            description: "Team up and pass the baton smoothly.",
          },
          {
            name: "Cycling",
            description: "Race on two wheels around the track.",
          },
          {
            name: "Marathon",
            description: "Endurance racing for the long haul.",
          },
          {
            name: "Steeplechase",
            description: "Race with obstacles and water jumps.",
          },
          {
            name: "LongJump",
            description: "Leap as far as you can into the sand.",
          },
          {
            name: "HighJump",
            description: "Soar over the bar to new heights.",
          },
          {
            name: "PoleVault",
            description: "Use a pole to fly over tall bars.",
          },
          {
            name: "Discus",
            description: "Throw the discus for maximum distance.",
          },
          { name: "ShotPut", description: "Push the shot for a heavy throw." },
          { name: "Javelin", description: "Throw the spear-like javelin far." },
          {
            name: "CrossCountry",
            description: "Run over varied terrain and trails.",
          },
          { name: "Decathlon", description: "Test your skills in ten events." },
          {
            name: "Triathlon",
            description: "Swim, bike, and run in one race.",
          },
          { name: "100m", description: "Classic sprint to show your speed." },
          { name: "200m", description: "Double the distance, double the fun." },
          { name: "400m", description: "Sprint around the track once." },
          { name: "800m", description: "Middle-distance race for endurance." },
          { name: "1500m", description: "Run just under a mile with speed." },
          {
            name: "4x100m",
            description: "Fast-paced relay race with four sprinters.",
          },
          {
            name: "4x400m",
            description: "Longer relay race, teamwork is key.",
          },
          {
            name: "Wheelchair",
            description: "Racing on wheels with speed and skill.",
          },
          {
            name: "MountainBike",
            description: "Tackle rough tracks on a mountain bike.",
          },
          {
            name: "Velodrome",
            description: "Track cycling on a banked track.",
          },
          {
            name: "UltraMarathon",
            description: "Go beyond the marathon distance.",
          },
          { name: "RelayMixed", description: "Mixed gender team relay races." },
          {
            name: "SprintHurdles",
            description: "Sprint races with hurdles to jump.",
          },
          { name: "FunRun", description: "Casual races just for fun." },
          {
            name: "NightRace",
            description: "Exciting races held under the lights.",
          },
        ],
      },
      {
        name: "Fitness",
        description:
          "Get moving and have fun with all things fitness and exercise!",
        topics: ["Gymnastics", "Pilates", "Yoga", "Martial Arts", "Zumba"],
        rooms: [
          {
            name: "Gymnastics",
            description:
              "Flip, balance, and tumble your way through challenges.",
          },
          {
            name: "Pilates",
            description: "Focus on core strength and flexibility.",
          },
          {
            name: "Yoga",
            description: "Stretch and relax while mastering your poses.",
          },
          {
            name: "MartialArts",
            description: "Learn the moves and tactics of martial arts.",
          },
          {
            name: "Zumba",
            description: "Dance your way to fitness with fun rhythms.",
          },
          {
            name: "Cardio",
            description: "Boost your heart rate with energizing exercises.",
          },
          {
            name: "Strength",
            description: "Build muscle and power with strength training.",
          },
          {
            name: "Endurance",
            description: "Push your limits with stamina-building workouts.",
          },
          {
            name: "Balance",
            description: "Improve your stability and coordination.",
          },
          {
            name: "Flexibility",
            description: "Stretch your muscles and increase mobility.",
          },
          {
            name: "HIIT",
            description: "High-intensity interval training for quick results.",
          },
          {
            name: "CrossFit",
            description: "Mix of strength and conditioning challenges.",
          },
          {
            name: "Aerobics",
            description: "Keep moving with fun and rhythmic workouts.",
          },
          {
            name: "Circuit",
            description: "Rotate through exercises for a total body workout.",
          },
          {
            name: "Meditation",
            description: "Calm your mind to complement your fitness.",
          },
          {
            name: "Running",
            description:
              "Hit the track or trail to improve speed and endurance.",
          },
          { name: "Cycling", description: "Pedal your way to better fitness." },
          { name: "Swimming", description: "Full-body workouts in the water." },
          {
            name: "Dance",
            description: "Fun moves to keep you active and energized.",
          },
          {
            name: "Stretching",
            description: "Prevent injuries and improve recovery.",
          },
          {
            name: "Boxing",
            description: "Punch and move with cardio boxing workouts.",
          },
          {
            name: "JumpRope",
            description: "Quick, effective cardio with a simple rope.",
          },
          {
            name: "Powerlifting",
            description: "Lift heavy and build serious strength.",
          },
          {
            name: "Kettlebells",
            description: "Swing into fitness with kettlebell exercises.",
          },
          {
            name: "TRX",
            description: "Bodyweight training with suspension straps.",
          },
          {
            name: "Calisthenics",
            description: "Train your body with minimal equipment.",
          },
          {
            name: "Bootcamp",
            description: "Intense group workouts for all fitness levels.",
          },
          {
            name: "Mobility",
            description: "Move better with joint-friendly exercises.",
          },
          {
            name: "Rehab",
            description: "Exercises focused on recovery and injury prevention.",
          },
          {
            name: "Wellness",
            description: "Balance fitness with mental and physical health.",
          },
        ],
      },
      {
        name: "Boards",
        description:
          "Ride the waves, slopes, and streets with board sports fun and excitement!",
        topics: ["Skateboarding", "Snowboarding", "Surfing", "Windsurfing"],
        rooms: [
          {
            name: "Skateboarding",
            description: "Master tricks and stunts on your skateboard.",
          },
          {
            name: "Snowboarding",
            description: "Carve through the snow with style and speed.",
          },
          {
            name: "Surfing",
            description: "Catch the perfect wave and ride like a pro.",
          },
          {
            name: "Windsurfing",
            description: "Harness the wind to glide across the water.",
          },
          {
            name: "Longboarding",
            description: "Cruise and carve on longer boards for smooth rides.",
          },
          {
            name: "Freestyle",
            description: "Show off creative moves and freestyle skills.",
          },
          {
            name: "Halfpipe",
            description: "Ride the ramps and perform aerial tricks.",
          },
          {
            name: "BigAir",
            description: "Launch into the air with thrilling jumps.",
          },
          {
            name: "Downhill",
            description: "Speed down hills with control and precision.",
          },
          {
            name: "ParkRiding",
            description: "Hit the skate park with tricks and fun.",
          },
          {
            name: "WaveRiding",
            description: "Ride waves of all sizes in different spots.",
          },
          {
            name: "Street",
            description: "Skate through urban environments and obstacles.",
          },
          {
            name: "Slalom",
            description: "Weave through cones or obstacles with agility.",
          },
          {
            name: "Freeride",
            description: "Explore varied terrain with style and skill.",
          },
          {
            name: "Speed",
            description: "Race for the fastest times on board sports.",
          },
          {
            name: "Tricks",
            description: "Learn and perform the coolest board tricks.",
          },
          {
            name: "Balance",
            description: "Improve your balance for smooth rides.",
          },
          {
            name: "Safety",
            description: "Gear up and stay safe while enjoying the ride.",
          },
          {
            name: "Equipment",
            description: "Know your boards, gear, and maintenance tips.",
          },
          {
            name: "Competitions",
            description: "Compete and win in exciting board sports events.",
          },
          {
            name: "History",
            description: "Discover how board sports evolved over time.",
          },
          {
            name: "Legends",
            description: "Learn about famous board sports athletes.",
          },
          {
            name: "Techniques",
            description: "Master the techniques for every board sport.",
          },
          {
            name: "Fitness",
            description: "Stay fit and strong for board sports performance.",
          },
          {
            name: "Culture",
            description:
              "Explore the lifestyle and culture around board sports.",
          },
          {
            name: "Travel",
            description: "Find the best spots worldwide for board sports.",
          },
          {
            name: "Weather",
            description: "Understand weather conditions for board sports.",
          },
          {
            name: "Tournaments",
            description: "Join and watch exciting board sports tournaments.",
          },
          {
            name: "Training",
            description: "Improve your skills with training tips and drills.",
          },
          {
            name: "Events",
            description: "Stay updated on upcoming board sports events.",
          },
        ],
      },
      {
        name: "WaterRacing",
        description:
          "Race across waves and waterways with speed and skill in water-based racing!",
        topics: ["Jet Skiing", "Canoeing", "Kayaking", "Sailing", "Rowing"],
        rooms: [
          {
            name: "JetSki",
            description: "Zoom over the water on a powerful jet ski.",
          },
          {
            name: "Canoe",
            description: "Paddle swiftly in a sleek canoe race.",
          },
          {
            name: "Kayak",
            description: "Navigate rapids and rivers in a kayak sprint.",
          },
          {
            name: "Sail",
            description: "Harness the wind to race your sailboat.",
          },
          {
            name: "Row",
            description: "Compete in teamwork rowing challenges.",
          },
          {
            name: "Speed",
            description: "Focus on top speeds across water races.",
          },
          {
            name: "Sprint",
            description: "Short, fast-paced water races for quick wins.",
          },
          {
            name: "Endurance",
            description: "Long-distance races that test stamina.",
          },
          {
            name: "Relay",
            description: "Team up for exciting water relay races.",
          },
          {
            name: "Offshore",
            description: "Race boats on open seas and offshore courses.",
          },
          {
            name: "Freestyle",
            description: "Show off stylish moves while racing.",
          },
          {
            name: "Marathon",
            description: "Test your limits in marathon water races.",
          },
          {
            name: "Obstacle",
            description: "Navigate courses with water obstacles.",
          },
          {
            name: "Circuit",
            description: "Complete laps in thrilling water circuits.",
          },
          {
            name: "Tandem",
            description: "Double the effort in tandem boat races.",
          },
          { name: "Team", description: "Work together for team water races." },
          {
            name: "Balance",
            description: "Master balance to maintain speed and control.",
          },
          {
            name: "Technique",
            description: "Perfect your racing techniques on water.",
          },
          {
            name: "Gear",
            description: "Learn about the best gear for water racing.",
          },
          {
            name: "Safety",
            description: "Stay safe while pushing your limits on water.",
          },
          {
            name: "History",
            description: "Discover the history of water-based racing.",
          },
          {
            name: "Legends",
            description: "Meet the champions of water racing.",
          },
          {
            name: "Training",
            description: "Improve your skills with water racing drills.",
          },
          {
            name: "Weather",
            description: "Understand how weather impacts water races.",
          },
          {
            name: "Competitions",
            description: "Compete in water racing championships.",
          },
          { name: "Strategy", description: "Plan your race tactics to win." },
          {
            name: "Navigation",
            description: "Master course navigation and turning.",
          },
          {
            name: "Starts",
            description: "Get off to a perfect start in every race.",
          },
          { name: "Turns", description: "Handle sharp turns like a pro." },
          {
            name: "Events",
            description: "Keep up with exciting water racing events.",
          },
        ],
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
        rooms: [
          {
            name: "Frisbee",
            description: "Catch and throw in exciting Ultimate Frisbee action.",
          },
          {
            name: "Dodge",
            description: "Dodge, duck, and dive in fast-paced dodgeball.",
          },
          {
            name: "Kickball",
            description: "Kick, run, and score in classic kickball games.",
          },
          {
            name: "Bocce",
            description: "Aim and roll with precision in bocce ball.",
          },
          { name: "Horseshoe", description: "Toss and score with horseshoes." },
          {
            name: "Tag",
            description: "Chase and tag in classic playground fun.",
          },
          { name: "Relay", description: "Team up for thrilling relay races." },
          {
            name: "Catch",
            description: "Sharpen your catching skills in various games.",
          },
          {
            name: "Throw",
            description: "Perfect your throwing in fun challenges.",
          },
          {
            name: "Balance",
            description: "Test your balance with casual game twists.",
          },
          { name: "Speed", description: "Race and move fast to win the game." },
          { name: "Team", description: "Work together to score and win." },
          {
            name: "Fun",
            description: "Enjoy light-hearted, entertaining gameplay.",
          },
          {
            name: "Outdoor",
            description: "Play games best enjoyed outside in the sun.",
          },
          {
            name: "Indoor",
            description: "Casual games perfect for indoor fun.",
          },
          {
            name: "Strategy",
            description: "Plan smart moves to outplay opponents.",
          },
          {
            name: "Skills",
            description: "Practice and improve your game skills.",
          },
          {
            name: "Challenges",
            description: "Take on fun challenges with friends.",
          },
          {
            name: "Practice",
            description: "Hone your skills in relaxed sessions.",
          },
          {
            name: "Friendly",
            description: "Games for friendly competition and laughs.",
          },
          {
            name: "Events",
            description: "Join tournaments and fun social events.",
          },
          {
            name: "Rules",
            description: "Learn the basics and advanced game rules.",
          },
          {
            name: "History",
            description: "Discover the origins of your favorite games.",
          },
          {
            name: "Gear",
            description: "Explore equipment used in casual games.",
          },
          {
            name: "Teams",
            description: "Build and manage your winning teams.",
          },
          { name: "Tactics", description: "Master tactics to get the edge." },
          {
            name: "Warmup",
            description: "Get ready with fun warm-up exercises.",
          },
          { name: "Play", description: "Jump right into the action and play!" },
          {
            name: "Scores",
            description: "Keep track of points and leaderboards.",
          },
          { name: "Social", description: "Games that bring people together." },
        ],
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
        rooms: [
          {
            name: "Softball",
            description: "Swing, catch, and run in relaxed softball games.",
          },
          {
            name: "Cricket",
            description: "Bowl, bat, and field in casual cricket matches.",
          },
          {
            name: "Bowling",
            description: "Roll strikes and spares with your friends.",
          },
          {
            name: "PingPong",
            description: "Fast-paced table tennis action for all skill levels.",
          },
          {
            name: "Pool",
            description: "Aim and sink balls in friendly pool games.",
          },
          {
            name: "Darts",
            description: "Throw sharp and steady in fun darts matches.",
          },
          {
            name: "Catch",
            description: "Enjoy classic catch games that never get old.",
          },
          {
            name: "Teams",
            description: "Form teams and play together for the win.",
          },
          {
            name: "Tournaments",
            description: "Compete in fun and casual tournaments.",
          },
          {
            name: "Skills",
            description: "Sharpen your social sports skills here.",
          },
          {
            name: "Strategy",
            description: "Plan and play smarter to outscore your friends.",
          },
          {
            name: "Friendly",
            description: "Games designed for fun and friendly matches.",
          },
          {
            name: "Socialize",
            description: "Sports that are as much about friends as the game.",
          },
          {
            name: "Leisure",
            description: "Relaxed games perfect for downtime.",
          },
          {
            name: "Practice",
            description: "Work on your moves and improve your game.",
          },
          {
            name: "Events",
            description: "Join social sports events and gatherings.",
          },
          {
            name: "Gear",
            description: "Learn about equipment used in these games.",
          },
          {
            name: "Rules",
            description: "Brush up on the basics to keep the game fun.",
          },
          {
            name: "Play",
            description: "Jump into games and enjoy the action.",
          },
          {
            name: "Scores",
            description: "Track your progress and friendly rivalries.",
          },
          {
            name: "Warmup",
            description: "Get ready with fun warm-up activities.",
          },
          {
            name: "Challenges",
            description: "Take on new challenges with your crew.",
          },
          { name: "Fun", description: "Pure fun and laughs with every match." },
          {
            name: "Outdoor",
            description: "Enjoy social sports best played outside.",
          },
          { name: "Indoor", description: "Cozy up with indoor social sports." },
          {
            name: "Mixed",
            description: "Games for all ages and skill levels.",
          },
          { name: "Casual", description: "No pressure, just play and enjoy." },
          {
            name: "Competitive",
            description: "For those who like a little friendly rivalry.",
          },
          {
            name: "Teams",
            description: "Join or create your own social sports teams.",
          },
          {
            name: "Events",
            description: "Be part of the community and have fun.",
          },
        ],
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
        rooms: [
          {
            name: "League",
            description: "Test your skills in the world of League of Legends.",
          },
          {
            name: "Fortnite",
            description: "Build, battle, and survive in Fortnite.",
          },
          {
            name: "CSGO",
            description: "Aim and strategize in Counter-Strike matches.",
          },
          {
            name: "CallDuty",
            description: "Dominate the battlefield in Call of Duty.",
          },
          {
            name: "Dota",
            description: "Master the lanes and heroes in Dota 2.",
          },
          {
            name: "Shooter",
            description: "Fast reflexes and sharp aim rule here.",
          },
          {
            name: "Strategy",
            description: "Plan and outsmart your opponents.",
          },
          {
            name: "Teamwork",
            description: "Win games with tight team coordination.",
          },
          {
            name: "Tournaments",
            description: "Compete in thrilling esports tournaments.",
          },
          {
            name: "Ranked",
            description: "Climb the ranks and prove your mettle.",
          },
          {
            name: "Casual",
            description: "Chill and play some casual matches.",
          },
          {
            name: "Streamers",
            description: "Follow and learn from the best gamers.",
          },
          {
            name: "Events",
            description: "Join live esports events and watch the action.",
          },
          {
            name: "Practice",
            description: "Sharpen your skills and tactics here.",
          },
          {
            name: "Highlights",
            description: "Catch the best moments and plays.",
          },
          {
            name: "News",
            description: "Stay updated with the latest esports news.",
          },
          { name: "Gear", description: "Explore gaming gear and setups." },
          { name: "Mods", description: "Discover custom maps and mods." },
          {
            name: "Casters",
            description: "Hear the excitement from esports commentators.",
          },
          {
            name: "Updates",
            description: "Keep up with game patches and changes.",
          },
          {
            name: "Clans",
            description: "Join or create clans and gaming communities.",
          },
          {
            name: "Challenges",
            description: "Take on in-game challenges and missions.",
          },
          {
            name: "Achievements",
            description: "Show off your in-game accomplishments.",
          },
          {
            name: "Training",
            description: "Improve your mechanics and game sense.",
          },
          {
            name: "Replays",
            description: "Review past matches to learn and improve.",
          },
          {
            name: "Streaming",
            description: "Tips and tricks for becoming a streamer.",
          },
          {
            name: "Social",
            description: "Meet and chat with fellow esports fans.",
          },
          { name: "Events", description: "Special community esports events." },
          { name: "Battles", description: "Jump into intense player battles." },
          { name: "Fun", description: "Just have fun and enjoy the game!" },
        ],
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
        rooms: [
          { name: "Speed", description: "Test how fast you can type!" },
          {
            name: "Accuracy",
            description: "Focus on typing perfectly without mistakes.",
          },
          {
            name: "Words",
            description: "Type tricky words before time runs out.",
          },
          {
            name: "Phrases",
            description: "Type full phrases with speed and style.",
          },
          {
            name: "Challenge",
            description: "Take on tough typing challenges.",
          },
          {
            name: "Race",
            description: "Compete against others in real-time typing races.",
          },
          { name: "Practice", description: "Hone your typing skills here." },
          {
            name: "Beginner",
            description: "Start easy and build up your speed.",
          },
          {
            name: "Intermediate",
            description: "Step up your game with medium difficulty.",
          },
          {
            name: "Advanced",
            description: "For the pros who never miss a key.",
          },
          {
            name: "Sentences",
            description: "Type complete sentences quickly.",
          },
          {
            name: "Speedrun",
            description: "Beat the clock in this timed mode.",
          },
          { name: "Quotes", description: "Type famous quotes under pressure." },
          {
            name: "Numbers",
            description: "Challenge your numeric typing skills.",
          },
          {
            name: "Symbols",
            description: "Master typing special characters fast.",
          },
          { name: "Daily", description: "Try the daily typing challenge." },
          { name: "Weekly", description: "Compete in weekly typing contests." },
          {
            name: "Tournament",
            description: "Join the big typing competitions.",
          },
          {
            name: "Wordspeed",
            description: "Focus on typing speed over accuracy.",
          },
          { name: "Perfection", description: "Type without a single mistake." },
          {
            name: "Combo",
            description: "Build combos by typing consecutive words correctly.",
          },
          {
            name: "Marathon",
            description: "Endurance typing for the long haul.",
          },
          {
            name: "Classic",
            description: "The classic typing test experience.",
          },
          { name: "Timed", description: "Race against a ticking clock." },
          {
            name: "Freeplay",
            description: "Type at your own pace, no pressure.",
          },
          {
            name: "Challenge",
            description: "Special typing challenges to push your limits.",
          },
          {
            name: "Speedtest",
            description: "Measure your maximum typing speed.",
          },
          {
            name: "Wordsprint",
            description: "Fast typing sprints with short bursts.",
          },
          {
            name: "AccuracyPro",
            description: "Focus purely on flawless typing.",
          },
          {
            name: "Nightmode",
            description: "Practice typing in a relaxed, dark theme.",
          },
        ],
      },
      {
        name: "Hangman",
        description:
          "Guess letters to reveal the hidden word before the hangman is complete!",
        topics: [],
        rooms: [
          { name: "Easy", description: "Simple words to get you started." },
          { name: "Medium", description: "Words with a moderate challenge." },
          { name: "Hard", description: "Test your skills with tough words." },
          { name: "Animals", description: "Guess names of animals." },
          {
            name: "Fruits",
            description: "Try to guess delicious fruit names.",
          },
          {
            name: "Countries",
            description: "Guess countries from around the world.",
          },
          { name: "Cities", description: "Famous cities to uncover." },
          { name: "Sports", description: "Sports-related words to guess." },
          { name: "Movies", description: "Guess popular movie titles." },
          { name: "Music", description: "Names of songs and artists." },
          { name: "Food", description: "Delicious food items to reveal." },
          { name: "Colors", description: "Color names to guess." },
          { name: "Technology", description: "Tech terms and gadgets." },
          {
            name: "Nature",
            description: "Words inspired by the natural world.",
          },
          { name: "Body", description: "Parts of the human body to guess." },
          { name: "Vehicles", description: "Types of transportation." },
          { name: "Jobs", description: "Guess various professions." },
          { name: "Clothing", description: "Items of clothing to reveal." },
          { name: "Mythology", description: "Mythical creatures and legends." },
          { name: "School", description: "School-related words and objects." },
          { name: "Space", description: "Words from the cosmos." },
          { name: "Games", description: "Guess names of popular games." },
          { name: "Weather", description: "Weather-related terms." },
          { name: "Plants", description: "Guess names of plants and trees." },
          { name: "Transport", description: "Various means of travel." },
          { name: "Instruments", description: "Musical instruments to guess." },
          { name: "Books", description: "Famous book titles and authors." },
          {
            name: "Festivals",
            description: "Names of holidays and festivals.",
          },
          { name: "Superheroes", description: "Guess superhero names." },
          { name: "Fantasy", description: "Words from fantasy worlds." },
        ],
      },
      {
        name: "Anagram",
        description:
          "Rearrange the letters to create new words and solve the puzzle!",
        topics: [],
        rooms: [
          {
            name: "Easy",
            description: "Simple puzzles to warm up your brain.",
          },
          {
            name: "Medium",
            description: "Challenge yourself with tricky puzzles.",
          },
          { name: "Hard", description: "Only for the puzzle pros!" },
          { name: "Animals", description: "Unscramble names of animals." },
          { name: "Fruits", description: "Mix up fruit names and solve." },
          { name: "Countries", description: "Anagrams of country names." },
          { name: "Cities", description: "Try to solve city name puzzles." },
          { name: "Sports", description: "Sports-related anagrams to crack." },
          { name: "Movies", description: "Famous movie titles jumbled up." },
          { name: "Music", description: "Unscramble song titles and artists." },
          { name: "Food", description: "Delicious food word puzzles." },
          { name: "Colors", description: "Color names to unscramble." },
          { name: "Technology", description: "Tech terms mixed around." },
          {
            name: "Nature",
            description: "Words inspired by the natural world.",
          },
          { name: "Body", description: "Parts of the human body anagrammed." },
          { name: "Vehicles", description: "Transportation terms scrambled." },
          { name: "Jobs", description: "Professions in mixed letters." },
          { name: "Clothing", description: "Fashion words to unscramble." },
          { name: "Mythology", description: "Mystical names jumbled up." },
          { name: "School", description: "School-related anagram puzzles." },
          { name: "Space", description: "Words from outer space." },
          { name: "Games", description: "Popular game titles mixed up." },
          { name: "Weather", description: "Weather-related word puzzles." },
          { name: "Plants", description: "Names of plants to solve." },
          { name: "Transport", description: "Means of travel anagrammed." },
          {
            name: "Instruments",
            description: "Musical instruments scrambled.",
          },
          { name: "Books", description: "Famous books and authors jumbled." },
          { name: "Festivals", description: "Holiday names mixed up." },
          { name: "Superheroes", description: "Unscramble superhero names." },
          { name: "Fantasy", description: "Words from fantasy realms." },
        ],
      },
      {
        name: "Unscramble",
        description:
          "A fun and engaging game where players unscramble jumbled letters to discover the correct word or phrase.",
        topics: [],
        rooms: [
          { name: "Easy", description: "Start simple and warm up your brain." },
          {
            name: "Medium",
            description: "A bit trickier for the word lovers.",
          },
          { name: "Hard", description: "Only for those who love a challenge." },
          {
            name: "Animals",
            description: "Unscramble names of creatures big and small.",
          },
          { name: "Fruits", description: "Juicy and sweet word puzzles." },
          {
            name: "Countries",
            description: "Discover nations through mixed letters.",
          },
          {
            name: "Cities",
            description: "Famous cities waiting to be solved.",
          },
          {
            name: "Sports",
            description: "Get sporty with these word jumbles.",
          },
          { name: "Movies", description: "Famous films in scrambled form." },
          { name: "Music", description: "Songs and artists to decode." },
          { name: "Food", description: "Yummy word challenges." },
          { name: "Colors", description: "Brighten up with colorful puzzles." },
          { name: "Tech", description: "Techie terms all jumbled up." },
          {
            name: "Nature",
            description: "Words inspired by the great outdoors.",
          },
          { name: "Body", description: "Parts of the body to unscramble." },
          { name: "Vehicles", description: "Travel words scrambled for fun." },
          {
            name: "Jobs",
            description: "Professions mixed and waiting for you.",
          },
          { name: "Clothing", description: "Fashion words all tangled up." },
          {
            name: "Mythology",
            description: "Mythical names and terms to solve.",
          },
          { name: "School", description: "Back to school with word puzzles." },
          {
            name: "Space",
            description: "Explore outer space through letters.",
          },
          { name: "Games", description: "Famous games to unscramble." },
          { name: "Weather", description: "Weather terms in a twist." },
          { name: "Plants", description: "Nature's green friends scrambled." },
          { name: "Transport", description: "Means of travel to decode." },
          {
            name: "Instruments",
            description: "Musical tools waiting to be found.",
          },
          { name: "Books", description: "Famous titles and authors jumbled." },
          { name: "Festivals", description: "Celebrate with festive words." },
          { name: "Superheroes", description: "Hero names scrambled and fun." },
          {
            name: "Fantasy",
            description: "Dive into fantasy worlds of words.",
          },
        ],
      },

      {
        name: "WordMaker",
        description:
          "Given a base word, form as many smaller words as possible using its letters. A fun and challenging game to test your vocabulary skills!",
        topics: [],
        rooms: [
          {
            name: "Easy",
            description: "Start with simple words and build up.",
          },
          {
            name: "Medium",
            description: "A bit trickier for the word explorers.",
          },
          { name: "Hard", description: "Only for vocabulary masters." },
          { name: "Animals", description: "Make words inspired by animals." },
          { name: "Fruits", description: "Juicy word challenges await." },
          {
            name: "Colors",
            description: "Create words that brighten your day.",
          },
          { name: "Foods", description: "Form delicious word combos." },
          { name: "Sports", description: "Get sporty with your word skills." },
          {
            name: "Cities",
            description: "Build words from famous city names.",
          },
          {
            name: "Countries",
            description: "Explore nations one word at a time.",
          },
          { name: "Nature", description: "Words inspired by the outdoors." },
          { name: "Music", description: "Tune your brain with musical words." },
          {
            name: "Space",
            description: "Shoot for the stars with your vocabulary.",
          },
          { name: "Tech", description: "Create words from tech terms." },
          { name: "Body", description: "Words from the human body." },
          { name: "Vehicles", description: "Drive your word skills forward." },
          { name: "Clothing", description: "Fashionable word fun." },
          { name: "Jobs", description: "Work your way through word puzzles." },
          { name: "Instruments", description: "Make musical word combos." },
          {
            name: "Mythology",
            description: "Create words from myths and legends.",
          },
          { name: "Books", description: "Words inspired by literature." },
          { name: "Festivals", description: "Celebrate with festive words." },
          { name: "Superheroes", description: "Form words from hero names." },
          { name: "Fantasy", description: "Dive into magical word building." },
          { name: "Weather", description: "Storm up some word fun." },
          { name: "Games", description: "Play with words from games." },
          {
            name: "Plants",
            description: "Grow your vocabulary with nature words.",
          },
          { name: "Ocean", description: "Dive deep into aquatic words." },
          {
            name: "History",
            description: "Build words from historical themes.",
          },
          { name: "Adventure", description: "Explore exciting word puzzles." },
        ],
      },
      {
        name: "LuckyFlip",
        description:
          "This game combines excitement with unpredictability, making it perfect for casual gamers and risk-takers alike.",
        topics: [],
        rooms: [
          { name: "Flip", description: "Get ready to flip your luck!" },
          { name: "Spin", description: "Spin the wheel and test your fate." },
          { name: "Rush", description: "Fast-paced flips for thrill seekers." },
          { name: "Dash", description: "Quick flips, big surprises." },
          { name: "Twist", description: "Expect the unexpected twists!" },
          { name: "Surge", description: "Feel the surge of excitement." },
          { name: "Jolt", description: "Electrifying flips and turns." },
          { name: "Boost", description: "Boost your chances with every flip." },
          { name: "Jump", description: "Leap into the flipping action." },
          { name: "Wave", description: "Ride the wave of luck." },
          { name: "Flipout", description: "Go all out with daring flips." },
          { name: "Spin-off", description: "Compete in wild spin-offs." },
          { name: "Pop", description: "Pop your luck in every round." },
          { name: "Flipster", description: "Become the ultimate flipster." },
          {
            name: "Bounce",
            description: "Bounce your luck higher and higher.",
          },
          { name: "RushHour", description: "Feel the rush in every flip." },
          { name: "Roller", description: "Roll the odds your way." },
          { name: "FlipZone", description: "Enter the zone of flips and fun." },
          { name: "FlipMax", description: "Maximize your flip potential." },
          { name: "Blitz", description: "Quick, bold, and exciting flips." },
          { name: "Glide", description: "Smooth flips with high stakes." },
          { name: "Rocket", description: "Blast off with lucky flips." },
          { name: "BounceBack", description: "Flip back from near misses." },
          { name: "PopUp", description: "Surprise flips at every turn." },
          { name: "FlipKing", description: "Rule the flips, rule the game." },
          { name: "Flash", description: "Fast flips, bright rewards." },
          { name: "Storm", description: "Whirlwind of lucky flips." },
          { name: "Bolt", description: "Strike with lightning flips." },
          { name: "Surprise", description: "Expect surprises every flip." },
          { name: "Jumpstart", description: "Kick off with an exciting flip." },
        ],
      },

      {
        name: "LuckyWhiz",
        description:
          "A game of luck and logic, where you make quick decisions to win. Guess correctly and rise to the top!",
        topics: [],
        rooms: [
          { name: "Spark", description: "Ignite your luck and wit!" },
          { name: "Flash", description: "Quick moves, fast wins." },
          { name: "Buzz", description: "Feel the buzz of smart guesses." },
          { name: "Flip", description: "Flip your way to victory." },
          { name: "Dash", description: "Race against time and luck." },
          { name: "Blitz", description: "Fast decisions, big rewards." },
          { name: "Glide", description: "Smooth moves, clever wins." },
          { name: "Rush", description: "Feel the rush of the game." },
          { name: "Jolt", description: "Electrify your luck and logic." },
          { name: "Pop", description: "Pop quick guesses to win." },
          { name: "Zap", description: "Zap your way to the top." },
          { name: "Buzz", description: "Buzz through tricky questions." },
          { name: "Twist", description: "Twist your luck and skill." },
          { name: "Surge", description: "Ride the surge of wins." },
          { name: "Blink", description: "Fast eyes, faster wins." },
          { name: "Pulse", description: "Feel the pulse of the game." },
          { name: "Glint", description: "Shine with sharp guesses." },
          { name: "Sparkle", description: "Brighten your winning streak." },
          { name: "Leap", description: "Leap ahead with clever guesses." },
          { name: "Zoom", description: "Zoom past the competition." },
          { name: "Bounce", description: "Bounce your way to victory." },
          {
            name: "Flashpoint",
            description: "Make your move at the flashpoint.",
          },
          { name: "Rocket", description: "Blast off with quick thinking." },
          { name: "Shine", description: "Shine bright with smart moves." },
          { name: "Flick", description: "Flick your luck and win." },
          { name: "Sprint", description: "Sprint to the top with speed." },
          { name: "Dart", description: "Hit the target every time." },
          { name: "Vibe", description: "Catch the winning vibe." },
          { name: "Flashy", description: "Show off your quick smarts." },
          { name: "SparkUp", description: "Turn up the luck and logic." },
        ],
      },
      {
        name: "LuckySpin",
        description:
          "Spin the wheel of fortune and guess the word or number! The more you play, the luckier you get!",
        topics: [],
        rooms: [
          { name: "Spin", description: "Get ready to spin and win!" },
          { name: "Twirl", description: "Watch the wheel twirl your luck." },
          { name: "Whirl", description: "Whirl to your fortune!" },
          { name: "Reel", description: "Reel in those big wins." },
          { name: "Wheel", description: "Round and round it goes!" },
          { name: "Luck", description: "Put your luck to the test." },
          { name: "Chance", description: "Take a chance, win big!" },
          { name: "Turn", description: "Your turn to spin the wheel." },
          { name: "Roll", description: "Roll for luck and fun." },
          { name: "SpinOut", description: "Spin out your fortune!" },
          { name: "Twist", description: "Twist fate in your favor." },
          { name: "Flip", description: "Flip the odds your way." },
          { name: "Rush", description: "Feel the rush of the spin." },
          { name: "Glide", description: "Glide smoothly to victory." },
          { name: "Bounce", description: "Bounce into your luck." },
          { name: "Flash", description: "Spin fast, win faster." },
          { name: "Jolt", description: "Get a jolt of excitement!" },
          { name: "Blink", description: "Spin in the blink of an eye." },
          { name: "Surge", description: "Surge ahead with every spin." },
          { name: "Bolt", description: "Strike lucky with the bolt." },
          { name: "Dart", description: "Aim your spin right." },
          { name: "Pulse", description: "Feel the pulse of fortune." },
          { name: "Glint", description: "Catch the glint of luck." },
          { name: "Flashy", description: "Spin flashy and win big." },
          { name: "Leap", description: "Leap to the next lucky win." },
          { name: "Zoom", description: "Zoom through spins and wins." },
          { name: "Spark", description: "Spark your fortune now." },
          { name: "Rocket", description: "Blast off to lucky spins." },
          { name: "Shine", description: "Shine with every spin." },
          { name: "Twinkle", description: "Twinkle your way to fortune." },
        ],
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
    SubscriptionPlan,
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
      discount: 0.10,
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

async function main() {
  try {
    // seed coin packages
    const totalPackages = await prisma.coinPackage.count();
    if (totalPackages === 0) {
      await prisma.coinPackage.createMany({ data: coinPackages });
      console.log("seeding complete.... coin packages created successfully");
    } else {
      console.log("Seeding complete .... coin packages  already exists");
    }

    // seed tip packages
    const totalTipPackages = await prisma.tipPackage.count();
    if (totalTipPackages === 0) {
      await prisma.tipPackage.createMany({ data: tipPackages });
      console.log("seeding complete.... tip packages created successfully");
    } else {
      console.log("Seeding complete .... tip packages  already exists");
    }

    // seed coin wallets
    const totalWallets = await prisma.cryptoAddress.count();
    if (totalWallets === 0) {
      await prisma.cryptoAddress.createMany({
        data: [
          {
            address: "UQDB7WxFFuZQ2LPMwoC7eSLWwLJ1pMZZ_sURxct8GAXEIuHt",
            name: "TON",
            rate: 0.013,
          },
        ],
      });
      console.log("seeding complete.... crypto wallets created successfully");
    } else {
      console.log("Seeding complete .... crypto wallets  already exists");
    }
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
        const gameName = el.name.toLocaleLowerCase()
        const isAcronym = gameName.startsWith("acronym")
        await prisma.game.create({
          data: {
            name: el.name,
            description: el.description,
            modes: isAcronym ? [GameMode.MULTI] : [GameMode.MULTI, GameMode.SINGLE],
            categories: {
              create: el.categories.map((item) => ({
                name: item.name,
                description: item.description,
                rooms: { create: item.rooms },
              })),
            },
          },
        });
      }
      console.log("seeding complete.... games created successfully");
    } else {
      console.log("Seeding complete.... games  already exists");
    }
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
    // send users
    const users = await prisma.user.count();
    if (users < 10) {
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
  } catch (error: any) {
    console.log("Error Continent & countries", error.message);
  }
}

main()
  .catch((error: any) => {
    console.log("Error seeding data", error?.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

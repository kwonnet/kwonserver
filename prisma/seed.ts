import {
  GameMilestone,
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

const coinPackages = [
  { name: "Starter Pack", amount: 110, price: 50, bonus: 0 },
  { name: "Basic Pack", amount: 230, price: 100, bonus: 0 },
  { name: "Bronze Pack", amount: 350, price: 170, bonus: 0 },
  { name: "Silver Pack", amount: 460, price: 200, bonus: 0 },
  { name: "Gold Pack", amount: 570, price: 260, bonus: 50 },
  { name: "Elite Pack", amount: 1_100, price: 500, bonus: 105 },
  { name: "Pro Pack", amount: 2_000, price: 1005, bonus: 410 },
  { name: "Mega Pack", amount: 5_000, price: 2200, bonus: 500 },
  { name: "Ultra Pack", amount: 10_100, price: 5100, bonus: 1200 },
  { name: "Master Pack", amount: 20_300, price: 10_000, bonus: 3300 },
  { name: "Legend Pack", amount: 41_000, price: 22_000, bonus: 7100 },
  { name: "Titan Pack", amount: 88_500, price: 45_000, bonus: 15_000 },
  { name: "Giant Pack", amount: 180_000, price: 80_000, bonus: 25_000 },
  { name: "Colossal Pack", amount: 300_500, price: 140_000, bonus: 70_000 },
  { name: "Infinity Pack", amount: 700_500, price: 300_000, bonus: 150_000 },
];

const gameMilestones = [
  // room winning streak
  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIVE_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 100,
    milestone: 5,
    thumbnail: "/static/trophies/silver-4.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TEN_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 150,
    milestone: 10,
    thumbnail: "/static/trophies/silver-3.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.TWENTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 200,
    milestone: 20,
    thumbnail: "/static/trophies/silver-2.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.FIFTY_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 250,
    milestone: 50,
    thumbnail: "/static/trophies/silver-1.jpeg",
  },

  {
    name: MilestoneNameEnum.ROOM_STREAK,
    reason: RewardReasonEnum.HUNDRED_WINNING_STREAK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 300,
    milestone: 100,
    thumbnail: "/static/trophies/gold-1.jpeg",
  },

  // week
  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.TOP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 360,
    milestone: 1,
    thumbnail: "/static/trophies/gold-1.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 325,
    milestone: 2,
    thumbnail: "/static/trophies/gold-2.jpeg",
  },

  {
    name: MilestoneNameEnum.WEEK,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_WEEK,
    rewardType: RewardTypeEnum.BONUS,
    reward: 305,
    milestone: 3,
    thumbnail: "/static/trophies/gold-3.jpeg",
  },

  // Month
  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.TOP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.CREDIT,
    reward: 0,
    milestone: 1,
    thumbnail: "/static/trophies/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.CREDIT,
    reward: 0,
    milestone: 2,
    thumbnail: "/static/trophies/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.MONTH,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_MONTH,
    rewardType: RewardTypeEnum.CREDIT,
    reward: 0,
    milestone: 3,
    thumbnail: "/static/trophies/gold-6.jpeg",
  },

  // Year
  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.TOP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 700,
    milestone: 1,
    thumbnail: "/static/trophies/gold-4.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.FIRST_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 600,
    milestone: 2,
    thumbnail: "/static/trophies/gold-5.jpeg",
  },

  {
    name: MilestoneNameEnum.YEAR,
    reason: RewardReasonEnum.SECOND_RUNNER_UP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 500,
    milestone: 3,
    thumbnail: "/static/trophies/gold-6.jpeg",
  },
  //   champ
  {
    name: MilestoneNameEnum.CHAMP,
    reason: RewardReasonEnum.CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 850,
    milestone: 1,
    thumbnail: "/static/trophies/diamond-1.jpeg",
  },

  {
    name: MilestoneNameEnum.GRAND_CHAMP,
    reason: RewardReasonEnum.GRAND_CHAMP_OF_THE_YEAR,
    rewardType: RewardTypeEnum.COINS,
    reward: 1000,
    milestone: 1,
    thumbnail: "/static/trophies/diamond-2.jpeg",
  },
];

const games = [
  {
    name: "Trivia & Quiz",
    description:
      "Fast-paced games requiring quick thinking, precise timing, and swift reactions",
  },
  {
    name: "Acronym Arcade",
    description:
      "Test your wit and speed in this fun-filled game of guessing acronyms — perfect for quick thinkers!",
  },
  {
    name: "MindMash",
    description:
      "Brain games that challenge your thinking and reflexes, featuring word puzzles, typing races, and problem-solving challenges.",
    // categories: [Hangman, Anagram, Unscramble, Missing Letter, Lucky Number(Guess the Number), Fastest Typing Sprint]
  },
];

const categories = [
  {
    name: "Themed Quest",
    description: "Embark on a journey through themed challenges",
  },
];

const rooms = [
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
    description: "Survive a malfunction on a space station in deep space.",
  },
  {
    name: "Secret Agent Mission",
    description: "Complete covert missions for the intelligence agency.",
  },
  {
    name: "Zombie Apocalypse",
    description: "Survive waves of zombies in a post-apocalyptic world.",
  },
  {
    name: "Ninja Training",
    description: "Master your skills as a stealthy ninja in ancient Japan.",
  },
  {
    name: "Medieval Kingdom",
    description: "Defend the kingdom from invaders and rival monarchs.",
  },
  {
    name: "The Jungle Hunt",
    description: "Navigate the dense jungle to find rare and hidden gems.",
  },
  {
    name: "Haunted Carnival",
    description: "Survive a spooky adventure in a haunted carnival.",
  },
  {
    name: "The Viking Quest",
    description: "Embark on a raid to discover treasures of the Norse gods.",
  },
  {
    name: "Mythical Creatures",
    description: "Track down and tame mythical beasts from ancient legends.",
  },
  {
    name: "The Ice Cavern",
    description: "Explore icy caves to uncover long-forgotten secrets.",
  },
  {
    name: "Mysterious Island",
    description: "Stranded on an island, uncover its secrets to escape.",
  },
  {
    name: "The Alien Invasion",
    description: "Defend Earth from a wave of alien invaders.",
  },
  {
    name: "The Arctic Expedition",
    description: "Survive the frozen wilderness and uncover hidden treasures.",
  },
  {
    name: "Treasure Hunt",
    description:
      "Follow clues to unearth ancient treasure hidden around the world.",
  },
  {
    name: "The Haunted Library",
    description: "Explore an eerie library and solve its mysteries.",
  },
  {
    name: "Superhero Academy",
    description: "Train to become the next superhero and save the city.",
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
    name: "Spooky Graveyard",
    description:
      "Navigate through a haunted graveyard full of spooky surprises.",
  },
  {
    name: "Castle Siege",
    description: "Defend the castle from invading armies of the undead.",
  },
  {
    name: "The Secret Society",
    description: "Join a secret society and uncover its hidden conspiracies.",
  },
  {
    name: "The Mad Scientist",
    description: "Help a scientist solve puzzles to finish a wild experiment.",
  },
  {
    name: "Witch's Curse",
    description: "Break the curse cast by a vengeful witch.",
  },
  {
    name: "Haunted Forest",
    description: "Brave a haunted forest full of eerie creatures.",
  },
  {
    name: "The Sorcerer's Tower",
    description: "Climb the wizard's tower and face magical challenges.",
  },
  {
    name: "Steampunk City",
    description: "Explore a city powered by steam and mechanical wonders.",
  },
  {
    name: "Cliffside Escape",
    description: "Escape from a crumbling cliffside fortress.",
  },
  {
    name: "The Pharaoh's Curse",
    description: "Escape the deadly traps of the ancient Pharaoh's tomb.",
  },
  {
    name: "Mayan Mystery",
    description: "Unveil the mysteries hidden in ancient Mayan ruins.",
  },
  {
    name: "The Robot Uprising",
    description: "Fight back against a world taken over by rogue robots.",
  },
  {
    name: "Nautical Adventure",
    description: "Sail across the seas to explore new lands and treasures.",
  },
  {
    name: "Dungeon Crawl",
    description: "Fight through dangerous dungeons to retrieve ancient relics.",
  },
  {
    name: "Monster Hunter",
    description: "Hunt down mythical monsters lurking in the dark.",
  },
];
// premium subscription plans
const subPlans: {
  plan: Pick<
    SubscriptionPlan,
    "name" | "accountType" | "discount" | "price" | "tier"
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
      name: "Basic",
      price: 3.99,
      discount: 0.1,
      accountType: UserTypeEnum.INDIVIDUAL,
      tier: [],
    },
    feature: {
      name: "Exclusive Experience",
      items: [
        {
          id: generateUniqueRef(),
          title: "Reply and profile boost",
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
      price: 7.99,
      discount: 0.11,
      accountType: UserTypeEnum.INDIVIDUAL,
      tier: [],
    },
    feature: {
      name: "Exclusive Experience",
      items: [
        {
          id: generateUniqueRef(),
          title: "Reply and profile boost",
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
      name: "Supreme",
      price: 18.99,
      discount: 0.12,
      accountType: UserTypeEnum.INDIVIDUAL,
      tier: [],
    },
    feature: {
      name: "Exclusive Experience",
      items: [
        {
          id: generateUniqueRef(),
          title: "Reply and profile boost",
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
      name: "Basic",
      price: 53.99,
      discount: 0.11,
      accountType: UserTypeEnum.ORGANIZATION,
      tier: [
        {
          id: "83902837hjdl",
          name: "Small",
          price: 53.99,
          message: "1 - 20 Employees",
        },
        {
          id: "37290w03julo",
          name: "Medium",
          price: 87.99,
          message: " More than 20 Employees",
        },
        {
          id: "7389wjsoo0p0w",
          name: "Large",
          price: 121.99,
          message: " More than 100 Employees",
        },
      ],
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
      price: 230.99,
      discount: 0.12,
      accountType: UserTypeEnum.ORGANIZATION,
      tier: [
        {
          id: "729shujslos",
          name: "Small",
          price: 230.99,
          message: "1 - 20 Employees",
        },
        {
          id: "6372929hywi",
          name: "Medium",
          price: 321.99,
          message: " More than 20 Employees",
        },
        {
          id: "36282930lsop",
          name: "Large",
          price: 749.99,
          message: " More than 100 Employees",
        },
      ],
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
  {
    plan: {
      name: "Basic",
      price: 25.99,
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
      price: 65.99,
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
      const result = await prisma.game.createManyAndReturn({ data: games });
      console.log("seeding in progress.... games created successfully");
      const game = result[0];
      const result2 = await prisma.gameCategory.createManyAndReturn({
        data: categories.map((i) => ({ ...i, gameId: game.id })),
      });
      console.log(
        "seeding in progress.... game categories created successfully"
      );
      const category = result2[0];
      const result3 = await prisma.gameRoom.createManyAndReturn({
        data: rooms.map((i) => ({ ...i, catId: category.id })),
      });
      console.log(
        "seeding in progress.... game category rooms created successfully"
      );
    } else {
      console.log("Seeding complete.... games  already exists");
    }
    // seed app subscriptions
    const plans = await prisma.subscriptionPlan.count();
    if (plans === 0) {
      for(let { plan, feature } of subPlans){
        await prisma.subscriptionPlan.create({data: {...plan, features: { create: feature }}, })
      }
      console.log( "seeding complete.... subscription plans created successfully");
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

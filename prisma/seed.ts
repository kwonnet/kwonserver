import {
  GameMilestone,
  MilestoneNameEnum,
  PrismaClient,
  RewardReasonEnum,
  RewardTypeEnum,
  SubscriptionPlan,
  UserTypeEnum,
} from "@prisma/client";

const prisma = new PrismaClient();

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
    description: "Brain games that challenge your thinking and reflexes, featuring word puzzles, typing races, and problem-solving challenges."
    // categories: [Hangman, Anagram, Unscramble, Missing Letter, Lucky Number(Guess the Number), Fastest Typing Sprint]
  }
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
const subPlans: Pick<SubscriptionPlan, 'name' | 'accountType' | 'discount' | 'price' | 'tier'>[] = [
  {
    name: "Basic",
    price: 3.99,
    discount: 0.10,
    accountType: UserTypeEnum.INDIVIDUAL,
    tier: []
  },
  {
    name: "Premium",
    price: 7.99,
    discount: 0.11,
    accountType: UserTypeEnum.INDIVIDUAL,
    tier: []
  },
  {
    name: "Supreme",
    price: 18.99,
    discount: 0.12,
    accountType: UserTypeEnum.INDIVIDUAL,
    tier: []
  },
  {
    name: "Basic",
    price: 53.99,
    discount: 0.11,
    accountType: UserTypeEnum.ORGANIZATION,
    tier: [
      { id: "83902837hjdl",  name: "Small", price: 53.99, message: "1 - 20 Employees" },
      { id: "37290w03julo",  name: "Medium", price: 87.99, message: " More than 20 Employees" },
      { id: "7389wjsoo0p0w", name: "Large", price: 121.99, message: " More than 100 Employees" }
    ],
  },
  {
    name: "Pro",
    price: 230.99,
    discount: 0.12,
    accountType: UserTypeEnum.ORGANIZATION,
    tier: [
      { id: "729shujslos",  name: "Small", price: 230.99, message: "1 - 20 Employees" },
      { id: "6372929hywi",  name: "Medium", price: 321.99, message: " More than 20 Employees" },
      { id: "36282930lsop", name: "Large", price: 749.99, message: " More than 100 Employees" }
    ],
  },
  {
    name: "Basic",
    price: 25.99,
    discount: 0.11,
    accountType: UserTypeEnum.GOVERNMENT,
    tier: []
  },
  {
    name: "Pro",
    price: 65.99,
    discount: 0.12,
    accountType: UserTypeEnum.GOVERNMENT,
    tier: []
  }  
]

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
      await prisma.subscriptionPlan.createMany({ data: subPlans });
      console.log("seeding complete.... subscription plans created successfully");
    } else {
      console.log("Seeding complete.... subscription plans  already exists");
    }
  } catch (error: any) {
    console.log("Error creating users", error.message);
  }
}

main()
  .catch((error: any) => {
    console.log("Error seeding data", error?.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { axiosXAI, deepSeekAi, openai } from "@/config";
import { v4 as uuid4 } from "uuid";
import {
  GameCatType,
  GameType,
  TempGameRoom,
  ThemedGameQuestion,
  WordGameType,
} from "@/types";
import { getGameCatType } from "@/services/helper";
import wordlist from "wordlist-english"; // ES Modules

// import { generate, count } from "random-words";

import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import logger from "@/logger";


const TriviaQuestionSchema = z.object({
  question: z.string(),
  answer: z.string(),
  options: z.array(z.string()),
});

export type GeneratedTriviaQuestion = z.infer<typeof TriviaQuestionSchema>;





/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns The shuffled array.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffledArray = [...array]; // Create a copy to avoid mutating the original array
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // Generate a random index from 0 to i
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]]; // Swap elements
  }
  return shuffledArray;
}

export function shuffleLetters(word: string) {
  const letters = word.split("");
  for (let i = letters.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[randomIndex]] = [letters[randomIndex], letters[i]]; // Swap letters
  }
  return letters.join("");
}
// Array of question prompts (not associated with any theme)
const questionPrompts = [
  "Create a random trivia question",
  "Come up with a trivia question for a quiz",
  "Generate a random question on any topic",
  "Provide a random trivia question",
  "Formulate a quiz question",
  "Ask a random trivia question",
  "Produce a random trivia question for a quiz",
  "Make a trivia question about a specific subject",
  "Craft a random quiz question.",
  "Provide a random question for a trivia challenge ",
  "Invent a random question to quiz ",
  "Generate a trivia question on any subject",
  "Formulate a random quiz question on any topic",
  "Create a random quiz question that tests knowledge",
  "Give me a random trivia-based quiz question",
  "Produce a random quiz question to challenge users",
  "Create a general trivia question for a quiz",
  "Ask a random question on any subject for trivia",
  "Generate a question that tests knowledge of any field",
  "Craft a question for a trivia game",
];

// Array of themes
const themes = [
  "Science",
  "History",
  "Geography",
  "Arts and Literature",
  "Pop Culture",
  "Sports",
  "Technology",
  "Mathematics",
  "Languages and Linguistics",
  "Health and Medicine",
  "Mythology and Folklore",
  "Food and Cooking",
  "Business and Economics",
  "Philosophy and Ethics",
  "Travel and Adventure",
];

// Function to randomly return a trivia prompt from available themes
function getRandomPrompt(room?: TempGameRoom): string {
  // Randomly select a question prompt and a theme
  const randomQuestionPrompt =
    questionPrompts[Math.floor(Math.random() * questionPrompts.length)];
  const randomTheme = themes[Math.floor(Math.random() * themes.length)];

  const themeTopic = room?.topics ? room.topics : randomTheme;

  // Compose and return the full, more natural prompt
  const question = `${randomQuestionPrompt} on any of ${themeTopic}`;

  
  // Compose and return the full prompt
  return `
    ${question}

    Format the response as a JSON object with the following structure:
    {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "answer": "string"
    }

    Ensure that:
    1. "question" is a single question as a string.
    2. "options" is an array with 3-5 unique answer choices.
    3. "answer" is the correct answer from the options array.
    Return only the JSON object. Do not add any extra text.
  `;


}
const generateID = (count: number = 10): string => {
  return uuid4()?.replace("-", "").slice(0, count);
};
const convertToJSON = (str: string) => {
  const jsonString = str.replace(/^```json\n|```$/g, "");
  const jsonObject = JSON.parse(jsonString);
  return {
    ...jsonObject,
    id: generateID(),
    type: GameType.TRIVIA,
  } as ThemedGameQuestion;
};

export const generateXAiQuestion = async (room?: TempGameRoom) => {
  const content = getRandomPrompt(room);
  try {
    const result = await axiosXAI.post("/chat/completions", {
      messages: [
        {
          role: "user",
          content,
        },
      ],
      model: "grok-beta",
      stream: false,
      // "temperature": 2,
      seed: Math.floor(Math.random() * 100000000),
      top_p: 0.9,
    });
    const question = convertToJSON(result?.data?.choices[0]?.message?.content);
    return question;
  } catch (error: any) {
    logger.error(error?.message);
  }
};


export const generateOpenAiQuestion =
  async (prompt: string): Promise<GeneratedTriviaQuestion> => {

    try {
      const result = await openai.responses.parse({
        model: "gpt-6-astra",
        input: prompt,
        text: {
          format: zodTextFormat(
            TriviaQuestionSchema,
            "question_schema",
          ),
        },
      });

      if (!result.output_parsed) {
        throw new Error("No question returned from OpenAI");
      }
      return result.output_parsed;
    } catch (error) {
      logger.error("Failed to generate OpenAI question:", error);
      throw error;
    }
  };


export const generateDeepSeekAiQuestion = async (room?: TempGameRoom) => {
  try {
    const result = await deepSeekAi.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Generate a random question on any topic and return the response in json format with question, answer and options as an array",
            },
          ],
        },
      ],
      model: "deepseek-chat",
      stream: false,
      // response_format: {
      //   // See /docs/guides/structured-outputs
      //   type: "json_schema",
      //   json_schema: {
      //     name: "question_schema",
      //     schema: {
      //       type: "object",
      //       properties: {
      //         question: {
      //           description: "The question generated",
      //           type: "string",
      //         },
      //         answer: {
      //           description: "The answer to the question generated",
      //           type: "string",
      //         },
      //         options: {
      //           description: "The question options generated",
      //           type: "array",
      //         },
      //       },
      //       additionalProperties: false,
      //     },
      //   },
      // },
    });
    logger.info("DeepSeek AI question generated:", result);
    if (!result) throw new Error("No response from openai server");
    // const question = convertToJSON(result?.data?.choices[0]?.message?.content)
    return result;
  } catch (error) {
    logger.error("Failed to generate DeepSeek AI question:", error);
  }
};



export const generateSportsQuestion = async (room: TempGameRoom) => {
  const footballTriviaQuestions = [
    {
      question: "Which country won the first FIFA World Cup in 1930?",
      answer: "Uruguay",
      id: "q1",
      options: ["Uruguay", "Brazil", "Argentina", "Italy"],
    },
    {
      question:
        "Who holds the record for the most goals in a single World Cup tournament?",
      answer: "Just Fontaine",
      id: "q2",
      options: ["Just Fontaine", "Pele", "Ronaldo", "Miroslav Klose"],
    },
    {
      question: "Which club has won the most UEFA Champions League titles?",
      answer: "Real Madrid",
      id: "q3",
      options: ["Real Madrid", "AC Milan", "Barcelona", "Liverpool"],
    },
    {
      question: "Who scored the 'Hand of God' goal in the 1986 World Cup?",
      answer: "Diego Maradona",
      id: "q4",
      options: [
        "Diego Maradona",
        "Lionel Messi",
        "Zinedine Zidane",
        "Cristiano Ronaldo",
      ],
    },
    {
      question:
        "Which team won the English Premier League title in the 2015-16 season?",
      answer: "Leicester City",
      id: "q5",
      options: ["Leicester City", "Chelsea", "Manchester City", "Arsenal"],
    },
  ];

  const randomIndex = Math.floor(
    Math.random() * footballTriviaQuestions.length
  );
  return { ...footballTriviaQuestions[randomIndex], type: GameType.SPORTS };

  // const content = getRandomPrompt();
  // try {
  //   const result = await axiosXAI.post("/chat/completions", {
  //     messages: [
  //       {
  //         role: "user",
  //         content,
  //       },
  //     ],
  //     model: "grok-beta",
  //     stream: false,
  //     // "temperature": 2,
  //     seed: Math.floor(Math.random() * 100000000),
  //     top_p: 0.9,
  //   });
  //   const question = convertToJSON(result?.data?.choices[0]?.message?.content);
  //   return question;
  // } catch (error: any) {
  //   console.log(error?.message);
  // }
};

export const generateCountryQuestion = async (room: TempGameRoom) => {
  const nigerianTriviaQuestions = [
    {
      question: "What is the capital city of Nigeria?",
      answer: "Abuja",
      id: "q1",
      options: ["Lagos", "Abuja", "Kano", "Port Harcourt"],
    },
    {
      question: "Which river is the longest in Nigeria?",
      answer: "River Niger",
      id: "q2",
      options: ["River Benue", "River Niger", "River Kaduna", "River Cross"],
    },
    {
      question: "Who was the first president of Nigeria?",
      answer: "Nnamdi Azikiwe",
      id: "q3",
      options: [
        "Obafemi Awolowo",
        "Nnamdi Azikiwe",
        "Ahmadu Bello",
        "Yakubu Gowon",
      ],
    },
    {
      question: "Which Nigerian city is known as the 'Centre of Excellence'?",
      answer: "Lagos",
      id: "q4",
      options: ["Abuja", "Ibadan", "Lagos", "Kano"],
    },
    {
      question: "In what year did Nigeria gain independence?",
      answer: "1960",
      id: "q5",
      options: ["1957", "1960", "1963", "1970"],
    },
    {
      question: "What is the official language of Nigeria?",
      answer: "English",
      id: "q6",
      options: ["Hausa", "Yoruba", "Igbo", "English"],
    },
    {
      question: "Which state is known as the 'Land of Promise'?",
      answer: "Akwa Ibom",
      id: "q7",
      options: ["Rivers", "Akwa Ibom", "Cross River", "Bayelsa"],
    },
    {
      question: "Which tribe in Nigeria is the largest by population?",
      answer: "Hausa-Fulani",
      id: "q8",
      options: ["Igbo", "Hausa-Fulani", "Yoruba", "Ijaw"],
    },
    {
      question: "What is the currency of Nigeria?",
      answer: "Naira",
      id: "q9",
      options: ["Dollar", "Cedi", "Naira", "Pound"],
    },
    {
      question: "Which Nigerian state is nicknamed the 'Coal City State'?",
      answer: "Enugu",
      id: "q10",
      options: ["Ebonyi", "Anambra", "Enugu", "Imo"],
    },
  ];

  const randomIndex = Math.floor(
    Math.random() * nigerianTriviaQuestions.length
  );
  return { ...nigerianTriviaQuestions[randomIndex], type: GameType.COUNTRY };

  // const content = getRandomPrompt();
  // try {
  //   const result = await axiosXAI.post("/chat/completions", {
  //     messages: [
  //       {
  //         role: "user",
  //         content,
  //       },
  //     ],
  //     model: "grok-beta",
  //     stream: false,
  //     // "temperature": 2,
  //     seed: Math.floor(Math.random() * 100000000),
  //     top_p: 0.9,
  //   });
  //   const question = convertToJSON(result?.data?.choices[0]?.message?.content);
  //   return question;
  // } catch (error: any) {
  //   console.log(error?.message);
  // }
};

export const generateAcademiaQuestion = async (room: TempGameRoom) => {
  const scienceTriviaQuestions = [
    {
      question: "What is the chemical symbol for water?",
      answer: "H2O",
      id: "q1",
      options: ["H2O", "O2", "CO2", "H2"],
    },
    {
      question: "Which planet is known as the Red Planet?",
      answer: "Mars",
      id: "q2",
      options: ["Earth", "Mars", "Venus", "Jupiter"],
    },
    {
      question: "What is the powerhouse of the cell?",
      answer: "Mitochondria",
      id: "q3",
      options: ["Nucleus", "Mitochondria", "Ribosome", "Chloroplast"],
    },
    {
      question: "What force keeps us grounded on Earth?",
      answer: "Gravity",
      id: "q4",
      options: ["Magnetism", "Friction", "Gravity", "Electromagnetic Force"],
    },
    {
      question: "What is the chemical formula for table salt?",
      answer: "NaCl",
      id: "q5",
      options: ["NaCl", "KCl", "HCl", "CaCl2"],
    },
    {
      question: "What gas do plants absorb during photosynthesis?",
      answer: "Carbon dioxide",
      id: "q6",
      options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
    },
    {
      question: "What is the speed of light in a vacuum?",
      answer: "299,792,458 m/s",
      id: "q7",
      options: [
        "299,792,458 m/s",
        "150,000,000 m/s",
        "30,000,000 m/s",
        "3,000,000 m/s",
      ],
    },
    {
      question: "What is the most abundant gas in Earth's atmosphere?",
      answer: "Nitrogen",
      id: "q8",
      options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Argon"],
    },
    {
      question: "What is the unit of electric current?",
      answer: "Ampere",
      id: "q9",
      options: ["Volt", "Watt", "Ohm", "Ampere"],
    },
    {
      question: "What is the smallest unit of matter?",
      answer: "Atom",
      id: "q10",
      options: ["Molecule", "Atom", "Proton", "Electron"],
    },
  ];

  const randomIndex = Math.floor(Math.random() * scienceTriviaQuestions.length);
  return { ...scienceTriviaQuestions[randomIndex], type: GameType.ACADEMIA };

  // const content = getRandomPrompt();
  // try {
  //   const result = await axiosXAI.post("/chat/completions", {
  //     messages: [
  //       {
  //         role: "user",
  //         content,
  //       },
  //     ],
  //     model: "grok-beta",
  //     stream: false,
  //     // "temperature": 2,
  //     seed: Math.floor(Math.random() * 100000000),
  //     top_p: 0.9,
  //   });
  //   const question = convertToJSON(result?.data?.choices[0]?.message?.content);
  //   return question;
  // } catch (error: any) {
  //   console.log(error?.message);
  // }
};


function shuffleAlphabet() {
  const alphabet =
    "ABCDEAFSGHAIJKAWLMABNOPQRSGTUVCWOXYZYXOWVUPTSRQPONMLKJIHGFEDCBA";
  const letters = alphabet.split("");
  // Fisher-Yates Shuffle
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join("");
}

export function generateRandomAcronyms(count = 3) {
  const alphabet = shuffleAlphabet();
  return Array.from(
    { length: count },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join(".");
}

export async function generateTriviaQuestion(room: TempGameRoom): Promise<ThemedGameQuestion> {
  try {
    console.log("Generating trivia question for room:", room);
    const prompt = getRandomPrompt(room);
    console.log("Generated prompt:", prompt);
    const result = await generateOpenAiQuestion(prompt);
    console.log("Generated trivia question:", result);
    return {...result, id: generateID(), type: GameType.TRIVIA};
  } catch (error) {
    logger.error("Failed to generate trivia question:", error);
    throw error;
  }

}

export function generateAcronymQuestion() {
  const count = shuffleArray([4, 3, 4, 3, 4, 4, 3])[0];
  const obj: ThemedGameQuestion = {
    question: generateRandomAcronyms(count),
    answer: "",
    id: generateID(),
    options: [],
    type: GameType.ACRONYM,
  };
  return obj;
}

export function generateTypingManiaQuestion() {
  const subjects = [
    "A cat",
    "The dog",
    "My friend",
    "An artist",
    "The bird",
    "Someone",
  ];
  const verbs = ["jumps", "runs", "paints", "flies", "sings", "writes"];
  const objects = [
    "a book",
    "on the roof",
    "a picture",
    "in the garden",
    "a melody",
    "quickly",
  ];
  // Build a sentence by randomly combining parts
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const object = objects[Math.floor(Math.random() * objects.length)];

  // Create a sentence and add a hint about letters used
  const sentence = `${subject} ${verb} ${object}`;

  const obj: ThemedGameQuestion = {
    question: sentence,
    answer: sentence.toLowerCase(),
    id: generateID(),
    options: [],
    type: GameType.MINDMASH,
  };
  return obj;
}

export function generateHangmanQuestion() {
  const words: string[] = wordlist["english/10"];
  // Filter words with length of 4 or more
  const validWords = shuffleArray(words.filter((word) => word.length >= 4))
  const word = validWords[Math.floor(Math.random() * validWords.length)].toLowerCase();
  const wordArray = word.split("");
  const omittedIndices: number[] = [];
  const answer: string[] = [];
  // Determine maxOmittedLength based on word length
  const wordLength = word.length;
  let maxOmittedLength =
    wordLength <= 5 ? 3 : wordLength <= 8 ? 4 : wordLength <= 12 ? 5 : 7;
  console.log(
    "maxOmittedLength: ",
    maxOmittedLength,
    " wordLength: ",
    wordLength
  );
  // Randomly omit letters
  wordArray.forEach((char, index) => {
    if (omittedIndices.length < maxOmittedLength) {
      if (Math.random() < 0.5) {
        // Randomly decide whether to omit a character
        omittedIndices.push(index);
        answer.push(char);
        wordArray[index] = "-"; // Replace omitted character with '-'
      }
    }
  });
  const correctAnswer = answer.join(",").toLowerCase();
  // generate options
  const optionsCount = shuffleArray([4, 3, 4, 3, 4, 4, 3])[0];
  const options = new Set<string>();
  options.add(correctAnswer);
  let count = 0;
  while (count < optionsCount) {
    const randomOption = Array.from(
      { length: answer.length },
      () => String.fromCharCode(97 + Math.floor(Math.random() * 26)) // Generate random letters
    ).join(",");
    options.add(randomOption.toLowerCase());
    count++;
  }
  const obj = {
    question: wordArray.join(""),
    answer: correctAnswer,
    options: Array.from(options),
    id: generateID(),
    type: GameType.MINDMASH,
  };
  return obj;
}

export function generateAnagramQuestion() {
  const words: string[] = wordlist["english/10"];
  // Filter words with length of 4 or more
  const validWords = shuffleArray(words.filter((word) => word.length >= 4))
  const word = validWords[Math.floor(Math.random() * validWords.length)].toLowerCase();
  // shuffle letters
  const question = shuffleLetters(word);
  // compose question
  const obj: ThemedGameQuestion = {
    question,
    answer: word,
    options: [],
    id: generateID(),
    type: GameType.MINDMASH,
  };
  return obj;
}

export function generateUnscrambleQuestion() {
  const subjects = [
    "A cat",
    "The dog",
    "My friend",
    "An artist",
    "The bird",
    "Someone",
  ];
  const verbs = ["jumps", "runs", "paints", "flies", "sings", "writes"];
  const objects = [
    "a book",
    "on the roof",
    "a picture",
    "in the garden",
    "a melody",
    "quickly",
  ];
  // Build a sentence by randomly combining parts
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const object = objects[Math.floor(Math.random() * objects.length)];

  // Create a sentence and add a hint about letters used
  const sentence = `${subject} ${verb} ${object}`;

  const question = shuffleArray(sentence.split(" ")).join(" ");

  const obj: ThemedGameQuestion = {
    question,
    answer: sentence.toLowerCase(),
    id: generateID(),
    options: [],
    type: GameType.MINDMASH,
  };
  return obj;
}

function generateWordSmith(setCount = 3, lettersPerSet = 7) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const vowels = "AEIOU";
  const sets = [];

  for (let i = 0; i < setCount; i++) {
    const letters = [];
    // Ensure at least one vowel in each set
    const vowel = vowels[Math.floor(Math.random() * vowels.length)];
    letters.push(vowel);

    // Generate the remaining letters randomly
    for (let j = 1; j < lettersPerSet; j++) {
      const randomIndex = Math.floor(Math.random() * alphabet.length);
      letters.push(alphabet[randomIndex]);
    }

    // Shuffle the letters to make them random
    for (let k = letters.length - 1; k > 0; k--) {
      const randomIndex = Math.floor(Math.random() * (k + 1));
      [letters[k], letters[randomIndex]] = [letters[randomIndex], letters[k]];
    }

    sets.push(letters.join(", "));
  }

  const obj: ThemedGameQuestion = {
    question: shuffleArray(sets)[1].toString(),
    answer: "",
    id: generateID(),
    options: [],
    type: GameType.MINDMASH,
  };
  return obj;
}

function generateWordMaker() {
  const words: string[] = wordlist["english"];
  // Filter words with length of 4 or more
  const validWords = words.filter((word) => word.length >= 4);
  // Select a random word from the valid words array
  const randomIndex = Math.floor(Math.random() * validWords.length);
  const word = validWords[randomIndex];
  const obj: ThemedGameQuestion = {
    question: word,
    answer: "",
    id: generateID(),
    options: [],
    type: GameType.MINDMASH,
  };
  return obj;
}

function generateWordMakerQuestion() {
  const wordTypes = shuffleArray([
    WordGameType.LETTER,
    WordGameType.WORD,
    WordGameType.LETTER,
    WordGameType.WORD,
    WordGameType.WORD,
  ]);
  const randomIndex = Math.floor(Math.random() * wordTypes.length);
  const wordType = wordTypes[randomIndex];
  const lettersPerSet = shuffleArray([9, 5, 7, 8, 5, 6, 7, 8, 9])[0];
  return wordType === WordGameType.LETTER
    ? generateWordSmith(2, lettersPerSet)
    : generateWordMaker();
}

function generateLuckyWhizQuestion() {
  const words: string[] = wordlist["english"];
  const wordTypes = shuffleArray([
    WordGameType.NUMBER,
    WordGameType.WORD,
    WordGameType.NUMBER,
    WordGameType.WORD,
    WordGameType.NUMBER,
    WordGameType.WORD,
  ]);
  // word type
  const randomIndex = Math.floor(Math.random() * wordTypes.length);
  const wordType = wordTypes[randomIndex];
  if (wordType === WordGameType.NUMBER) {
    // number guess
    const randNumber1 = Math.floor(Math.random() * 5_00_000);
    const randNumber2 = randNumber1 + 1;
    const answer = shuffleArray([
      randNumber1,
      randNumber2,
      randNumber1,
      randNumber2,
    ])[0].toString();
    // return
    const obj: ThemedGameQuestion = {
      question: `Guess the chosen number between ${randNumber1} & ${randNumber2}`,
      answer,
      id: generateID(),
      options: [`${randNumber1}`, `${randNumber2}`],
      type: GameType.MINDMASH,
    };
    return obj;
  }
  // word guess
  // Filter words with length of 3 or more
  const validWords = words.filter((word) => word.length >= 3);
  // Select a random word from the valid words array
  const word1 = validWords[Math.floor(Math.random() * validWords.length)];
  const word2 = validWords[Math.floor(Math.random() * validWords.length - 1)];
  const answer = shuffleArray([word1, word2, word1, word2])[0].toString();
  // return
  const obj: ThemedGameQuestion = {
    question: `Guess the chosen word between ${word1} & ${word2}`,
    answer,
    id: generateID(),
    options: [word1, word2],
    type: GameType.MINDMASH,
  };
  return obj;
}

function generateLuckySpinQuestion() {
  const range = Array.from({ length: 11 }, (_, i) => i + 10); // [10, 11, 12, ..., 20]
  const randNumbers: string[] = [];

  while (randNumbers.length < 5) {
    const randomIndex = Math.floor(Math.random() * range.length);
    const randomNumber = range.splice(randomIndex, 1)[0]; // Remove and get the number
    randNumbers.push(randomNumber.toString());
  }
  // return
  const obj: ThemedGameQuestion = {
    question: `Spin the wheel to win some points!`,
    answer: "",
    id: generateID(),
    options: [...randNumbers, "0", "1", "2"],
    type: GameType.MINDMASH,
  };
  return obj;
}

function generateLuckyFlipQuestion() {
  const range = Array.from({ length: 11 }, (_, i) => i + 10); // [10, 11, 12, ..., 20]
  const randNumbers: string[] = [];

  while (randNumbers.length < 3) {
    const randomIndex = Math.floor(Math.random() * range.length);
    const randomNumber = range.splice(randomIndex, 1)[0]; // Remove and get the number
    randNumbers.push(randomNumber.toString());
  }
  // return
  const obj: ThemedGameQuestion = {
    question: `Flip the card to win some points!`,
    answer: "",
    id: generateID(),
    options: [...randNumbers, "0", "1", "2"],
    type: GameType.MINDMASH,
  };
  return obj;
}

export const generateRoomQuestion = async (room: TempGameRoom) => {
  try {
    const name = room.gameName.toLowerCase();
    const topics = room?.topics ? room.topics : `${room.catName} current affairs`;
    const quizzes = ["trivia", "acronym", "academia", "sports", "country"];
    const isQuiz = quizzes.some((item) =>
      topics.toLowerCase().includes(item.toLowerCase())
    );

    // if (name.includes("trivia")) {
    //   return await generateTriviaQuestion(room);
    // } else if (name.includes("acronym")) {
    //   return generateAcronymQuestion();
    // } else if (name.includes("academia")) {
    //   return await generateAcademiaQuestion(room);
    // } else if (name.includes("sports")) {
    //   return await generateSportsQuestion(room);
    // } else if (name.includes("country")) {
    //   return await generateCountryQuestion(room);

    if(isQuiz){
      return await generateTriviaQuestion({...room, topics});
    }
    else if (name.includes("mindmash")) {
      const catType = getGameCatType(room.catName);
      if (catType === GameCatType.TYPEMANIA) {
        return generateTypingManiaQuestion();
      }
      if (catType === GameCatType.HANGMAN) {
        return generateHangmanQuestion();
      }
      if (catType === GameCatType.ANAGRAM) {
        return generateAnagramQuestion();
      }
      if (catType === GameCatType.UNSCRAMBLE) {
        return generateUnscrambleQuestion();
      }
      if (catType === GameCatType.WORDMAKER) {
        return generateWordMakerQuestion();
      }
      if (catType === GameCatType.LUCKYWHIZ) {
        return generateLuckyWhizQuestion();
      }
      if (catType === GameCatType.LUCKYSPIN) {
        return generateLuckySpinQuestion();
      }
      if (catType === GameCatType.LUCKYFLIP) {
        return generateLuckyFlipQuestion();
      }
    } else {
      return;
    }
  } catch (error) {}
};

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoomQuestion = exports.generateDeepSeekAiQuestion = exports.generateOpenAiQuestion = exports.generateAcademiaQuestion = exports.generateCountryQuestion = exports.generateSportsQuestion = exports.generateXAiQuestion = void 0;
exports.shuffleArray = shuffleArray;
exports.shuffleLetters = shuffleLetters;
exports.generateRandomAcronyms = generateRandomAcronyms;
exports.generateAcronymQuestion = generateAcronymQuestion;
exports.generateTypingManiaQuestion = generateTypingManiaQuestion;
exports.generateHangmanQuestion = generateHangmanQuestion;
exports.generateAnagramQuestion = generateAnagramQuestion;
exports.generateUnscrambleQuestion = generateUnscrambleQuestion;
const config_1 = require("@/config");
const uuid_1 = require("uuid");
const _types_1 = require("@/@types");
const helper_1 = require("@/services/helper");
const wordlist_english_1 = __importDefault(require("wordlist-english")); // ES Modules
// import { generate, count } from "random-words";
/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns The shuffled array.
 */
function shuffleArray(array) {
    const shuffledArray = [...array]; // Create a copy to avoid mutating the original array
    for (let i = shuffledArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); // Generate a random index from 0 to i
        [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]]; // Swap elements
    }
    return shuffledArray;
}
function shuffleLetters(word) {
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
function getRandomPrompt() {
    // Randomly select a question prompt and a theme
    const randomQuestionPrompt = questionPrompts[Math.floor(Math.random() * questionPrompts.length)];
    const randomTheme = themes[Math.floor(Math.random() * themes.length)];
    // Compose and return the full, more natural prompt
    const question = `${randomQuestionPrompt} on ${randomTheme}`;
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
const generateID = (count = 10) => {
    var _a;
    return (_a = (0, uuid_1.v4)()) === null || _a === void 0 ? void 0 : _a.replace("-", "").slice(0, count);
};
const convertToJSON = (str) => {
    const jsonString = str.replace(/^```json\n|```$/g, "");
    const jsonObject = JSON.parse(jsonString);
    return Object.assign(Object.assign({}, jsonObject), { id: generateID(), type: _types_1.GameType.TRIVIA });
};
const generateXAiQuestion = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const content = getRandomPrompt();
    try {
        const result = yield config_1.axiosXAI.post("/chat/completions", {
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
        const question = convertToJSON((_c = (_b = (_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content);
        return question;
    }
    catch (error) {
        console.log(error === null || error === void 0 ? void 0 : error.message);
    }
});
exports.generateXAiQuestion = generateXAiQuestion;
const generateSportsQuestion = (room) => __awaiter(void 0, void 0, void 0, function* () {
    const footballTriviaQuestions = [
        {
            question: "Which country won the first FIFA World Cup in 1930?",
            answer: "Uruguay",
            id: "q1",
            options: ["Uruguay", "Brazil", "Argentina", "Italy"],
        },
        {
            question: "Who holds the record for the most goals in a single World Cup tournament?",
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
            question: "Which team won the English Premier League title in the 2015-16 season?",
            answer: "Leicester City",
            id: "q5",
            options: ["Leicester City", "Chelsea", "Manchester City", "Arsenal"],
        },
    ];
    const randomIndex = Math.floor(Math.random() * footballTriviaQuestions.length);
    return Object.assign(Object.assign({}, footballTriviaQuestions[randomIndex]), { type: _types_1.GameType.SPORTS });
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
});
exports.generateSportsQuestion = generateSportsQuestion;
const generateCountryQuestion = (room) => __awaiter(void 0, void 0, void 0, function* () {
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
    const randomIndex = Math.floor(Math.random() * nigerianTriviaQuestions.length);
    return Object.assign(Object.assign({}, nigerianTriviaQuestions[randomIndex]), { type: _types_1.GameType.COUNTRY });
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
});
exports.generateCountryQuestion = generateCountryQuestion;
const generateAcademiaQuestion = (room) => __awaiter(void 0, void 0, void 0, function* () {
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
    return Object.assign(Object.assign({}, scienceTriviaQuestions[randomIndex]), { type: _types_1.GameType.ACADEMIA });
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
});
exports.generateAcademiaQuestion = generateAcademiaQuestion;
const generateOpenAiQuestion = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield config_1.openai.chat.completions.create({
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
            model: "gpt-4o-mini",
            stream: false,
            response_format: {
                // See /docs/guides/structured-outputs
                type: "json_schema",
                json_schema: {
                    name: "question_schema",
                    schema: {
                        type: "object",
                        properties: {
                            question: {
                                description: "The question generated",
                                type: "string",
                            },
                            answer: {
                                description: "The answer to the question generated",
                                type: "string",
                            },
                            options: {
                                description: "The question options generated",
                                type: "array",
                            },
                        },
                        additionalProperties: false,
                    },
                },
            },
        });
        if (!result)
            throw new Error("No response from openai server");
        // const question = convertToJSON(result?.data?.choices[0]?.message?.content)
        return result;
    }
    catch (error) { }
});
exports.generateOpenAiQuestion = generateOpenAiQuestion;
const generateDeepSeekAiQuestion = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield config_1.deepSeekAi.chat.completions.create({
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
        if (!result)
            throw new Error("No response from openai server");
        // const question = convertToJSON(result?.data?.choices[0]?.message?.content)
        console.log(result);
        return result;
    }
    catch (error) {
        console.log(error);
    }
});
exports.generateDeepSeekAiQuestion = generateDeepSeekAiQuestion;
// generateDeepSeekAiQuestion()
function shuffleAlphabet() {
    const alphabet = "ABCDEAFSGHAIJKAWLMABNOPQRSGTUVCWOXYZYXOWVUPTSRQPONMLKJIHGFEDCBA";
    const letters = alphabet.split("");
    // Fisher-Yates Shuffle
    for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    return letters.join("");
}
function generateRandomAcronyms(count = 3) {
    const alphabet = shuffleAlphabet();
    return Array.from({ length: count }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(".");
}
function generateAcronymQuestion() {
    const count = shuffleArray([4, 3, 4, 3, 4, 4, 3])[0];
    const obj = {
        question: generateRandomAcronyms(count),
        answer: "",
        id: generateID(),
        options: [],
        type: _types_1.GameType.ACRONYM,
    };
    return obj;
}
function generateTypingManiaQuestion() {
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
    const obj = {
        question: sentence,
        answer: sentence.toLowerCase(),
        id: generateID(),
        options: [],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateHangmanQuestion() {
    const words = wordlist_english_1.default["english/10"];
    // Filter words with length of 4 or more
    const validWords = shuffleArray(words.filter((word) => word.length >= 4));
    const word = validWords[Math.floor(Math.random() * validWords.length)].toLowerCase();
    const wordArray = word.split("");
    const omittedIndices = [];
    const answer = [];
    // Determine maxOmittedLength based on word length
    const wordLength = word.length;
    let maxOmittedLength = wordLength <= 5 ? 3 : wordLength <= 8 ? 4 : wordLength <= 12 ? 5 : 7;
    console.log("maxOmittedLength: ", maxOmittedLength, " wordLength: ", wordLength);
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
    const options = new Set();
    options.add(correctAnswer);
    let count = 0;
    while (count < optionsCount) {
        const randomOption = Array.from({ length: answer.length }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26)) // Generate random letters
        ).join(",");
        options.add(randomOption.toLowerCase());
        count++;
    }
    const obj = {
        question: wordArray.join(""),
        answer: correctAnswer,
        options: Array.from(options),
        id: generateID(),
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateAnagramQuestion() {
    const words = wordlist_english_1.default["english/10"];
    // Filter words with length of 4 or more
    const validWords = shuffleArray(words.filter((word) => word.length >= 4));
    const word = validWords[Math.floor(Math.random() * validWords.length)].toLowerCase();
    // shuffle letters
    const question = shuffleLetters(word);
    // compose question
    const obj = {
        question,
        answer: word,
        options: [],
        id: generateID(),
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateUnscrambleQuestion() {
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
    const obj = {
        question,
        answer: sentence.toLowerCase(),
        id: generateID(),
        options: [],
        type: _types_1.GameType.MINDMASH,
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
    const obj = {
        question: shuffleArray(sets)[1].toString(),
        answer: "",
        id: generateID(),
        options: [],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateWordMaker() {
    const words = wordlist_english_1.default["english"];
    // Filter words with length of 4 or more
    const validWords = words.filter((word) => word.length >= 4);
    // Select a random word from the valid words array
    const randomIndex = Math.floor(Math.random() * validWords.length);
    const word = validWords[randomIndex];
    const obj = {
        question: word,
        answer: "",
        id: generateID(),
        options: [],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateWordMakerQuestion() {
    const wordTypes = shuffleArray([
        _types_1.WordGameType.LETTER,
        _types_1.WordGameType.WORD,
        _types_1.WordGameType.LETTER,
        _types_1.WordGameType.WORD,
        _types_1.WordGameType.WORD,
    ]);
    const randomIndex = Math.floor(Math.random() * wordTypes.length);
    const wordType = wordTypes[randomIndex];
    const lettersPerSet = shuffleArray([9, 5, 7, 8, 5, 6, 7, 8, 9])[0];
    return wordType === _types_1.WordGameType.LETTER
        ? generateWordSmith(2, lettersPerSet)
        : generateWordMaker();
}
function generateLuckyWhizQuestion() {
    const words = wordlist_english_1.default["english"];
    const wordTypes = shuffleArray([
        _types_1.WordGameType.NUMBER,
        _types_1.WordGameType.WORD,
        _types_1.WordGameType.NUMBER,
        _types_1.WordGameType.WORD,
        _types_1.WordGameType.NUMBER,
        _types_1.WordGameType.WORD,
    ]);
    // word type
    const randomIndex = Math.floor(Math.random() * wordTypes.length);
    const wordType = wordTypes[randomIndex];
    if (wordType === _types_1.WordGameType.NUMBER) {
        // number guess
        const randNumber1 = Math.floor(Math.random() * 500000);
        const randNumber2 = randNumber1 + 1;
        const answer = shuffleArray([
            randNumber1,
            randNumber2,
            randNumber1,
            randNumber2,
        ])[0].toString();
        // return
        const obj = {
            question: `Guess the chosen number between ${randNumber1} & ${randNumber2}`,
            answer,
            id: generateID(),
            options: [`${randNumber1}`, `${randNumber2}`],
            type: _types_1.GameType.MINDMASH,
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
    const obj = {
        question: `Guess the chosen word between ${word1} & ${word2}`,
        answer,
        id: generateID(),
        options: [word1, word2],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateLuckySpinQuestion() {
    const range = Array.from({ length: 11 }, (_, i) => i + 10); // [10, 11, 12, ..., 20]
    const randNumbers = [];
    while (randNumbers.length < 5) {
        const randomIndex = Math.floor(Math.random() * range.length);
        const randomNumber = range.splice(randomIndex, 1)[0]; // Remove and get the number
        randNumbers.push(randomNumber.toString());
    }
    // return
    const obj = {
        question: `Spin the wheel to win some points!`,
        answer: "",
        id: generateID(),
        options: [...randNumbers, "0", "1", "2"],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
function generateLuckyFlipQuestion() {
    const range = Array.from({ length: 11 }, (_, i) => i + 10); // [10, 11, 12, ..., 20]
    const randNumbers = [];
    while (randNumbers.length < 3) {
        const randomIndex = Math.floor(Math.random() * range.length);
        const randomNumber = range.splice(randomIndex, 1)[0]; // Remove and get the number
        randNumbers.push(randomNumber.toString());
    }
    // return
    const obj = {
        question: `Flip the card to win some points!`,
        answer: "",
        id: generateID(),
        options: [...randNumbers, "0", "1", "2"],
        type: _types_1.GameType.MINDMASH,
    };
    return obj;
}
const generateRoomQuestion = (room) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const name = room.gameName.toLowerCase();
        if (name.includes("trivia")) {
            return yield (0, exports.generateXAiQuestion)();
        }
        else if (name.includes("acronym")) {
            return generateAcronymQuestion();
        }
        else if (name.includes("academia")) {
            return yield (0, exports.generateAcademiaQuestion)(room);
        }
        else if (name.includes("sports")) {
            return yield (0, exports.generateSportsQuestion)(room);
        }
        else if (name.includes("country")) {
            return yield (0, exports.generateCountryQuestion)(room);
        }
        else if (name.includes("mindmash")) {
            const catType = (0, helper_1.getGameCatType)(room.catName);
            if (catType === _types_1.GameCatType.TYPEMANIA) {
                return generateTypingManiaQuestion();
            }
            if (catType === _types_1.GameCatType.HANGMAN) {
                return generateHangmanQuestion();
            }
            if (catType === _types_1.GameCatType.ANAGRAM) {
                return generateAnagramQuestion();
            }
            if (catType === _types_1.GameCatType.UNSCRAMBLE) {
                return generateUnscrambleQuestion();
            }
            if (catType === _types_1.GameCatType.WORDMAKER) {
                return generateWordMakerQuestion();
            }
            if (catType === _types_1.GameCatType.LUCKYWHIZ) {
                return generateLuckyWhizQuestion();
            }
            if (catType === _types_1.GameCatType.LUCKYSPIN) {
                return generateLuckySpinQuestion();
            }
            if (catType === _types_1.GameCatType.LUCKYFLIP) {
                return generateLuckyFlipQuestion();
            }
        }
        else {
            return;
        }
    }
    catch (error) { }
});
exports.generateRoomQuestion = generateRoomQuestion;

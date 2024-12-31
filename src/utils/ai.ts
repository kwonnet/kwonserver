
import { axiosXAI, openai } from "@/config";
import { v4 as uuid4 } from "uuid"
import { ThemedGameQuestion } from "@/types";
// import { nanoid } from "nanoid"
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
    "Craft a question for a trivia game"
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
    "Travel and Adventure"
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

const convertToJSON = (str: string) => {
  const jsonString = str.replace(/^```json\n|```$/g, "");
  const jsonObject = JSON.parse(jsonString);
  const id = uuid4()?.replace("-","").slice(0,10)
  return { ...jsonObject, id } as ThemedGameQuestion
};

export const generateXAiQuestion = async () => {
  const content = getRandomPrompt();
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
  } catch (error) {
    
  }
};

export const generateOpenAiQuestion = async () => {
  try {
    const result = await openai.chat.completions.create({
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
    if (!result) throw new Error("No response from openai server");
    // const question = convertToJSON(result?.data?.choices[0]?.message?.content)
    return result;
  } catch (error) {
  }
};
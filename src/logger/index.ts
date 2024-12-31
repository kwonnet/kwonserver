import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logger = pino({
  ...(!isProduction && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false, // Format logs over multiple lines for readability
        translateTime: true, // Show human-readable time
      },
    },
  }),
});

export default logger;

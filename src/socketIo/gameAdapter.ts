import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import logger from "@/logger";

/** Only games use this adapter; messaging retains its own encrypted relay. */
export async function attachGameAdapter(io: Server) {
  if (!process.env.REDIS_URL)
    throw new Error("REDIS_URL is required for cross-server games");
  const publisher = new IORedis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectionName: "kwonserver:games:publisher",
  });
  const subscriber = publisher.duplicate({
    connectionName: "kwonserver:games:subscriber",
  });
  for (const client of [publisher, subscriber])
    client.on("error", (error) =>
      logger.error(
        { event: "game_adapter_connection_error", error },
        "Game event connection unavailable",
      ),
    );
  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    const namespace = io.of("/games");
    const Adapter = createAdapter(publisher, subscriber, {
      key: "kwonnet:game-events",
      publishOnSpecificResponseChannel: true,
    });
    namespace.adapter = Adapter(namespace);
    const originalClose = namespace.adapter.close.bind(namespace.adapter);
    let adapterClosed = false;
    namespace.adapter.close = () => {
      if (adapterClosed) return;
      adapterClosed = true;
      return originalClose();
    };
    return async () => {
      await namespace.adapter.close();
      await Promise.all([publisher.quit(), subscriber.quit()]);
    };
  } catch (error) {
    logger.error(
      { event: "game_adapter_start_failed", error },
      "Cannot start cross-server games",
    );
    publisher.disconnect();
    subscriber.disconnect();
    throw error;
  }
}

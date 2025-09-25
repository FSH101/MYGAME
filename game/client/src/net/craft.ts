import type { CraftItem } from "../shared/types";
import { getSocket } from "./connection";

export function requestCraft(item: CraftItem): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket) {
      resolve(false);
      return;
    }
    socket.emit("craft", item, (success: boolean) => resolve(Boolean(success)));
  });
}

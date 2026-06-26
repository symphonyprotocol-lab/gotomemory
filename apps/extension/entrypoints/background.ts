import { createBackgroundHandlers } from "../src/handlers.js";
import type { ExtensionMessage } from "../src/messaging.js";

const handleMessage = createBackgroundHandlers();

declare const chrome:
  | {
      runtime?: {
        onMessage?: {
          addListener: (
            callback: (
              message: ExtensionMessage,
              sender: unknown,
              sendResponse: (response: unknown) => void
            ) => boolean
          ) => void;
        };
      };
    }
  | undefined;

chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

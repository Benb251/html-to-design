import { safeParseDesignDocument } from "@web2design/design-schema";
import type { PluginToUiMessage, UiToPluginMessage } from "./messages.js";
import { computeDocumentSummary } from "./summary.js";

export function handleUiMessage(
  msg: unknown,
  postMessage: (message: PluginToUiMessage) => void,
  notify: (text: string, options?: { error?: boolean }) => void,
  closePlugin?: () => void,
): void {
  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    postMessage({
      type: "validation-error",
      error: {
        message: "Malformed message received from plugin UI",
        issues: [
          {
            path: [],
            code: "invalid_message",
            message: "Message is missing a valid 'type' property",
          },
        ],
      },
    });
    return;
  }

  const message = msg as UiToPluginMessage;

  if (message.type === "close-plugin") {
    closePlugin?.();
    return;
  }

  if (message.type === "notify") {
    if (message.error !== undefined) {
      notify(message.message, { error: message.error });
    } else {
      notify(message.message);
    }
    return;
  }

  if (message.type === "validate-document") {
    let payload = message.raw;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (err) {
        postMessage({
          type: "validation-error",
          error: {
            message: "JSON syntax error: Unable to parse document string",
            issues: [
              {
                path: [],
                code: "json_parse_error",
                message: err instanceof Error ? err.message : "Syntax error in JSON string",
              },
            ],
          },
        });
        notify("Invalid JSON syntax", { error: true });
        return;
      }
    }

    const result = safeParseDesignDocument(payload);
    if (!result.success) {
      postMessage({
        type: "validation-error",
        error: {
          message: "Design Schema validation failed",
          issues: result.issues,
        },
      });
      notify("Invalid Web2Design document", { error: true });
      return;
    }

    const summary = computeDocumentSummary(result.data);
    postMessage({
      type: "validation-success",
      summary,
      document: result.data,
    });
    notify("Web2Design document validated");
  }
}

// Runtime entry point inside Figma plugin sandbox
if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 440, height: 620, title: "Web2Design Importer" });

  figma.ui.onmessage = (msg: unknown) => {
    handleUiMessage(
      msg,
      (response) => figma.ui.postMessage(response),
      (text, options) => figma.notify(text, options),
      () => figma.closePlugin(),
    );
  };
}

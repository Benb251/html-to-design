import { safeParseDesignDocument, type DesignDocument } from "@web2design/design-schema";
import { renderDesignDocument, type FigmaRendererHost } from "@web2design/figma-renderer";
import { createFigmaHost } from "./host.js";
import type { PluginToUiMessage, UiToPluginMessage } from "./messages.js";
import { computeDocumentSummary } from "./summary.js";

export interface SessionState {
  currentValidatedDoc: DesignDocument | null;
  isImporting: boolean;
}

const defaultSessionState: SessionState = {
  currentValidatedDoc: null,
  isImporting: false,
};

export async function handleUiMessage(
  msg: unknown,
  postMessage: (message: PluginToUiMessage) => void,
  notify: (text: string, options?: { error?: boolean }) => void,
  closePlugin?: () => void,
  host?: FigmaRendererHost | null,
  state: SessionState = defaultSessionState,
): Promise<void> {
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
        state.currentValidatedDoc = null;
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
      state.currentValidatedDoc = null;
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

    state.currentValidatedDoc = result.data;
    const summary = computeDocumentSummary(result.data);
    postMessage({
      type: "validation-success",
      summary,
      document: result.data,
    });
    notify("Web2Design document validated");
    return;
  }

  if (message.type === "import-document") {
    if (state.isImporting) {
      notify("Import already in progress");
      return;
    }

    if (!state.currentValidatedDoc) {
      postMessage({
        type: "import-error",
        error: {
          message: "No validated Web2Design document available for import",
          issues: [],
        },
      });
      notify("Please validate a document before importing", { error: true });
      return;
    }

    if (!host) {
      postMessage({
        type: "import-error",
        error: {
          message: "Figma renderer host is unavailable",
          issues: [],
        },
      });
      notify("Figma runtime host unavailable", { error: true });
      return;
    }

    state.isImporting = true;
    postMessage({ type: "import-started" });

    try {
      const renderResult = await renderDesignDocument(state.currentValidatedDoc, host);
      state.isImporting = false;
      postMessage({
        type: "import-success",
        result: renderResult,
      });
      notify(`Web2Design import complete (${renderResult.createdNodeCount} layers created)`);
    } catch (err) {
      state.isImporting = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      postMessage({
        type: "import-error",
        error: {
          message: `Import failed: ${errMsg}`,
          issues: [],
        },
      });
      notify(`Import failed: ${errMsg}`, { error: true });
    }
  }
}

// Runtime entry point inside Figma plugin sandbox
if (typeof figma !== "undefined") {
  figma.showUI(__html__, { width: 440, height: 640, title: "Web2Design Importer" });

  const host = createFigmaHost();
  const sessionState: SessionState = {
    currentValidatedDoc: null,
    isImporting: false,
  };

  figma.ui.onmessage = (msg: unknown) => {
    void handleUiMessage(
      msg,
      (response) => figma.ui.postMessage(response),
      (text, options) => {
        if (options?.error !== undefined) {
          figma.notify(text, { error: options.error });
        } else {
          figma.notify(text);
        }
      },
      () => figma.closePlugin(),
      host,
      sessionState,
    );
  };
}

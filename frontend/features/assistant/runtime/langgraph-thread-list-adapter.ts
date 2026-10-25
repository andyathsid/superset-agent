import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import type { Client } from "@langchain/langgraph-sdk";
import { createAssistantStream } from "assistant-stream";
import type { ThreadModelStore } from "./thread-model-store";

export const createLangGraphThreadListAdapter = (
  client: Client,
  threadModels: ThreadModelStore,
): RemoteThreadListAdapter => ({
  async list() {
    const threads = await client.threads.search({
      limit: 50,
      sortBy: "updated_at",
      sortOrder: "desc",
    });
    console.log("Raw threads:", threads);
    return {
      threads: threads.map((thread) => ({
        status: "regular",
        remoteId: thread.thread_id,
        externalId: thread.thread_id,
        title:
          typeof thread.metadata?.thread_name === "string"
            ? thread.metadata.thread_name
            : undefined,
        lastMessageAt: new Date(thread.updated_at),
      })),
    };
  },

  async initialize(localId) {
    return threadModels.getState().initialize(localId);
  },

  async fetch(threadId) {
    const thread = await client.threads.get(threadId);

    return {
      status: "regular",
      remoteId: thread.thread_id,
      externalId: thread.thread_id,
      title:
        typeof thread.metadata?.thread_name === "string"
          ? thread.metadata.thread_name
          : undefined,
      lastMessageAt: new Date(thread.updated_at),
    };
  },

  async rename(remoteId, newTitle) {
    await client.threads.update(remoteId, {
      metadata: {
        thread_name: newTitle,
      },
    });
  },

  async archive() {
    throw new Error("Thread archiving is not implemented yet.");
  },

  async unarchive() {
    throw new Error("Thread unarchiving is not implemented yet.");
  },

  async delete(remoteId) {
    await client.threads.delete(remoteId);
  },

  async generateTitle(remoteId, messages) {
    return createAssistantStream(async (controller) => {
      // Find the first user message
      const firstUserMessage = messages.find(
        (message) => message.role === "user",
      );

      // Extract text content
      const content = firstUserMessage?.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      // Generate a short title
      const maxLength = 60;

      const title = !content
        ? "New Chat"
        : content.length > maxLength
          ? `${content.slice(0, maxLength).trimEnd()}…`
          : content;

      // Persist title in LangGraph metadata
      await client.threads.update(remoteId, {
        metadata: {
          thread_name: title,
        },
      });

      // Update assistant-ui's thread title
      controller.appendText(title);
    });
  },
});

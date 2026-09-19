import { useContext, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Database,
  Zap,
  MessageSquareMore,
  ArrowRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { DatasetContext } from "@/global/context/DatasetContext";
import {
  askQuestion,
  startChatWithDataset,
  makeDatasetActive,
  clearChatHistory,
} from "@/features/Dashboard/services/chatBot";
import UserDataContext from "@/global/context/UserDataContext";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
}

export default function ChatDatasetPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const datasetCtx = useContext(DatasetContext);
  const activeDataset = datasetCtx?.activeDataset;
  const user = useContext(UserDataContext);

  const isReady = Boolean(activeDataset?.isActive);

  // Clear messages whenever the user selects a different dataset
  useEffect(() => {
    setMessages([]);
    setInputValue("");
    setIsThinking(false);
  }, [activeDataset?.id]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Clear chat state locally and on backend with loading feedback
  const handleClearChat = async () => {
    if (messages.length === 0 || isClearing) return;

    setIsClearing(true);
    try {
      await clearChatHistory();
      setMessages([]);
      setInputValue("");
      setIsThinking(false);
    } catch (error) {
      console.error("Error clearing chat history:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const uploadDataset = async () => {
    if (!activeDataset) {
      alert("Please select a dataset first.");
      return;
    }

    const userUid = user?.user_data?.uid || "";
    if (!userUid) {
      alert("User UID not found. Cannot start chat.");
      return;
    }

    setIsUploading(true);

    try {
      const success = await startChatWithDataset(
        activeDataset.rows ?? [],
        activeDataset.headers ?? [],
        activeDataset.id,
        activeDataset.name,
        activeDataset.isActive ?? false,
        userUid,
      );

      if (success) {
        datasetCtx?.setActiveDataset({ ...activeDataset, isActive: true });
        await makeDatasetActive(activeDataset.id);
      } else {
        alert("Failed to upload dataset. Please try again.");
      }
    } catch (error) {
      console.error("Failed to start chat with dataset:", error);
      alert("Something went wrong while connecting to the dataset.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAskQuestion = async () => {
    const questionText = inputValue.trim();
    if (!questionText || !activeDataset || isThinking) return;

    // 1. Immediately append user question to the chat
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      text: questionText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsThinking(true);

    try {
      const userUid = user?.user_data?.uid || "";
      const datasetId = activeDataset.id;

      // 2. Request backend Qdrant RAG pipeline
      const result = await askQuestion(questionText, userUid, datasetId);

      // 3. Append assistant response
      if (result?.response) {
        const botMessage: Message = {
          id: crypto.randomUUID(),
          sender: "assistant",
          text: result.response,
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        sender: "assistant",
        text: "Sorry, I couldn't process your request. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header & Status Card */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 shadow-xs">
        {/* Left: Dataset Details */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <Database className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-800">
              {activeDataset?.name || "No Dataset Selected"}
            </p>
            <p className="text-[10px] text-slate-400">
              {activeDataset?.rows?.length
                ? `${activeDataset.rows.length.toLocaleString()} rows loaded`
                : "Select a dataset to begin"}
            </p>
          </div>
        </div>

        {/* Right: Status Badge & Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Status Indicator */}
          <div className="text-[11px] font-semibold">
            {isUploading ? (
              <span className="flex items-center gap-1.5 rounded-full border border-orange-200/60 bg-orange-50 px-2.5 py-0.5 text-orange-600">
                <Loader2 className="h-3 w-3 animate-spin text-orange-600" />
                Syncing
              </span>
            ) : isReady ? (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Ready
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                Not Connected
              </span>
            )}
          </div>

          {/* Delete / Clear Messages Button */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={isClearing}
              title="Clear chat history"
              aria-label="Clear chat messages"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-rose-500"
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Connect Button */}
      {!isReady && (
        <button
          onClick={uploadDataset}
          disabled={isUploading || !activeDataset}
          className="group relative flex items-center justify-center gap-2 rounded-2xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 text-xs font-bold transition-all shadow-sm active:scale-[0.99]"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              <span>Indexing Dataset...</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 transition-transform group-hover:scale-110" />
              <span>Connect Dataset for AI Chat</span>
            </>
          )}
        </button>
      )}

      {/* Dynamic Messages Stream */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="m-auto text-center p-6 text-slate-400">
            <MessageSquareMore
              className="h-8 w-8 mx-auto mb-2 text-slate-300"
              strokeWidth={1.5}
            />
            <p className="text-xs font-medium">No messages yet</p>
            <p className="text-[11px] text-slate-400">
              Ask any question to analyze your dataset.
            </p>
          </div>
        ) : (
          messages.map((msg) =>
            msg.sender === "user" ? (
              <div
                key={msg.id}
                className="self-end rounded-2xl bg-slate-900 text-white px-4 py-3 text-xs font-semibold max-w-[85%] shadow-xs leading-relaxed"
              >
                {msg.text}
              </div>
            ) : (
              <div
                key={msg.id}
                className="self-start rounded-2xl border border-slate-200/90 bg-white
                px-3 py-1 text-xs text-slate-800 font-medium leading-relaxed max-w-[90%]
                shadow-xs overflow-x-auto"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0 leading-relaxed">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-4 mb-2 space-y-1">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-4 mb-2 space-y-1">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-bold text-slate-950">
                        {children}
                      </strong>
                    ),
                    table: ({ children }) => (
                      <div className="my-2 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-slate-50 text-slate-700 font-semibold">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-1.5 border-b border-slate-200 text-[11px] uppercase tracking-wider">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-1.5 border-b border-slate-100">
                        {children}
                      </td>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-orange-600 font-semibold">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100 font-mono">
                        {children}
                      </pre>
                    ),
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            ),
          )
        )}

        {/* AI Typing Indicator */}
        {isThinking && (
          <div className="self-start flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="mt-auto flex items-center gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isReady || isThinking}
          placeholder={
            isReady
              ? "Ask about top 3 clients or top 3 segments..."
              : "Connect dataset above to enable chat..."
          }
          className="w-full h-11 pl-3.5 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
        />
        <button
          onClick={handleAskQuestion}
          disabled={!isReady || !inputValue.trim() || isThinking}
          type="button"
          className="h-11 px-4 flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shrink-0 active:scale-95"
        >
          <span>Send</span>
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

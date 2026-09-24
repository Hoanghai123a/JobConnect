import { useState, useCallback, useEffect, useRef } from "react";
import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";

/**
 * Message Search Hook
 * Full-text search trong messages với debouncing
 */

type ChatMessage = {
  id: string;
  room: string;
  user: string;
  content: string;
  is_anonymous: boolean;
  created: string;
  updated: string;
  expand?: {
    user?: {
      id: string;
      username: string;
      full_name: string;
      avatar?: string;
    };
  };
};

type SearchResult = {
  message: ChatMessage;
  matchIndex: number; // Vị trí match trong content
};

const DEBOUNCE_DELAY = 300; // 300ms debounce

/**
 * Hook để search messages trong một room
 */
export function useMessageSearch(params: {
  viewer: UserRecord | null;
  roomId: string;
  isGuest?: boolean;
}) {
  const { viewer, roomId, isGuest = false } = params;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  /**
   * Perform search
   */
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim() || isGuest) {
        setResults([]);
        return;
      }

      setSearching(true);

      try {
        // Search trong PocketBase (case-insensitive)
        const searchTerm = searchQuery.toLowerCase().trim();

        // Sử dụng filter với ~ operator cho case-insensitive search
        const res = await pb.collection("group_chat_messages").getList(1, 50, {
          filter: `room = "${roomId}" && content ~ "${searchTerm}"`,
          sort: "-created",
          expand: "user",
        });

        const items = (res.items as unknown as ChatMessage[]) || [];

        // Map results với match index
        const searchResults: SearchResult[] = items.map((msg) => {
          const matchIndex = msg.content.toLowerCase().indexOf(searchTerm);
          return {
            message: msg,
            matchIndex,
          };
        });

        setResults(searchResults);
      } catch (error) {
        console.error("[MessageSearch] Search error:", error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [viewer, roomId, isGuest],
  );

  /**
   * Debounced search
   */
  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      // Clear previous debounce
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }

      // Debounce search
      debounceRef.current = window.setTimeout(() => {
        void performSearch(searchQuery);
      }, DEBOUNCE_DELAY);
    },
    [performSearch],
  );

  /**
   * Clear search
   */
  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    query,
    results,
    searching,
    search,
    clearSearch,
  };
}

/**
 * Highlight search term trong text
 */
export function highlightSearchTerm(text: string, searchTerm: string): string {
  if (!searchTerm.trim()) return text;

  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

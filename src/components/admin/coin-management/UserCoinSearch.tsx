import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { pb } from "@/lib/pocketbase";
import { escapePb } from "@/lib/pocketbase-utils";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fileUrl } from "@/lib/pocketbase";

interface UserSearchResult {
  id: string;
  full_name: string;
  username: string;
  phone?: string;
  avatar?: string;
}

interface UserCoinSearchProps {
  onSelect: (userId: string) => void;
  selectedUserId?: string | null;
}

export function UserCoinSearch({ onSelect, selectedUserId }: UserCoinSearchProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setUsers([]);
      return;
    }

    loadUsers();
  }, [debouncedSearch]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const q = escapePb(debouncedSearch.trim());
      const filter = `(full_name~"${q}" || username~"${q}" || phone~"${q}")`;

      const results = await pb.collection("users").getList<UserSearchResult>(1, 10, {
        filter,
        sort: "full_name",
      });

      setUsers(results.items);
    } catch (error) {
      console.error("Error searching users:", error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm user theo tên hoặc số điện thoại..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading && <DataLoadingState message="Đang tìm kiếm..." />}

      {!loading && debouncedSearch && users.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-4">
          Không tìm thấy user nào
        </div>
      )}

      {users.length > 0 && (
        <div className="space-y-2">
          {users.map((user) => (
            <Card
              key={user.id}
              className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                selectedUserId === user.id ? "border-primary bg-accent" : ""
              }`}
              onClick={() => onSelect(user.id)}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={fileUrl(user, user.avatar)} />
                  <AvatarFallback>{user.full_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{user.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    @{user.username}
                    {user.phone && ` • ${user.phone}`}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

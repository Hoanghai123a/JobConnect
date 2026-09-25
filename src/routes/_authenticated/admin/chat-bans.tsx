import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldOff, Search, UserX, Users, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/chat-bans")({
  component: ChatBansPage,
});

interface User {
  id: string;
  username: string;
  full_name: string;
  email: string;
  chat_blocked: boolean;
  role: string;
}

interface ChatRoom {
  id: string;
  name: string;
}

interface ChatRoomBan {
  id: string;
  user: string;
  room: string;
  expand?: {
    user?: User;
    room?: ChatRoom;
  };
  created: string;
}

function ChatBansPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [globalBans, setGlobalBans] = useState<User[]>([]);
  const [roomBans, setRoomBans] = useState<ChatRoomBan[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Load danh sách user bị chặn toàn cục
  const loadGlobalBans = async () => {
    try {
      // Load tất cả users và filter ở client side vì field chat_blocked có thể chưa tồn tại
      const allUsers = await pb.collection("users").getFullList<User>({
        sort: "-updated",
      });
      const blockedUsers = allUsers.filter(u => u.chat_blocked === true);
      setGlobalBans(blockedUsers);
    } catch (error) {
      console.error("Failed to load global bans:", error);
      toast.error("Không thể tải danh sách chặn toàn cục");
    }
  };

  // Load danh sách user bị chặn theo phòng
  const loadRoomBans = async () => {
    try {
      const bans = await pb.collection("chat_room_bans").getFullList<ChatRoomBan>({
        expand: "user,room",
        sort: "-created",
      });
      setRoomBans(bans);
    } catch (error) {
      console.error("Failed to load room bans:", error);
      toast.error("Không thể tải danh sách chặn phòng");
    }
  };

  // Load initial data
  useEffect(() => {
    if (!isAdmin) return;

    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadGlobalBans(), loadRoomBans()]);
      setLoading(false);
    };

    void loadData();
  }, [isAdmin]);

  // Tìm kiếm user
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const users = await pb.collection("users").getFullList<User>({
        filter: `username ~ "${searchQuery}" || full_name ~ "${searchQuery}" || email ~ "${searchQuery}"`,
        sort: "full_name",
      });
      setSearchResults(users);
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Không thể tìm kiếm user");
    } finally {
      setSearching(false);
    }
  };

  // Chặn/bỏ chặn toàn cục
  const toggleGlobalBlock = async (targetUser: User) => {
    try {
      await pb.collection("users").update(targetUser.id, {
        chat_blocked: !targetUser.chat_blocked,
      });

      toast.success(
        targetUser.chat_blocked
          ? `Đã bỏ chặn toàn cục ${targetUser.full_name || targetUser.username}`
          : `Đã chặn toàn cục ${targetUser.full_name || targetUser.username}`,
      );

      // Reload data
      await loadGlobalBans();

      // Cập nhật search results nếu có
      if (searchResults.length > 0) {
        setSearchResults((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, chat_blocked: !targetUser.chat_blocked } : u,
          ),
        );
      }
    } catch (error) {
      console.error("Failed to toggle block:", error);
      toast.error("Không thể thay đổi trạng thái chặn");
    }
  };

  // Bỏ chặn khỏi phòng
  const unbanFromRoom = async (ban: ChatRoomBan) => {
    try {
      await pb.collection("chat_room_bans").delete(ban.id);
      toast.success("Đã bỏ chặn user khỏi phòng");
      await loadRoomBans();
    } catch (error) {
      console.error("Failed to unban:", error);
      toast.error("Không thể bỏ chặn");
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Bạn không có quyền truy cập trang này
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-center text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quản lý chặn chat</h1>
        <p className="text-muted-foreground">
          Quản lý người dùng bị chặn toàn cục và theo từng phòng
        </p>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList>
          <TabsTrigger value="global" className="gap-2">
            <ShieldOff className="h-4 w-4" />
            Chặn toàn cục ({globalBans.length})
          </TabsTrigger>
          <TabsTrigger value="rooms" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Chặn theo phòng ({roomBans.length})
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2">
            <Search className="h-4 w-4" />
            Tìm kiếm user
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User bị chặn toàn cục</CardTitle>
              <CardDescription>
                Những user này không thể gửi tin nhắn trong bất kỳ phòng nào
              </CardDescription>
            </CardHeader>
            <CardContent>
              {globalBans.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Không có user nào bị chặn toàn cục
                </p>
              ) : (
                <div className="space-y-3">
                  {globalBans.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <UserX className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium">{u.full_name || u.username}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                        </div>
                        {u.role === "admin" && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleGlobalBlock(u)}
                      >
                        Bỏ chặn toàn cục
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User bị chặn theo phòng</CardTitle>
              <CardDescription>
                Những user này bị chặn khỏi các phòng chat cụ thể
              </CardDescription>
            </CardHeader>
            <CardContent>
              {roomBans.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Không có user nào bị chặn khỏi phòng
                </p>
              ) : (
                <div className="space-y-3">
                  {roomBans.map((ban) => (
                    <div
                      key={ban.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium">
                            {ban.expand?.user?.full_name || ban.expand?.user?.username || "Không rõ"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Phòng: {ban.expand?.room?.name || "Không rõ"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(ban.created).toLocaleString("vi-VN")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void unbanFromRoom(ban)}
                      >
                        Bỏ chặn khỏi phòng
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tìm kiếm user để chặn</CardTitle>
              <CardDescription>
                Tìm user theo tên, email hoặc username
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nhập tên, email hoặc username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSearch();
                  }}
                />
                <Button onClick={() => void handleSearch()} disabled={searching}>
                  <Search className="h-4 w-4 mr-2" />
                  Tìm kiếm
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{u.full_name || u.username}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                        </div>
                        {u.role === "admin" && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                        {u.chat_blocked && (
                          <Badge variant="destructive">Đã chặn</Badge>
                        )}
                      </div>
                      <Button
                        variant={u.chat_blocked ? "outline" : "destructive"}
                        size="sm"
                        onClick={() => void toggleGlobalBlock(u)}
                      >
                        {u.chat_blocked ? "Bỏ chặn toàn cục" : "Chặn toàn cục"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="text-center text-muted-foreground py-8">
                  Không tìm thấy user nào
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <Link to="/chat">
          <Button variant="outline">
            Quay lại chat
          </Button>
        </Link>
      </div>
    </div>
  );
}

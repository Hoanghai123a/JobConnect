import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  BusFront,
  Gamepad2,
  Gem,
  MessageCircleMore,
  MessageSquareWarning,
  Newspaper,
  NotebookPen,
  Sprout,
  Users,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileSection } from "@/components/layout/MobileSection";
import { FeatureTile } from "@/components/dashboard/FeatureTile";

export const Route = createFileRoute("/_authenticated/exchange")({
  component: ExchangeHubPage,
});

function ExchangeHubPage() {
  return (
    <PageContainer title="Trao đổi" subtitle="Kết nối, hỗ trợ và tiện ích" back={false}>
      <MobileSection
        title="Kết nối và hỗ trợ"
        description="Theo dõi thông tin mới và trao đổi với cộng đồng"
      >
        <div className="grid grid-cols-2 gap-3">
          <FeatureTile
            to="/chat"
            label="Trò chuyện"
            description="Các phòng chat của bạn"
            icon={MessageCircleMore}
            variant="accent"
          />
          <FeatureTile
            to="/news"
            label="Tin tuyển dụng"
            description="Cơ hội mới nhất"
            icon={Newspaper}
            variant="accent"
          />
          <FeatureTile
            to="/complaints"
            label="Khiếu nại"
            description="Gửi phản ánh và xem lịch sử"
            icon={MessageSquareWarning}
          />
          <FeatureTile
            to="/guides"
            label="Hướng dẫn"
            description="Cách sử dụng ứng dụng"
            icon={BookOpen}
          />
        </div>
      </MobileSection>
      <MobileSection title="Tiện ích hằng ngày">
        <div className="grid grid-cols-2 gap-3">
          <FeatureTile
            to="/transport"
            label="Tìm nhà xe"
            description="Tra cứu tuyến xe"
            icon={BusFront}
          />
          <FeatureTile
            to="/notebook"
            label="Sổ tay"
            description="Ghi chú công việc"
            icon={NotebookPen}
          />
          <FeatureTile to="/counter" label="Bộ đếm" description="Công cụ nhanh" icon={Users} />
        </div>
      </MobileSection>
      <MobileSection title="Giải trí" description="Thư giãn sau giờ làm">
        <div className="grid grid-cols-3 gap-3">
          <FeatureTile to="/garden" label="Vườn cây" icon={Sprout} size="compact" />
          <FeatureTile to="/gems" label="Xếp kim cương" icon={Gem} size="compact" />
          <FeatureTile to="/minesweeper" label="Dò mìn" icon={Gamepad2} size="compact" />
        </div>
      </MobileSection>
    </PageContainer>
  );
}

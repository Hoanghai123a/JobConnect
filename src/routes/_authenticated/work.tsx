import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, CalendarCheck, ClipboardList, History, Wallet } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileSection } from "@/components/layout/MobileSection";
import { FeatureTile } from "@/components/dashboard/FeatureTile";

export const Route = createFileRoute("/_authenticated/work")({
  component: WorkHubPage,
});

function WorkHubPage() {
  return (
    <PageContainer title="Công việc" subtitle="Theo dõi thời gian làm và thu nhập" back={false}>
      <MobileSection
        title="Chấm công và bảng lương"
        description="Các thông tin cần kiểm tra thường xuyên"
      >
        <div className="grid grid-cols-2 gap-3">
          <FeatureTile
            to="/attendance"
            label="Chấm công"
            description="Ghi nhận giờ làm"
            icon={CalendarCheck}
            variant="accent"
          />
          <FeatureTile
            to="/check-attendance"
            label="Bảng công/lương"
            description="Kiểm tra dữ liệu"
            icon={ClipboardList}
            variant="accent"
          />
        </div>
      </MobileSection>
      <MobileSection title="Thu nhập và lịch sử">
        <div className="grid grid-cols-2 gap-3">
          <FeatureTile
            to="/advances"
            label="Ứng lương"
            description="Gửi và theo dõi yêu cầu"
            icon={Wallet}
          />
          <FeatureTile
            to="/work-history"
            label="Lịch sử đi làm"
            description="Nhà máy, ngày vào/nghỉ"
            icon={History}
          />
        </div>
      </MobileSection>
      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/8 p-4 text-sm leading-5 text-foreground">
        <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          Thông tin chấm công và ứng lương sẽ hiển thị đầy đủ sau khi hồ sơ được admin gắn mã nhân
          viên và nhà máy.
        </p>
      </div>
    </PageContainer>
  );
}

import { pb } from "./pocketbase";

/**
 * Tạo log hành động của staff (admin/người tuyển) để audit trail
 */
export async function createStaffActionLog(params: {
  staff_id: string;
  action_type: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
}) {
  try {
    await pb.collection("staff_action_logs").create({
      staff_id: params.staff_id,
      action_type: params.action_type,
      target_type: params.target_type || "",
      target_id: params.target_id || "",
      details: params.details || {},
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to create staff action log:", error);
    // Không throw error để không ảnh hưởng flow chính
  }
}

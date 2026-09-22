#!/usr/bin/env node
/**
 * Script tạo user test để kiểm tra các tính năng
 */
import PocketBase from "pocketbase";

const pb = new PocketBase("http://127.0.0.1:8090");

async function createTestUser() {
  try {
    console.log("🔐 Đăng nhập admin...");
    await pb.collection("_superusers").authWithPassword("admin@ccc.com", "Hoanghai12!");
    console.log("   ✅ Đăng nhập admin thành công\n");

    console.log("👤 Tạo user test...");
    const testUser = await pb.collection("users").create({
      username: "test",
      email: "test@test.com",
      password: "12345678",
      passwordConfirm: "12345678",
      full_name: "Người dùng Test",
      phone: "0123456789",
      role: "user",
      status: "active",
      approvalStatus: "approved",
      uid: "TEST001"
    });

    console.log("   ✅ Đã tạo user test:");
    console.log("      Username: test");
    console.log("      Password: 12345678");
    console.log("      User ID:", testUser.id);
    console.log("\n✨ Hoàn tất! Bây giờ có thể đăng nhập với username 'test' và password '12345678'");

  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log("   ℹ️  User test đã tồn tại");
      console.log("      Username: test");
      console.log("      Password: 12345678");
    } else {
      console.error("   ❌ Lỗi:", error.message);
      if (error.data) {
        console.error("   📋 Chi tiết:", JSON.stringify(error.data, null, 2));
      }
    }
  }
}

createTestUser();

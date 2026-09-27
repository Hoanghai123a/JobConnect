export interface ShareDataInput {
  referralCode: string;
  userName?: string;
}

export function generateShareContent({ referralCode, userName }: ShareDataInput) {
  const baseUrl = window.location.origin;
  const shareUrl = `${baseUrl}/register?ref=${referralCode}`;

  const title = "Tham gia JobConnect ngay!";
  const text = `${userName ? `${userName} mời bạn` : "Mời bạn"} tham gia JobConnect! Sử dụng mã giới thiệu: ${referralCode}`;

  return {
    title,
    text,
    url: shareUrl,
    fullMessage: `${text}\nĐăng ký tại: ${shareUrl}`,
  };
}

export async function shareContent(data: ShareDataInput): Promise<boolean> {
  const { title, text, url } = generateShareContent(data);

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return true;
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Lỗi khi chia sẻ:", error);
      }
      return false;
    }
  }

  return false;
}

export function getZaloShareUrl(url: string) {
  return `https://sp.zalo.me/share_inline?url=${encodeURIComponent(url)}`;
}

export function getFacebookShareUrl(url: string) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("Không thể copy:", err);
    return false;
  }
}

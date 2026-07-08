import { useEffect } from "react";

import { useAppSettings } from "@/lib/app-settings";

function versionParam(version?: string) {
  const value = version?.trim();
  return value ? `?v=${encodeURIComponent(value)}` : "";
}

function upsertHeadLink(rel: string, href: string) {
  const selector = rel === "icon" ? 'link[rel="icon"]' : `link[rel="${rel}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(selector);

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  if (link.href !== new URL(href, window.location.origin).href) {
    link.href = href;
  }
}

export function BrandHeadLinks() {
  const { data: settings } = useAppSettings();
  const version = versionParam(settings.updated || settings.id);

  useEffect(() => {
    const manifestHref = `/api/public/manifest/webmanifest${version}`;
    const iconHref = settings.logo ? `/api/public/app-icon${version}` : "/icons/app-icon.svg";

    upsertHeadLink("manifest", manifestHref);
    upsertHeadLink("icon", iconHref);
    upsertHeadLink("apple-touch-icon", iconHref);
  }, [settings.logo, version]);

  return null;
}

#!/usr/bin/env python3
"""Script to remove all desktop: Tailwind classes from TSX files."""

import re
import sys
from pathlib import Path

def remove_desktop_classes(content: str) -> str:
    """Remove all desktop: prefixed Tailwind classes from content."""
    # Pattern to match desktop:class-name with word boundaries
    pattern = r'\s+desktop:[a-zA-Z0-9_\-\[\]\.\/\(\)\:]+(?=[\s\"\'])'
    result = re.sub(pattern, '', content)
    return result

def process_file(file_path: Path) -> bool:
    """Process a single file and remove desktop classes."""
    try:
        content = file_path.read_text(encoding='utf-8')
        original_content = content

        # Remove desktop classes
        new_content = remove_desktop_classes(content)

        if new_content != original_content:
            file_path.write_text(new_content, encoding='utf-8')
            # Count removed classes
            removed = len(re.findall(r'desktop:[a-zA-Z0-9_\-\[\]\.\/\(\)\:]+', original_content))
            print(f"✓ {file_path.relative_to(Path.cwd())}: removed {removed} desktop classes")
            return True
        else:
            print(f"  {file_path.relative_to(Path.cwd())}: no changes")
            return False
    except Exception as e:
        print(f"✗ {file_path}: {e}", file=sys.stderr)
        return False

def main():
    """Main function to process all TSX files."""
    files = [
        "src/components/dashboard/ApprovalDashboard.tsx",
        "src/components/dashboard/FinanceDashboard.tsx",
        "src/components/dashboard/OtherDashboard.tsx",
        "src/components/dashboard/WorkProgressBoard.tsx",
        "src/components/imports/BulkWorkerHistoryImportDialog.tsx",
        "src/components/ui/filter-bar.tsx",
        "src/components/ui/popover.tsx",
        "src/components/ui/tabs.tsx",
        "src/routes/about.tsx",
        "src/routes/login.tsx",
        "src/routes/pending.tsx",
        "src/routes/register.tsx",
        "src/routes/_authenticated/account.tsx",
        "src/routes/_authenticated/admin/imports.tsx",
        "src/routes/_authenticated/advances.tsx",
        "src/routes/_authenticated/force-change-password.tsx",
        "src/routes/_authenticated/guides.tsx",
        "src/routes/_authenticated/last-working-day.tsx",
        "src/routes/_authenticated/notebook.tsx",
    ]

    print("Removing desktop: classes from files...\n")

    modified_count = 0
    for file_path_str in files:
        file_path = Path(file_path_str)
        if file_path.exists():
            if process_file(file_path):
                modified_count += 1
        else:
            print(f"✗ {file_path}: file not found", file=sys.stderr)

    print(f"\n✓ Done! Modified {modified_count} files.")

if __name__ == "__main__":
    main()

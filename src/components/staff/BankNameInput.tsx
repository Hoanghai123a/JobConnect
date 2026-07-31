import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { VN_BANKS } from "@/lib/vn-banks";

export function BankNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => {
    const keyword = value.trim().toLocaleLowerCase("vi");
    if (!keyword) return VN_BANKS.slice(0, 8);
    return VN_BANKS.filter(
      (bank) =>
        bank.code.toLocaleLowerCase("vi").includes(keyword) ||
        bank.name.toLocaleLowerCase("vi").includes(keyword),
    ).slice(0, 8);
  }, [value]);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder="Nhập mã hoặc tên ngân hàng"
        autoComplete="off"
        role="combobox"
        aria-expanded={focused && suggestions.length > 0}
      />
      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          {suggestions.map((bank) => (
            <button
              key={bank.code}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(bank.name);
                setFocused(false);
              }}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <span className="shrink-0 font-semibold text-primary">{bank.code}</span>
              <span className="min-w-0 text-muted-foreground">{bank.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

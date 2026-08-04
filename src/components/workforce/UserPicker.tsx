import { useMemo, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizeUserPickerSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function UserPicker({
  label,
  users,
  value,
  onChange,
  placeholder,
  allowClear,
}: {
  label?: string;
  users: UserRecord[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedSearch(query);
  const selected = users.find((u) => u.id === value);

  const filteredUsers = useMemo(() => {
    const keyword = normalizeUserPickerSearch(debouncedQuery);
    if (!keyword) return users;
    return users.filter((u) =>
      normalizeUserPickerSearch(
        `${u.full_name || ""} ${u.username || ""} ${u.phone || ""} ${u.uid || ""} ${u.cccd || ""}`,
      ).includes(keyword),
    );
  }, [debouncedQuery, users]);

  return (
    <div className="space-y-1">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected
                ? `${selected.full_name || selected.username} · ${selected.phone || "—"}`
                : placeholder || "Chọn..."}
            </span>
            <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Tìm kiếm..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {allowClear && value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">Bỏ chọn</span>
                  </CommandItem>
                )}
                {filteredUsers.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.full_name || ""} ${u.username || ""} ${u.phone || ""} ${u.uid || ""} ${u.cccd || ""}`}
                    onSelect={() => {
                      onChange(u.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {u.full_name || u.username || "—"}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {[u.username, u.phone, u.uid, u.cccd].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function FactoryPicker({
  factories,
  value,
  onChange,
}: {
  factories: FactoryRecord[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedSearch(query);
  const selected = factories.find((f) => f.id === value);

  const filteredFactories = useMemo(() => {
    const keyword = normalizeUserPickerSearch(debouncedQuery);
    if (!keyword) return factories;
    return factories.filter((f) =>
      normalizeUserPickerSearch(`${f.name} ${f.code || ""}`).includes(keyword),
    );
  }, [debouncedQuery, factories]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Chọn nhà máy..."}
          </span>
          <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Tìm nhà máy..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Không tìm thấy.</CommandEmpty>
            <CommandGroup>
              {filteredFactories.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`${f.name} ${f.code || ""}`}
                  onSelect={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm">{f.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

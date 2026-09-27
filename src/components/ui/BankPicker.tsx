import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VN_BANKS } from "@/lib/vn-banks";

interface BankPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function BankPicker({ value, onChange }: BankPickerProps) {
  const [open, setOpen] = useState(false);

  const selectedBank = VN_BANKS.find((bank) => bank.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="truncate">{selectedBank ? selectedBank.name : "Chọn ngân hàng"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Tìm ngân hàng..." />
          <CommandList>
            <CommandEmpty>Không tìm thấy ngân hàng.</CommandEmpty>
            <CommandGroup>
              {VN_BANKS.map((bank) => (
                <CommandItem
                  key={bank.code}
                  value={bank.name}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === bank.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{bank.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

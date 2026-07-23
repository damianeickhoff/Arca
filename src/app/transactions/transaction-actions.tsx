"use client";

import { useState } from "react";
import {
  IconArrowsLeftRight as ArrowLeftRight,
  IconChevronDownFilled as ChevronDown,
  IconGitBranch as GitBranch,
  IconPhotoFilled as ImageIcon,
  IconMessageFilled as MessageSquare,
  IconDotsFilled as MoreHorizontal,
  IconPencilFilled as Pencil,
  IconRefresh as RefreshCcw,
  IconTagFilled as Tag,
  IconTagsFilled as Tags,
  IconTrashFilled as Trash2,
  IconWand as Wand2
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { Category } from "@/db/schema";
import { formatEur, currencySymbol } from "@/lib/format";
import { BrandIconPicker } from "@/components/brand-icon-picker";
import { SplitTransactionDialog } from "./split-transaction-dialog";
import { getTransactionSplitTotal, type TransactionSplitRow } from "@/lib/transaction-splits";

interface Props {
  id: number;
  description: string;
  amount: number;
  correctedAmount: number | null;
  isReimbursement: boolean;
  isManualTransfer: boolean;
  isInternalTransfer: boolean;
  categories: Category[];
  currentCategoryId: number | null;
  brandIcon: string | null;
  brandIconColor: string | null;
  brandIconBgColor: string | null;
  splits: TransactionSplitRow[];
  notes: string | null;
  onCategorized?: (previousCategoryId: number | null, newCategoryName: string, newCategoryId: number | null) => void;
}

function FlatCategories({
  categories,
  currentCategoryId,
  onSelect,
}: {
  categories: Category[];
  currentCategoryId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {categories.map((category) => (
        <DropdownMenuItem
          key={category.id}
          onClick={() => onSelect(category.id)}
          className={category.id === currentCategoryId ? "bg-muted" : ""}
        >
          {category.color && (
            <span
              className="inline-block size-2 rounded-full shrink-0"
              style={{ backgroundColor: category.color }}
            />
          )}
          {category.name}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function TransactionActions({ id, description, amount, correctedAmount, isReimbursement, isManualTransfer, isInternalTransfer, categories, currentCategoryId, brandIcon, brandIconColor, brandIconBgColor, splits, notes, onCategorized }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  const [iconOpen, setIconOpen] = useState(false);
  const [iconValue, setIconValue] = useState<string | null>(brandIcon);
  const [iconColorValue, setIconColorValue] = useState<string | null>(brandIconColor);
  const [iconBgColorValue, setIconBgColorValue] = useState<string | null>(brandIconBgColor);
  const [iconSaving, setIconSaving] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    categoryId: String(currentCategoryId ?? ""),
    namePattern: description,
    matchType: "contains" as "contains" | "word" | "exact",
    amount: String(amount),
    direction: "",
  });
  const [ruleSaving, setRuleSaving] = useState(false);

  const [correctOpen, setCorrectOpen] = useState(false);
  const [correctValue, setCorrectValue] = useState("");
  const [correctSaving, setCorrectSaving] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  async function categorize(categoryId: number) {
    const previousCategoryId = currentCategoryId;
    const newCategoryName = categories.find((c) => c.id === categoryId)?.name ?? "Unknown";
    setLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, categoryId }),
    });
    setLoading(false);
    onCategorized?.(previousCategoryId, newCategoryName, categoryId);
    router.refresh();
  }

  async function categorizeAll(categoryId: number) {
    setLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, categoryId }),
    });
    setLoading(false);
    router.refresh();
  }

  async function saveIcon() {
    setIconSaving(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, brandIcon: iconValue, brandIconColor: iconColorValue, brandIconBgColor: iconBgColorValue }),
    });
    setIconSaving(false);
    setIconOpen(false);
    router.refresh();
  }

  async function saveCorrection() {
    setCorrectSaving(true);
    const parsed = parseFloat(correctValue.replace(",", "."));
    const correctedAmount = correctValue.trim() === "" || isNaN(parsed) ? null : parsed;
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, correctedAmount }),
    });
    setCorrectSaving(false);
    setCorrectOpen(false);
    router.refresh();
  }

  async function toggleManualTransfer() {
    setLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isManualTransfer: !isManualTransfer }),
    });
    setLoading(false);
    router.refresh();
  }

  async function toggleReimbursement() {
    setLoading(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isReimbursement: !isReimbursement }),
    });
    setLoading(false);
    router.refresh();
  }

  async function saveNote() {
    setNoteSaving(true);
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, notes: noteValue.trim() || null }),
    });
    setNoteSaving(false);
    setNoteOpen(false);
    router.refresh();
  }

  async function deleteTransaction() {
    if (!confirm("Delete this transaction?")) return;
    setLoading(true);
    await fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLoading(false);
    router.refresh();
  }

  async function saveRule() {
    if (!ruleForm.categoryId) return;
    setRuleSaving(true);
    await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: parseInt(ruleForm.categoryId),
        namePattern: ruleForm.namePattern || null,
        nameWildcard: ruleForm.matchType === "contains",
        nameWholeWord: ruleForm.matchType === "word",
        amount: ruleForm.amount ? parseFloat(ruleForm.amount) : null,
        direction: ruleForm.direction || null,
      }),
    });
    await fetch("/api/apply-rules", { method: "POST" });
    setRuleSaving(false);
    setRuleOpen(false);
    router.refresh();
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="p-1.5 rounded bg-transparent hover:bg-foreground/5 opacity-60 hover:opacity-100"
          disabled={loading}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Tag className="size-3.5 mr-2" />
              Categoriseer deze
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <FlatCategories categories={categories} currentCategoryId={currentCategoryId} onSelect={categorize} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Tags className="size-3.5 mr-2" />
              Toepassen op alle &ldquo;{description.length > 22 ? description.slice(0, 22) + "…" : description}&rdquo;
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <FlatCategories categories={categories} currentCategoryId={currentCategoryId} onSelect={categorizeAll} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => { setIconValue(brandIcon); setIconColorValue(brandIconColor); setIconBgColorValue(brandIconBgColor); setIconOpen(true); }}>
            <ImageIcon className="size-3.5 mr-2" />
            Set brand icon
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => { setCorrectValue(correctedAmount != null ? String(correctedAmount) : ""); setCorrectOpen(true); }}>
            <Pencil className="size-3.5 mr-2" />
            Amount corrigeren
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setSplitOpen(true)}>
            <GitBranch className="size-3.5 mr-2" />
            {splits.length > 0 ? "Adjust split" : "Split transaction"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={toggleReimbursement}>
            <RefreshCcw className="size-3.5 mr-2" />
            {isReimbursement ? "Remove reimbursement mark" : "Mark as reimbursement"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={toggleManualTransfer} disabled={isInternalTransfer && !isManualTransfer}>
            <ArrowLeftRight className="size-3.5 mr-2" />
            {isManualTransfer ? "Remove internal transfer mark" : "Mark as internal transfer"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => { setNoteValue(notes ?? ""); setNoteOpen(true); }}>
            <MessageSquare className="size-3.5 mr-2" />
            {notes ? "Edit note" : "Add note"}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setRuleOpen(true)}>
            <Wand2 className="size-3.5 mr-2" />
            Create automatic rule
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={deleteTransaction} className="text-destructive">
            <Trash2 className="size-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Automatic rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">

            <div className="space-y-1.5">
              <label className="font-medium">Name contains</label>
              <Input
                value={ruleForm.namePattern}
                onChange={(e) => setRuleForm((f) => ({ ...f, namePattern: e.target.value }))}
              />
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(["contains", "word", "exact"] as const).map((opt, i) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setRuleForm((f) => ({ ...f, matchType: opt }))}
                    className={`flex-1 px-2 py-1.5 transition-colors ${
                      ruleForm.matchType === opt
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    } ${i > 0 ? "border-l" : ""}`}
                  >
                    {opt === "contains" ? "Contains" : opt === "word" ? "Whole word" : "Exact"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium">Amount</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={ruleForm.amount}
                onChange={(e) => setRuleForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave empty to ignore the amount.</p>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium">Direction</label>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {([["", "Both"], ["income", "Income"], ["expense", "Expense"]] as const).map(([val, label], i) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRuleForm((f) => ({ ...f, direction: val }))}
                    className={`flex-1 px-2 py-1.5 transition-colors ${
                      ruleForm.direction === val
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    } ${i > 0 ? "border-l" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium">Category</label>
              {(() => {
                const selectedCat = categories.find((c) => String(c.id) === ruleForm.categoryId);
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-full border rounded-md px-3 py-1.5 text-sm bg-background flex items-center justify-between gap-2">
                      <span className={`flex items-center gap-2 min-w-0 ${selectedCat ? "" : "text-muted-foreground"}`}>
                        {selectedCat?.color && (
                          <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: selectedCat.color }} />
                        )}
                        <span className="truncate">{selectedCat ? selectedCat.name : "— Choose category —"}</span>
                      </span>
                      <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-52 max-h-80 overflow-y-auto">
                      {categories.map((cat) => (
                        <DropdownMenuItem
                          key={cat.id}
                          onClick={() => setRuleForm((f) => ({ ...f, categoryId: String(cat.id) }))}
                          className={String(cat.id) === ruleForm.categoryId ? "bg-muted" : ""}
                        >
                          {cat.color && (
                            <span className="inline-block size-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          )}
                          {cat.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
            </div>

            <Button
              onClick={saveRule}
              disabled={ruleSaving || !ruleForm.categoryId}
              className="w-full"
            >
              {ruleSaving ? "Saving..." : "Save and apply rule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={iconOpen} onOpenChange={setIconOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set brand icon</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <BrandIconPicker
              value={iconValue}
              onChange={(key) => { setIconValue(key); setIconColorValue(null); setIconBgColorValue(null); }}
            />
            <Button onClick={saveIcon} disabled={iconSaving} className="w-full">
              {iconSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Correct amount</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-muted px-4 py-3">
              <p className="text-muted-foreground text-xs mb-1">Original amount</p>
              <p className="font-semibold tabular-nums text-red-600">-{formatEur(amount)}</p>
            </div>
            <div className="space-y-1.5">
              <label className="font-medium">Corrected amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currencySymbol()}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={correctValue}
                  onChange={(e) => setCorrectValue(e.target.value)}
                  placeholder={String(amount)}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to remove the correction.</p>
            </div>
            <Button onClick={saveCorrection} disabled={correctSaving} className="w-full">
              {correctSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {splitOpen && (
        <SplitTransactionDialog
          open={splitOpen}
          onOpenChange={setSplitOpen}
          transactionId={id}
          description={description}
          totalAmount={getTransactionSplitTotal(amount, correctedAmount)}
          categories={categories}
          initialSplits={splits}
        />
      )}

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-5 focus:ring-primary/50"
              rows={4}
              placeholder="Add a note…"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Leave empty to remove the note.</p>
            <Button onClick={saveNote} disabled={noteSaving} className="w-full">
              {noteSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

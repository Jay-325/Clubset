import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { staggerStyle } from "@/lib/motion";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClubContext } from "@/lib/hooks/use-club";
import { can } from "@/lib/auth/permissions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/domain";
import type { DuesRow, ProfileRow, TransactionRow } from "@/lib/types/database";
import { toast } from "sonner";

/**
 * PRD 24: bookkeeping a student can run without a spreadsheet.
 *
 * The balance is a SQL view, so recording an expense updates it with no
 * synchronization step (PRD 24/46). Adding an entry is four fields and Save.
 */
export const Route = createFileRoute("/clubs/$clubId/funds")({
  component: FundsPage,
});

function FundsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <FundsContent />
      </AppShell>
    </RequireAuth>
  );
}

function FundsContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/funds" });
  const context = useClubContext(clubId);

  const canManage =
    can(context.data?.permissions ?? [], "manage_finances") ||
    (context.data?.isLinkedAdministrator ?? false) ||
    (context.data?.isAdministrator ?? false);

  const finances = useQuery({
    queryKey: ["club", clubId, "finances"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("club_finances")
        .select("*")
        .eq("club_id", clubId)
        .single();
      if (error) throw error;
      return data as { total_income: number; total_expenses: number; balance: number };
    },
  });

  const transactions = useQuery({
    queryKey: ["club", clubId, "transactions"],
    queryFn: async (): Promise<TransactionRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("club_id", clubId)
        .order("occurred_on", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (finances.isLoading || transactions.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const totals = finances.data;
  const rows = transactions.data ?? [];

  return (
    <>
      <PageHeader
        title="Club funds"
        description={
          canManage
            ? "Add money in or money out. Clubset keeps the balance up to date for you."
            : "A summary of the club's money."
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Balance</p>
            <p className="text-3xl font-semibold">${(totals?.balance ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="size-4" />
              Money in
            </p>
            <p className="text-3xl font-semibold text-emerald-600">
              ${(totals?.total_income ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingDown className="size-4" />
              Money out
            </p>
            <p className="text-3xl font-semibold text-red-600">
              ${(totals?.total_expenses ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canManage ? <TabsTrigger value="add">Add money</TabsTrigger> : null}
          {canManage ? <TabsTrigger value="dues">Dues</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {rows.map((row, index) => (
                    <li
                      key={row.id}
                      className={cn(
                        "flex items-center justify-between gap-3 py-2.5 animate-in fade-in",
                      )}
                      style={staggerStyle(index)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {row.description || row.category}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.category} · {row.occurred_on}
                          {row.receipt_path ? (
                            <span className="ml-2 inline-flex items-center gap-1">
                              <Receipt className="size-3" />
                              receipt
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          row.type === "income" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {row.type === "income" ? "+" : "-"}
                        {Number(row.amount).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canManage ? (
          <TabsContent value="add" className="mt-4">
            <QuickAdd clubId={clubId} />
          </TabsContent>
        ) : null}

        {canManage ? (
          <TabsContent value="dues" className="mt-4">
            <DuesPanel clubId={clubId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}

function QuickAdd({ clubId }: { clubId: string }) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0] ?? "Supplies");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      // add_transaction() re-checks manage_finances and writes the audit entry
      // in the same transaction as the row.
      const { error } = await supabase.rpc("add_transaction", {
        target_club: clubId,
        tx_type: type,
        amount: Number(amount),
        category,
        description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      toast("Transaction added");
      void queryClient.invalidateQueries({ queryKey: ["club", clubId, "finances"] });
      void queryClient.invalidateQueries({ queryKey: ["club", clubId, "transactions"] });
    },
  });

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const valid = Number(amount) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a transaction</CardTitle>
        <CardDescription>
          What was it, how much, and what category. Clubset updates the balance automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              onClick={() => {
                setType("expense");
                setCategory(EXPENSE_CATEGORIES[0] ?? "Supplies");
              }}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              onClick={() => {
                setType("income");
                setCategory(INCOME_CATEGORIES[0] ?? "Other");
              }}
            >
              Income
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">How much?</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="25.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">What was it for?</Label>
            <Input
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Competition entry fee"
            />
          </div>

          <Button type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? (
              <SkeletonSpinner />
            ) : (
              <Plus className="size-4" />
            )}
            Save
          </Button>

          {mutation.error ? (
            <p className="form-message animate-in fade-in text-sm text-destructive duration-150">
              {mutation.error.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

/** PRD 24: dues statuses are Paid / Not Paid / Unknown. */
function DuesPanel({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();

  const dues = useQuery({
    queryKey: ["club", clubId, "dues"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("dues")
        .select("*, profiles(id, full_name, grade)")
        .eq("club_id", clubId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<DuesRow & { profile?: ProfileRow }>;
    },
  });

  const markPaid = useMutation({
    mutationFn: async (duesId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("mark_dues_paid", { target_dues: duesId });
      if (error) throw error;
    },
    // Marking paid also records income, so the balance and the roster can never
    // disagree (PRD 46).
    onSuccess: () => {
      toast("Dues marked paid");
      void queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });

  const rows = dues.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Club dues</CardTitle>
        <CardDescription>
          Marking a payment records the income for you, so the balance stays correct.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dues.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dues have been set up for this club yet.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row, index) => (
              <li
                key={row.id}
                className={cn("flex items-center justify-between gap-3 py-2.5 animate-in fade-in")}
                style={staggerStyle(index)}
              >
                <div>
                  <p className="text-sm font-medium">{row.profile?.full_name ?? "Member"}</p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(row.amount).toFixed(2)}
                    {row.due_date ? ` · due ${row.due_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      row.status === "paid"
                        ? "secondary"
                        : row.status === "not_paid"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {row.status === "paid"
                      ? "Paid"
                      : row.status === "not_paid"
                        ? "Not paid"
                        : "Unknown"}
                  </Badge>
                  {row.status !== "paid" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markPaid.mutate(row.id)}
                      disabled={markPaid.isPending}
                    >
                      {markPaid.isPending ? <SkeletonSpinner /> : null}
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {markPaid.error ? (
          <p className="form-message animate-in fade-in mt-2 text-sm text-destructive duration-150">
            {markPaid.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

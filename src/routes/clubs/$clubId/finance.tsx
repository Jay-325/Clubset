import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Calculator,
  ChevronLeft,
  DollarSign,
  Plus,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { staggerStyle } from "@/lib/motion";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClubContext } from "@/lib/hooks/use-club";
import { can } from "@/lib/auth/permissions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/domain";
import type { DuesRow, ProfileRow, TransactionRow } from "@/lib/types/database";
import { toast } from "sonner";

/**
 * Finance tab: a dashboard of school-club financial planning tools, each
 * opening a spreadsheet-style view backed by existing transactions and dues
 * data. No new database tables; every view reads from `transactions`,
 * `club_finances`, or `dues`.
 */
export const Route = createFileRoute("/clubs/$clubId/finance")({
  component: FinancePage,
});

function FinancePage() {
  return (
    <RequireAuth>
      <AppShell>
        <FinanceContent />
      </AppShell>
    </RequireAuth>
  );
}

/* ---------------------------------------------------------------------- */
/*  Tool definitions                                                       */
/* ---------------------------------------------------------------------- */

type ToolKey = "budget" | "fundraiser" | "expenses" | "dues";

const FINANCE_TOOLS: ReadonlyArray<{
  key: ToolKey;
  title: string;
  description: string;
  icon: typeof Calculator;
}> = [
  {
    key: "budget",
    title: "Budget Overview",
    description: "See where your club's money goes by category",
    icon: Calculator,
  },
  {
    key: "fundraiser",
    title: "Fundraiser Tracker",
    description: "Track fundraising campaigns and income sources",
    icon: Target,
  },
  {
    key: "expenses",
    title: "Expense Ledger",
    description: "Full spreadsheet of all club expenses",
    icon: Receipt,
  },
  {
    key: "dues",
    title: "Dues Tracker",
    description: "Track member dues and payment statuses",
    icon: Users,
  },
];

/* ---------------------------------------------------------------------- */
/*  Main content                                                           */
/* ---------------------------------------------------------------------- */

function FinanceContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/finance" });
  const context = useClubContext(clubId);
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);

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
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (context.isLoading || finances.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const totals = finances.data;
  const allTransactions = transactions.data ?? [];

  return (
    <>
      <PageHeader
        title="Finance"
        description="Your club's financial planning tools — track, plan, and manage money all in one place."
      />

      {/* ---- Summary cards ---- */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <DollarSign className="size-4" />
              Balance
            </p>
            <p className="text-3xl font-semibold">${(totals?.balance ?? 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="size-4" />
              Total income
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
              Total expenses
            </p>
            <p className="text-3xl font-semibold text-red-600">
              ${(totals?.total_expenses ?? 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Tool cards / detail view ---- */}
      {activeTool === null ? (
        <>
          <h2 className="mb-4 text-lg font-semibold">Financial Tools</h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {FINANCE_TOOLS.map((tool, index) => (
              <button
                key={tool.key}
                type="button"
                onClick={() => setActiveTool(tool.key)}
                className={cn(
                  "group flex items-start gap-4 rounded-xl border bg-card p-5 text-left",
                  "transition-all hover:shadow-md hover:border-primary/20 animate-in fade-in",
                )}
                style={staggerStyle(index)}
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <tool.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{tool.title}</p>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Quick recent activity */}
          <RecentActivity transactions={allTransactions.slice(0, 5)} />
        </>
      ) : (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setActiveTool(null)}>
            <ChevronLeft className="size-4" />
            Back to tools
          </Button>

          {activeTool === "budget" && <BudgetOverview transactions={allTransactions} />}
          {activeTool === "fundraiser" && <FundraiserTracker transactions={allTransactions} />}
          {activeTool === "expenses" && (
            <ExpenseLedger clubId={clubId} transactions={allTransactions} canManage={canManage} />
          )}
          {activeTool === "dues" && <DuesTracker clubId={clubId} canManage={canManage} />}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/*  Recent activity (home view)                                            */
/* ---------------------------------------------------------------------- */

function RecentActivity({ transactions }: { transactions: TransactionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Latest transactions at a glance</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {transactions.map((row, index) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2.5 animate-in fade-in"
                style={staggerStyle(index)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.description || row.category}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.category} · {row.occurred_on}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    row.type === "income" ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {row.type === "income" ? "+" : "-"}${Number(row.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/*  Budget Overview                                                        */
/* ---------------------------------------------------------------------- */

function BudgetOverview({ transactions }: { transactions: TransactionRow[] }) {
  const expenses = transactions.filter((tx) => tx.type === "expense");
  const income = transactions.filter((tx) => tx.type === "income");

  const expenseByCategory = groupByCategory(expenses);
  const incomeByCategory = groupByCategory(income);

  const totalExpenses = sumAmounts(expenses);
  const totalIncome = sumAmounts(income);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Expense breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense Breakdown</CardTitle>
          <CardDescription>How your club's money is being spent</CardDescription>
        </CardHeader>
        <CardContent>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseByCategory.map(([category, amount]) => (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      <TableCell className="text-right text-red-600">
                        ${amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : "0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-red-600">
                      ${totalExpenses.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Income breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income Breakdown</CardTitle>
          <CardDescription>Where your club's money comes from</CardDescription>
        </CardHeader>
        <CardContent>
          {incomeByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomeByCategory.map(([category, amount]) => (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      <TableCell className="text-right text-emerald-600">
                        ${amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {totalIncome > 0 ? ((amount / totalIncome) * 100).toFixed(1) : "0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-emerald-600">
                      ${totalIncome.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Fundraiser Tracker                                                     */
/* ---------------------------------------------------------------------- */

function FundraiserTracker({ transactions }: { transactions: TransactionRow[] }) {
  const incomeTransactions = transactions.filter((tx) => tx.type === "income");

  const fundraiserIncome = incomeTransactions.filter((tx) => tx.category === "Fundraiser");
  const otherIncome = incomeTransactions.filter((tx) => tx.category !== "Fundraiser");

  const totalFundraiser = sumAmounts(fundraiserIncome);
  const totalOther = sumAmounts(otherIncome);
  const totalAll = totalFundraiser + totalOther;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Fundraiser Tracker</CardTitle>
            <CardDescription>
              Track your fundraising campaigns and all income sources
            </CardDescription>
          </div>
          {totalAll > 0 ? (
            <div className="text-right text-sm">
              <p className="text-muted-foreground">
                Fundraisers:{" "}
                <span className="font-semibold text-emerald-600">${totalFundraiser.toFixed(2)}</span>
                {" · "}Total:{" "}
                <span className="font-semibold text-emerald-600">${totalAll.toFixed(2)}</span>
              </p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {incomeTransactions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No income recorded yet. Add transactions in the Funds tab to see them here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...fundraiserIncome, ...otherIncome].map((tx, index) => (
                  <TableRow key={tx.id} className="animate-in fade-in" style={staggerStyle(index)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {tx.occurred_on}
                    </TableCell>
                    <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={tx.category === "Fundraiser" ? "default" : "outline"}>
                        {tx.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      +${Number(tx.amount).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3}>Total income</TableCell>
                  <TableCell className="text-right text-emerald-600">
                    ${totalAll.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/*  Expense Ledger (spreadsheet-style with inline add row)                 */
/* ---------------------------------------------------------------------- */

function ExpenseLedger({
  clubId,
  transactions,
  canManage,
}: {
  clubId: string;
  transactions: TransactionRow[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const expenses = transactions.filter((tx) => tx.type === "expense");
  const totalExpenses = sumAmounts(expenses);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0] ?? "Supplies");
  const [description, setDescription] = useState("");

  const addExpense = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("add_transaction", {
        target_club: clubId,
        tx_type: "expense",
        amount: Number(amount),
        category,
        description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAmount("");
      setDescription("");
      toast("Expense added");
      void queryClient.invalidateQueries({ queryKey: ["club", clubId, "finances"] });
      void queryClient.invalidateQueries({ queryKey: ["club", clubId, "transactions"] });
    },
  });

  const valid = Number(amount) > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Expense Ledger</CardTitle>
            <CardDescription>All club expenses in one spreadsheet view</CardDescription>
          </div>
          <p className="text-sm font-semibold text-red-600">
            Total: -${totalExpenses.toFixed(2)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline add row */}
        {canManage ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) addExpense.mutate();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What was it for?"
              />
            </div>
            <Button type="submit" size="sm" disabled={!valid || addExpense.isPending}>
              {addExpense.isPending ? <SkeletonSpinner /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>
        ) : null}

        {addExpense.error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {addExpense.error.message}
          </p>
        ) : null}

        {/* Expense table */}
        {expenses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No expenses recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((tx, index) => (
                  <TableRow key={tx.id} className="animate-in fade-in" style={staggerStyle(index)}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {tx.occurred_on}
                    </TableCell>
                    <TableCell className="font-medium">{tx.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tx.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      -${Number(tx.amount).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell colSpan={3}>Total expenses</TableCell>
                  <TableCell className="text-right text-red-600">
                    -${totalExpenses.toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/*  Dues Tracker                                                           */
/* ---------------------------------------------------------------------- */

function DuesTracker({ clubId, canManage }: { clubId: string; canManage: boolean }) {
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
    onSuccess: () => {
      toast("Dues marked paid");
      void queryClient.invalidateQueries({ queryKey: ["club", clubId] });
    },
  });

  const rows = dues.data ?? [];
  const totalDues = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const paidDues = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const paidCount = rows.filter((row) => row.status === "paid").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Dues Tracker</CardTitle>
            <CardDescription>Track member dues and payment statuses</CardDescription>
          </div>
          {rows.length > 0 ? (
            <div className="text-right text-sm">
              <p className="text-muted-foreground">
                Collected{" "}
                <span className="font-semibold text-emerald-600">${paidDues.toFixed(2)}</span> of{" "}
                <span className="font-semibold">${totalDues.toFixed(2)}</span>
                <span className="ml-2 text-xs">
                  ({paidCount}/{rows.length} paid)
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {dues.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No dues have been set up for this club yet. Set them up in the Funds tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className="animate-in fade-in"
                    style={staggerStyle(index)}
                  >
                    <TableCell className="font-medium">
                      {row.profile?.full_name ?? "Member"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${Number(row.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.due_date ?? "—"}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
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
                        ) : (
                          <span className="text-xs text-muted-foreground">✓</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">${totalDues.toFixed(2)}</TableCell>
                  <TableCell />
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {paidCount}/{rows.length} paid
                    </span>
                  </TableCell>
                  {canManage ? <TableCell /> : null}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        {markPaid.error ? (
          <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {markPaid.error.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

/** Group transactions by category and sort descending by total amount. */
function groupByCategory(transactions: TransactionRow[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    map.set(tx.category, (map.get(tx.category) ?? 0) + Number(tx.amount));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/** Sum transaction amounts. */
function sumAmounts(transactions: TransactionRow[]): number {
  return transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
}

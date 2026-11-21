import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import type { FormEvent } from "react";
import { CirclePlus, Edit, Plus, Sparkles, Table2, Trash2, X } from "lucide-react";

import { AppShell, PageHeader, RequireAuth } from "@/components/app-shell";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton, SkeletonSpinner } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/ui/motion";
import { staggerStyle } from "@/lib/motion";
import { can } from "@/lib/auth/permissions";
import { TABLE_TEMPLATES } from "@/lib/domain";
import { useClubContext } from "@/lib/hooks/use-club";
import { useClubEvents, useClubMembers } from "@/lib/queries";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type {
  DataTableColumnRow,
  DataTableDataRow,
  DataTableRow,
  Json,
  MembershipRow,
  ProfileRow,
  TablesInsert,
} from "@/lib/types/database";

/**
 * PRD 26/28: structured tables, always started from a template or from a
 * plain-English description. There is deliberately no blank grid anywhere on
 * this page -- "Clubset should not become Excel" (PRD 26/44).
 */
export const Route = createFileRoute("/clubs/$clubId/data")({
  component: DataPage,
});

function DataPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DataContent />
      </AppShell>
    </RequireAuth>
  );
}

/**
 * "Something else" is not a template -- it is the hand-off to the PRD 28
 * intent flow, so it is filtered out of the template picker.
 */
const TEMPLATE_KEYS = TABLE_TEMPLATES.filter((template) => template.key !== "custom");

interface ProposedColumn {
  name: string;
  type: string;
}

interface TableProposal {
  templateKey: string;
  name: string;
  columns: ProposedColumn[];
}

function DataContent() {
  const { clubId } = useParams({ from: "/clubs/$clubId/data" });
  const context = useClubContext(clubId);
  const queryClient = useQueryClient();

  const permissions = context.data?.permissions ?? [];
  const isLinkedAdministrator = context.data?.isLinkedAdministrator ?? false;
  // The database accepts a linked club administrator everywhere the templates
  // are applied, so the page gate follows the same rule (PRD 38/41).
  const mayManage = can(permissions, "manage_data_tables") || isLinkedAdministrator;

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [intent, setIntent] = useState("");
  const [proposal, setProposal] = useState<TableProposal | null>(null);
  const [proposalName, setProposalName] = useState("");

  const tables = useQuery({
    queryKey: ["club", clubId, "data-tables"],
    queryFn: async (): Promise<DataTableRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("data_tables")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DataTableRow[];
    },
    enabled: Boolean(clubId) && mayManage,
  });

  const tableRows = tables.data ?? [];
  const activeTableId = selectedTableId ?? tableRows[0]?.id ?? null;

  const columns = useQuery({
    queryKey: ["club", clubId, "data-table-columns", activeTableId],
    queryFn: async (): Promise<DataTableColumnRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("data_table_columns")
        .select("*")
        .eq("table_id", activeTableId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DataTableColumnRow[];
    },
    enabled: Boolean(activeTableId),
  });

  const rows = useQuery({
    queryKey: ["club", clubId, "data-table-rows", activeTableId],
    queryFn: async (): Promise<DataTableDataRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("data_table_rows")
        .select("*")
        .eq("table_id", activeTableId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DataTableDataRow[];
    },
    enabled: Boolean(activeTableId),
  });

  const dataRows = rows.data ?? [];

  const members = useClubMembers(clubId);
  const events = useClubEvents(clubId);

  const [addRowOpen, setAddRowOpen] = useState(false);
  const [editRowOpen, setEditRowOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DataTableDataRow | null>(null);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);

  // PRD 27: a row stores a member id, not a frozen copy of their name, so the
  // name is resolved at read time against profiles.
  //
  // The table and the id set are part of the key: without them, switching
  // tables inside the stale window served the previous table's names.
  const memberIds = [
    ...new Set(dataRows.map((row) => row.member_id).filter((id): id is string => Boolean(id))),
  ];

  const memberNames = useQuery({
    queryKey: ["club", clubId, "data-table-member-names", activeTableId, memberIds],
    queryFn: async (): Promise<ProfileRow[]> => {
      const supabase = getSupabaseClient();
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberIds);
      if (error) throw error;
      return (data ?? []) as unknown as ProfileRow[];
    },
    enabled: memberIds.length > 0,
  });

  const nameById = useMemo(
    () =>
      new Map(
        (memberNames.data ?? []).map(
          (person) => [person.id, person.full_name || person.email] as const,
        ),
      ),
    [memberNames.data],
  );

  const invalidate = () => {
    // These have to be real key prefixes. ["club", clubId, "data-table"] is not
    // a prefix of "data-table-columns" / "data-table-rows", so it invalidated
    // nothing and the table kept rendering pre-mutation rows.
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "data-table-columns"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "data-table-rows"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "data-table-member-names"] });
    void queryClient.invalidateQueries({ queryKey: ["club", clubId, "data-tables"] });
  };

  const createTable = useMutation({
    mutationFn: async (input: { name: string; templateKey: string }) => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id;
      if (!createdBy) throw new Error("You need to be signed in to create a table.");

      const { data, error } = await insertTable({
        club_id: clubId,
        created_by: createdBy,
        name: input.name,
        template_key: input.templateKey,
      });
      if (error) throw error;

      const created = (data as Array<{ id: string }> | null)?.[0];
      if (!created) throw new Error("The table could not be created.");

      // PRD 26/44: the columns come from the template in the database, so every
      // club's table is structured the same way and needs no schema knowledge.
      const { error: templateError } = await supabase.rpc("apply_table_template", {
        target_table: created.id,
        template_key: input.templateKey,
      });
      if (templateError) throw templateError;

      return created.id;
    },
    onSuccess: (id) => {
      invalidate();
      setSelectedTableId(id);
      setProposal(null);
      setProposalName("");
      setIntent("");
    },
  });

  const propose = useMutation({
    mutationFn: async (intentText: string): Promise<TableProposal | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("propose_table_structure", {
        intent_text: intentText,
      });
      if (error) throw error;
      return readProposal(data);
    },
    onSuccess: (result) => {
      setProposal(result);
      if (result) setProposalName(result.name);
    },
  });

  const handlePropose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (intent.trim().length === 0) return;
    propose.mutate(intent.trim());
  };

  const handleApprove = () => {
    if (!proposal) return;
    const name = proposalName.trim() === "" ? proposal.name : proposalName.trim();
    createTable.mutate({ name, templateKey: proposal.templateKey });
  };

  // ---------------------------------------------------------------------------
  // Row mutations (PRD 26/44: fill in tables, no spreadsheet knowledge needed)
  // ---------------------------------------------------------------------------

  const insertRow = useMutation({
    mutationFn: async (input: {
      tableId: string;
      memberId: string | null;
      data: Record<string, unknown>;
    }) => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id;
      if (!createdBy) throw new Error("You need to be signed in to add a row.");

      const { error } = await supabase.from("data_table_rows").insert(
        [
          {
            table_id: input.tableId,
            member_id: input.memberId,
            data: input.data,
            created_by: createdBy,
          },
        ] as unknown as never[]
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row added");
    },
  });

  const updateRow = useMutation({
    mutationFn: async (input: {
      rowId: string;
      memberId: string | null;
      data: Record<string, unknown>;
    }) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("data_table_rows")
        .update({ member_id: input.memberId, data: input.data as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", input.rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row updated");
    },
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("data_table_rows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row deleted");
    },
  });

  if (context.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  // PRD 45: the management surface only appears for people who hold the
  // permission, and the message names the role that would unlock it.
  if (!mayManage) {
    return (
      <>
        <PageHeader title="Data" description="Structured tables for this club." />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              You do not have permission to manage data tables
            </CardTitle>
            <CardDescription>
              Creating and filling in tables is handled by the club role that manages data. Ask a
              leader to assign you that role if you need it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Clubset keeps this area permission-gated so a member is never shown a blank
              spreadsheet to fill in.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  if (tables.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <>
      <PageHeader
        title="Data"
        description="Track attendance, signups, volunteer hours and more -- starting from a ready-made structure."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start from a template</CardTitle>
            <CardDescription>
              Pick what you want to track and Clubset builds the columns for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TEMPLATE_KEYS.map((template) => (
              <div
                key={template.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </div>
                <Button
                  size="sm"
                  disabled={createTable.isPending}
                  onClick={() =>
                    createTable.mutate({ name: template.name, templateKey: template.key })
                  }
                >
                  {createTable.isPending ? (
                    <SkeletonSpinner />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Use this
                </Button>
              </div>
            ))}
            {createTable.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createTable.error.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* PRD 28: describe the intent in plain English instead of designing a schema. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What are you trying to track?</CardTitle>
            <CardDescription>
              Say it in your own words and Clubset will suggest a structure to review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handlePropose} className="flex gap-2">
              <Input
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="e.g. how many hours each member volunteered"
                aria-label="What you want to track"
                maxLength={200}
              />
              <Button type="submit" disabled={propose.isPending || intent.trim().length === 0}>
                {propose.isPending ? (
                  <SkeletonSpinner />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Suggest
              </Button>
            </form>

            {propose.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {propose.error.message}
              </p>
            ) : null}

            {proposal ? (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                {/* PRD 31/53.18: a suggestion is never applied on its own. */}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Suggestion</Badge>
                  <p className="text-xs text-muted-foreground">
                    Review this structure and approve it before the table is created.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="proposal-name">Table name</Label>
                  <Input
                    id="proposal-name"
                    value={proposalName}
                    onChange={(event) => setProposalName(event.target.value)}
                    maxLength={120}
                  />
                </div>

                <ul className="space-y-1 text-sm">
                  {proposal.columns.map((column) => (
                    <li
                      key={`${column.name}-${column.type}`}
                      className="flex justify-between gap-2"
                    >
                      <span>{column.name}</span>
                      <span className="text-xs text-muted-foreground">{column.type}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button size="sm" disabled={createTable.isPending} onClick={handleApprove}>
                    {createTable.isPending ? (
                      <SkeletonSpinner />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Approve and create
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProposal(null);
                      setProposalName("");
                    }}
                  >
                    <X className="size-4" />
                    Discard
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing is created until you approve it -- Clubset proposes, you decide.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        {tableRows.length === 0 ? (
          <Card>
            <CardContent>
              <p className="py-6 text-center text-sm text-muted-foreground">
                This club has no tables yet. Choose a template above to create the first one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {tableRows.map((table, index) => (
                <li key={table.id} className={cn("animate-in fade-in")} style={staggerStyle(index)}>
                  <Button
                    variant={table.id === activeTableId ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTableId(table.id)}
                  >
                    <Table2 className="size-4" />
                    {table.name}
                  </Button>
                </li>
              ))}
            </ul>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {tableRows.find((table) => table.id === activeTableId)?.name ?? "Table"}
                    </CardTitle>
                    <CardDescription>
                      {dataRows.length} row{dataRows.length === 1 ? "" : "s"} recorded
                    </CardDescription>
                  </div>
                  {tableRows.find((table) => table.id === activeTableId)?.template_key ? (
                    <Badge variant="outline">
                      {TABLE_TEMPLATES.find(
                        (template) =>
                          template.key ===
                          tableRows.find((table) => table.id === activeTableId)?.template_key,
                      )?.name ?? "Custom"}
                    </Badge>
                  ) : null}
                  {activeTableId && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingRow(null);
                        setAddRowOpen(true);
                      }}
                    >
                      <CirclePlus className="size-4" />
                      Add row
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {rows.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : dataRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing has been recorded in this table yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        {(columns.data ?? []).map((column) => (
                          <TableHead key={column.id}>{column.name}</TableHead>
                        ))}
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">
                            {row.member_id === null
                              ? "—"
                              : (nameById.get(row.member_id) ?? "Club member")}
                          </TableCell>
                          {(columns.data ?? []).map((column) => (
                            <TableCell key={column.id}>
                              {column.column_type === "member"
                                ? (nameById.get(cellMemberId(row, column)) ??
                                  cellText(row.data, column.name) ??
                                  "—")
                                : (cellText(row.data, column.name) ?? "—")}
                            </TableCell>
                          ))}
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingRow(row);
                                setEditRowOpen(true);
                              }}
                            >
                              <Edit className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteRowId(row.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {activeTableId && columns.data ? (
        <>
          <AddRowDialog
            open={addRowOpen}
            onOpenChange={setAddRowOpen}
            tableId={activeTableId}
            columns={columns.data}
            members={members.data ?? []}
            events={events.data ?? []}
            invalidate={invalidate}
          />
          {editRowOpen && editingRow && (
            <EditRowDialog
              open={editRowOpen}
              onOpenChange={setEditRowOpen}
              tableId={activeTableId}
              row={editingRow}
              columns={columns.data}
              members={members.data ?? []}
              events={events.data ?? []}
              invalidate={invalidate}
            />
          )}
          {deleteRowId && (
            <DeleteRowDialog
              open={Boolean(deleteRowId)}
              onOpenChange={(open) => {
                if (!open) setDeleteRowId(null);
              }}
              rowId={deleteRowId}
              invalidate={invalidate}
            />
          )}
        </>
      ) : null}
    </>
  );
}

/** Cell text for a jsonb column bag; anything non-scalar is shown as JSON. */
function cellText(data: Json, columnName: string): string | undefined {
  const value = jsonMap(data)[columnName];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function cellMemberId(row: DataTableDataRow, column: DataTableColumnRow): string {
  const value = jsonMap(row.data)[column.name];
  if (typeof value === "string") return value;
  return row.member_id ?? "";
}

function jsonMap(data: Json): Record<string, Json | undefined> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  return data as Record<string, Json | undefined>;
}

/**
 * propose_table_structure() returns jsonb, so the payload is validated here
 * before it is displayed. PRD 31/53.18 requires the leader to see a proposed
 * structure and approve it, so nothing here is applied automatically.
 */
function readProposal(value: Json | null): TableProposal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const templateKey = record["template_key"];
  const name = record["name"];
  const rawColumns = record["columns"];
  if (typeof templateKey !== "string" || typeof name !== "string" || !Array.isArray(rawColumns)) {
    return null;
  }

  const parsed: ProposedColumn[] = [];
  for (const entry of rawColumns) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const column = entry as Record<string, Json | undefined>;
    if (typeof column["name"] !== "string" || typeof column["type"] !== "string") return null;
    parsed.push({ name: column["name"], type: column["type"] });
  }

  return { templateKey, name, columns: parsed };
}

/**
 * The hand-maintained Database type carries no relationship metadata, so
 * supabase-js cannot infer a payload from an already-typed object. Casting once
 * here keeps the call site readable; Postgres and RLS remain the enforcement
 * point (PRD 41).
 */
function insertTable(row: TablesInsert<"data_tables">) {
  return getSupabaseClient()
    .from("data_tables")
    .insert(row as unknown as never[])
    .select("id");
}

// ---------------------------------------------------------------------------
// Row dialogs (PRD 26/44: fill in tables, no spreadsheet knowledge needed)
// ---------------------------------------------------------------------------

type RowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  columns: DataTableColumnRow[];
  members: Array<MembershipRow & { profile: ProfileRow }>;
  events: Array<{ id: string; title: string }>;
  invalidate: () => void;
};

function columnInput({
  column,
  value,
  onChange,
}: {
  column: DataTableColumnRow;
  value: string | null;
  onChange: (value: string) => void;
}) {
  if (column.column_type === "boolean") {
    return (
      <Select
        value={value ?? ""}
        onValueChange={(next: string) => onChange(next)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (column.column_type === "date") {
    return (
      <Input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (column.column_type === "number") {
    return (
      <Input
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function MemberOrEventSelect({
  column,
  value,
  onChange,
  options,
  label,
}: {
  column: DataTableColumnRow;
  value: string | null;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`row-dialog-${column.id}`}>{label}</Label>
      <Select
        value={value ?? ""}
        onValueChange={(next: string) => onChange(next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select a ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AddRowDialog({
  open,
  onOpenChange,
  tableId,
  columns,
  members,
  events,
  invalidate,
}: RowDialogProps) {
  const [formData, setFormData] = useState<Record<string, string | null>>({});
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberColumn = columns.find(
    (c) => c.name === "Member" && c.column_type === "member",
  );
  const dataColumns = columns.filter(
    (c) => !(c.name === "Member" && c.column_type === "member"),
  );

  const insertRow = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id;
      if (!createdBy) throw new Error("You need to be signed in to add a row.");

      for (const column of dataColumns) {
        if (column.is_required) {
          const value = formData[column.name];
          if (value === null || value === "") {
            throw new Error(`${column.name} is required.`);
          }
        }
      }

      if (memberColumn && !memberId) {
        throw new Error("Member is required.");
      }

      const data: Record<string, unknown> = {};
      for (const column of dataColumns) {
        const value = formData[column.name];
        if (value === null || value === "") continue;
        if (column.column_type === "number") {
          data[column.name] = Number(value);
        } else if (column.column_type === "boolean") {
          data[column.name] = value === "true";
        } else {
          data[column.name] = value;
        }
      }

      const { error } = await supabase.from("data_table_rows").insert(
        [
          {
            table_id: tableId,
            member_id: memberId,
            data,
            created_by: createdBy,
          },
        ] as unknown as never[],
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row added");
      setFormData({});
      setMemberId(null);
      setError(null);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    insertRow.mutate();
  };

  const memberOptions = (members ?? []).map((m) => ({
    id: m.user_id,
    label: m.profile?.full_name ?? "Member",
  }));
  const eventOptions = (events ?? []).map((e) => ({ id: e.id, label: e.title }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add row</DialogTitle>
          <DialogDescription>
            Fill in the values for each column below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {memberColumn ? (
            <MemberOrEventSelect
              column={memberColumn}
              value={memberId}
              onChange={setMemberId}
              options={memberOptions}
              label="Member"
            />
          ) : null}

          {dataColumns.map((column) => {
            if (column.column_type === "member") {
              return (
                <MemberOrEventSelect
                  key={column.id}
                  column={column}
                  value={formData[column.name] ?? null}
                  onChange={(next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next }))
                  }
                  options={memberOptions}
                  label={column.name}
                />
              );
            }
            if (column.column_type === "event") {
              return (
                <MemberOrEventSelect
                  key={column.id}
                  column={column}
                  value={formData[column.name] ?? null}
                  onChange={(next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next }))
                  }
                  options={eventOptions}
                  label={column.name}
                />
              );
            }
            return (
              <div key={column.id} className="space-y-2">
                <Label htmlFor={`row-dialog-${column.id}`}>{column.name}</Label>
                {column.is_required && (
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                )}
                {columnInput({
                  column,
                  value: formData[column.name] ?? null,
                  onChange: (next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next })),
                })}
              </div>
            );
          })}

          <Button type="submit" disabled={insertRow.isPending}>
            {insertRow.isPending ? <SkeletonSpinner /> : null}
            Add row
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRowDialog({
  open,
  onOpenChange,
  tableId,
  columns,
  members,
  events,
  invalidate,
  row,
}: RowDialogProps & { row: DataTableDataRow }) {
  const [formData, setFormData] = useState<Record<string, string | null>>({});
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const memberColumn = columns.find(
    (c) => c.name === "Member" && c.column_type === "member",
  );
  const dataColumns = columns.filter(
    (c) => !(c.name === "Member" && c.column_type === "member"),
  );

  // Initialize form from existing row data
  useMemo(() => {
    const next: Record<string, string | null> = {};
    for (const column of dataColumns) {
      const value = jsonMap(row.data)[column.name];
      next[column.name] =
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : value === null || value === undefined
            ? null
            : JSON.stringify(value);
    }
    setFormData(next);
    setMemberId(row.member_id ?? null);
    setError(null);
  }, [row, dataColumns]);

  const updateRow = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();

      for (const column of dataColumns) {
        if (column.is_required) {
          const value = formData[column.name];
          if (value === null || value === "") {
            throw new Error(`${column.name} is required.`);
          }
        }
      }

      if (memberColumn && !memberId) {
        throw new Error("Member is required.");
      }

      const data: Record<string, unknown> = {};
      for (const column of dataColumns) {
        const value = formData[column.name];
        if (value === null || value === "") continue;
        if (column.column_type === "number") {
          data[column.name] = Number(value);
        } else if (column.column_type === "boolean") {
          data[column.name] = value === "true";
        } else {
          data[column.name] = value;
        }
      }

      const { error } = await supabase.from("data_table_rows")
        .update({ member_id: memberId, data: data as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row updated");
      setError(null);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateRow.mutate();
  };

  const memberOptions = (members ?? []).map((m) => ({
    id: m.user_id,
    label: m.profile?.full_name ?? "Member",
  }));
  const eventOptions = (events ?? []).map((e) => ({ id: e.id, label: e.title }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit row</DialogTitle>
          <DialogDescription>
            Update the values below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {memberColumn ? (
            <MemberOrEventSelect
              column={memberColumn}
              value={memberId}
              onChange={setMemberId}
              options={memberOptions}
              label="Member"
            />
          ) : null}

          {dataColumns.map((column) => {
            if (column.column_type === "member") {
              return (
                <MemberOrEventSelect
                  key={column.id}
                  column={column}
                  value={formData[column.name] ?? null}
                  onChange={(next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next }))
                  }
                  options={memberOptions}
                  label={column.name}
                />
              );
            }
            if (column.column_type === "event") {
              return (
                <MemberOrEventSelect
                  key={column.id}
                  column={column}
                  value={formData[column.name] ?? null}
                  onChange={(next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next }))
                  }
                  options={eventOptions}
                  label={column.name}
                />
              );
            }
            return (
              <div key={column.id} className="space-y-2">
                <Label htmlFor={`row-dialog-${column.id}`}>{column.name}</Label>
                {column.is_required && (
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                )}
                {columnInput({
                  column,
                  value: formData[column.name] ?? null,
                  onChange: (next: string) =>
                    setFormData((prev) => ({ ...prev, [column.name]: next })),
                })}
              </div>
            );
          })}

          <Button type="submit" disabled={updateRow.isPending}>
            {updateRow.isPending ? <SkeletonSpinner /> : null}
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRowDialog({
  open,
  onOpenChange,
  rowId,
  invalidate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowId: string;
  invalidate: () => void;
}) {
  const deleteRow = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("data_table_rows").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast("Row deleted");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete row?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The row will be removed from the table.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteRow.mutate();
              onOpenChange(false);
            }}
            className="bg-destructive text-destructive-foreground"
            disabled={deleteRow.isPending}
          >
            {deleteRow.isPending ? <SkeletonSpinner /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  CsvPreviewResponse,
  DatabaseSchemaSnapshot,
  DesignerColumnInput,
  DesignerIndexInput,
  InferredPostgresColumnType,
  MigrationPreviewResponse,
  SchemaAiProposalResponse,
  SeedGeneratorResponse,
} from '@datapilot/types';
import { Badge, Button, Card, Icon, Input, Skeleton } from '@datapilot/ui';
import { apiClient } from '@/lib/api';
import { useAppStore } from '@/lib/store';

const PG_DATA_TYPES: DesignerColumnInput['dataType'][] = [
  'serial',
  'bigserial',
  'uuid',
  'integer',
  'bigint',
  'numeric(12,2)',
  'varchar(255)',
  'text',
  'boolean',
  'timestamptz',
  'date',
  'jsonb',
];

const CSV_OVERRIDABLE_TYPES: InferredPostgresColumnType[] = [
  'integer',
  'numeric(12,2)',
  'boolean',
  'timestamptz',
  'text',
];

const SAMPLE_CSV_DATA = `full_name,email,company_name,deal_size_usd,is_qualified,contacted_at
Elena Vance,elena.vance@northstar.io,Northstar Analytics,48500.00,true,2026-09-14T10:15:00Z
Marcus Sterling,m.sterling@velocecloud.com,Veloce Cloud,12400.50,true,2026-09-18T14:30:00Z
Priya Patel,priya@apexfreight.co,Apex Freight,89000.00,true,2026-10-02T09:00:00Z
Liam Okafor,liam@cinderbio.org,Cinder Bio,6200.00,false,2026-10-11T16:45:00Z
Sophia Chen,sophia@heliosfintech.io,Helios Fintech,115000.00,true,2026-10-19T11:20:00Z
Noah Mercer,noah@stratasystems.dev,Strata Systems,19800.75,false,2026-10-25T08:10:00Z`;

const BUSINESS_PRESETS = [
  {
    label: 'Online bookstore',
    description:
      'Online bookstore with books catalog, registered store members, and verified customer book reviews',
  },
  {
    label: 'Fleet & logistics',
    description:
      'Fleet and logistics platform tracking delivery vehicles, dispatch hubs, and active delivery routes',
  },
  {
    label: 'Healthcare clinic',
    description:
      'Healthcare clinic booking system with medical providers, patients, and scheduled appointments',
  },
  {
    label: 'B2B SaaS billing',
    description:
      'B2B SaaS subscription platform with tenant accounts, plan tiers, and monthly usage invoices',
  },
];

type SchemaTab =
  | 'er-canvas'
  | 'inspector'
  | 'designer'
  | 'schema-ai'
  | 'seed'
  | 'csv-import';

export default function SchemaPage() {
  const searchParams = useSearchParams();
  const databases = useAppStore((s) => s.databases);
  const setDatabases = useAppStore((s) => s.setDatabases);
  const activeDatabaseId = useAppStore((s) => s.activeDatabaseId);
  const addToast = useAppStore((s) => s.addToast);

  const activeDb = React.useMemo(
    () => databases.find((d) => d.id === activeDatabaseId) ?? databases[0],
    [databases, activeDatabaseId],
  );

  const [snapshot, setSnapshot] = React.useState<DatabaseSchemaSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedTableName, setSelectedTableName] = React.useState<string>('');
  const [activeTab, setActiveTab] = React.useState<SchemaTab>('er-canvas');

  // Honor ?tab= query param
  React.useEffect(() => {
    const tabParam = searchParams.get('tab') as SchemaTab | null;
    if (
      tabParam &&
      ['er-canvas', 'inspector', 'designer', 'schema-ai', 'seed', 'csv-import'].includes(
        tabParam,
      )
    ) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // 1. Visual Schema Designer state
  const [newTableName, setNewTableName] = React.useState('customer_reviews');
  const [columns, setColumns] = React.useState<DesignerColumnInput[]>([
    {
      name: 'id',
      dataType: 'serial',
      isNullable: false,
      isPrimaryKey: true,
      isUnique: true,
    },
    {
      name: 'customer_id',
      dataType: 'integer',
      isNullable: false,
      isPrimaryKey: false,
      isUnique: false,
      referencesTable: 'customers',
      referencesColumn: 'id',
    },
    {
      name: 'rating',
      dataType: 'integer',
      isNullable: false,
      isPrimaryKey: false,
      isUnique: false,
      defaultValue: '5',
    },
    {
      name: 'comment',
      dataType: 'text',
      isNullable: true,
      isPrimaryKey: false,
      isUnique: false,
    },
    {
      name: 'created_at',
      dataType: 'timestamptz',
      isNullable: false,
      isPrimaryKey: false,
      isUnique: false,
      defaultValue: 'NOW()',
    },
  ]);
  const [indexes, setIndexes] = React.useState<DesignerIndexInput[]>([
    {
      name: 'idx_customer_reviews_customer_id',
      columns: ['customer_id'],
      isUnique: false,
    },
  ]);
  const [migrationPreview, setMigrationPreview] =
    React.useState<MigrationPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isApplying, setIsApplying] = React.useState(false);

  // 2. Phase 6: Schema AI state
  const [businessDescription, setBusinessDescription] = React.useState(
    BUSINESS_PRESETS[0]!.description,
  );
  const [schemaAiProposal, setSchemaAiProposal] =
    React.useState<SchemaAiProposalResponse | null>(null);
  const [editableAiDdl, setEditableAiDdl] = React.useState('');
  const [isGeneratingSchemaAi, setIsGeneratingSchemaAi] = React.useState(false);
  const [isApplyingSchemaAi, setIsApplyingSchemaAi] = React.useState(false);

  // 3. Phase 6: Realistic Seed Generator state
  const [seedTableName, setSeedTableName] = React.useState<string>('customers');
  const [seedRowCount, setSeedRowCount] = React.useState<number>(15);
  const [seedResult, setSeedResult] = React.useState<SeedGeneratorResponse | null>(null);
  const [isPreviewingSeed, setIsPreviewingSeed] = React.useState(false);
  const [isInsertingSeed, setIsInsertingSeed] = React.useState(false);

  // 4. Phase 6: CSV Import state
  const [csvTableName, setCsvTableName] = React.useState('imported_leads');
  const [csvContent, setCsvContent] = React.useState(SAMPLE_CSV_DATA);
  const [csvPreview, setCsvPreview] = React.useState<CsvPreviewResponse | null>(null);
  const [csvTypeOverrides, setCsvTypeOverrides] = React.useState<Record<string, string>>(
    {},
  );
  const [isPreviewingCsv, setIsPreviewingCsv] = React.useState(false);
  const [isImportingCsv, setIsImportingCsv] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const fetchSchema = React.useCallback(
    async (dbId: string, force = false) => {
      if (force) setSyncing(true);
      else setLoading(true);
      try {
        const data = force
          ? await apiClient.syncDatabaseSchema(dbId)
          : await apiClient.getDatabaseSchema(dbId, false);
        setSnapshot(data);
        setSelectedTableName((prev) =>
          data.tables.some((t) => t.name === prev) ? prev : data.tables[0]?.name ?? '',
        );
        setSeedTableName((prev) =>
          data.tables.some((t) => t.name === prev) ? prev : data.tables[0]?.name ?? '',
        );
        if (force) {
          const { databases: refreshed } = await apiClient.listDatabases();
          setDatabases(refreshed);
          addToast({
            title: 'Schema snapshot refreshed',
            description: `${data.tables.length} tables and ${data.relations.length} relations cached.`,
            variant: 'success',
          });
        }
      } catch (err) {
        addToast({
          title: 'Failed to load schema',
          description: err instanceof Error ? err.message : 'Check database connection.',
          variant: 'danger',
        });
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [addToast, setDatabases],
  );

  React.useEffect(() => {
    if (activeDb?.id) {
      void fetchSchema(activeDb.id, false);
    }
  }, [activeDb?.id, fetchSchema]);

  const filteredTables = React.useMemo(() => {
    if (!snapshot) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return snapshot.tables;
    return snapshot.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [snapshot, searchQuery]);

  const selectedTable = React.useMemo(
    () =>
      snapshot?.tables.find((t) => t.name === selectedTableName) ?? snapshot?.tables[0],
    [snapshot, selectedTableName],
  );

  // Designer handlers
  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      {
        name: `col_${prev.length + 1}`,
        dataType: 'varchar(255)',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: false,
      },
    ]);
    setMigrationPreview(null);
  };

  const handleUpdateColumn = (
    idx: number,
    patch: Partial<DesignerColumnInput>,
  ) => {
    setColumns((prev) =>
      prev.map((col, i) => (i === idx ? { ...col, ...patch } : col)),
    );
    setMigrationPreview(null);
  };

  const handleRemoveColumn = (idx: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== idx));
    setMigrationPreview(null);
  };

  const handleAddIndex = () => {
    const firstCol = columns[0]?.name ?? 'id';
    setIndexes((prev) => [
      ...prev,
      {
        name: `idx_${newTableName || 'table'}_${prev.length + 1}`,
        columns: [firstCol],
        isUnique: false,
      },
    ]);
    setMigrationPreview(null);
  };

  const handlePreviewMigration = async () => {
    if (!activeDb) return;
    setIsPreviewing(true);
    try {
      const preview = await apiClient.previewMigration(activeDb.id, {
        tableName: newTableName.trim(),
        columns,
        indexes,
      });
      setMigrationPreview(preview);
    } catch (err) {
      addToast({
        title: 'Migration preview error',
        description: err instanceof Error ? err.message : 'Check identifier names.',
        variant: 'danger',
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyMigration = async () => {
    if (!activeDb) return;
    setIsApplying(true);
    try {
      const updatedSnapshot = await apiClient.applyMigration(activeDb.id, {
        tableName: newTableName.trim(),
        columns,
        indexes,
      });
      setSnapshot(updatedSnapshot);
      setSelectedTableName(newTableName.trim());
      setMigrationPreview(null);
      setActiveTab('er-canvas');
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      addToast({
        title: `Created table "${newTableName.trim()}"`,
        description: 'Migration committed in transaction and schema cache updated.',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Migration failed',
        description: err instanceof Error ? err.message : 'PostgreSQL rejected the DDL.',
        variant: 'danger',
      });
    } finally {
      setIsApplying(false);
    }
  };

  // Phase 6: Schema AI handlers
  const handleProposeSchemaAi = async (customDesc?: string) => {
    if (!activeDb) return;
    const desc = (customDesc ?? businessDescription).trim();
    if (desc.length < 3) return;
    setIsGeneratingSchemaAi(true);
    try {
      const proposal = await apiClient.proposeSchemaAi(activeDb.id, desc);
      setSchemaAiProposal(proposal);
      setEditableAiDdl(proposal.ddlSql);
      addToast({
        title: `Proposed ${proposal.tables.length} tables`,
        description: proposal.summary,
        variant: 'info',
      });
    } catch (err) {
      addToast({
        title: 'Schema AI generation failed',
        description: err instanceof Error ? err.message : 'Try a clearer business description.',
        variant: 'danger',
      });
    } finally {
      setIsGeneratingSchemaAi(false);
    }
  };

  const handleApplySchemaAi = async () => {
    if (!activeDb || !editableAiDdl.trim()) return;
    setIsApplyingSchemaAi(true);
    try {
      const updatedSnapshot = await apiClient.applySchemaAi(
        activeDb.id,
        editableAiDdl,
      );
      setSnapshot(updatedSnapshot);
      const firstProposed = schemaAiProposal?.tables[0]?.tableName;
      if (firstProposed) {
        setSelectedTableName(firstProposed);
        setSeedTableName(firstProposed);
      }
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      addToast({
        title: 'Schema AI migration applied',
        description: `Database now has ${updatedSnapshot.tables.length} tables.`,
        variant: 'success',
      });
      setActiveTab('er-canvas');
    } catch (err) {
      addToast({
        title: 'Schema AI migration failed',
        description: err instanceof Error ? err.message : 'Review the SQL DDL and retry.',
        variant: 'danger',
      });
    } finally {
      setIsApplyingSchemaAi(false);
    }
  };

  // Phase 6: Seed Generator handlers
  const handleRunSeedGenerator = async (previewOnly: boolean) => {
    if (!activeDb || !seedTableName) return;
    if (previewOnly) setIsPreviewingSeed(true);
    else setIsInsertingSeed(true);

    try {
      const res = await apiClient.generateSeedData(activeDb.id, {
        tableName: seedTableName,
        rowCount: seedRowCount,
        previewOnly,
      });
      setSeedResult(res);
      if (!previewOnly && res.schema) {
        setSnapshot(res.schema);
        const { databases: refreshed } = await apiClient.listDatabases();
        setDatabases(refreshed);
        addToast({
          title: `Inserted ${res.rowCount} realistic rows into "${res.tableName}"`,
          description: `Completed in ${res.durationMs}ms inside a transaction.`,
          variant: 'success',
        });
      }
    } catch (err) {
      addToast({
        title: 'Seed generator error',
        description: err instanceof Error ? err.message : 'Could not generate seed data.',
        variant: 'danger',
      });
    } finally {
      setIsPreviewingSeed(false);
      setIsInsertingSeed(false);
    }
  };

  // Phase 6: CSV Import handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name
      .replace(/\.csv$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (baseName && /^[a-z]/.test(baseName)) {
      setCsvTableName(baseName.slice(0, 40));
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvContent(reader.result);
        setCsvPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handlePreviewCsv = async () => {
    if (!activeDb) return;
    setIsPreviewingCsv(true);
    try {
      const preview = await apiClient.previewCsvImport(activeDb.id, {
        tableName: csvTableName.trim(),
        csvContent,
      });
      setCsvPreview(preview);
      const initialOverrides: Record<string, string> = {};
      for (const col of preview.columns) {
        initialOverrides[col.columnName] = col.inferredType;
      }
      setCsvTypeOverrides(initialOverrides);
    } catch (err) {
      addToast({
        title: 'CSV preview failed',
        description: err instanceof Error ? err.message : 'Check CSV format and table name.',
        variant: 'danger',
      });
    } finally {
      setIsPreviewingCsv(false);
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!activeDb) return;
    setIsImportingCsv(true);
    try {
      const res = await apiClient.confirmCsvImport(activeDb.id, {
        tableName: csvTableName.trim(),
        csvContent,
        columnTypes: csvTypeOverrides,
      });
      setSnapshot(res.schema);
      setSelectedTableName(res.tableName);
      setCsvPreview(null);
      const { databases: refreshed } = await apiClient.listDatabases();
      setDatabases(refreshed);
      addToast({
        title: `Imported ${res.importedRows} rows into "${res.tableName}"`,
        description: `Created ${res.columnsCreated} columns in ${res.durationMs}ms.`,
        variant: 'success',
      });
      setActiveTab('inspector');
    } catch (err) {
      addToast({
        title: 'CSV import failed',
        description: err instanceof Error ? err.message : 'Could not import CSV into PostgreSQL.',
        variant: 'danger',
      });
    } finally {
      setIsImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="engine" icon="database">
              {activeDb?.name ?? 'PostgreSQL'}
            </Badge>
            {snapshot && (
              <Badge variant="readonly" icon="check">
                {snapshot.tables.length} tables · {snapshot.relations.length} relations
              </Badge>
            )}
            {snapshot?.cached && <Badge variant="neutral">Cached snapshot</Badge>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold m-0">
            Schema Studio, AI Architect &amp; Data Import
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-1 gap-0.5">
            {[
              { id: 'er-canvas' as const, label: 'ER Canvas', icon: 'relationship' as const },
              { id: 'inspector' as const, label: 'Inspector', icon: 'table' as const },
              {
                id: 'designer' as const,
                label: 'Table Designer',
                icon: 'schema-designer' as const,
              },
              {
                id: 'schema-ai' as const,
                label: 'Schema AI',
                icon: 'schema-ai' as const,
              },
              {
                id: 'seed' as const,
                label: 'Seed Generator',
                icon: 'seed' as const,
              },
              {
                id: 'csv-import' as const,
                label: 'CSV Import',
                icon: 'csv-upload' as const,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`dp-btn dp-btn--sm h-8 px-2.5 text-xs ${
                  activeTab === tab.id ? 'dp-btn--primary' : 'dp-btn--ghost'
                }`}
              >
                <Icon
                  name={tab.icon}
                  size={14}
                  className={
                    tab.id === 'schema-ai' && activeTab !== 'schema-ai' ? 'text-accent' : ''
                  }
                />
                {tab.label}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="secondary"
            leftIcon="refresh"
            isLoading={syncing}
            onClick={() => activeDb && void fetchSchema(activeDb.id, true)}
          >
            Sync schema
          </Button>
        </div>
      </div>

      {/* Main Split View: Left Schema Explorer + Right Active View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar: Schema Explorer Tree */}
        <Card className="lg:col-span-4 xl:col-span-3 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Public Schema ({filteredTables.length})
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('schema-ai')}
              className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
            >
              <Icon name="schema-ai" size={13} className="text-accent" /> Schema AI
            </button>
          </div>

          <Input
            placeholder="Filter tables or columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter schema tables and columns"
          />

          {loading ? (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredTables.map((table) => {
                const isSelected = selectedTable?.name === table.name;
                return (
                  <div
                    key={table.name}
                    className={`rounded-[10px] border transition-colors ${
                      isSelected
                        ? 'border-brand bg-brand-50/40 dark:bg-navy-700/60'
                        : 'border-[var(--border)] bg-[var(--surface)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTableName(table.name);
                        setSeedTableName(table.name);
                        if (activeTab === 'designer') setActiveTab('inspector');
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon name="table" size={16} className="text-brand shrink-0" />
                        <span className="font-mono text-xs font-semibold truncate">
                          {table.name}
                        </span>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                        {table.rowCountEstimate} rows
                      </span>
                    </button>

                    {isSelected && (
                      <div className="px-3 pb-2.5 pt-1 border-t border-[var(--border)] space-y-1">
                        {table.columns.map((col) => (
                          <div
                            key={col.name}
                            className="flex items-center justify-between gap-2 text-xs py-0.5"
                          >
                            <span className="flex items-center gap-1.5 font-mono truncate">
                              <Icon
                                name={
                                  col.isPrimaryKey
                                    ? 'primary-key'
                                    : col.isForeignKey
                                      ? 'foreign-key'
                                      : 'column'
                                }
                                size={13}
                                className={
                                  col.isPrimaryKey
                                    ? 'text-accent shrink-0'
                                    : col.isForeignKey
                                      ? 'text-brand shrink-0'
                                      : 'text-[var(--text-muted)] shrink-0'
                                }
                              />
                              <span className="truncate">{col.name}</span>
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                              {col.dataType}
                            </span>
                          </div>
                        ))}
                        <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-[var(--border)]/60">
                          <button
                            type="button"
                            onClick={() => {
                              setSeedTableName(table.name);
                              setActiveTab('seed');
                            }}
                            className="text-[11px] font-medium text-brand hover:underline inline-flex items-center gap-1"
                          >
                            <Icon name="seed" size={12} />
                            Generate seed rows
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('inspector')}
                            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            Inspect →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right Area */}
        <div className="lg:col-span-8 xl:col-span-9">
          {/* TAB 1: ER CANVAS */}
          {activeTab === 'er-canvas' && (
            <Card className="p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="text-base font-display font-bold m-0">
                    Entity-Relationship Canvas
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                    Click any table node to inspect its keys, foreign key links, and
                    indexes.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="primary-key" size={14} className="text-accent" /> Primary
                    Key
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Icon name="foreign-key" size={14} className="text-brand" /> Foreign
                    Key
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Skeleton className="h-56" />
                  <Skeleton className="h-56" />
                  <Skeleton className="h-56" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredTables.map((table) => {
                      const isSelected = selectedTable?.name === table.name;
                      const relatedSelected =
                        selectedTable &&
                        snapshot?.relations.some(
                          (r) =>
                            (r.sourceTable === selectedTable.name &&
                              r.targetTable === table.name) ||
                            (r.targetTable === selectedTable.name &&
                              r.sourceTable === table.name),
                        );
                      return (
                        <div
                          key={table.name}
                          onClick={() => setSelectedTableName(table.name)}
                          className={`rounded-[12px] border bg-[var(--surface)] overflow-hidden cursor-pointer transition-all ${
                            isSelected
                              ? 'border-brand ring-2 ring-brand/30 shadow-md'
                              : relatedSelected
                                ? 'border-accent ring-1 ring-accent/40'
                                : 'border-[var(--border)] hover:border-brand/50'
                          }`}
                        >
                          <div className="px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
                            <span className="flex items-center gap-2 font-mono text-xs font-bold">
                              <Icon name="table" size={15} className="text-brand" />
                              {table.name}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-muted)]">
                              {table.rowCountEstimate} rows
                            </span>
                          </div>

                          <div className="p-3 space-y-1.5">
                            {table.columns.map((col) => (
                              <div
                                key={col.name}
                                className="flex items-center justify-between gap-2 text-xs font-mono"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  {col.isPrimaryKey ? (
                                    <Icon
                                      name="primary-key"
                                      size={13}
                                      className="text-accent shrink-0"
                                    />
                                  ) : col.isForeignKey ? (
                                    <Icon
                                      name="foreign-key"
                                      size={13}
                                      className="text-brand shrink-0"
                                    />
                                  ) : (
                                    <span className="w-3.5 inline-block shrink-0" />
                                  )}
                                  <span
                                    className={
                                      col.isPrimaryKey
                                        ? 'font-semibold text-[var(--text)]'
                                        : 'text-[var(--text)]'
                                    }
                                  >
                                    {col.name}
                                  </span>
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                                  {col.dataType}
                                  {!col.isNullable ? ' • NN' : ''}
                                </span>
                              </div>
                            ))}
                          </div>

                          {table.columns.some((c) => c.isForeignKey) && (
                            <div className="px-3 py-2 bg-[var(--surface-2)]/60 border-t border-[var(--border)] space-y-1">
                              {table.columns
                                .filter((c) => c.isForeignKey)
                                .map((fkCol) => (
                                  <div
                                    key={fkCol.name}
                                    className="text-[11px] font-mono text-brand flex items-center gap-1"
                                  >
                                    <Icon name="relationship" size={12} />
                                    <span>
                                      {fkCol.name} → {fkCol.referencesTable}.
                                      {fkCol.referencesColumn}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {snapshot && snapshot.relations.length > 0 && (
                    <div className="pt-4 border-t border-[var(--border)]">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2.5">
                        Introspected Foreign Key Relations ({snapshot.relations.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {snapshot.relations.map((rel) => (
                          <span
                            key={rel.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-[var(--surface-2)] border border-[var(--border)]"
                          >
                            <Icon name="relationship" size={13} className="text-brand" />
                            <span>
                              {rel.sourceTable}.{rel.sourceColumn}
                            </span>
                            <Icon
                              name="arrow-right"
                              size={12}
                              className="text-[var(--text-muted)]"
                            />
                            <span className="text-brand font-semibold">
                              {rel.targetTable}.{rel.targetColumn}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* TAB 2: TABLE INSPECTOR */}
          {activeTab === 'inspector' && selectedTable && (
            <Card className="p-5 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div className="flex items-center gap-2.5">
                  <Icon name="table" size={20} className="text-brand" />
                  <div>
                    <h2 className="text-lg font-display font-bold font-mono m-0">
                      {selectedTable.schema}.{selectedTable.name}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] m-0">
                      {selectedTable.columns.length} columns ·{' '}
                      {selectedTable.indexes.length} indexes ·{' '}
                      {selectedTable.rowCountEstimate} rows
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon="seed"
                    onClick={() => {
                      setSeedTableName(selectedTable.name);
                      setActiveTab('seed');
                    }}
                  >
                    Seed rows
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon="plus"
                    onClick={() => setActiveTab('designer')}
                  >
                    Design new table
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Type</th>
                      <th>Nullable</th>
                      <th>Default</th>
                      <th>Constraints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTable.columns.map((col) => (
                      <tr key={col.name}>
                        <td className="font-semibold">{col.name}</td>
                        <td>{col.dataType}</td>
                        <td>{col.isNullable ? 'YES' : 'NO'}</td>
                        <td className="text-[var(--text-muted)]">
                          {col.defaultValue ?? '—'}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {col.isPrimaryKey && (
                              <Badge variant="write" icon="primary-key">
                                PRIMARY KEY
                              </Badge>
                            )}
                            {col.isForeignKey && (
                              <Badge variant="engine" icon="foreign-key">
                                FK → {col.referencesTable}.{col.referencesColumn}
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="text-sm font-display font-bold mb-2.5 flex items-center gap-1.5">
                  <Icon name="index" size={16} className="text-brand" />
                  Indexes ({selectedTable.indexes.length})
                </h3>
                {selectedTable.indexes.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No indexes found on this table.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {selectedTable.indexes.map((idx) => (
                      <div
                        key={idx.name}
                        className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-semibold block truncate">
                            {idx.name}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            Columns: ({idx.columns.join(', ')})
                          </span>
                        </div>
                        <Badge variant={idx.isUnique ? 'readonly' : 'neutral'}>
                          {idx.isUnique ? 'UNIQUE' : 'BTREE'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* TAB 3: VISUAL TABLE DESIGNER */}
          {activeTab === 'designer' && (
            <Card className="p-5 sm:p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <h2 className="text-lg font-display font-bold m-0">
                    Visual Schema Designer
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                    Define columns, keys, foreign key relations, and indexes. Preview the
                    transactional SQL migration before applying.
                  </p>
                </div>
                <Badge variant="write" icon="write-access">
                  Transactional DDL
                </Badge>
              </div>

              <div className="max-w-sm">
                <Input
                  label="New table name"
                  value={newTableName}
                  onChange={(e) => {
                    setNewTableName(e.target.value);
                    setMigrationPreview(null);
                  }}
                  placeholder="e.g. customer_reviews"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-display font-bold">
                    Columns ({columns.length})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon="plus"
                    onClick={handleAddColumn}
                  >
                    Add column
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {columns.map((col, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center"
                    >
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) =>
                            handleUpdateColumn(idx, { name: e.target.value })
                          }
                          placeholder="column_name"
                          aria-label="Column name"
                          className="dp-input h-8 text-xs font-mono"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <select
                          value={col.dataType}
                          onChange={(e) =>
                            handleUpdateColumn(idx, {
                              dataType: e.target.value as DesignerColumnInput['dataType'],
                            })
                          }
                          aria-label="Column data type"
                          className="dp-select h-8 text-xs font-mono"
                        >
                          {PG_DATA_TYPES.map((dt) => (
                            <option key={dt} value={dt}>
                              {dt}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-3 flex items-center gap-3 text-xs">
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.isPrimaryKey}
                            onChange={(e) =>
                              handleUpdateColumn(idx, {
                                isPrimaryKey: e.target.checked,
                                isNullable: e.target.checked ? false : col.isNullable,
                              })
                            }
                          />
                          <span>PK</span>
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!col.isNullable}
                            disabled={col.isPrimaryKey}
                            onChange={(e) =>
                              handleUpdateColumn(idx, { isNullable: !e.target.checked })
                            }
                          />
                          <span>NOT NULL</span>
                        </label>
                        <label className="inline-flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.isUnique}
                            onChange={(e) =>
                              handleUpdateColumn(idx, { isUnique: e.target.checked })
                            }
                          />
                          <span>UQ</span>
                        </label>
                      </div>

                      <div className="md:col-span-3">
                        <select
                          aria-label="Foreign key reference"
                          value={
                            col.referencesTable
                              ? `${col.referencesTable}.${col.referencesColumn ?? 'id'}`
                              : ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              handleUpdateColumn(idx, {
                                referencesTable: undefined,
                                referencesColumn: undefined,
                              });
                            } else {
                              const [refT, refC] = val.split('.');
                              handleUpdateColumn(idx, {
                                referencesTable: refT,
                                referencesColumn: refC ?? 'id',
                              });
                            }
                          }}
                          className="dp-select h-8 text-xs font-mono"
                        >
                          <option value="">No foreign key</option>
                          {snapshot?.tables.map((t) => (
                            <option key={t.name} value={`${t.name}.id`}>
                              FK → {t.name}.id
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-1 flex justify-end">
                        {columns.length > 1 && (
                          <button
                            type="button"
                            aria-label="Remove column"
                            onClick={() => handleRemoveColumn(idx)}
                            className="dp-btn dp-btn--ghost dp-btn--sm w-7 h-7 p-0 justify-center text-danger"
                          >
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-display font-bold">
                    Indexes ({indexes.length})
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon="index"
                    onClick={handleAddIndex}
                  >
                    Add index
                  </Button>
                </div>

                {indexes.map((idxItem, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] flex flex-wrap items-center justify-between gap-3"
                  >
                    <input
                      type="text"
                      value={idxItem.name}
                      onChange={(e) =>
                        setIndexes((prev) =>
                          prev.map((item, j) =>
                            j === i ? { ...item, name: e.target.value } : item,
                          ),
                        )
                      }
                      aria-label="Index name"
                      className="dp-input h-8 text-xs font-mono max-w-xs"
                    />
                    <select
                      aria-label="Indexed column"
                      value={idxItem.columns[0] ?? ''}
                      onChange={(e) =>
                        setIndexes((prev) =>
                          prev.map((item, j) =>
                            j === i ? { ...item, columns: [e.target.value] } : item,
                          ),
                        )
                      }
                      className="dp-select h-8 text-xs font-mono max-w-[180px]"
                    >
                      {columns.map((c) => (
                        <option key={c.name} value={c.name}>
                          Column: {c.name}
                        </option>
                      ))}
                    </select>
                    <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={idxItem.isUnique}
                        onChange={(e) =>
                          setIndexes((prev) =>
                            prev.map((item, j) =>
                              j === i ? { ...item, isUnique: e.target.checked } : item,
                            ),
                          )
                        }
                      />
                      <span>Unique index</span>
                    </label>
                    <button
                      type="button"
                      aria-label="Remove index"
                      onClick={() =>
                        setIndexes((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="dp-btn dp-btn--ghost dp-btn--sm w-7 h-7 p-0 justify-center text-danger"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon="sql-editor"
                  isLoading={isPreviewing}
                  onClick={() => void handlePreviewMigration()}
                >
                  Preview migration SQL
                </Button>

                {migrationPreview && (
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon="check"
                    isLoading={isApplying}
                    onClick={() => void handleApplyMigration()}
                  >
                    Apply migration to database
                  </Button>
                )}
              </div>

              {migrationPreview && (
                <div className="space-y-3">
                  {migrationPreview.warnings.map((w) => (
                    <div
                      key={w}
                      className="p-3 rounded-[10px] border border-warning/40 bg-warning/10 text-xs flex items-center gap-2"
                    >
                      <Icon name="warning" size={15} className="text-warning shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5">
                      <span className="font-mono">
                        Reviewed Migration Preview ({migrationPreview.statementsCount}{' '}
                        DDL statements)
                      </span>
                      <span className="text-success font-medium">
                        Wrapped in BEGIN ... COMMIT transaction
                      </span>
                    </div>
                    <pre className="dp-code m-0 text-xs">{migrationPreview.sql}</pre>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 4: PHASE 6 — SCHEMA AI ARCHITECT */}
          {activeTab === 'schema-ai' && (
            <Card className="p-5 sm:p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="write" icon="schema-ai">
                      Schema AI Architect
                    </Badge>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      Normalized DDL + Foreign Keys + B-Tree Indexes
                    </span>
                  </div>
                  <h2 className="text-lg font-display font-bold m-0">
                    Describe a Business to Generate Tables
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                    Describe your product or domain in plain English. Review the proposed
                    tables, columns, and migration SQL before applying to PostgreSQL.
                  </p>
                </div>
              </div>

              {/* Domain Presets */}
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Quick Business Templates
                </span>
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setBusinessDescription(preset.description);
                        void handleProposeSchemaAi(preset.description);
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface-2)] hover:border-brand transition-colors inline-flex items-center gap-1.5"
                    >
                      <Icon name="sparkle" size={12} className="text-accent" />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="dp-label" htmlFor="schema-ai-desc">
                  Business or application description
                </label>
                <textarea
                  id="schema-ai-desc"
                  rows={3}
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="e.g., Online bookstore with books, registered members, and verified reviews..."
                  className="dp-input py-2.5 text-sm min-h-[84px]"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon="schema-ai"
                    isLoading={isGeneratingSchemaAi}
                    onClick={() => void handleProposeSchemaAi()}
                  >
                    Propose normalized schema
                  </Button>
                </div>
              </div>

              {schemaAiProposal && (
                <div className="space-y-5 pt-4 border-t border-[var(--border)]">
                  <div className="p-3.5 rounded-[10px] border border-brand/30 bg-brand-50/40 dark:bg-navy-800/60 flex items-start gap-3">
                    <Icon name="sparkle" size={18} className="text-accent shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-[var(--text)]">
                        {schemaAiProposal.summary}
                      </div>
                      <div className="text-[var(--text-muted)]">
                        Review the proposed tables below or edit the transactional SQL
                        migration before applying.
                      </div>
                    </div>
                  </div>

                  {/* Proposed Tables Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {schemaAiProposal.tables.map((tbl) => (
                      <div
                        key={tbl.tableName}
                        className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                            <span className="font-mono text-xs font-bold flex items-center gap-1.5">
                              <Icon name="table" size={14} className="text-brand" />
                              {tbl.tableName}
                            </span>
                            <Badge variant="neutral">{tbl.columns.length} cols</Badge>
                          </div>
                          <p className="px-3.5 py-2 text-[11px] text-[var(--text-muted)] m-0 border-b border-[var(--border)]/60">
                            {tbl.description}
                          </p>
                          <div className="p-3 space-y-1">
                            {tbl.columns.map((c) => (
                              <div
                                key={c.name}
                                className="flex items-center justify-between text-xs font-mono"
                              >
                                <span className="truncate flex items-center gap-1">
                                  {c.isPrimaryKey && (
                                    <Icon
                                      name="primary-key"
                                      size={12}
                                      className="text-accent"
                                    />
                                  )}
                                  {c.referencesTable && (
                                    <Icon
                                      name="foreign-key"
                                      size={12}
                                      className="text-brand"
                                    />
                                  )}
                                  {c.name}
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {c.dataType}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {tbl.indexes.length > 0 && (
                          <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface)] text-[11px] font-mono text-[var(--text-muted)]">
                            Indexes: {tbl.indexes.map((i) => i.name).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Editable DDL Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">
                        Migration SQL Preview (editable before applying)
                      </span>
                      <span className="font-mono text-success">
                        Transactional (BEGIN ... COMMIT)
                      </span>
                    </div>
                    <textarea
                      rows={12}
                      value={editableAiDdl}
                      onChange={(e) => setEditableAiDdl(e.target.value)}
                      aria-label="Schema AI DDL migration SQL"
                      className="dp-input font-mono text-xs py-3 leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="primary"
                      leftIcon="check"
                      isLoading={isApplyingSchemaAi}
                      onClick={() => void handleApplySchemaAi()}
                    >
                      Apply proposed schema to database
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 5: PHASE 6 — REALISTIC SEED DATA GENERATOR */}
          {activeTab === 'seed' && (
            <Card className="p-5 sm:p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="readonly" icon="seed">
                      Realistic Seed Generator
                    </Badge>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      Foreign-Key Aware · Transactional Batch Insert
                    </span>
                  </div>
                  <h2 className="text-lg font-display font-bold m-0">
                    Generate Realistic Seed Data
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                    Select any table and row count (1–500). DataPilot inspects column
                    types, domain semantics, and parent foreign keys automatically.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-5">
                  <label className="dp-label" htmlFor="seed-table-select">
                    Target PostgreSQL table
                  </label>
                  <select
                    id="seed-table-select"
                    value={seedTableName}
                    onChange={(e) => {
                      setSeedTableName(e.target.value);
                      setSeedResult(null);
                    }}
                    className="dp-select font-mono text-xs"
                  >
                    {snapshot?.tables.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} ({t.rowCountEstimate} rows)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4">
                  <label className="dp-label" htmlFor="seed-row-count">
                    Row count ({seedRowCount} rows)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="seed-row-count"
                      type="range"
                      min={1}
                      max={250}
                      value={seedRowCount}
                      onChange={(e) => setSeedRowCount(Number(e.target.value))}
                      className="w-full accent-[var(--brand)]"
                    />
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={seedRowCount}
                      onChange={(e) =>
                        setSeedRowCount(
                          Math.min(500, Math.max(1, Number(e.target.value) || 1)),
                        )
                      }
                      aria-label="Exact seed row count"
                      className="dp-input w-20 text-xs font-mono text-center"
                    />
                  </div>
                </div>

                <div className="md:col-span-3 flex flex-wrap gap-1.5">
                  {[10, 25, 50, 100].map((presetCount) => (
                    <button
                      key={presetCount}
                      type="button"
                      onClick={() => setSeedRowCount(presetCount)}
                      className={`px-2.5 py-1.5 rounded-[8px] text-xs font-mono border transition-colors ${
                        seedRowCount === presetCount
                          ? 'border-brand bg-brand/10 text-brand font-semibold'
                          : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]'
                      }`}
                    >
                      +{presetCount}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon="sql-editor"
                  isLoading={isPreviewingSeed}
                  onClick={() => void handleRunSeedGenerator(true)}
                >
                  Preview sample rows &amp; SQL
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  leftIcon="seed"
                  isLoading={isInsertingSeed}
                  onClick={() => void handleRunSeedGenerator(false)}
                >
                  Generate &amp; insert {seedRowCount} rows
                </Button>
              </div>

              {seedResult && (
                <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      {seedResult.applied
                        ? `Inserted ${seedResult.rowCount} rows into "${seedResult.tableName}" (${seedResult.durationMs}ms)`
                        : `Previewing ${seedResult.sampleRows.length} of ${seedResult.rowCount} generated rows for "${seedResult.tableName}"`}
                    </span>
                    <Badge variant={seedResult.applied ? 'readonly' : 'neutral'}>
                      {seedResult.applied ? 'COMMITTED' : 'PREVIEW ONLY'}
                    </Badge>
                  </div>

                  {seedResult.sampleRows.length > 0 && (
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="dp-table text-xs">
                        <thead>
                          <tr>
                            {Object.keys(seedResult.sampleRows[0]!).map((colKey) => (
                              <th key={colKey} className="font-mono">
                                {colKey}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {seedResult.sampleRows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              {Object.keys(seedResult.sampleRows[0]!).map((colKey) => (
                                <td key={colKey} className="font-mono text-xs">
                                  {String(row[colKey] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-mono text-[var(--text-muted)] mb-1">
                      Generated Batch INSERT SQL
                    </div>
                    <pre className="dp-code m-0 text-xs max-h-56 overflow-y-auto">
                      {seedResult.insertSqlPreview}
                    </pre>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 6: PHASE 6 — CSV IMPORT WITH COLUMN TYPE INFERENCE */}
          {activeTab === 'csv-import' && (
            <Card className="p-5 sm:p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="engine" icon="csv-upload">
                      CSV Schema Inference &amp; Import
                    </Badge>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      Auto-detects integer, numeric, boolean, timestamptz &amp; text
                    </span>
                  </div>
                  <h2 className="text-lg font-display font-bold m-0">
                    Import CSV into a New PostgreSQL Table
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] m-0 mt-0.5">
                    Upload a CSV file or paste rows below. DataPilot infers PostgreSQL
                    column types and lets you review or override types before importing.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    leftIcon="csv-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload .csv file
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCsvTableName('imported_leads');
                      setCsvContent(SAMPLE_CSV_DATA);
                      setCsvPreview(null);
                    }}
                  >
                    Reset sample CSV
                  </Button>
                </div>
              </div>

              <div className="max-w-sm">
                <Input
                  label="Destination PostgreSQL table name"
                  value={csvTableName}
                  onChange={(e) => {
                    setCsvTableName(e.target.value);
                    setCsvPreview(null);
                  }}
                  placeholder="e.g. imported_leads"
                />
              </div>

              <div className="space-y-2">
                <label className="dp-label" htmlFor="csv-raw-input">
                  CSV content (first row must contain column headers)
                </label>
                <textarea
                  id="csv-raw-input"
                  rows={7}
                  value={csvContent}
                  onChange={(e) => {
                    setCsvContent(e.target.value);
                    setCsvPreview(null);
                  }}
                  className="dp-input font-mono text-xs py-2.5 leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon="filter"
                  isLoading={isPreviewingCsv}
                  onClick={() => void handlePreviewCsv()}
                >
                  Infer column types &amp; preview
                </Button>

                {csvPreview && (
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon="check"
                    isLoading={isImportingCsv}
                    onClick={() => void handleConfirmCsvImport()}
                  >
                    Confirm &amp; import {csvPreview.totalRows} rows into &ldquo;
                    {csvPreview.tableName}&rdquo;
                  </Button>
                )}
              </div>

              {csvPreview && (
                <div className="space-y-5 pt-4 border-t border-[var(--border)]">
                  <div>
                    <h3 className="text-sm font-display font-bold mb-2">
                      Inferred Columns ({csvPreview.columns.length}) — override any type
                      before import
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="dp-table text-xs">
                        <thead>
                          <tr>
                            <th>CSV Header</th>
                            <th>PostgreSQL Column</th>
                            <th>Inferred / Selected Type</th>
                            <th>Nullable</th>
                            <th>Sample Values</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.columns.map((col) => (
                            <tr key={col.columnName}>
                              <td className="font-mono text-[var(--text-muted)]">
                                {col.originalHeader}
                              </td>
                              <td className="font-mono font-semibold">
                                {col.columnName}
                              </td>
                              <td>
                                <select
                                  aria-label={`Column type for ${col.columnName}`}
                                  value={
                                    csvTypeOverrides[col.columnName] ?? col.inferredType
                                  }
                                  onChange={(e) =>
                                    setCsvTypeOverrides((prev) => ({
                                      ...prev,
                                      [col.columnName]: e.target.value,
                                    }))
                                  }
                                  className="dp-select h-7 text-xs font-mono max-w-[160px]"
                                >
                                  {CSV_OVERRIDABLE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="font-mono">
                                {col.nullable ? 'NULL' : 'NOT NULL'}
                              </td>
                              <td className="font-mono text-[11px] text-[var(--text-muted)]">
                                {col.sampleValues.slice(0, 3).join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-display font-bold mb-2">
                      Row Preview ({csvPreview.sampleRows.length} of{' '}
                      {csvPreview.totalRows} rows)
                    </h3>
                    <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
                      <table className="dp-table text-xs">
                        <thead>
                          <tr>
                            {csvPreview.columns.map((c) => (
                              <th key={c.columnName} className="font-mono">
                                {c.columnName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.sampleRows.map((row, idx) => (
                            <tr key={idx}>
                              {csvPreview.columns.map((c) => (
                                <td key={c.columnName} className="font-mono">
                                  {row[c.columnName] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-[var(--text-muted)] mb-1">
                      Generated Table DDL
                    </div>
                    <pre className="dp-code m-0 text-xs">{csvPreview.createTableSql}</pre>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

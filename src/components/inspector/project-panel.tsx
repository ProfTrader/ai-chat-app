import { useMemo, useRef, useState } from "react";
import {
  AtSign,
  ChevronRight,
  Database,
  FileText,
  Info,
  SendHorizontal,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { currentUser } from "@/lib/current-user";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";
import { useDataStore } from "@/stores/data-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useShellStore } from "@/stores/shell-store";
import type { TeamMember, TeamMessage } from "@/types";

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {title}
        </p>
        {typeof count === "number" ? (
          <Badge variant="secondary" className="font-normal">
            {count}
          </Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Render a chat body, highlighting @mentions of known members. */
function MentionPill({
  member,
  children,
  compact = false,
}: {
  member: TeamMember;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md border border-active/30 bg-active-soft text-active transition-colors hover:border-active/50 hover:bg-active-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              compact ? "px-1.5 py-0.5 text-xs" : "px-1.5 py-0.5 text-sm font-medium",
            )}
          />
        }
      >
        {compact ? (
          <>
            <PersonAvatar
              name={member.name}
              avatarUrl={member.avatarUrl}
              status={member.status}
              size="sm"
              shape="square"
              className="size-4"
            />
            <span className="truncate">{member.name}</span>
          </>
        ) : (
          children ?? `@${member.name}`
        )}
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-72 p-0">
        <div className="flex items-start gap-3 border-b border-border p-3">
          <PersonAvatar
            name={member.name}
            avatarUrl={member.avatarUrl}
            status={member.status}
            size="lg"
            shape="square"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{member.name}</p>
              <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            </div>
            <p className="truncate text-xs text-muted-foreground">{member.role}</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground">
              {member.status ?? "available"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          <Button size="sm" variant="outline" className="justify-start">
            Message
          </Button>
          <Button size="sm" variant="outline" className="justify-start">
            Assign
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function renderMentions(body: string, members: TeamMember[]) {
  if (members.length === 0) return body;
  // Longest names first so "Morgan Lee" wins over "Morgan".
  const names = members
    .map((m) => m.name)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${names.join("|")})`, "g");
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) nodes.push(body.slice(lastIndex, match.index));
    const member = members.find((item) => item.name === match?.[1]);
    nodes.push(
      member ? (
        <MentionPill key={`m-${key++}`} member={member}>
          {match[0]}
        </MentionPill>
      ) : (
        <span key={`m-${key++}`} className="font-medium text-active">
          {match[0]}
        </span>
      ),
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) nodes.push(body.slice(lastIndex));
  return nodes;
}

function TeamMessageRow({
  message,
  members,
}: {
  message: TeamMessage;
  members: TeamMember[];
}) {
  return (
    <div className="flex gap-2.5">
      <PersonAvatar
        name={message.authorName}
        avatarUrl={message.authorAvatarUrl}
        size="sm"
        shape="square"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{message.authorName}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTime(message.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed break-words text-foreground/90">
          {renderMentions(message.body, members)}
        </p>
      </div>
    </div>
  );
}

function TeamChat({
  projectId,
  members,
}: {
  projectId: string;
  members: TeamMember[];
}) {
  const getTeamMessagesByProject = useDataStore((s) => s.getTeamMessagesByProject);
  const postTeamMessage = useDataStore((s) => s.postTeamMessage);
  const teamMessages = useDataStore((s) => s.teamMessages);
  const messages = useMemo(
    () => getTeamMessagesByProject(projectId),
    // teamMessages drives recompute; getTeamMessagesByProject is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamMessages, projectId],
  );

  const [value, setValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, members]);

  const selectedMentions = useMemo(
    () =>
      members.filter((member) =>
        new RegExp(`@${member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
          value,
        ),
      ),
    [members, value],
  );

  const removeMention = (member: TeamMember) => {
    const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const next = value
      .replace(new RegExp(`(^|\\s)@${escaped}\\b\\s?`, "gi"), "$1")
      .replace(/\s{2,}/g, " ");
    setValue(next);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Detect an active "@query" token immediately before the caret.
  const syncMentionQuery = (text: string, caret: number) => {
    const upToCaret = text.slice(0, caret);
    const match = upToCaret.match(/(?:^|\s)@([\w'-]*)$/);
    setMentionQuery(match ? match[1] : null);
    setActiveIndex(0);
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = event.target.value;
    setValue(text);
    syncMentionQuery(text, event.target.selectionStart ?? text.length);
  };

  const insertMention = (member: TeamMember) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([\w'-]*)$/, "");
    const after = value.slice(caret);
    const next = `${before}@${member.name} ${after}`;
    setValue(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length + member.name.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  };

  const resolveMentions = (text: string) =>
    members
      .filter((m) => new RegExp(`@${m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
      .map((m) => m.id);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    postTeamMessage({
      projectId,
      body: trimmed,
      mentions: resolveMentions(trimmed),
    });
    setValue("");
    setMentionQuery(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While the mention picker is open, arrow keys navigate it and
    // Enter/Tab selects — just like Slack.
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[activeIndex] ?? suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No messages yet. Use{" "}
          <span className="font-medium text-foreground">@</span> to call a teammate
          into the conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <TeamMessageRow key={message.id} message={message} members={members} />
          ))}
        </div>
      )}

      <div className="relative">
        {mentionQuery !== null ? (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-md">
            <p className="px-2.5 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {suggestions.length > 0 ? "Teammates" : "No teammates match"}
            </p>
            {suggestions.map((member, index) => (
              <button
                key={member.id}
                type="button"
                // onMouseDown (not onClick) so the textarea keeps focus and the
                // blur doesn't close the picker before the insert runs.
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(member);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                  index === activeIndex ? "bg-active-soft text-active" : "hover:bg-muted/60",
                )}
              >
                <PersonAvatar
                  name={member.name}
                  avatarUrl={member.avatarUrl}
                  status={member.status}
                  size="sm"
                  shape="square"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {member.role}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {selectedMentions.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedMentions.map((member) => (
              <span key={member.id} className="inline-flex items-center gap-1">
                <MentionPill member={member} compact />
                <button
                  type="button"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => removeMention(member)}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message the team… use @ to call a teammate"
          className="min-h-[60px] pr-10"
        />
        <Button
          size="icon-sm"
          className="absolute right-2 bottom-2"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Send message"
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}

export function ProjectPanel() {
  const projectId = useSelectionStore((s) => s.projectId);
  const selectMember = useSelectionStore((s) => s.selectMember);
  const projects = useDataStore((s) => s.projects);
  const workspaces = useDataStore((s) => s.workspaces);
  const getTeamMembersByProject = useDataStore((s) => s.getTeamMembersByProject);
  const getTeamMembersByWorkspace = useDataStore((s) => s.getTeamMembersByWorkspace);
  const getTasksByProject = useDataStore((s) => s.getTasksByProject);
  const getContactsByProject = useDataStore((s) => s.getContactsByProject);
  const getDatasetsByProject = useDataStore((s) => s.getDatasetsByProject);
  const workRuns = useDataStore((s) => s.workRuns);
  const setInspectorCollapsed = useShellStore((s) => s.setInspectorCollapsed);

  const project = projects.find((p) => p.id === projectId);
  const workspace = workspaces.find((w) => w.id === project?.workspaceId);
  const assignees = getTeamMembersByProject(projectId);
  const tasks = getTasksByProject(projectId);
  const contacts = getContactsByProject(projectId);
  const datasets = getDatasetsByProject(projectId);
  const openTasks = tasks.filter((t) => t.status !== "done").length;

  // The @mention pool is the whole workspace (Slack-style), deduped by name.
  const mentionPool = useMemo(() => {
    const all = getTeamMembersByWorkspace(project?.workspaceId ?? "");
    const seen = new Set<string>();
    return all.filter((member) => {
      const key = member.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [getTeamMembersByWorkspace, project?.workspaceId]);

  const briefFiles = useMemo(
    () =>
      workRuns
        .filter((run) => run.projectId === projectId)
        .flatMap((run) =>
          run.drafts
            .map((draft) => draft.htmlArtifact)
            .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact)),
        )
        .reduce<{ fileName: string; title: string; createdAt: string }[]>((acc, artifact) => {
          if (!acc.some((file) => file.fileName === artifact.fileName)) {
            acc.push({
              fileName: artifact.fileName,
              title: artifact.title,
              createdAt: artifact.createdAt,
            });
          }
          return acc;
        }, []),
    [workRuns, projectId],
  );

  // The creator. Projects in this workspace are created by the operator; if a
  // future project records a different creator we still fall back gracefully.
  const creator = currentUser;

  const fileCount = datasets.length + briefFiles.length;

  return (
    <div className="flex h-full flex-col bg-pane">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium leading-snug">
            {project?.name ?? "Project"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {workspace?.name ?? "Workspace"} · overview
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label="Hide inspector"
                onClick={() => setInspectorCollapsed(true)}
              />
            }
          >
            <ChevronRight />
          </TooltipTrigger>
          <TooltipContent>Hide inspector</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-5">
          {/* 1 — Creator */}
          <Section icon={Users} title="Created by">
            <div className="flex items-center gap-3">
              <PersonAvatar
                name={creator.name}
                avatarUrl={creator.avatarUrl}
                status={creator.status}
                size="lg"
                shape="square"
                className="size-10"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{creator.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {creator.role} · created {formatRelativeTime(project?.createdAt ?? "")}
                </p>
              </div>
            </div>
          </Section>

          <Separator />

          {/* 2 — Assignees */}
          <Section icon={Users} title="Assignees" count={assignees.length}>
            {assignees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teammates assigned yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {assignees.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => selectMember(member)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <PersonAvatar
                      name={member.name}
                      avatarUrl={member.avatarUrl}
                      status={member.status}
                      shape="square"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Separator />

          {/* 3 — Information */}
          <Section icon={Info} title="Information">
            <dl className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Workspace</dt>
                <dd className="truncate font-medium">{workspace?.name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Project key</dt>
                <dd className="truncate font-mono text-xs">{project?.slug ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="truncate font-medium">{formatDate(project?.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Open tasks</dt>
                <dd className="font-medium">
                  {openTasks}
                  <span className="text-muted-foreground"> / {tasks.length}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Contacts</dt>
                <dd className="font-medium">{contacts.length}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Teammates</dt>
                <dd className="font-medium">{assignees.length}</dd>
              </div>
            </dl>
          </Section>

          <Separator />

          {/* 4 — Files */}
          <Section icon={FileText} title="Files" count={fileCount}>
            {fileCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No files yet. Imported datasets and generated briefs show up here.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <Database className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{dataset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dataset.rows.length.toLocaleString()} rows · {dataset.columns.length} cols
                      </p>
                    </div>
                    <Badge variant="outline" className="font-normal capitalize">
                      {dataset.sourceKind}
                    </Badge>
                  </div>
                ))}
                {briefFiles.map((file) => (
                  <div
                    key={file.fileName}
                    className="flex items-center gap-3 rounded-md px-2 py-2"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-fin/10 text-fin">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.title}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {file.fileName}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-normal">
                      HTML
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Separator />

          {/* 5 — Team chat */}
          <Section icon={AtSign} title="Team chat">
            <TeamChat projectId={projectId} members={mentionPool} />
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}

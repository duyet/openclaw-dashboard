export const runtime = "edge";

import { KanbanBoard } from "@/components/project-board/KanbanBoard";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";

export default function ProjectBoardPage() {
  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view the project board.",
        forceRedirectUrl: "/project-board",
      }}
      title="Project Board"
      description="Unified kanban view across all OpenClaw boards."
      contentClassName="p-0"
    >
      <KanbanBoard />
    </DashboardPageLayout>
  );
}

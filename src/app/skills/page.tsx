export const runtime = "edge";

import { redirect } from "next/navigation";

export default function SkillsIndexPage() {
  redirect("/skills/marketplace");
}

import App from "../../../src/App.jsx";
import { redirect } from "next/navigation";

export default async function ProjectPage({ params }) {
  const { projectId: slug } = await params;
  if (slug.startsWith("project-")) redirect(`/projects/${slug.slice("project-".length)}`);
  return <App initialProjectId={`project-${slug}`} />;
}

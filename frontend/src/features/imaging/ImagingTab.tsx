import { useJobStore } from "@/lib/jobStore";
import { AnalysisView } from "./views/AnalysisView";
import { LoaderView } from "./views/LoaderView";

export function ImagingTab() {
  const latestResult = useJobStore(s => s.latestJobResult);

  if (latestResult) {
    return <AnalysisView result={latestResult} />;
  }

  return <LoaderView />;
}
